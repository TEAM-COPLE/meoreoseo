/**
 * 구글 캘린더 양방향 연동 (Supabase Edge Function: google-calendar)
 *
 * 멀어서 일정(events 표)과 구글 캘린더를 서로 맞춘다.
 *   - "멀어서" 캘린더: 앱에서 새로 만든 일정이 들어가는 곳 (항상 맞춘다)
 *   - 사용자가 고른 다른 캘린더(기본 캘린더 등): 그 일정도 앱에서 보고 고칠 수 있다
 * 구글 캘린더에 들어간 일정은 휴대폰 캘린더 앱, 노션 캘린더 등에서도 보이고 고칠 수 있다.
 *
 * 하는 일
 *   GET  /google-calendar/callback  구글 로그인을 마치고 돌아오는 곳 (토큰을 받아 저장)
 *   POST { action: 'status' }       연결 상태 알려 주기
 *   POST { action: 'start', returnTo } 구글 로그인 주소 만들어 주기
 *   POST { action: 'calendars' }    고를 수 있는 구글 캘린더 목록
 *   POST { action: 'select', calendarIds } 맞출 캘린더 정하기
 *   POST { action: 'sync' }         지금 바로 맞추기
 *   POST { action: 'disconnect' }   연결 끊기
 *   POST { action: 'cron' }         5분마다 예약 작업이 불러서 모든 연결을 맞춘다
 *
 * 비밀 값 (Supabase 대시보드 → Edge Functions → Secrets 에 사용자가 직접 넣는다)
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 *
 * 구글 토큰은 앱이 읽을 수 없는 표(google_calendar_connections)에 암호화해서 둔다.
 * 이 함수는 배포할 때 "JWT 확인"을 끈다(구글이 돌아오는 주소에는 로그인 정보가 없기 때문).
 * 대신 POST 요청은 아래에서 직접 로그인한 사용자인지 확인한다.
 */

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { addDays, daysBetween, fromRecurrence, toRRule } from './repeat.ts';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

// ───────────────────────── 설정 ─────────────────────────

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';
/**
 * 구글 로그인을 마치고 돌아오는 주소.
 * 구글 동의 화면에 "meoreoseo.vercel.app에서 …"처럼 우리 주소가 보이도록,
 * 웹사이트 주소로 받은 뒤 이 함수로 넘긴다 (vercel.json 의 /google-callback).
 * 구글 클라우드 콘솔의 "승인된 리디렉션 URI"에도 같은 주소가 있어야 한다.
 */
const REDIRECT_URI = 'https://meoreoseo.vercel.app/google-callback';

/** 앱이 만든 캘린더("멀어서")와 그 안의 일정을 다루는 권한. 이것만은 꼭 있어야 한다. */
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
/** 다른 캘린더의 일정을 보고 고치는 권한 */
const EVENTS_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
/** 캘린더 목록(이름·색)을 보는 권한 */
const LIST_SCOPE = 'https://www.googleapis.com/auth/calendar.calendarlist.readonly';
const SCOPES = ['openid', 'email', CALENDAR_SCOPE, EVENTS_SCOPE, LIST_SCOPE].join(' ');

/** 다른 캘린더를 처음 받을 때는 1년 전 일정부터만 받는다 (너무 많지 않게). */
const IMPORT_DAYS_BACK = 365;

const CALENDAR_NAME = '멀어서';
const DEFAULT_TIME_ZONE = 'Asia/Seoul';
const GOOGLE_API = 'https://www.googleapis.com/calendar/v3';
const FALLBACK_RETURN = 'https://meoreoseo.vercel.app/account';

/** 한 번에 구글로 보내는 일정 수 (나머지는 다음 차례에) */
const PUSH_LIMIT = 150;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** 태그 색 → 구글 일정 색 번호 */
const COLOR_IDS: Record<string, string> = {
  red: '11',
  orange: '6',
  yellow: '5',
  green: '10',
  teal: '7',
  blue: '9',
  indigo: '1',
  purple: '3',
  pink: '4',
  gray: '8',
};

function serviceKey(): string {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
    const first = Object.values(keys).find((key) => typeof key === 'string');
    if (typeof first === 'string') return first;
  } catch {
    // 아래에서 빈 값이면 실패한다.
  }
  return '';
}

