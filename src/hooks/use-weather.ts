import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { check } from '@/lib/query';
import { supabase } from '@/lib/supabase';
import {
  DEFAULT_CITY,
  fetchWeather,
  parseSavedCity,
  searchPlaces,
  type City,
} from '@/lib/weather';

const CITY_KEY = 'weather-city';

/** 기기(웹은 브라우저) 안에 고른 지역을 저장할 때 쓰는 이름 */
const STORAGE_KEY = 'weather-city';

/** 날씨는 30분 동안 다시 묻지 않는다. 그 사이에는 이미 받은 값을 보여준다. */
const WEATHER_STALE_MS = 30 * 60 * 1000;

async function readLocalCity(): Promise<City> {
  try {
    return parseSavedCity(await AsyncStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_CITY;
  }
}

async function writeLocalCity(city: City) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(city));
  } catch {
    // 기기 저장에 실패해도 계정(DB)에는 저장되므로 그냥 넘어간다.
  }
}

/** 지역을 내 계정의 설정(user_settings 표)에 저장한다. 처음이면 새 줄을 만든다. */
async function writeAccountCity(userId: string, city: City) {
  const { error } = await supabase.from('user_settings').upsert({
    user_id: userId,
    weather_place_id: city.id,
    weather_name: city.name,
    weather_detail: city.detail ?? null,
    weather_latitude: city.latitude,
    weather_longitude: city.longitude,
    updated_at: new Date().toISOString(),
  });
  check(error);
}

/**
 * 내 계정에 저장된 지역을 읽는다.
 * 아직 저장한 적이 없으면, 로그인 전에 이 기기에서 골라 둔 지역을 계정으로 옮기고 그 지역을 쓴다.
 */
async function readAccountCity(userId: string): Promise<City> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('weather_place_id, weather_name, weather_detail, weather_latitude, weather_longitude')
    .eq('user_id', userId)
    .maybeSingle();
  check(error);

  if (
    data?.weather_place_id &&
    data.weather_name &&
    data.weather_latitude !== null &&
    data.weather_longitude !== null
  ) {
    const city: City = {
      id: data.weather_place_id,
      name: data.weather_name,
      detail: data.weather_detail ?? undefined,
      latitude: data.weather_latitude,
      longitude: data.weather_longitude,
    };
    // 다른 기기에서 바꾼 지역도 이 기기에 맞춰 둔다. 인터넷이 안 될 때 이 값을 쓴다.
    await writeLocalCity(city);
    return city;
  }

  const local = await readLocalCity();
  if (local.id !== DEFAULT_CITY.id) {
    // 옮기기에 실패해도 화면에는 기기 값을 보여주고, 다음에 지역을 바꿀 때 다시 저장된다.
    await writeAccountCity(userId, local).catch(() => {});
  }
  return local;
}

/**
 * 날씨를 볼 지역. 기본은 서울이다.
 * - 로그인했으면 계정(DB)에 저장한다. 휴대폰과 웹에서 같은 지역을 본다.
 * - 로그인하지 않았으면 이 기기 안(AsyncStorage)에 저장한다.
 */
export function useWeatherCity() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: [CITY_KEY, userId ?? 'local'],
    queryFn: async (): Promise<City> => {
      if (!userId) return readLocalCity();
      try {
        return await readAccountCity(userId);
      } catch {
        // 인터넷 문제 등으로 계정 설정을 못 읽으면 기기에 남아 있는 값으로 날씨를 보여준다.
        return readLocalCity();
      }
    },
    staleTime: Infinity,
  });
}

/** 지역을 바꾸고, 날씨 상자에 바로 반영한다. */
export function useSaveWeatherCity() {
  const client = useQueryClient();
  const { session } = useAuth();
  const userId = session?.user.id;

  return useMutation({
    mutationFn: async (city: City) => {
      if (userId) await writeAccountCity(userId, city);
      // 기기에도 같이 남겨 둔다. 인터넷이 안 될 때나 로그아웃한 뒤에도 이 지역을 보여준다.
      await writeLocalCity(city);
      return city;
    },
    onSuccess: (city) => client.setQueryData([CITY_KEY, userId ?? 'local'], city),
  });
}

/** 입력한 이름으로 지역을 찾는다. "검색"을 누를 때마다 한 번씩 부른다. */
export function useSearchPlaces() {
  return useMutation({ mutationFn: searchPlaces });
}

/** 고른 지역의 오늘 날씨. 지역을 아직 읽는 중이면 기다린다. */
export function useWeather(city: City | undefined) {
  return useQuery({
    queryKey: ['weather', city?.id, city?.latitude, city?.longitude],
    queryFn: () => fetchWeather(city as City),
    enabled: city !== undefined,
    staleTime: WEATHER_STALE_MS,
    // 앱을 오래 켜 두어도 30분마다 새로 받아 온다.
    refetchInterval: WEATHER_STALE_MS,
  });
}
