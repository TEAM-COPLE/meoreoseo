import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { fetchWeather, parseSavedCity, searchPlaces, type City } from '@/lib/weather';

const CITY_KEY = ['weather-city'];

/** 휴대폰(웹은 브라우저) 안에 고른 도시를 저장할 때 쓰는 이름 */
const STORAGE_KEY = 'weather-city';

/** 날씨는 30분 동안 다시 묻지 않는다. 그 사이에는 이미 받은 값을 보여준다. */
const WEATHER_STALE_MS = 30 * 60 * 1000;

/**
 * 날씨를 볼 지역. 기본은 서울이다.
 * 기기마다 따로 정하는 값이라 데이터베이스가 아니라 기기 안(AsyncStorage)에 둔다.
 */
export function useWeatherCity() {
  return useQuery({
    queryKey: CITY_KEY,
    queryFn: async (): Promise<City> => {
      try {
        return parseSavedCity(await AsyncStorage.getItem(STORAGE_KEY));
      } catch {
        return parseSavedCity(null);
      }
    },
    staleTime: Infinity,
  });
}

/** 지역을 바꾸고, 날씨 상자에 바로 반영한다. 직접 찾은 지역도 좌표까지 통째로 저장한다. */
export function useSaveWeatherCity() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (city: City) => {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(city));
      return city;
    },
    onSuccess: (city) => client.setQueryData(CITY_KEY, city),
  });
}

/** 입력한 이름으로 지역을 찾는다. "검색"을 누를 때마다 한 번씩 부른다. */
export function useSearchPlaces() {
  return useMutation({ mutationFn: searchPlaces });
}

/** 고른 도시의 오늘 날씨. 도시를 아직 읽는 중이면 기다린다. */
export function useWeather(city: City | undefined) {
  return useQuery({
    queryKey: ['weather', city?.id],
    queryFn: () => fetchWeather(city as City),
    enabled: city !== undefined,
    staleTime: WEATHER_STALE_MS,
    // 앱을 오래 켜 두어도 30분마다 새로 받아 온다.
    refetchInterval: WEATHER_STALE_MS,
  });
}
