import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { queryClient } from './query';
import { MAX_SEGMENT_SECONDS, MIN_SEGMENT_SECONDS, splitByDay } from './study';
import { supabase } from './supabase';

/**
 * 공부 타이머 엔진.
 *
 * - 타이머가 도는 중인지는 휴대폰 안(AsyncStorage)에 적어 두어서, 앱을 껐다 켜도 이어진다.
 * - 멈추면 그동안의 시간을 "기록 조각"으로 만들어 서버(study_sessions)에 보낸다.
 *   인터넷이 끊겨 있으면 휴대폰 안에 모아 두었다가 다음에 다시 보낸다.
 * - 타이머를 켜면 "지금 공부 중"(study_live)을 서버에 알려서 그룹 사람들에게 초록 불이 보인다.
 *
 * 화면은 useStudyTimer() 로 지금 상태를 읽고, startStudy / stopStudy 로 조작한다.
 * 앱을 벗어날 때 멈추는 일은 components/study-timer-sync.tsx 가 맡는다.
 */

type RunningTimer = {
  userId: string;
  subjectId: string | null;
  subjectName: string | null;
  /** 시작한 시각(밀리초) */
  startedAt: number;
  /** "앱을 벗어나면 멈춤" 설정일 때, 앱을 벗어난 시각. 여기서 멈춘 것으로 친다. */
  leftAt?: number;
};

type PendingSegment = {
  userId: string;
  subject_id: string | null;
  study_date: string;
  started_at: string;
  ended_at: string;
  seconds: number;
};

type TimerState = {
  /** 저장된 상태를 다 읽었는지 */
  loaded: boolean;
  running: RunningTimer | null;
  /** 다른 앱으로 나가면 타이머를 멈출지 */
  pauseOnLeave: boolean;
  /** 아직 서버에 못 보낸 기록 개수 */
  pendingCount: number;
  /** 화면 위쪽에 잠깐 보여 줄 안내 (예: "다른 앱으로 나가서 멈췄어요") */
  notice: string | null;
};

const RUNNING_KEY = 'meoreoseo:study-running';
const PENDING_KEY = 'meoreoseo:study-pending';
const OPTIONS_KEY = 'meoreoseo:study-options';

let state: TimerState = {
  loaded: false,
  running: null,
  pauseOnLeave: true,
  pendingCount: 0,
  notice: null,
};
const listeners = new Set<() => void>();

function setState(patch: Partial<TimerState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 화면에서 타이머 상태를 읽는다. 상태가 바뀌면 화면이 다시 그려진다. */
export function useStudyTimer(): TimerState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    if (value === null) await AsyncStorage.removeItem(key);
    else await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장에 실패해도 앱이 멈추지 않게 한다.
  }
}

let loadPromise: Promise<void> | null = null;

/** 휴대폰에 적어 둔 타이머 상태를 한 번 읽어 온다. 여러 번 불러도 한 번만 읽는다. */
export function loadStudyTimer(): Promise<void> {
  loadPromise ??= (async () => {
    const [running, pending, options] = await Promise.all([
      readJson<RunningTimer>(RUNNING_KEY),
      readJson<PendingSegment[]>(PENDING_KEY),
      readJson<{ pauseOnLeave?: boolean }>(OPTIONS_KEY),
    ]);
    setState({
      loaded: true,
      running: running && typeof running.startedAt === 'number' ? running : null,
      pendingCount: pending?.length ?? 0,
      pauseOnLeave: options?.pauseOnLeave ?? true,
    });
  })();
  return loadPromise;
}

/** "다른 앱으로 나가면 멈춤" 켜기/끄기 */
export async function setPauseOnLeave(value: boolean): Promise<void> {
  setState({ pauseOnLeave: value });
  await writeJson(OPTIONS_KEY, { pauseOnLeave: value });
}

export function clearStudyNotice() {
  if (state.notice) setState({ notice: null });
}

/** 지금 도는 타이머가 몇 초째인지 */
export function runningSeconds(running: RunningTimer | null, nowMs = Date.now()): number {
  if (!running) return 0;
  const end = running.leftAt ?? nowMs;
  return Math.min(MAX_SEGMENT_SECONDS, Math.max(0, Math.floor((end - running.startedAt) / 1000)));
}

// ───────────────────────── 지금 공부 중 표시 ─────────────────────────

