/**
 * 기상청 날씨 (Supabase Edge Function: kma-weather)
 *
 * 앱이 위도·경도를 보내면 기상청 단기예보 API(공공데이터포털)로 지금 날씨와 오늘 최고·최저 기온을 받아
 * 앱이 쓰는 모양(src/lib/weather.ts 의 Weather)으로 바꿔 돌려준다.
 *
 * 기상청 API 키는 앱에 넣으면 누구나 꺼내 볼 수 있으므로, 이 서버 함수 안에만 둔다.
 * 키는 Supabase 대시보드 → Edge Functions → Secrets 에 KMA_SERVICE_KEY 라는 이름으로 넣는다.
 *
 * 부르는 법: POST { "latitude": 37.47, "longitude": 126.86 }
 */

const API_BASE = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0';

/** 같은 격자(약 5km 칸)의 날씨는 10분 동안 다시 묻지 않는다. 하루 호출 한도를 아낀다. */
const CACHE_MS = 10 * 60 * 1000;

/** 기상청 서버가 10초 안에 답하지 않으면 실패로 본다. */
const TIMEOUT_MS = 10_000;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type DayForecast = {
  date: string;
  high: number;
  low: number;
  rainChance: number | null;
  code: number;
};

type Weather = {
  temperature: number;
  feelsLike: number;
  high: number;
  low: number;
  rainChance: number | null;
  code: number;
  isDay: boolean;
  /** 오늘부터 3일간의 예보 (아침 브리핑 알림용) */
  days: DayForecast[];
};

type KmaItem = {
  category: string;
  fcstDate?: string;
  fcstTime?: string;
  fcstValue?: string;
  obsrValue?: string;
};

const cache = new Map<string, { expires: number; weather: Weather }>();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/** 우리 앱(공개용 키)에서 온 요청인지 확인한다. 아무나 이 함수를 불러 기상청 호출 한도를 쓰지 못하게 한다. */
function isFromOurApp(request: Request): boolean {
  const sent = request.headers.get('apikey');
  const allowed: string[] = [];
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}');
    allowed.push(...Object.values(keys).filter((key): key is string => typeof key === 'string'));
  } catch {
    // 형식이 다르면 아래의 예전 키만 비교한다.
  }
  const legacy = Deno.env.get('SUPABASE_ANON_KEY');
  if (legacy) allowed.push(legacy);
  // 비교할 키를 하나도 못 읽으면 막지 않는다(함수가 아예 안 되는 것보다 낫다).
  if (allowed.length === 0) return true;
  return sent !== null && allowed.includes(sent);
}

/**
 * 위도·경도를 기상청 격자 번호(nx, ny)로 바꾼다.
 * 기상청이 공개한 람베르트 정각원추도법 계산식 그대로다.
 */
function toGrid(latitude: number, longitude: number): { nx: number; ny: number } {
  const RE = 6371.00877; // 지구 반지름 (km)
  const GRID = 5.0; // 격자 간격 (km)
  const SLAT1 = 30.0;
  const SLAT2 = 60.0;
  const OLON = 126.0;
  const OLAT = 38.0;
  const XO = 43;
  const YO = 136;
  const DEGRAD = Math.PI / 180.0;

  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);

  let ra = Math.tan(Math.PI * 0.25 + latitude * DEGRAD * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = longitude * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;

  return {
    nx: Math.floor(ra * Math.sin(theta) + XO + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5),
  };
}

/** 한국 시간(KST)의 날짜·시각. 서버는 세계 표준시(UTC)로 돌기 때문에 9시간을 더해 계산한다. */
function koreaNow(date = new Date()) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return {
    kst,
    ymd: kst.toISOString().slice(0, 10).replaceAll('-', ''),
    hour: kst.getUTCHours(),
    minute: kst.getUTCMinutes(),
  };
}

/** 하루 전 날짜 (YYYYMMDD) */
function previousDay(kst: Date): string {
  return new Date(kst.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10).replaceAll('-', '');
}

