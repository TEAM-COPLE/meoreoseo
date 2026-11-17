import { FunctionsHttpError } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { supabase } from './supabase';

/**
 * 날씨 정보.
 * - 국내 지역 날씨: 기상청 단기예보. 기상청 API 키를 숨기려고 Supabase 서버 함수(kma-weather)를 거친다.
 *   (코드: supabase/functions/kma-weather/index.ts)
 * - 해외 지역 날씨, 그리고 기상청이 안 될 때의 예비: Open-Meteo(https://open-meteo.com). API 키가 필요 없다.
 * - 지역 검색: OpenStreetMap 의 Nominatim(https://nominatim.org). 한글 지명을 잘 찾는다.
 * 위치 권한을 묻지 않도록, 사용자가 고르거나 직접 입력한 지역의 좌표로 날씨를 물어본다.
 */

export type City = {
  /** 구분용 이름. 기본 도시는 'seoul' 같은 영문, 직접 찾은 지역은 'osm:...' 이다. */
  id: string;
  /** 화면에 보이는 이름 */
  name: string;
  latitude: number;
  longitude: number;
  /** 검색 결과에서 같은 이름을 구분하기 위한 상세 주소 (예: "부산광역시, 대한민국") */
  detail?: string;
};

/** 아직 지역을 고르지 않았을 때 보여줄 곳 (서울시청 근처) */
export const DEFAULT_CITY: City = {
  id: 'seoul',
  name: '서울',
  latitude: 37.5665,
  longitude: 126.978,
};

/**
 * 기기에 저장해 둔 지역 값(JSON)을 다시 City 로 바꾼다.
 * 저장된 값이 없거나 알아볼 수 없으면 기본 지역(서울)을 쓴다.
 */
export function parseSavedCity(saved: string | null): City {
  if (!saved) return DEFAULT_CITY;
  try {
    const city = JSON.parse(saved) as Partial<City>;
    const valid =
      typeof city.id === 'string' &&
      typeof city.name === 'string' &&
      Number.isFinite(city.latitude) &&
      Number.isFinite(city.longitude);
    return valid ? (city as City) : DEFAULT_CITY;
  } catch {
    return DEFAULT_CITY;
  }
}

/** 정해진 시간 안에 답이 없으면 실패로 보는 fetch */
async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** 지역 검색 API 가 돌려주는 값 중 여기서 쓰는 부분 */
type PlaceResult = {
  osm_type: string;
  osm_id: number;
  name: string;
  display_name: string;
  lat: string;
  lon: string;
};

/** 검색 결과 하나를 City 로 바꾼다. 상세 주소는 이름을 뺀 나머지 앞부분만 짧게 남긴다. */
function toCity(place: PlaceResult): City {
  const parts = place.display_name.split(', ').filter((part) => !/^\d+$/.test(part));
  const name = place.name || parts[0];
  const detail = parts
    .filter((part) => part !== name)
    .slice(0, 3)
    .join(', ');
  return {
    id: `osm:${place.osm_type}${place.osm_id}`,
    name,
    latitude: Number(place.lat),
    longitude: Number(place.lon),
    detail,
  };
}

async function requestPlaces(query: string, onlySettlements: boolean): Promise<PlaceResult[]> {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: '5',
    'accept-language': 'ko',
  });
  // 도시·구·동 같은 "사람 사는 곳"만 먼저 찾는다. 산이나 공원이 먼저 나오지 않게 한다.
  if (onlySettlements) params.set('featureType', 'settlement');

  const response = await fetchWithTimeout(`https://nominatim.openstreetmap.org/search?${params}`, {
    // 검색 서비스 이용 규칙상 어떤 앱인지 밝혀야 한다. 브라우저는 이 값을 직접 정하므로 앱에서만 보낸다.
    headers: Platform.OS === 'web' ? undefined : { 'User-Agent': 'meoreoseo-weather/1.0' },
  });
  if (!response.ok) throw new Error(`지역을 찾지 못했습니다 (${response.status})`);
  return response.json();
}

/**
 * 사용자가 입력한 지역 이름(예: "해운대", "판교", "도쿄")으로 지역을 찾는다. 최대 5개.
 * 검색 서비스 규칙상 글자를 칠 때마다가 아니라 "검색"을 눌렀을 때만 부른다.
 */
export async function searchPlaces(query: string): Promise<City[]> {
  const text = query.trim();
  if (!text) return [];
  let places = await requestPlaces(text, true);
  // 동네 단위로 못 찾으면(외국 도시 등) 조건 없이 한 번 더 찾는다.
  if (places.length === 0) places = await requestPlaces(text, false);
  return places.map(toCity).filter((city) => Number.isFinite(city.latitude));
}

export type Weather = {
  /** 지금 기온 (°C) */
  temperature: number;
  /** 체감 기온 (°C) */
  feelsLike: number;
  /** 오늘 최고·최저 기온 (°C) */
  high: number;
  low: number;
  /** 오늘 비·눈이 올 확률 중 가장 높은 값 (%) */
  rainChance: number | null;
  /** 날씨 종류 번호 (WMO 기준). describeWeather 로 글자와 그림으로 바꾼다. */
  code: number;
  /** 낮이면 true. 맑은 밤에는 해 대신 달을 보여준다. */
  isDay: boolean;
};

