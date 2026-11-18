import { FunctionsHttpError } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { queryClient } from './query';
import { hasSupabaseConfig, supabase } from './supabase';

/**
 * 구글 캘린더 연동.
 *
 * 실제 일은 서버 함수(supabase/functions/google-calendar)가 한다.
 * 앱은 "연결해 줘 / 지금 맞춰 줘 / 끊어 줘" 하고 부탁만 한다.
 * 구글 토큰은 서버에만 있고 앱에는 절대 오지 않는다.
 */

export type GoogleCalendarStatus = {
  /** 서버에 구글 비밀 값이 들어가 있는지 (없으면 연결 버튼을 눌러도 소용없다) */
  configured: boolean;
  connected: boolean;
  /** 'reauth' 이면 구글에서 권한이 끊겨 다시 연결해야 한다 */
  status: 'ok' | 'reauth' | null;
  email: string | null;
  calendarName: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
};

export const GOOGLE_STATUS_KEY = ['google-calendar-status'];

/** 사람마다 따로 기억하는 연결 상태의 이름 */
export function googleStatusKey(userId: string | null) {
  return [...GOOGLE_STATUS_KEY, userId];
}

/** 서버 함수를 부르고, 실패하면 서버가 준 한국어 안내를 담아 오류를 던진다. */
async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('google-calendar', {
    body,
    timeout: 60_000,
  });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const detail = await error.context.json().catch(() => null);
      if (detail?.message) throw new Error(detail.message);
    }
    throw error;
  }
  return data as T;
}

export function fetchGoogleStatus(): Promise<GoogleCalendarStatus> {
  return call<GoogleCalendarStatus>({ action: 'status' });
}

/** 구글 로그인을 마치고 돌아올 주소 (계정 화면) */
function returnUrl(): string {
  if (Platform.OS === 'web') return `${window.location.origin}/account`;
  return Linking.createURL('account');
}

/**
 * 구글 캘린더 연결을 시작한다.
 * 웹: 페이지가 구글 로그인으로 이동했다가 /account?google=connected 로 돌아온다.
 * 휴대폰: 앱 위에 브라우저 창을 띄우고, 끝나면 결과를 돌려준다.
 * @returns 휴대폰에서 연결이 끝났으면 'connected' 같은 결과, 창을 닫았으면 null
 */
export async function connectGoogleCalendar(): Promise<string | null> {
  const target = returnUrl();
  const { url } = await call<{ url: string }>({ action: 'start', returnTo: target });
  if (!url.startsWith('https://accounts.google.com/')) throw new Error('구글 로그인 주소가 올바르지 않습니다.');

  if (Platform.OS === 'web') {
    window.location.assign(url);
    return null;
  }
  const result = await WebBrowser.openAuthSessionAsync(url, target);
  if (result.type !== 'success') return null;
  const match = /[?&]google=([a-z]+)/.exec(result.url);
  return match?.[1] ?? null;
}

export async function disconnectGoogleCalendar(): Promise<void> {
  await call({ action: 'disconnect' });
}

/** 돌아온 주소의 google=… 값을 사람이 읽을 문장으로 */
export function describeGoogleResult(result: string | null | undefined): string | null {
  switch (result) {
    case 'connected':
      return '구글 캘린더에 연결했어요. 구글 캘린더에 "멀어서" 캘린더가 생기고, 일정이 곧 옮겨집니다.';
    case 'denied':
      return '구글 연결을 취소했어요.';
    case 'scope':
      return '캘린더 권한에 체크하지 않아 연결하지 못했어요. 다시 연결하고 권한을 허용해 주세요.';
    case 'expired':
      return '연결 시간이 지났어요. 다시 시도해 주세요.';
    case 'error':
      return '구글 연결 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.';
    default:
      return null;
  }
}

// ───────────────────────── 지금 맞추기 ─────────────────────────

let timer: ReturnType<typeof setTimeout> | null = null;
let running: Promise<void> | null = null;
let again = false;

async function runSync(): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return;
    // 연결되지 않은 사람은 서버를 부르지 않는다. (상태는 10분 동안 기억해 둔다)
    const known = await queryClient.fetchQuery({
      queryKey: googleStatusKey(userId),
      queryFn: fetchGoogleStatus,
      staleTime: 10 * 60 * 1000,
    });
    if (!known.connected || known.status !== 'ok') return;
    await call({ action: 'sync' }).catch(() => undefined);
    // 구글에서 받아 온 일정이 화면에 보이도록 다시 불러온다.
    await queryClient.invalidateQueries({ queryKey: ['events'] });
    await queryClient.invalidateQueries({ queryKey: GOOGLE_STATUS_KEY });
  } catch {
    // 연동은 덤이다. 실패해도 앱 사용을 막지 않는다. (5분마다 서버가 다시 맞춘다)
  }
}

/**
 * 구글 캘린더와 곧 맞추도록 부탁한다. 여러 번 불러도 잠깐 모았다가 한 번만 맞춘다.
 * 일정을 저장·삭제한 뒤, 그리고 캘린더 화면을 열 때 부른다.
 */
export function requestGoogleSync(delayMs = 1500): void {
  if (!hasSupabaseConfig) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    if (running) {
      again = true;
      return;
    }
    running = runSync().finally(() => {
      running = null;
      if (again) {
        again = false;
        requestGoogleSync(0);
      }
    });
  }, delayMs);
}