/** 'YYYYMMDD' → 'YYYY-MM-DD' */
function isoOf(ymd: string): string {
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

function pad(hour: number) {
  return `${String(hour).padStart(2, '0')}00`;
}

/** 기상청 오류 코드 03 = 아직 그 시각 자료가 없음 */
class NoDataError extends Error {}

/** 기상청 API 하나를 불러 자료 목록을 받는다. */
async function callKma(
  operation: string,
  params: Record<string, string>,
  serviceKey: string,
): Promise<KmaItem[]> {
  const query = new URLSearchParams({
    serviceKey,
    pageNo: '1',
    dataType: 'JSON',
    ...params,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let text: string;
  try {
    const response = await fetch(`${API_BASE}/${operation}?${query}`, { signal: controller.signal });
    text = await response.text();
    if (!response.ok) throw new Error(`기상청 서버 오류 (${response.status}) ${text.slice(0, 120)}`);
  } finally {
    clearTimeout(timer);
  }

  // 키가 틀리면 JSON 대신 XML 로 답한다.
  if (!text.trim().startsWith('{')) {
    const reason = text.match(/<returnAuthMsg>([^<]+)</)?.[1] ?? text.slice(0, 120);
    throw new Error(`기상청 API 키 문제: ${reason}`);
  }
  const data = JSON.parse(text);
  const header = data?.response?.header;
  if (header?.resultCode === '03') throw new NoDataError(header.resultMsg);
  if (header?.resultCode !== '00') {
    throw new Error(`기상청 오류 ${header?.resultCode}: ${header?.resultMsg ?? '알 수 없음'}`);
  }
  return data.response.body?.items?.item ?? [];
}

/** 단기예보 발표 시각(02, 05, ..., 23시) 중 지금 받을 수 있는 가장 최근 것. 발표 10분 뒤부터 받을 수 있다. */
function latestForecastBase(now: ReturnType<typeof koreaNow>) {
  const minutes = now.hour * 60 + now.minute;
  const hours = [2, 5, 8, 11, 14, 17, 20, 23].filter((h) => h * 60 + 10 <= minutes);
  const hour = hours.at(-1);
  if (hour === undefined) return { base_date: previousDay(now.kst), base_time: '2300' };
  return { base_date: now.ymd, base_time: pad(hour) };
}

/** 오늘 최고·최저 기온이 모두 들어 있는 발표: 오늘 02시 (02시 10분 전이면 어제 23시) */
function morningForecastBase(now: ReturnType<typeof koreaNow>) {
  if (now.hour * 60 + now.minute >= 2 * 60 + 10) return { base_date: now.ymd, base_time: '0200' };
  return { base_date: previousDay(now.kst), base_time: '2300' };
}

/** 지금 관측값(초단기실황). 이번 시각 자료가 아직 없으면 한 시간 전 것을 쓴다. */
async function currentObservation(
  now: ReturnType<typeof koreaNow>,
  grid: { nx: number; ny: number },
  serviceKey: string,
) {
  const params = { nx: String(grid.nx), ny: String(grid.ny), numOfRows: '20' };
  try {
    return await callKma(
      'getUltraSrtNcst',
      { ...params, base_date: now.ymd, base_time: pad(now.hour) },
      serviceKey,
    );
  } catch (error) {
    if (!(error instanceof NoDataError)) throw error;
    const before = koreaNow(new Date(now.kst.getTime() - 9 * 60 * 60 * 1000 - 60 * 60 * 1000));
    return callKma(
      'getUltraSrtNcst',
      { ...params, base_date: before.ymd, base_time: pad(before.hour) },
      serviceKey,
    );
  }
}

/**
 * 체감 온도. 기상청 방식을 따른다.
 * - 여름(5~9월): 기온과 습도로 계산
 * - 겨울(10~4월): 기온 10도 이하이고 바람이 있으면 바람 냉각 계산
 */
function feelsLike(temperature: number, humidity: number | null, windMs: number | null, month: number) {
  if (month >= 5 && month <= 9 && humidity !== null) {
    const rh = humidity;
    const t = temperature;
    // 습구 온도 (Stull 추정식)
    const tw =
      t * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) +
      Math.atan(t + rh) -
      Math.atan(rh - 1.67633) +
      0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh) -
      4.686035;
    return -0.2442 + 0.55399 * tw + 0.45535 * t - 0.0022 * tw * tw + 0.00278 * tw * t + 3.0;
  }
  if (windMs !== null) {
    const v = windMs * 3.6; // m/s → km/h
    if (temperature <= 10 && v >= 4.8) {
      const p = Math.pow(v, 0.16);
      return 13.12 + 0.6215 * temperature - 11.37 * p + 0.3965 * p * temperature;
    }
  }
  return temperature;
}

/** 해가 떠 있는지 대략 계산한다(태양 고도). 맑은 밤에 해 대신 달 그림을 보여주려는 용도다. */
function isDaytime(latitude: number, longitude: number, date = new Date()) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - start) / 86_400_000);
  const rad = Math.PI / 180;
  const declination = 23.44 * Math.sin((2 * Math.PI * (284 + dayOfYear)) / 365) * rad;
  const solarHours = date.getUTCHours() + date.getUTCMinutes() / 60 + longitude / 15;
  const hourAngle = 15 * (solarHours - 12) * rad;
  const lat = latitude * rad;
  const elevation = Math.asin(
    Math.sin(lat) * Math.sin(declination) + Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle),
  );
  return elevation > -0.833 * rad;
}