/** 날씨 API 가 돌려주는 값 중 여기서 쓰는 부분 */
type ForecastResponse = {
  current: {
    temperature_2m: number;
    apparent_temperature: number;
    weather_code: number;
    is_day: number;
  };
  daily: {
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: (number | null)[];
  };
};

/** 기상청 예보가 있는 곳인지 (대한민국 육지·섬과 가까운 바다를 감싸는 네모 범위) */
export function isInKorea(city: City): boolean {
  return (
    city.latitude >= 32.9 &&
    city.latitude <= 38.7 &&
    city.longitude >= 124.0 &&
    city.longitude <= 132.0
  );
}

/** 기상청 날씨를 서버 함수(kma-weather)로 받아 온다. 15초 안에 답이 없으면 실패로 본다. */
async function fetchKmaWeather(city: City): Promise<Weather> {
  const { data, error } = await supabase.functions.invoke<Weather>('kma-weather', {
    body: { latitude: city.latitude, longitude: city.longitude },
    timeout: 15_000,
  });
  if (error) {
    // 서버 함수가 돌려준 오류 문장(예: "기상청 API 키가 설정되지 않았습니다")을 꺼내 쓴다.
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => null);
      if (body?.error) throw new Error(`기상청 날씨: ${body.error}`);
    }
    throw error;
  }
  if (!data || !Number.isFinite(data.temperature)) throw new Error('기상청 날씨: 받은 값이 비어 있습니다');
  return data;
}

/**
 * 고른 지역의 지금 날씨와 오늘 최고·최저 기온을 가져온다.
 * 국내는 기상청, 해외는 Open-Meteo. 기상청이 실패하면 Open-Meteo 로 한 번 더 시도한다.
 */
export async function fetchWeather(city: City): Promise<Weather> {
  if (!isInKorea(city)) return fetchOpenMeteoWeather(city);
  try {
    return await fetchKmaWeather(city);
  } catch (kmaError) {
    console.warn('[날씨] 기상청 실패, Open-Meteo 로 다시 시도', kmaError);
    try {
      return await fetchOpenMeteoWeather(city);
    } catch {
      // 둘 다 실패하면 기상청 쪽 오류를 알린다. 국내 지역의 주 날씨 출처이기 때문이다.
      throw kmaError;
    }
  }
}

/** Open-Meteo 에서 날씨를 받아 온다. 10초 안에 답이 없으면 실패로 본다. */
async function fetchOpenMeteoWeather(city: City): Promise<Weather> {
  const params = new URLSearchParams({
    latitude: String(city.latitude),
    longitude: String(city.longitude),
    current: 'temperature_2m,apparent_temperature,weather_code,is_day',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'Asia/Seoul',
    forecast_days: '1',
  });

  const response = await fetchWithTimeout(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!response.ok) throw new Error(`날씨를 불러오지 못했습니다 (${response.status})`);
  const data: ForecastResponse = await response.json();

  return {
    temperature: data.current.temperature_2m,
    feelsLike: data.current.apparent_temperature,
    high: data.daily.temperature_2m_max[0],
    low: data.daily.temperature_2m_min[0],
    rainChance: data.daily.precipitation_probability_max[0] ?? null,
    code: data.current.weather_code,
    isDay: data.current.is_day === 1,
  };
}

/** 날씨 종류 번호를 한글 설명과 그림 문자로 바꾼다. */
export function describeWeather(code: number, isDay: boolean): { label: string; icon: string } {
  if (code === 0) return { label: '맑음', icon: isDay ? '☀️' : '🌙' };
  if (code === 1) return { label: '대체로 맑음', icon: isDay ? '🌤️' : '🌙' };
  // 기상청의 "구름많음"도 이 번호로 바꿔서 보여준다.
  if (code === 2) return { label: '구름 많음', icon: '⛅' };
  if (code === 3) return { label: '흐림', icon: '☁️' };
  if (code === 45 || code === 48) return { label: '안개', icon: '🌫️' };
  if (code >= 51 && code <= 57) return { label: '이슬비', icon: '🌦️' };
  // 66, 67: 어는 비 (기상청의 "비/눈"도 66 으로 바꾼다)
  if (code === 66 || code === 67) return { label: '비 또는 눈', icon: '🌨️' };
  if (code >= 61 && code <= 65) return { label: '비', icon: '🌧️' };
  if (code >= 71 && code <= 77) return { label: '눈', icon: '🌨️' };
  if (code >= 80 && code <= 82) return { label: '소나기', icon: '🌦️' };
  if (code === 85 || code === 86) return { label: '눈 소나기', icon: '🌨️' };
  if (code >= 95) return { label: '뇌우', icon: '⛈️' };
  return { label: '알 수 없음', icon: '🌡️' };
}

/** 기온을 "12°" 처럼 반올림해서 보여준다. */
export function formatTemperature(value: number): string {
  return `${Math.round(value)}°`;
}
