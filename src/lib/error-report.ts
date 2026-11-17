import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { loadNotificationSettings } from './notification-settings';
import { showErrorNotification } from './notifications';
import { supabase } from './supabase';

/**
 * 오류 알림과 오류 기록.
 *
 * 앱에서 오류가 나면
 * 1) 휴대폰에 바로 알림을 띄운다 (계정 화면의 "오류 알림"이 켜져 있을 때, 웹은 제외)
 * 2) 로그인한 상태면 오류 내용을 DB 의 error_logs 표에 남긴다. 개발자가 원인을 찾을 때 읽는다.
 *
 * 데이터 요청 오류는 lib/query.ts 가, 앱이 멈추는 큰 오류는 installGlobalErrorHandler 가 여기로 보낸다.
 */

/** 같은 오류를 다시 알리기까지 기다리는 시간. 자동 재시도 때문에 알림이 쏟아지지 않게 한다. */
const REPEAT_WAIT_MS = 5 * 60 * 1000;

/** 오류가 난 곳을 사람이 읽기 쉬운 이름으로 (데이터 요청의 첫 번째 이름 기준) */
const SOURCE_LABELS: Record<string, string> = {
  todos: '할 일',
  events: '일정',
  habits: '습관',
  'habit-logs': '습관 기록',
  notes: '메모',
  note: '메모',
  transactions: '가계부',
  weather: '날씨',
  'weather-city': '날씨 지역',
  'weather-search': '지역 검색',
  'notification-settings': '알림 설정',
  app: '앱',
};

/** 오류마다 마지막으로 알린 시각 (키: 출처 + 문장) */
const lastReported = new Map<string, number>();

function toMessage(error: unknown): { message: string; detail: string | null } {
  if (error instanceof Error) {
    const name = error.name && error.name !== 'Error' ? `${error.name}: ` : '';
    return {
      message: `${name}${error.message || '알 수 없는 오류'}`,
      detail: error.stack ?? null,
    };
  }
  return { message: String(error), detail: null };
}

function platformName(): 'android' | 'ios' | 'web' | 'other' {
  const os = Platform.OS;
  return os === 'android' || os === 'ios' || os === 'web' ? os : 'other';
}

async function saveToDatabase(source: string, message: string, detail: string | null) {
  const { data } = await supabase.auth.getSession();
  // 로그인하지 않았으면 DB 에 쓸 수 없다(접근 규칙). 알림만 띄운다.
  if (!data.session) return;
  await supabase.from('error_logs').insert({
    source: source.slice(0, 50),
    message: message.slice(0, 1000),
    detail: detail ? detail.slice(0, 4000) : null,
    platform: platformName(),
    app_version: Constants.expoConfig?.version ?? null,
  });
}

async function notify(source: string, message: string) {
  const settings = await loadNotificationSettings();
  if (!settings.errors) return;
  const label = SOURCE_LABELS[source] ?? source;
  await showErrorNotification(`멀어서 오류 · ${label}`, message.slice(0, 300));
}

/**
 * 오류를 알리고 기록한다. 실패해도 앱에 영향을 주지 않는다(오류 알림이 또 오류를 만들지 않게).
 * @param source 오류가 난 곳 (예: 'weather', 'todos', 'app')
 */
export function reportError(source: string, error: unknown): void {
  const { message, detail } = toMessage(error);

  const key = `${source}|${message}`;
  const now = Date.now();
  const last = lastReported.get(key);
  if (last !== undefined && now - last < REPEAT_WAIT_MS) return;
  if (lastReported.size >= 100) {
    for (const [k, ts] of lastReported) {
      if (now - ts >= REPEAT_WAIT_MS) lastReported.delete(k);
    }
    if (lastReported.size >= 100) lastReported.clear();
  }
  lastReported.set(key, now);

  console.warn(`[오류] ${source}: ${message}`);
  notify(source, message).catch(() => {});
  saveToDatabase(source, message, detail).catch(() => {});
}

/**
 * 앱이 멈출 정도의 큰 오류도 reportError 로 보낸다. 앱을 시작할 때 한 번 부른다.
 * 원래 하던 처리(빨간 오류 화면, 앱 종료 등)는 그대로 이어서 한다.
 */
export function installGlobalErrorHandler(): void {
  const utils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (!utils) return; // 웹에는 없다.
  const previous = utils.getGlobalHandler();
  utils.setGlobalHandler((error, isFatal) => {
    reportError('app', error);
    previous(error, isFatal);
  });
}

type ErrorUtilsLike = {
  getGlobalHandler(): (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler(handler: (error: unknown, isFatal?: boolean) => void): void;
};