/**
 * 기상청의 강수 형태(PTY)·하늘 상태(SKY)를 앱이 쓰는 날씨 번호(WMO)로 바꾼다.
 * PTY: 1 비, 2 비/눈, 3 눈, 4 소나기, 5 빗방울, 6 빗방울눈날림, 7 눈날림
 * SKY: 1 맑음, 3 구름많음, 4 흐림
 */
function toWeatherCode(pty: number | null, sky: number | null): number {
  switch (pty) {
    case 1:
      return 61;
    case 2:
      return 66;
    case 3:
      return 71;
    case 4:
      return 80;
    case 5:
      return 51;
    case 6:
      return 56;
    case 7:
      return 77;
  }
  if (sky === 4) return 3;
  if (sky === 3) return 2;
  return 0;
}

function toNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** 가장 많이 나온 값 (같으면 먼저 나온 값) */
function mostCommon(values: number[]): number | null {
  const counts = new Map<number, number>();
  let best: number | null = null;
  for (const value of values) {
    const count = (counts.get(value) ?? 0) + 1;
    counts.set(value, count);
    if (best === null || count > (counts.get(best) ?? 0)) best = value;
  }
  return best;
}

/**
 * 그날 낮(6시~21시)의 대표 날씨 번호.
 * 비·눈이 오는 시간이 있으면 그중 가장 많은 강수 형태, 없으면 가장 많은 하늘 상태.
 */
function dayCode(items: KmaItem[]): number {
  const daytime = items.filter((item) => {
    const hour = Number(item.fcstTime?.slice(0, 2));
    return hour >= 6 && hour <= 21;
  });
  const pick = (category: string) =>
    (daytime.length > 0 ? daytime : items)
      .filter((item) => item.category === category)
      .map((item) => toNumber(item.fcstValue))
      .filter((value): value is number => value !== null);
  const rain = mostCommon(pick('PTY').filter((value) => value > 0));
  if (rain !== null) return toWeatherCode(rain, null);
  return toWeatherCode(0, mostCommon(pick('SKY')));
}

