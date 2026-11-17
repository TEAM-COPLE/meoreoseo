import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { requireUserId, useAuth } from '@/lib/auth';
import { check } from '@/lib/query';
import { supabase } from '@/lib/supabase';
import { DEFAULT_CITY, fetchWeather, searchPlaces, type City } from '@/lib/weather';

const CITY_KEY = 'weather-city';

/** 날씨는 30분 동안 다시 묻지 않는다. 그 사이에는 이미 받은 값을 보여준다. */
const WEATHER_STALE_MS = 30 * 60 * 1000;

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

/** 내 계정에 저장된 지역을 읽는다. 아직 저장한 적이 없으면 기본 지역(서울)을 쓴다. */
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
    return {
      id: data.weather_place_id,
      name: data.weather_name,
      detail: data.weather_detail ?? undefined,
      latitude: data.weather_latitude,
      longitude: data.weather_longitude,
    };
  }

  return DEFAULT_CITY;
}

/**
 * 날씨를 볼 지역. 기본은 서울이며 로그인된 계정의 DB(user_settings)에 저장한다.
 */
export function useWeatherCity(enabled = true) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  return useQuery({
    queryKey: [CITY_KEY, userId],
    enabled: enabled && userId !== null,
    queryFn: () => readAccountCity(userId as string),
    staleTime: Infinity,
  });
}

/** 지역을 바꾸고, 날씨 상자에 바로 반영한다. */
export function useSaveWeatherCity() {
  const client = useQueryClient();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  return useMutation({
    mutationKey: [CITY_KEY],
    mutationFn: async (city: City) => {
      const uid = requireUserId();
      await writeAccountCity(uid, city);
      return city;
    },
    onSuccess: (city) => {
      if (userId) client.setQueryData([CITY_KEY, userId], city);
    },
  });
}

/** 입력한 이름으로 지역을 찾는다. "검색"을 누를 때마다 한 번씩 부른다. */
export function useSearchPlaces() {
  return useMutation({ mutationKey: ['weather-search'], mutationFn: searchPlaces });
}

/** 고른 지역의 오늘 날씨. 지역을 아직 읽는 중이면 기다린다. */
export function useWeather(city: City | undefined, enabled = true) {
  return useQuery({
    queryKey: ['weather', city?.id, city?.latitude, city?.longitude],
    queryFn: () => fetchWeather(city as City),
    enabled: enabled && city !== undefined,
    staleTime: WEATHER_STALE_MS,
    // 앱을 오래 켜 두어도 30분마다 새로 받아 온다.
    refetchInterval: WEATHER_STALE_MS,
  });
}