const db: SupabaseClient = createClient(SUPABASE_URL, serviceKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const isConfigured = () => CLIENT_ID !== '' && CLIENT_SECRET !== '';

// ───────────────────────── 작은 도우미 ─────────────────────────

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function fail(code: string, message: string, status = 400) {
  return json({ error: code, message }, status);
}

function redirect(to: string) {
  return new Response(null, { status: 302, headers: { Location: to } });
}

function randomHex(bytes: number): string {
  const array = crypto.getRandomValues(new Uint8Array(bytes));
  return [...array].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 두 글자가 같은지, 걸린 시간으로 내용을 짐작할 수 없게 비교한다. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function short(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

/** 로그인을 마치고 돌아갈 주소로 허락된 곳인지 */
function isAllowedReturn(url: unknown): url is string {
  if (typeof url !== 'string' || url.length > 1000) return false;
  return (
    url.startsWith('https://meoreoseo.vercel.app/') ||
    /^https:\/\/meoreoseo(-[a-z0-9-]+)?\.vercel\.app\//.test(url) ||
    url.startsWith('http://localhost:') ||
    url.startsWith('meoreoseo://') ||
    url.startsWith('exp://')
  );
}

function withParam(url: string, key: string, value: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set(key, value);
    return parsed.toString();
  } catch {
    return `${FALLBACK_RETURN}?${key}=${value}`;
  }
}

/** 요청에 담긴 로그인 정보로 사용자 id 를 알아낸다. 아니면 null */
async function userIdOf(request: Request): Promise<string | null> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

// ───────────────────────── 토큰 암호화 ─────────────────────────
// 혹시 DB 내용이 새어 나가도 구글 토큰을 바로 쓸 수 없게, 서버 비밀 값으로 만든 열쇠로 잠가 둔다.

let keyPromise: Promise<CryptoKey> | null = null;
function tokenKey(): Promise<CryptoKey> {
  keyPromise ??= crypto.subtle
    .digest('SHA-256', new TextEncoder().encode(`meoreoseo-google-token:${CLIENT_SECRET}`))
    .then((raw) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']));
  return keyPromise;
}

function toBase64(bytes: Uint8Array): string {
  let text = '';
  for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text);
}

function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

async function encrypt(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await tokenKey(),
    new TextEncoder().encode(plain),
  );
  return `v1.${toBase64(iv)}.${toBase64(new Uint8Array(data))}`;
}

async function decrypt(sealed: string): Promise<string | null> {
  const [version, iv, data] = sealed.split('.');
  if (version !== 'v1' || !iv || !data) return null;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(iv) },
      await tokenKey(),
      fromBase64(data),
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

// ───────────────────────── 시간대 계산 ─────────────────────────

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

function validTimeZone(timeZone: unknown): string {
  if (typeof timeZone !== 'string' || !timeZone) return DEFAULT_TIME_ZONE;
  try {
    formatterFor(timeZone);
    return timeZone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

/** 어떤 순간(ms)이 그 시간대에서 몇 년 몇 월 며칠 몇 시인지 */
function partsIn(ms: number, timeZone: string) {
  const map: Record<string, number> = {};
  for (const part of formatterFor(timeZone).formatToParts(new Date(ms))) {
    if (part.type !== 'literal') map[part.type] = Number(part.value);
  }
  return { y: map.year, m: map.month, d: map.day, h: map.hour % 24, mi: map.minute, s: map.second };
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** 순간(ms) → 그 시간대의 { date: 'YYYY-MM-DD', time: 'HH:MM:SS' } */
function localOf(ms: number, timeZone: string) {
  const p = partsIn(ms, timeZone);
  return { date: `${pad(p.y, 4)}-${pad(p.m)}-${pad(p.d)}`, time: `${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}` };
}

/** 그 시간대의 날짜·시각 → 순간(ms) */
function instantOf(date: string, time: string, timeZone: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi, s] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h || 0, mi || 0, s || 0);
  const offset = (ms: number) => {
    const p = partsIn(ms, timeZone);
    return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - ms;
  };
  let ms = guess - offset(guess);
  ms = guess - offset(ms);
  return ms;
}

/** 'YYYYMMDDTHHMMSSZ' (RRULE 의 UTC 시각 모양) */
function icalUtc(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

const compact = (date: string) => date.replace(/-/g, '');

// ───────────────────────── 구글 API ─────────────────────────

type Connection = {
  user_id: string;
  google_email: string | null;
  refresh_token: string;
  access_token: string | null;
  access_token_expires_at: string | null;
  calendar_id: string | null;
  calendar_name: string | null;
  time_zone: string;
  sync_token: string | null;
  status: 'ok' | 'reauth';
  last_synced_at: string | null;
  last_error: string | null;
  scopes: string;
};

/** 맞추기로 고른 구글 캘린더 하나 */
type Link = {
  user_id: string;
  calendar_id: string;
  name: string | null;
  color: string | null;
  access_role: string | null;
  is_app: boolean;
  is_primary: boolean;
  sync_token: string | null;
};

/** 다른 캘린더까지 다룰 권한을 받았는지 */
function canUseOtherCalendars(conn: Pick<Connection, 'scopes'>): boolean {
  const granted = conn.scopes.split(' ');
  return granted.includes(EVENTS_SCOPE) && granted.includes(LIST_SCOPE);
}

class ReauthError extends Error {}

async function tokenRequest(params: Record<string, string>) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...params }),
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, data: data as Record<string, unknown> };
}

/** 쓸 수 있는 구글 출입증(access token). 만료가 가까우면 새로 받는다. */
async function accessTokenFor(conn: Connection): Promise<string> {
  if (conn.access_token && conn.access_token_expires_at) {
    if (new Date(conn.access_token_expires_at).getTime() - Date.now() > 60_000) {
      const token = await decrypt(conn.access_token);
      if (token) return token;
    }
  }
  const refresh = await decrypt(conn.refresh_token);
  if (!refresh) throw new ReauthError('저장된 구글 연결 정보를 읽을 수 없습니다.');
  const { ok, data } = await tokenRequest({ grant_type: 'refresh_token', refresh_token: refresh });
  if (!ok || typeof data.access_token !== 'string') {
    if (data.error === 'invalid_grant') throw new ReauthError('구글 연결이 끊어졌습니다.');
    throw new Error(`구글 토큰 갱신 실패 (${String(data.error ?? 'unknown')})`);
  }
  const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 3600;
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  await db
    .from('google_calendar_connections')
    .update({ access_token: await encrypt(data.access_token), access_token_expires_at: expiresAt })
    .eq('user_id', conn.user_id);
  return data.access_token;
}

type GoogleResult = { status: number; data: Record<string, unknown> };