async function loadWeather(latitude: number, longitude: number, serviceKey: string): Promise<Weather> {
  const grid = toGrid(latitude, longitude);
  const cacheKey = `${grid.nx},${grid.ny}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.weather;

  const now = koreaNow();
  const gridParams = { nx: String(grid.nx), ny: String(grid.ny) };
  const latestBase = latestForecastBase(now);
  const morningBase = morningForecastBase(now);
  const sameBase =
    latestBase.base_date === morningBase.base_date && latestBase.base_time === morningBase.base_time;

  const [observed, latest, morning] = await Promise.all([
    currentObservation(now, grid, serviceKey),
    // 오늘 남은 시간 + 내일 + 모레 예보가 다 들어가도록 넉넉히 받는다.
    callKma('getVilageFcst', { ...gridParams, ...latestBase, numOfRows: '1000' }, serviceKey),
    sameBase
      ? Promise.resolve(null)
      : callKma('getVilageFcst', { ...gridParams, ...morningBase, numOfRows: '400' }, serviceKey),
  ]);

  const observedValue = (category: string) =>
    toNumber(observed.find((item) => item.category === category)?.obsrValue);

  const temperature = observedValue('T1H');
  if (temperature === null) throw new Error('기상청 자료에 지금 기온이 없습니다');

  // 오늘 자료만 남긴다.
  const todayLatest = latest.filter((item) => item.fcstDate === now.ymd);
  const todayMorning = (morning ?? latest).filter((item) => item.fcstDate === now.ymd);
  const values = (items: KmaItem[], category: string) =>
    items
      .filter((item) => item.category === category)
      .map((item) => toNumber(item.fcstValue))
      .filter((value): value is number => value !== null);

  // 최고·최저: 기상청이 발표한 오늘 최고(TMX)·최저(TMN). 없으면 시간별 기온 중 가장 높고 낮은 값.
  const hourly = [...values(todayMorning, 'TMP'), ...values(todayLatest, 'TMP'), temperature];
  const high = Math.max(values(todayMorning, 'TMX')[0] ?? Math.max(...hourly), temperature);
  const low = Math.min(values(todayMorning, 'TMN')[0] ?? Math.min(...hourly), temperature);

  // 비 올 확률: 오늘 남은 시간 중 가장 높은 값. 남은 예보가 없으면(밤늦게) 표시하지 않는다.
  const chances = values(todayLatest, 'POP');
  const rainChance = chances.length > 0 ? Math.max(...chances) : null;

  // 하늘 상태는 관측에 없어서 가장 가까운 시각의 예보를 쓴다.
  const nextSky = toNumber(latest.find((item) => item.category === 'SKY')?.fcstValue);
  const month = now.kst.getUTCMonth() + 1;

  // 오늘·내일·모레 예보. 오늘은 위에서 계산한 값과 같게 맞춘다.
  const days: DayForecast[] = [
    {
      date: isoOf(now.ymd),
      high,
      low,
      rainChance,
      code: dayCode([...todayMorning, ...todayLatest]),
    },
  ];
  for (let offset = 1; offset <= 2; offset++) {
    const ymd = koreaNow(new Date(Date.now() + offset * 86_400_000)).ymd;
    const items = latest.filter((item) => item.fcstDate === ymd);
    const temps = values(items, 'TMP');
    if (temps.length === 0) continue; // 아직 그날 예보가 없다.
    const pops = values(items, 'POP');
    days.push({
      date: isoOf(ymd),
      high: values(items, 'TMX')[0] ?? Math.max(...temps),
      low: values(items, 'TMN')[0] ?? Math.min(...temps),
      rainChance: pops.length > 0 ? Math.max(...pops) : null,
      code: dayCode(items),
    });
  }

  const weather: Weather = {
    temperature,
    feelsLike: feelsLike(temperature, observedValue('REH'), observedValue('WSD'), month),
    high,
    low,
    rainChance,
    code: toWeatherCode(observedValue('PTY'), nextSky),
    isDay: isDaytime(latitude, longitude),
    days,
  };
  cache.set(cacheKey, { expires: Date.now() + CACHE_MS, weather });
  return weather;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (request.method !== 'POST') return json({ error: 'POST 로 불러 주세요' }, 405);
  if (!isFromOurApp(request)) return json({ error: '허용되지 않은 요청입니다' }, 401);

  let latitude: number;
  let longitude: number;
  try {
    const body = await request.json();
    latitude = Number(body.latitude);
    longitude = Number(body.longitude);
  } catch {
    return json({ error: '위도·경도를 보내 주세요' }, 400);
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return json({ error: '위도·경도가 올바르지 않습니다' }, 400);
  }

  let serviceKey = Deno.env.get('KMA_SERVICE_KEY')?.trim();
  if (!serviceKey) {
    return json({ error: '기상청 API 키가 설정되지 않았습니다 (KMA_SERVICE_KEY)' }, 500);
  }
  // 공공데이터포털의 "Encoding" 키를 넣었으면 원래 글자로 되돌린다(아래에서 다시 인코딩한다).
  if (serviceKey.includes('%')) serviceKey = decodeURIComponent(serviceKey);

  try {
    return json(await loadWeather(latitude, longitude, serviceKey));
  } catch (error) {
    const message =
      error instanceof Error
        ? error.name === 'AbortError'
          ? '기상청 서버가 응답하지 않습니다'
          : error.message
        : String(error);
    return json({ error: message }, 502);
  }
});