async function announceLive(running: RunningTimer) {
  const { error } = await supabase.from('study_live').upsert({
    user_id: running.userId,
    subject_name: running.subjectName,
    started_at: new Date(running.startedAt).toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) console.warn('study_live upsert failed', error.message);
  queryClient.invalidateQueries({ queryKey: ['study-board'] });
}

async function clearLive(userId: string) {
  const { error } = await supabase.from('study_live').delete().eq('user_id', userId);
  if (error) console.warn('study_live delete failed', error.message);
  queryClient.invalidateQueries({ queryKey: ['study-board'] });
}

// ───────────────────────── 시작·멈춤 ─────────────────────────

/**
 * 타이머를 시작한다. 이미 돌고 있으면 지금까지를 기록하고 새 과목으로 다시 시작한다.
 */
export async function startStudy(
  userId: string,
  subject: { id: string; name: string } | null,
): Promise<void> {
  await loadStudyTimer();
  if (state.running) await stopStudy();
  const running: RunningTimer = {
    userId,
    subjectId: subject?.id ?? null,
    subjectName: subject?.name ?? null,
    startedAt: Date.now(),
  };
  setState({ running, notice: null });
  await writeJson(RUNNING_KEY, running);
  void announceLive(running);
}

/**
 * 타이머를 멈추고 기록을 남긴다.
 * @param endMs 멈춘 것으로 칠 시각. 앱을 벗어난 시각 등을 넘길 수 있다.
 * @returns 이번에 기록한 시간(초). 너무 짧아서 버렸으면 0
 */
export async function stopStudy(endMs?: number): Promise<number> {
  await loadStudyTimer();
  const running = state.running;
  if (!running) return 0;

  const end = Math.min(
    endMs ?? running.leftAt ?? Date.now(),
    running.startedAt + MAX_SEGMENT_SECONDS * 1000,
  );
  setState({ running: null });
  await writeJson(RUNNING_KEY, null);
  void clearLive(running.userId);

  const total = Math.floor((end - running.startedAt) / 1000);
  if (total < MIN_SEGMENT_SECONDS) return 0;

  // 자정을 넘기면 날짜별로 나눠서 기록한다.
  const segments: PendingSegment[] = splitByDay(running.startedAt, end)
    .map((part) => ({
      userId: running.userId,
      subject_id: running.subjectId,
      study_date: part.date,
      started_at: new Date(part.start).toISOString(),
      ended_at: new Date(part.end).toISOString(),
      seconds: Math.floor((part.end - part.start) / 1000),
    }))
    .filter((segment) => segment.seconds >= 1);

  const pending = (await readJson<PendingSegment[]>(PENDING_KEY)) ?? [];
  pending.push(...segments);
  await writeJson(PENDING_KEY, pending);
  setState({ pendingCount: pending.length });

  await flushPendingStudy(running.userId);
  return total;
}

/**
 * 앱을 벗어났다고 적어 둔다 ("다른 앱으로 나가면 멈춤" 설정일 때).
 * 휴대폰이 앱을 곧바로 재워도, 다음에 열 때 이 시각에 멈춘 것으로 기록된다.
 */
export async function markStudyLeft(): Promise<void> {
  const running = state.running;
  if (!running || running.leftAt) return;
  const next = { ...running, leftAt: Date.now() };
  setState({ running: next });
  await writeJson(RUNNING_KEY, next);
  const seconds = await stopStudy(next.leftAt);
  if (seconds > 0) {
    setState({ notice: '다른 앱으로 나가서 타이머를 멈췄어요. 그때까지 공부한 시간은 기록했어요.' });
  }
}

let flushing: Promise<void> | null = null;

/** 아직 못 보낸 기록을 서버로 보낸다. */
export function flushPendingStudy(userId: string): Promise<void> {
  flushing ??= (async () => {
    try {
      const pending = (await readJson<PendingSegment[]>(PENDING_KEY)) ?? [];
      const keep: PendingSegment[] = [];
      let dropped = 0;
      let sent = 0;
      for (const segment of pending) {
        if (segment.userId !== userId) {
          // 다른 계정의 기록은 그 계정으로 로그인했을 때 보낸다.
          keep.push(segment);
          continue;
        }
        const { userId: _owner, ...row } = segment;
        const { error } = await supabase.from('study_sessions').insert(row);
        if (!error) {
          sent++;
          continue;
        }
        // 23P01: 다른 기기의 기록과 시간이 겹침, 42501: 너무 오래된 기록이라 서버가 거절함, 23514: 값 규칙 위반
        if (['23P01', '42501', '23514'].includes(error.code)) {
          dropped++;
          continue;
        }
        // 인터넷 문제 등은 다음에 다시 보낸다.
        keep.push(segment);
      }
      await writeJson(PENDING_KEY, keep.length > 0 ? keep : null);
      setState({
        pendingCount: keep.length,
        ...(dropped > 0
          ? { notice: '다른 기기의 기록과 시간이 겹치거나 너무 오래된 기록이 있어 일부는 저장하지 못했어요.' }
          : {}),
      });
      if (sent > 0) {
        queryClient.invalidateQueries({ queryKey: ['study-sessions'] });
        queryClient.invalidateQueries({ queryKey: ['study-board'] });
        queryClient.invalidateQueries({ queryKey: ['study-ranking'] });
      }
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

/** 로그아웃·계정 바꿈: 다른 계정의 타이머는 화면에서 치운다. */
export async function forgetStudyTimerFor(userId: string | null): Promise<void> {
  await loadStudyTimer();
  if (state.running && state.running.userId !== userId) {
    setState({ running: null });
    await writeJson(RUNNING_KEY, null);
  }
}