async function google(token: string, path: string, init: RequestInit = {}): Promise<GoogleResult> {
  const response = await fetch(`${GOOGLE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (response.status === 204) return { status: 204, data: {} };
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) throw new ReauthError('구글 연결이 끊어졌습니다.');
  return { status: response.status, data: data as Record<string, unknown> };
}

function googleError(result: GoogleResult): Error {
  const message = (result.data.error as { message?: string } | undefined)?.message ?? '';
  return new Error(`구글 캘린더 오류 ${result.status} ${short(message, 120)}`);
}

// ───────────────────────── 멀어서 일정 ↔ 구글 일정 ─────────────────────────

type EventRow = {
  id: string;
  user_id: string;
  title: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  memo: string | null;
  repeat: string | null;
  repeat_until: string | null;
  tag_id: string | null;
  excluded_dates: string[];
  google_event_id: string | null;
  google_calendar_id: string | null;
  google_readonly: boolean;
  google_dirty: boolean;
  local_version: number;
  google_original: Original | null;
};

/** 구글에서 받은 원래 모양 중 멀어서가 그대로 담지 못하는 것들 */
type Original = {
  /** 여러 날짜에 걸친 하루 종일 일정이면 그 날 수 */
  spanDays?: number;
  /** 자정을 넘는 시간 일정이면 그 길이(분) */
  keepMinutes?: number;
  /** 구글 쪽 반복 규칙에 멀어서가 표현 못 하는 것이 있었는지 */
  unsupported?: boolean;
  /** 구글 쪽에 반복 규칙이 있었는지 */
  hadRecurrence?: boolean;
  /** 반복 중 따로 고쳐진 날짜들 (그 날은 따로 된 일정으로 들어온다) */
  modifiedDates?: string[];
  /** 반복 중 구글에서 지워진 날짜들 */
  cancelledDates?: string[];
  /** 반복 일정의 한 회차만 고친 일정이면, 원래 반복 일정의 구글 id */
  instanceOf?: string;
};

type GoogleTime = { date?: string; dateTime?: string; timeZone?: string };
type GoogleEvent = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  start?: GoogleTime;
  end?: GoogleTime;
  recurrence?: string[];
  recurringEventId?: string;
  originalStartTime?: GoogleTime;
  extendedProperties?: { private?: Record<string, string> };
  /** 일정을 만든 사람. self 가 true 면 나, 없으면 다른 사람이 초대한 일정 */
  organizer?: { self?: boolean };
  /** default 가 아닌 일정(생일, 부재중, 지메일에서 온 일정 등)은 고칠 수 없다 */
  eventType?: string;
};

/** 구글 일정 시각 → 우리 시간대의 { date, time } (하루 종일이면 time 은 null) */
function readTime(value: GoogleTime | undefined, timeZone: string) {
  if (!value) return null;
  if (value.date) return { date: value.date, time: null as string | null, ms: Date.parse(`${value.date}T00:00:00Z`) };
  if (value.dateTime) {
    const ms = Date.parse(value.dateTime);
    if (Number.isNaN(ms)) return null;
    const local = localOf(ms, timeZone);
    return { date: local.date, time: local.time.slice(0, 5) + ':00', ms };
  }
  return null;
}

/** 구글 반복 규칙 속 날짜 값(YYYYMMDD, YYYYMMDDTHHMMSS[Z]) → 우리 시간대의 날짜 */
function recurrenceDate(timeZone: string) {
  return (value: string, tzid: string | null): string | null => {
    const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value);
    if (!match) return null;
    const date = `${match[1]}-${match[2]}-${match[3]}`;
    if (!match[4]) return date;
    const time = `${match[4]}:${match[5]}:${match[6]}`;
    if (match[7]) return localOf(Date.parse(`${date}T${time}Z`), timeZone).date;
    if (tzid && tzid !== timeZone) return localOf(instantOf(date, time, validTimeZone(tzid)), timeZone).date;
    return date;
  };
}

type LocalFields = Pick<
  EventRow,
  'title' | 'event_date' | 'start_time' | 'end_time' | 'memo' | 'repeat' | 'repeat_until' | 'excluded_dates'
> & { google_original: Original };

/** 구글 일정 하나 → 멀어서 일정 칸들. 읽을 수 없는 일정이면 null */
function fromGoogle(item: GoogleEvent, timeZone: string, previous: Original | null): LocalFields | null {
  const start = readTime(item.start, timeZone);
  const end = readTime(item.end, timeZone);
  if (!start) return null;

  const original: Original = {
    modifiedDates: previous?.modifiedDates ?? [],
    cancelledDates: previous?.cancelledDates ?? [],
  };
  if (item.recurringEventId) original.instanceOf = item.recurringEventId;

  let endTime: string | null = null;
  if (start.time === null) {
    const span = end?.date ? daysBetween(start.date, end.date) : 1;
    if (span > 1) original.spanDays = Math.min(span, 366);
  } else if (end && end.time !== null) {
    if (end.date === start.date && end.time > start.time) {
      endTime = end.time;
    } else if (end.ms > start.ms) {
      // 자정을 넘는 일정: 멀어서에는 끝 시각 없이 두고, 길이는 기억해 둔다.
      original.keepMinutes = Math.min(Math.round((end.ms - start.ms) / 60_000), 60 * 24 * 30);
    }
  }

  let repeat: string | null = null;
  let until: string | null = null;
  let excluded: string[] = [];
  if (!item.recurringEventId && item.recurrence && item.recurrence.length > 0) {
    original.hadRecurrence = true;
    const parsed = fromRecurrence(item.recurrence, start.date, recurrenceDate(timeZone));
    original.unsupported = parsed.unsupported;
    repeat = parsed.repeat;
    until = parsed.until;
    excluded = parsed.excluded;
    if (until && until < start.date) {
      repeat = null;
      until = null;
    }
  }
  const allExcluded = repeat
    ? [...new Set([...excluded, ...(original.modifiedDates ?? []), ...(original.cancelledDates ?? [])])]
        .sort()
        .slice(0, 500)
    : [];

  const title = (item.summary ?? '').trim();
  const memo = (item.description ?? '').trim();
  return {
    title: short(title || '(제목 없음)', 200),
    event_date: start.date,
    start_time: start.time,
    end_time: endTime,
    memo: memo ? short(memo, 5000) : null,
    repeat,
    repeat_until: repeat ? until : null,
    excluded_dates: allExcluded,
    google_original: original,
  };
}

/** 멀어서 일정 → 구글에 보낼 내용 */
function toGoogle(row: EventRow, timeZone: string, tagColors: Map<string, string>, isNew: boolean) {
  const original = row.google_original ?? {};
  const body: Record<string, unknown> = {
    summary: row.title,
    description: row.memo ?? '',
    extendedProperties: { private: { meoreoseoId: row.id } },
  };
  const color = row.tag_id ? COLOR_IDS[tagColors.get(row.tag_id) ?? ''] : undefined;
  if (color) body.colorId = color;

  if (!row.start_time) {
    const span = original.spanDays && original.spanDays > 1 ? original.spanDays : 1;
    body.start = { date: row.event_date };
    body.end = { date: addDays(row.event_date, span) };
  } else {
    const start = row.start_time.slice(0, 8).padEnd(8, ':00');
    body.start = { dateTime: `${row.event_date}T${start}`, timeZone };
    if (row.end_time) {
      body.end = { dateTime: `${row.event_date}T${row.end_time.slice(0, 8).padEnd(8, ':00')}`, timeZone };
    } else if (original.keepMinutes && original.keepMinutes > 0) {
      const endMs = instantOf(row.event_date, start, timeZone) + original.keepMinutes * 60_000;
      body.end = { dateTime: new Date(endMs).toISOString(), timeZone };
    } else {
      // 끝 시각이 없으면 시작 시각에 끝나는 일정으로 둔다.
      body.end = { dateTime: `${row.event_date}T${start}`, timeZone };
    }
  }

  // 한 회차만 고친 일정에는 반복 규칙을 넣을 수 없다.
  if (original.instanceOf) return body;

  const rrule = row.repeat
    ? toRRule(
        row.repeat,
        row.event_date,
        row.repeat_until
          ? row.start_time
            ? icalUtc(instantOf(row.repeat_until, '23:59:59', timeZone))
            : compact(row.repeat_until)
          : null,
      )
    : null;
  if (rrule) {
    const skip = new Set([...(original.modifiedDates ?? []), ...(original.cancelledDates ?? [])]);
    const dates = (row.excluded_dates ?? []).filter((date) => !skip.has(date));
    const lines = [rrule];
    if (dates.length > 0) {
      if (row.start_time) {
        const time = row.start_time.slice(0, 8).replace(/:/g, '').padEnd(6, '0');
        lines.push(`EXDATE;TZID=${timeZone}:${dates.map((d) => `${compact(d)}T${time}`).join(',')}`);
      } else {
        lines.push(`EXDATE;VALUE=DATE:${dates.map(compact).join(',')}`);
      }
    }
    body.recurrence = lines;
  } else if (original.unsupported) {
    // 멀어서가 표현 못 하는 구글 반복은 그대로 둔다(보내지 않으면 구글이 원래 것을 지킨다).
  } else if (!isNew && original.hadRecurrence) {
    body.recurrence = [];
  }
  return body;
}

// ───────────────────────── 동기화 ─────────────────────────

type SyncResult = { pushed: number; pulled: number; removed: number; failed: number };

/** 구글이 잠깐 바쁜 것인지 (그러면 다음 차례에 다시 해 본다) */
function isTemporary(result: GoogleResult): boolean {
  if (result.status >= 500 || result.status === 429) return true;
  if (result.status !== 403) return false;
  const errors = (result.data.error as { errors?: { reason?: string }[] } | undefined)?.errors ?? [];
  return errors.some((e) => /rateLimit|quota/i.test(e.reason ?? ''));
}

async function loadConnection(userId: string): Promise<Connection | null> {
  const { data } = await db
    .from('google_calendar_connections')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  return (data as Connection | null) ?? null;
}

async function loadLinks(userId: string): Promise<Link[]> {
  const { data, error } = await db
    .from('google_calendar_links')
    .select('*')
    .eq('user_id', userId)
    .order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []) as Link[];
}

/** 이 칸들을 비우면 "아직 구글에 안 간 일정"이 된다 */
const UNLINKED = {
  google_event_id: null,
  google_calendar_id: null,
  google_original: null,
  google_readonly: false,
  google_dirty: true,
};

/**
 * 처음부터 다시 맞추도록 되돌린다 (연결을 끊거나 다른 구글 계정으로 바꿀 때).
 * - 다른 캘린더에서 받아 온 일정은 앱에서 뺀다 (구글에는 그대로 있다)
 * - 앱에서 만든 일정은 남기고, 다음에 다시 보낼 일정으로 표시한다
 */
async function resetAll(userId: string, appCalendarId: string | null) {
  let imported = db.from('events').delete().eq('user_id', userId).not('google_calendar_id', 'is', null);
  if (appCalendarId) imported = imported.neq('google_calendar_id', appCalendarId);
  await imported;
  await db.from('events').update(UNLINKED).eq('user_id', userId);
  await db.from('google_calendar_deletions').delete().eq('user_id', userId);
  await db.from('google_calendar_links').delete().eq('user_id', userId);
}

/** 구글에서 "멀어서" 캘린더가 지워졌을 때: 그 안에 있던 일정을 다시 보낼 일정으로 되돌린다 */
async function resetAppCalendar(userId: string, oldId: string) {
  await db.from('events').update(UNLINKED).eq('user_id', userId).eq('google_calendar_id', oldId);
  await db.from('google_calendar_deletions').delete().eq('user_id', userId).eq('google_calendar_id', oldId);
  await db.from('google_calendar_deletions').delete().eq('user_id', userId).is('google_calendar_id', null);
  await db.from('google_calendar_links').delete().eq('user_id', userId).eq('calendar_id', oldId);
}

/** 고른 캘린더 하나를 뺀다: 그 캘린더에서 받아 온 일정을 앱에서 지운다 (구글에는 그대로) */
async function removeLink(userId: string, calendarId: string) {
  await db.from('events').delete().eq('user_id', userId).eq('google_calendar_id', calendarId);
  await db.from('google_calendar_deletions').delete().eq('user_id', userId).eq('google_calendar_id', calendarId);
  await db
    .from('google_calendar_links')
    .delete()
    .eq('user_id', userId)
    .eq('calendar_id', calendarId)
    .eq('is_app', false);
}

/** "멀어서" 캘린더가 있는지 확인하고, 없으면 만든다. 새로 만들었으면 fresh=true */
async function ensureCalendar(conn: Connection, token: string): Promise<{ id: string; fresh: boolean }> {
  if (conn.calendar_id) {
    const found = await google(token, `/calendars/${encodeURIComponent(conn.calendar_id)}`);
    if (found.status === 200) {
      const timeZone = validTimeZone(found.data.timeZone);
      if (timeZone !== conn.time_zone) {
        conn.time_zone = timeZone;
        await db.from('google_calendar_connections').update({ time_zone: timeZone }).eq('user_id', conn.user_id);
      }
      await saveAppLink(conn.user_id, conn.calendar_id);
      return { id: conn.calendar_id, fresh: false };
    }
    if (found.status !== 404 && found.status !== 410) throw googleError(found);
    // 사용자가 구글에서 캘린더를 지웠다 → 새로 만들고 처음부터 다시 맞춘다.
    await resetAppCalendar(conn.user_id, conn.calendar_id);
  }

  // 예전에 연결했다가 끊은 경우, 남아 있는 "멀어서" 캘린더를 다시 쓴다.
  let calendarId: string | null = null;
  let fresh = false;
  const list = await google(token, '/users/me/calendarList?minAccessRole=owner&maxResults=250');
  if (list.status === 200) {
    const items = (list.data.items as { id: string; summary?: string }[] | undefined) ?? [];
    calendarId = items.find((item) => item.summary === CALENDAR_NAME)?.id ?? null;
  }
  if (!calendarId) {
    const created = await google(token, '/calendars', {
      method: 'POST',
      body: JSON.stringify({ summary: CALENDAR_NAME, timeZone: conn.time_zone || DEFAULT_TIME_ZONE }),
    });
    if (created.status !== 200) throw googleError(created);
    calendarId = String(created.data.id);
    fresh = true;
  }
  conn.calendar_id = calendarId;
  await db
    .from('google_calendar_connections')
    .update({ calendar_id: calendarId, calendar_name: CALENDAR_NAME, sync_token: null })
    .eq('user_id', conn.user_id);
  await saveAppLink(conn.user_id, calendarId);
  return { id: calendarId, fresh };
}

/** "멀어서" 캘린더를 맞출 캘린더 목록에 넣어 둔다 (이미 있으면 그대로) */
async function saveAppLink(userId: string, calendarId: string) {
  await db
    .from('google_calendar_links')
    .upsert(
      { user_id: userId, calendar_id: calendarId, name: CALENDAR_NAME, access_role: 'owner', is_app: true },
      { onConflict: 'user_id,calendar_id', ignoreDuplicates: true },
    );
}

/** 앱에서 지운 일정을 구글에서도 지운다 */
async function pushDeletions(conn: Connection, token: string, appCalendar: string): Promise<number> {
  const { data } = await db
    .from('google_calendar_deletions')
    .select('id, google_event_id, google_calendar_id')
    .eq('user_id', conn.user_id)
    .order('id')
    .limit(200);
  let count = 0;
  for (const row of data ?? []) {
    const calendar = (row.google_calendar_id as string | null) ?? appCalendar;
    const result = await google(
      token,
      `/calendars/${encodeURIComponent(calendar)}/events/${encodeURIComponent(row.google_event_id)}`,
      { method: 'DELETE' },
    );
    if (result.status >= 300 && isTemporary(result)) throw googleError(result);
    if (result.status >= 300 && result.status !== 404 && result.status !== 410) {
      // 지울 권한이 없는 등 다시 해도 안 되는 경우: 기록만 지운다.
      console.error('delete rejected', result.status, JSON.stringify(result.data).slice(0, 300));
    }
    await db.from('google_calendar_deletions').delete().eq('id', row.id);
    count++;
  }
  return count;
}

async function findByLocalId(token: string, calendar: string, localId: string): Promise<string | null> {
  const query = new URLSearchParams({ privateExtendedProperty: `meoreoseoId=${localId}`, maxResults: '5' });
  const result = await google(token, `/calendars/${encodeURIComponent(calendar)}/events?${query}`);
  if (result.status !== 200) return null;
  const items = (result.data.items as GoogleEvent[] | undefined) ?? [];
  return items.find((item) => item.status !== 'cancelled')?.id ?? null;
}

/**
 * 앱에서 새로 만들거나 고친 일정을 구글에 보낸다.
 * 새 일정은 "멀어서" 캘린더로, 다른 캘린더에서 받아 온 일정은 원래 캘린더로 간다.
 */
async function pushChanges(
  conn: Connection,
  token: string,
  appCalendar: string,
  fresh: boolean,
  result: SyncResult,
) {
  const { data: rows, error } = await db
    .from('events')
    .select('*')
    .eq('user_id', conn.user_id)
    .eq('google_dirty', true)
    .order('created_at')
    .limit(PUSH_LIMIT);
  if (error) throw new Error(error.message);
  if (!rows || rows.length === 0) return;

  const { data: tags } = await db.from('tags').select('id, color').eq('user_id', conn.user_id);
  const tagColors = new Map((tags ?? []).map((tag) => [tag.id as string, tag.color as string]));

  for (const row of rows as EventRow[]) {
    if (row.google_readonly) {
      // 구글에서만 고칠 수 있는 일정은 보내지 않는다.
      await db.from('events').update({ google_dirty: false }).eq('id', row.id);
      continue;
    }
    const calendar = row.google_calendar_id ?? appCalendar;
    const base = `/calendars/${encodeURIComponent(calendar)}/events`;
    let googleId = row.google_event_id;
    let response: GoogleResult | null = null;

    if (googleId) {
      response = await google(token, `${base}/${encodeURIComponent(googleId)}`, {
        method: 'PATCH',
        body: JSON.stringify(toGoogle(row, conn.time_zone, tagColors, false)),
      });
      if (response.status === 404 || response.status === 410) {
        googleId = null;
        response = null;
      }
    }
    if (!googleId && !(fresh && calendar === appCalendar)) {
      // 예전에 보낸 적이 있는지 찾아본다(같은 일정이 두 번 생기지 않게).
      const existing = await findByLocalId(token, calendar, row.id);
      if (existing) {
        response = await google(token, `${base}/${encodeURIComponent(existing)}`, {
          method: 'PATCH',
          body: JSON.stringify(toGoogle(row, conn.time_zone, tagColors, false)),
        });
      }
    }
    if (!response) {
      response = await google(token, base, {
        method: 'POST',
        body: JSON.stringify(
          toGoogle(
            { ...row, google_original: { ...row.google_original, instanceOf: undefined } },
            conn.time_zone,
            tagColors,
            true,
          ),
        ),
      });
    }

    if (isTemporary(response)) {
      // 구글 쪽 일시적인 문제: 이번에는 여기서 멈추고 다음 차례에 다시 보낸다.
      throw googleError(response);
    }
    if (response.status !== 200) {
      // 구글이 받아 주지 않는 내용: 계속 다시 보내지 않도록 표시만 지운다.
      console.error('push rejected', row.id, response.status, JSON.stringify(response.data).slice(0, 300));
      await db
        .from('events')
        .update({ google_dirty: false })
        .eq('id', row.id)
        .eq('local_version', row.local_version);
      result.failed++;
      continue;
    }

    const saved = response.data as unknown as GoogleEvent;
    const original = fromGoogle(saved, conn.time_zone, row.google_original)?.google_original ?? {};
    await db
      .from('events')
      .update({ google_event_id: saved.id, google_calendar_id: calendar, google_original: original })
      .eq('id', row.id);
    // 보내는 사이에 앱에서 또 고쳤으면 다음에 다시 보낸다.
    await db
      .from('events')
      .update({ google_dirty: false })
      .eq('id', row.id)
      .eq('local_version', row.local_version);
    result.pushed++;
  }
}

/** 이 구글 일정을 앱에서 고칠 수 없는지 (남이 만든 초대, 읽기만 되는 캘린더, 생일 같은 특별한 일정) */
function isReadonly(item: GoogleEvent, link: Link): boolean {
  const canWrite = link.is_app || link.access_role === 'owner' || link.access_role === 'writer';
  if (!canWrite) return true;
  if (item.organizer && !item.organizer.self) return true;
  return Boolean(item.eventType && item.eventType !== 'default');
}

/**
 * 구글 캘린더 하나에서 바뀐 일정을 받아 앱에 반영한다.
 * @returns 'gone' 이면 그 캘린더가 구글에서 사라졌다(지워졌거나 공유가 끊김).
 */
async function pullChanges(
  conn: Connection,
  token: string,
  link: Link,
  result: SyncResult,
): Promise<'ok' | 'gone'> {
  const calendar = link.calendar_id;
  const base = `/calendars/${encodeURIComponent(calendar)}/events`;
  let syncToken = link.sync_token;
  let full = !syncToken;
  const items: GoogleEvent[] = [];
  let pageToken: string | null = null;
  let nextSyncToken: string | null = null;

  for (let page = 0; page < 40; page++) {
    const query = new URLSearchParams({ maxResults: '250', showDeleted: 'true' });
    if (syncToken) query.set('syncToken', syncToken);
    else if (!link.is_app) {
      // 다른 캘린더는 처음에 1년 전 일정부터만 받는다.
      query.set('timeMin', new Date(Date.now() - IMPORT_DAYS_BACK * 86_400_000).toISOString());
    }
    if (pageToken) query.set('pageToken', pageToken);
    const response = await google(token, `${base}?${query}`);
    if (response.status === 410) {
      // 오래되어 이어받을 수 없음 → 처음부터 다시 받는다.
      syncToken = null;
      full = true;
      pageToken = null;
      items.length = 0;
      continue;
    }
    if (response.status === 404 && !link.is_app) return 'gone';
    if (response.status !== 200) throw googleError(response);
    items.push(...((response.data.items as GoogleEvent[] | undefined) ?? []));
    pageToken = (response.data.nextPageToken as string | undefined) ?? null;
    if (!pageToken) {
      nextSyncToken = (response.data.nextSyncToken as string | undefined) ?? null;
      break;
    }
  }
  if (pageToken) throw new Error('구글 일정이 너무 많아 한 번에 다 받지 못했습니다.');

  const userId = conn.user_id;
  const { data: localRows, error } = await db
    .from('events')
    .select('*')
    .eq('user_id', userId)
    .eq('google_calendar_id', calendar)
    .not('google_event_id', 'is', null);
  if (error) throw new Error(error.message);
  const byGoogleId = new Map<string, EventRow>();
  for (const row of (localRows ?? []) as EventRow[]) byGoogleId.set(row.google_event_id!, row);

  // 새 일정은 모아 두었다가 한꺼번에 넣는다 (처음 가져올 때 일정이 많으므로).
  const pending = new Map<string, Record<string, unknown>>();
  async function flushInserts() {
    const entries = [...pending.entries()];
    pending.clear();
    for (let i = 0; i < entries.length; i += 200) {
      const chunk = entries.slice(i, i + 200);
      const { data, error: insertError } = await db
        .from('events')
        .insert(chunk.map(([, row]) => row))
        .select('*');
      if (!insertError) {
        for (const row of (data ?? []) as EventRow[]) byGoogleId.set(row.google_event_id!, row);
        result.pulled += data?.length ?? 0;
        continue;
      }
      // 한꺼번에 안 되면 하나씩 넣어 본다.
      for (const [googleId, row] of chunk) {
        const { data: one, error: oneError } = await db.from('events').insert(row).select('*').single();
        if (oneError) {
          console.error('pull insert failed', oneError.message);
          result.failed++;
          continue;
        }
        byGoogleId.set(googleId, one as EventRow);
        result.pulled++;
      }
    }
  }

  async function removeLocal(row: EventRow) {
    await db.from('events').delete().eq('id', row.id);
    byGoogleId.delete(row.google_event_id!);
    result.removed++;
  }

  const seen = new Set<string>();
  const touchedParents = new Map<string, EventRow>();
  const masters = items.filter((i) => !i.recurringEventId);
  const instances = items.filter((i) => i.recurringEventId);

  // 반복 일정 본체(와 보통 일정)를 먼저, 한 회차만 바뀐 것들은 나중에 처리한다.
  for (const phase of [masters, instances]) {
    for (const item of phase) {
      seen.add(item.id);
      const local = byGoogleId.get(item.id) ?? null;

      if (item.recurringEventId) {
        // 반복 일정 중 한 날짜만 지워졌거나 고쳐졌다. → 본체에서 그 날짜를 뺀다.
        const parent = byGoogleId.get(item.recurringEventId) ?? null;
        const when = readTime(item.originalStartTime, conn.time_zone);
        if (parent && when) {
          const original: Original = { ...(parent.google_original ?? {}) };
          const key = item.status === 'cancelled' ? 'cancelledDates' : 'modifiedDates';
          original[key] = [...new Set([...(original[key] ?? []), when.date])].sort().slice(-500);
          parent.excluded_dates = [...new Set([...(parent.excluded_dates ?? []), when.date])].sort().slice(-500);
          parent.google_original = original;
          touchedParents.set(parent.id, parent);
        }
      }
      if (item.status === 'cancelled' || item.eventType === 'workingLocation') {
        if (local) await removeLocal(local);
        continue;
      }

      // 앱에서 보낸 적 있는 일정인데 아직 연결이 안 된 경우 (멀어서 id 로 찾아 잇는다)
      let target = local;
      const localId = item.extendedProperties?.private?.meoreoseoId;
      if (!target && localId && /^[0-9a-f-]{36}$/i.test(localId)) {
        const { data } = await db.from('events').select('*').eq('id', localId).eq('user_id', userId).maybeSingle();
        const found = data as EventRow | null;
        if (found && (found.google_calendar_id === null || found.google_calendar_id === calendar)) target = found;
      }

      const fields = fromGoogle(item, conn.time_zone, target?.google_original ?? null);
      if (!fields) continue;
      const readonly = isReadonly(item, link);

      if (target) {
        if (target.google_dirty && !readonly) {
          // 앱에서 고친 내용이 아직 안 갔으면 앱 쪽을 우선한다(다음에 구글로 보낸다). 연결만 해 둔다.
          if (!target.google_event_id) {
            await db
              .from('events')
              .update({ google_event_id: item.id, google_calendar_id: calendar })
              .eq('id', target.id);
          }
        } else {
          await db
            .from('events')
            .update({
              ...fields,
              google_event_id: item.id,
              google_calendar_id: calendar,
              google_readonly: readonly,
              google_dirty: false,
            })
            .eq('id', target.id)
            .eq('local_version', target.local_version);
        }
        byGoogleId.set(item.id, { ...target, ...fields, google_event_id: item.id, google_calendar_id: calendar });
        result.pulled++;
      } else {
        pending.set(item.id, {
          ...fields,
          user_id: userId,
          google_event_id: item.id,
          google_calendar_id: calendar,
          google_readonly: readonly,
          google_dirty: false,
        });
      }
    }
    await flushInserts();
  }

  // 한 회차가 바뀐 반복 일정 본체에 "빠진 날짜"를 저장한다.
  for (const parent of touchedParents.values()) {
    await db
      .from('events')
      .update({ excluded_dates: parent.excluded_dates, google_original: parent.google_original })
      .eq('id', parent.id);
  }

  if (full) {
    // 처음부터 다 받았는데 구글에 없는 일정 → 구글에서 지워진 것이다.
    const missing = ((localRows ?? []) as EventRow[])
      .filter((row) => !row.google_dirty && !seen.has(row.google_event_id!))
      .map((row) => row.id);
    for (let i = 0; i < missing.length; i += 200) {
      await db.from('events').delete().in('id', missing.slice(i, i + 200)).eq('google_dirty', false);
    }
    result.removed += missing.length;
  }

  if (nextSyncToken) {
    link.sync_token = nextSyncToken;
    await db
      .from('google_calendar_links')
      .update({ sync_token: nextSyncToken, synced_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('calendar_id', calendar);
  }
  return 'ok';
}

/** 한 사람의 일정을 구글과 맞춘다 */
async function syncUser(userId: string): Promise<SyncResult | { error: string; message: string }> {
  const result: SyncResult = { pushed: 0, pulled: 0, removed: 0, failed: 0 };
  const { data: claimed } = await db.rpc('google_calendar_claim_sync', { target: userId });
  if (!claimed) return { error: 'busy', message: '이미 맞추는 중입니다. 잠시 후 다시 확인해 주세요.' };

  try {
    const conn = await loadConnection(userId);
    if (!conn) return { error: 'not_connected', message: '구글 캘린더가 연결되어 있지 않습니다.' };
    if (conn.status !== 'ok') return { error: 'reauth', message: '구글 캘린더를 다시 연결해 주세요.' };

    const token = await accessTokenFor(conn);
    const app = await ensureCalendar(conn, token);
    result.removed += await pushDeletions(conn, token, app.id);
    await pushChanges(conn, token, app.id, app.fresh, result);

    const others = canUseOtherCalendars(conn);
    for (const link of await loadLinks(userId)) {
      if (!link.is_app && !others) continue;
      if (link.is_app && link.calendar_id !== app.id) continue;
      const outcome = await pullChanges(conn, token, link, result);
      if (outcome === 'gone') await removeLink(userId, link.calendar_id);
    }

    await db
      .from('google_calendar_connections')
      .update({ last_synced_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
    return result;
  } catch (error) {
    const reauth = error instanceof ReauthError;
    const message = short(error instanceof Error ? error.message : String(error), 300);
    console.error('sync failed', userId, message);
    await db
      .from('google_calendar_connections')
      .update({ last_error: message, ...(reauth ? { status: 'reauth' } : {}), updated_at: new Date().toISOString() })
      .eq('user_id', userId);
    return reauth
      ? { error: 'reauth', message: '구글 캘린더 연결이 끊어졌습니다. 다시 연결해 주세요.' }
      : { error: 'sync_failed', message: '구글 캘린더와 맞추지 못했습니다. 잠시 후 다시 시도해 주세요.' };
  } finally {
    await db.from('google_calendar_connections').update({ sync_started_at: null }).eq('user_id', userId);
  }
}

type CalendarChoice = {
  id: string;
  name: string;
  color: string | null;
  accessRole: string;
  primary: boolean;
};

/** 고를 수 있는 구글 캘린더 목록 ("멀어서" 캘린더는 늘 맞추므로 뺀다) */
async function listCalendars(conn: Connection, token: string): Promise<CalendarChoice[]> {
  const result = await google(token, '/users/me/calendarList?minAccessRole=reader&maxResults=250');
  if (result.status !== 200) throw googleError(result);
  type Item = {
    id: string;
    summary?: string;
    summaryOverride?: string;
    backgroundColor?: string;
    accessRole?: string;
    primary?: boolean;
  };
  const items = (result.data.items as Item[] | undefined) ?? [];
  return items
    .filter((item) => item.id !== conn.calendar_id)
    .filter((item) => !(conn.calendar_id === null && item.summary === CALENDAR_NAME && item.accessRole === 'owner'))
    .map((item) => ({
      id: item.id,
      name: short(item.summaryOverride || item.summary || item.id, 100),
      color: typeof item.backgroundColor === 'string' ? item.backgroundColor : null,
      accessRole: item.accessRole ?? 'reader',
      primary: item.primary === true,
    }))
    .sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name, 'ko'));
}

/** 구글 일을 하다 연결이 끊긴 것을 알게 되면 기록해 둔다 */
async function markReauth(userId: string) {
  await db.from('google_calendar_connections').update({ status: 'reauth' }).eq('user_id', userId);
}

// ───────────────────────── 요청 처리 ─────────────────────────

/** 구글 로그인을 마치고 돌아왔을 때 */
async function handleCallback(url: URL): Promise<Response> {
  const state = url.searchParams.get('state') ?? '';
  if (!/^[0-9a-f]{64}$/.test(state)) return redirect(withParam(FALLBACK_RETURN, 'google', 'error'));

  const { data: saved } = await db.from('google_oauth_states').select('*').eq('state', state).maybeSingle();
  await db.from('google_oauth_states').delete().eq('state', state);
  if (!saved) return redirect(withParam(FALLBACK_RETURN, 'google', 'error'));
  const returnTo = isAllowedReturn(saved.return_to) ? saved.return_to : FALLBACK_RETURN;
  if (Date.now() - new Date(saved.created_at).getTime() > 10 * 60_000) {
    return redirect(withParam(returnTo, 'google', 'expired'));
  }
  if (url.searchParams.get('error')) return redirect(withParam(returnTo, 'google', 'denied'));

  const code = url.searchParams.get('code');
  if (!code) return redirect(withParam(returnTo, 'google', 'error'));
  const { ok, data } = await tokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
  });
  if (!ok || typeof data.access_token !== 'string') {
    console.error('code exchange failed', String(data.error ?? ''));
    return redirect(withParam(returnTo, 'google', 'error'));
  }
  const granted = String(data.scope ?? '').split(' ').filter(Boolean);
  if (!granted.includes(CALENDAR_SCOPE)) return redirect(withParam(returnTo, 'google', 'scope'));

  let email: string | null = null;
  if (typeof data.id_token === 'string') {
    try {
      const payload = data.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const claims = JSON.parse(new TextDecoder().decode(fromBase64(payload.padEnd(Math.ceil(payload.length / 4) * 4, '='))));
      if (typeof claims.email === 'string') email = claims.email;
    } catch {
      // 이메일은 보여주기용이라 없어도 된다.
    }
  }

  const userId = saved.user_id as string;
  const previous = await loadConnection(userId);
  const sameAccount = previous !== null && previous.google_email === email;
  if (previous && !sameAccount) await resetAll(userId, previous.calendar_id);

  let refreshSealed: string | null = null;
  if (typeof data.refresh_token === 'string') refreshSealed = await encrypt(data.refresh_token);
  else if (previous) refreshSealed = previous.refresh_token;
  if (!refreshSealed) return redirect(withParam(returnTo, 'google', 'error'));

  const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 3600;
  const { error } = await db.from('google_calendar_connections').upsert({
    user_id: userId,
    google_email: email,
    refresh_token: refreshSealed,
    access_token: await encrypt(data.access_token),
    access_token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    calendar_id: sameAccount ? previous!.calendar_id : null,
    calendar_name: sameAccount ? previous!.calendar_name : null,
    scopes: granted.join(' '),
    status: 'ok',
    last_error: null,
    sync_started_at: null,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error('save connection failed', error.message);
    return redirect(withParam(returnTo, 'google', 'error'));
  }

  // 첫 동기화는 화면을 기다리게 하지 않고 뒤에서 돌린다.
  const first = syncUser(userId);
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(first);
  return redirect(withParam(returnTo, 'google', 'connected'));
}

async function handleAction(request: Request): Promise<Response> {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return fail('bad_request', '요청 형식이 올바르지 않습니다.');
  }
  const action = body.action;

  if (action === 'cron') {
    const sent = request.headers.get('x-cron-secret') ?? '';
    const { data } = await db.from('app_secrets').select('value').eq('name', 'google_calendar_cron').maybeSingle();
    if (!data?.value || !safeEqual(sent, data.value)) return fail('forbidden', '허락되지 않은 요청입니다.', 403);
    if (!isConfigured()) return json({ skipped: 'not_configured' });
    const { data: users } = await db
      .from('google_calendar_connections')
      .select('user_id')
      .eq('status', 'ok')
      .order('last_synced_at', { ascending: true, nullsFirst: true })
      .limit(50);
    const started = Date.now();
    let done = 0;
    for (const user of users ?? []) {
      if (Date.now() - started > 100_000) break;
      await syncUser(user.user_id as string);
      done++;
    }
    return json({ synced: done });
  }

  const userId = await userIdOf(request);
  if (!userId) return fail('unauthorized', '로그인이 필요합니다.', 401);

  if (action === 'status') {
    const conn = await loadConnection(userId);
    const links = conn ? await loadLinks(userId) : [];
    return json({
      configured: isConfigured(),
      connected: conn !== null,
      status: conn?.status ?? null,
      email: conn?.google_email ?? null,
      calendarName: conn?.calendar_name ?? null,
      lastSyncedAt: conn?.last_synced_at ?? null,
      lastError: conn?.last_error ?? null,
      canPickCalendars: conn ? canUseOtherCalendars(conn) : false,
      calendars: links
        .filter((link) => !link.is_app)
        .map((link) => ({ id: link.calendar_id, name: link.name ?? link.calendar_id, color: link.color })),
    });
  }

  if (!isConfigured()) {
    return fail('not_configured', '구글 캘린더 연동이 아직 설정되지 않았습니다. (서버 비밀 값 필요)', 503);
  }

  if (action === 'start') {
    if (!isAllowedReturn(body.returnTo)) return fail('bad_return', '돌아갈 주소가 올바르지 않습니다.');
    const state = randomHex(32);
    await db
      .from('google_oauth_states')
      .delete()
      .lt('created_at', new Date(Date.now() - 15 * 60_000).toISOString());
    const { error } = await db.from('google_oauth_states').insert({ state, user_id: userId, return_to: body.returnTo });
    if (error) return fail('server', '연결을 시작하지 못했습니다.', 500);
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    });
    return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  }

  if (action === 'sync') {
    const outcome = await syncUser(userId);
    return 'error' in outcome ? json(outcome, outcome.error === 'busy' ? 409 : 400) : json(outcome);
  }

  if (action === 'calendars' || action === 'select') {
    const conn = await loadConnection(userId);
    if (!conn) return fail('not_connected', '구글 캘린더가 연결되어 있지 않습니다.');
    if (conn.status !== 'ok') return fail('reauth', '구글 캘린더를 다시 연결해 주세요.');
    if (!canUseOtherCalendars(conn)) {
      return fail('need_scope', '다른 캘린더를 고르려면 구글 캘린더를 다시 연결하고 권한을 모두 허용해 주세요.', 403);
    }
    let choices: CalendarChoice[];
    try {
      choices = await listCalendars(conn, await accessTokenFor(conn));
    } catch (error) {
      if (error instanceof ReauthError) {
        await markReauth(userId);
        return fail('reauth', '구글 캘린더 연결이 끊어졌습니다. 다시 연결해 주세요.');
      }
      console.error('calendar list failed', error instanceof Error ? error.message : String(error));
      return fail('google', '구글 캘린더 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.', 502);
    }

    const links = await loadLinks(userId);
    if (action === 'calendars') {
      const chosen = new Set(links.filter((link) => !link.is_app).map((link) => link.calendar_id));
      return json({
        calendars: choices.map((choice) => ({ ...choice, selected: chosen.has(choice.id) })),
      });
    }

    // action === 'select'
    const ids = body.calendarIds;
    if (!Array.isArray(ids) || ids.length > 20 || !ids.every((id) => typeof id === 'string')) {
      return fail('bad_request', '고른 캘린더가 올바르지 않습니다.');
    }
    const byId = new Map(choices.map((choice) => [choice.id, choice]));
    const wanted = [...new Set(ids as string[])];
    if (wanted.some((id) => !byId.has(id))) return fail('bad_calendar', '고를 수 없는 캘린더가 있습니다.');

    const { data: claimed } = await db.rpc('google_calendar_claim_sync', { target: userId });
    if (!claimed) return fail('busy', '지금 맞추는 중이에요. 잠시 후 다시 시도해 주세요.', 409);
    try {
      for (const link of links) {
        if (!link.is_app && !wanted.includes(link.calendar_id)) await removeLink(userId, link.calendar_id);
      }
      if (wanted.length > 0) {
        await db.from('google_calendar_links').upsert(
          wanted.map((id) => {
            const choice = byId.get(id)!;
            return {
              user_id: userId,
              calendar_id: id,
              name: choice.name,
              color: choice.color,
              access_role: choice.accessRole,
              is_primary: choice.primary,
              is_app: false,
            };
          }),
          { onConflict: 'user_id,calendar_id' },
        );
      }
    } finally {
      await db.from('google_calendar_connections').update({ sync_started_at: null }).eq('user_id', userId);
    }
    // 고른 캘린더의 일정을 바로 가져온다.
    const outcome = await syncUser(userId);
    return 'error' in outcome ? json(outcome, outcome.error === 'busy' ? 409 : 400) : json(outcome);
  }

  if (action === 'disconnect') {
    const conn = await loadConnection(userId);
    if (conn) {
      const refresh = await decrypt(conn.refresh_token);
      if (refresh) {
        // 구글에 "이 앱의 권한을 돌려준다"고 알린다. 실패해도 연결 정보는 지운다.
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refresh)}`, {
          method: 'POST',
        }).catch(() => undefined);
      }
      await db.from('google_calendar_connections').delete().eq('user_id', userId);
      await resetAll(userId, conn.calendar_id);
    }
    return json({ ok: true });
  }

  return fail('bad_request', '알 수 없는 요청입니다.');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  const url = new URL(request.url);
  try {
    if (request.method === 'GET' && url.pathname.endsWith('/callback')) {
      if (!isConfigured()) return redirect(withParam(FALLBACK_RETURN, 'google', 'error'));
      return await handleCallback(url);
    }
    if (request.method === 'POST') return await handleAction(request);
    return fail('bad_request', '알 수 없는 요청입니다.', 405);
  } catch (error) {
    console.error('unexpected', error instanceof Error ? error.message : String(error));
    return fail('server', '서버에서 문제가 생겼습니다.', 500);
  }
});
