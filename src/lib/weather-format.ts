/**
 * 날씨를 글자로 바꾸는 도우미. 다른 기능(알림 등)이 서버 연결 없이 쓸 수 있게 따로 둔다.
 */

/** 날씨 종류 번호(WMO 기준)를 한글 설명과 그림 문자로 바꾼다. */
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
