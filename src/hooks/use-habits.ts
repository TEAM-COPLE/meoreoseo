import { useMutation, useQuery } from '@tanstack/react-query';

import { activeUserId, requireUserId, useAuth } from '@/lib/auth';
import type { Tables } from '@/lib/database.types';
import { addDays, todayISO } from '@/lib/dates';
import { check, queryClient, useInvalidatingMutation } from '@/lib/query';
import { supabase } from '@/lib/supabase';

export type Habit = Tables<'habits'>;

const KEY = ['habits'];
const LOGS_KEY = ['habit-logs'];
const TOGGLE_DEBOUNCE_MS = 550;

/** 연속 기록을 계산하려고 불러오는 기간(일). */
const HISTORY_DAYS = 400;

export function useHabits(enabled = true) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  return useQuery({
    queryKey: [...KEY, userId],
    enabled: enabled && userId !== null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('habits')
        .select('*')
        .eq('archived', false)
        .order('created_at');
      check(error);
      return data ?? [];
    },
  });
}

/**
 * 습관별로 "실천한 날짜 모음"을 돌려준다.
 * 예: logs.get(habitId)?.has('2026-11-15')
 */
export function useHabitLogs(enabled = true) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  return useQuery({
    queryKey: [...LOGS_KEY, userId],
    enabled: enabled && userId !== null,
    queryFn: async () => {
      const sinceDate = addDays(todayISO(), -HISTORY_DAYS);
      const { data, error } = await supabase
        .from('habit_logs')
        .select('habit_id, log_date')
        .gte('log_date', sinceDate);
      check(error);

      const byHabit = new Map<string, Set<string>>();
      for (const log of data ?? []) {
        const dates = byHabit.get(log.habit_id) ?? new Set<string>();
        dates.add(log.log_date);
        byHabit.set(log.habit_id, dates);
      }
      return byHabit;
    },
  });
}

/** 오늘(오늘을 아직 안 했다면 어제)부터 거꾸로 며칠 연속으로 실천했는지 센다. */
export function streakOf(dates: ReadonlySet<string> | undefined): number {
  if (!dates) return 0;

  const today = todayISO();
  let day = dates.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (dates.has(day)) {
    streak += 1;
    day = addDays(day, -1);
  }
  return streak;
}

export function useSaveHabit() {
  return useInvalidatingMutation(
    KEY,
    async ({ id, name }: { id?: string; name: string }) => {
      requireUserId();
      const { error } = id
        ? await supabase.from('habits').update({ name }).eq('id', id)
        : await supabase.from('habits').insert({ name });
      check(error);
    },
  );
}

/** 습관을 지운다. 그 습관의 실천 기록도 함께 지워진다. */
export function useDeleteHabit() {
  return useInvalidatingMutation(KEY, async (id: string) => {
    requireUserId();
    const { error } = await supabase.from('habits').delete().eq('id', id);
    check(error);
  });
}

type PendingHabitToggle = {
  scope: string;
  habitId: string;
  date: string;
  confirmedDone: boolean;
  desiredDone: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  waiters: { resolve: () => void; reject: (err: unknown) => void }[];
  onRollback?: (confirmedDone: boolean) => void;
};

const pendingHabitToggles = new Map<string, PendingHabitToggle>();
const habitChains = new Map<string, Promise<void>>();
const confirmedHabitDoneMap = new Map<string, boolean>();
const optimisticHabitDoneMap = new Map<string, boolean>();

function currentScope(): string | null {
  return activeUserId();
}

function updateHabitLogsCache(
  scope: string,
  habitId: string,
  date: string,
  targetDone: boolean,
): void {
  const key = [...LOGS_KEY, scope];
  if (queryClient.getQueryData<Map<string, Set<string>>>(key) === undefined) return;
  queryClient.setQueryData<Map<string, Set<string>>>(key, (old) => {
    if (!old) return old;
    const nextMap = new Map(old);
    const nextSet = new Set(nextMap.get(habitId) ?? []);
    if (targetDone) nextSet.add(date);
    else nextSet.delete(date);
    nextMap.set(habitId, nextSet);
    return nextMap;
  });
}

async function commitHabitLogDone(
  habitId: string,
  date: string,
  targetDone: boolean,
): Promise<void> {
  requireUserId();
  if (targetDone) {
    const { error } = await supabase
      .from('habit_logs')
      .upsert(
        { habit_id: habitId, log_date: date },
        { onConflict: 'habit_id,log_date', ignoreDuplicates: true },
      );
    check(error);
  } else {
    const { error } = await supabase
      .from('habit_logs')
      .delete()
      .eq('habit_id', habitId)
      .eq('log_date', date);
    check(error);
  }
}

function flushHabitEntry(key: string): Promise<void> {
  const entry = pendingHabitToggles.get(key);
  if (!entry) return habitChains.get(key) ?? Promise.resolve();
  pendingHabitToggles.delete(key);
  if (entry.timer) {
    clearTimeout(entry.timer);
    entry.timer = null;
  }

  const prevChain = habitChains.get(key) ?? Promise.resolve();
  const nextChain = prevChain
    .catch(() => {})
    .then(async () => {
      if (currentScope() !== entry.scope) {
        for (const waiter of entry.waiters) waiter.resolve();
        return;
      }
      const confirmed = confirmedHabitDoneMap.get(key) ?? entry.confirmedDone;
      if (entry.desiredDone === confirmed) {
        for (const waiter of entry.waiters) waiter.resolve();
        return;
      }
      try {
        await commitHabitLogDone(entry.habitId, entry.date, entry.desiredDone);
        confirmedHabitDoneMap.set(key, entry.desiredDone);
        if (!pendingHabitToggles.has(key)) {
          optimisticHabitDoneMap.set(key, entry.desiredDone);
        }
        for (const waiter of entry.waiters) waiter.resolve();
      } catch (err) {
        if (!pendingHabitToggles.has(key)) {
          optimisticHabitDoneMap.set(key, confirmed);
          updateHabitLogsCache(
            entry.scope,
            entry.habitId,
            entry.date,
            confirmed,
          );
          entry.onRollback?.(confirmed);
        }
        for (const waiter of entry.waiters) waiter.reject(err);
      }
    })
    .finally(() => {
      if (habitChains.get(key) === nextChain && !pendingHabitToggles.has(key)) {
        habitChains.delete(key);
        confirmedHabitDoneMap.delete(key);
        optimisticHabitDoneMap.delete(key);
      }
    });

  habitChains.set(key, nextChain);
  return nextChain;
}

/**
 * 어떤 날의 실천 표시를 켜거나 끈다. 앱 화면과 홈 화면 위젯이 함께 쓴다.
 * 짧은 시간에 여러 번 켜고 끄면 마지막 상태만 DB에 반영하고, 원래 상태로 돌아오면 DB 요청을 건너뛴다.
 */
export function toggleHabitLogCoalesced(
  { habitId, date, done }: { habitId: string; date: string; done: boolean },
  options?: { delayMs?: number; onRollback?: (confirmedDone: boolean) => void },
): Promise<void> {
  const scope = currentScope();
  if (!scope) return Promise.reject(new Error('로그인이 필요합니다.'));
  const key = `${scope}:${habitId}:${date}`;
  const delayMs = options?.delayMs ?? TOGGLE_DEBOUNCE_MS;

  const existing = pendingHabitToggles.get(key);
  let nextDone: boolean;

  if (existing) {
    if (existing.timer) clearTimeout(existing.timer);
    for (const waiter of existing.waiters.splice(0)) {
      waiter.resolve();
    }
    nextDone = !existing.desiredDone;
    existing.desiredDone = nextDone;
    if (options?.onRollback) existing.onRollback = options.onRollback;
  } else {
    const cachedSet = queryClient
      .getQueryData<Map<string, Set<string>>>([...LOGS_KEY, scope])
      ?.get(habitId);
    const currentDone =
      optimisticHabitDoneMap.get(key) ??
      (cachedSet ? cachedSet.has(date) : done);
    const confirmed = confirmedHabitDoneMap.get(key) ?? currentDone;
    confirmedHabitDoneMap.set(key, confirmed);
    nextDone = !currentDone;
    pendingHabitToggles.set(key, {
      scope,
      habitId,
      date,
      confirmedDone: confirmed,
      desiredDone: nextDone,
      timer: null,
      waiters: [],
      onRollback: options?.onRollback,
    });
  }

  optimisticHabitDoneMap.set(key, nextDone);
  updateHabitLogsCache(scope, habitId, date, nextDone);

  const entry = pendingHabitToggles.get(key)!;
  return new Promise<void>((resolve, reject) => {
    entry.waiters.push({ resolve, reject });
    entry.timer = setTimeout(() => {
      flushHabitEntry(key).catch(() => {});
    }, delayMs);
  });
}

/** 현재 대기 중이거나 캐시된 습관 실천 여부를 돌려준다(없으면 undefined). */
export function getKnownHabitLogDone(
  habitId: string,
  date: string,
): boolean | undefined {
  const scope = currentScope();
  if (!scope) return undefined;
  const key = `${scope}:${habitId}:${date}`;
  if (optimisticHabitDoneMap.has(key)) return optimisticHabitDoneMap.get(key);
  if (confirmedHabitDoneMap.has(key)) return confirmedHabitDoneMap.get(key);
  const cached = queryClient.getQueryData<Map<string, Set<string>>>([
    ...LOGS_KEY,
    scope,
  ]);
  return cached ? (cached.get(habitId)?.has(date) ?? false) : undefined;
}

/** 대기 중인 모든 습관 실천 토글을 즉시 DB에 반영한다. */
export async function flushPendingHabitLogToggles(): Promise<void> {
  const keys = [...pendingHabitToggles.keys()];
  if (keys.length === 0 && habitChains.size === 0) return;
  await Promise.allSettled([
    ...keys.map((key) => flushHabitEntry(key)),
    ...habitChains.values(),
  ]);
}

/** 어떤 날의 실천 표시를 켜거나 끈다. */
export function useToggleHabitLog() {
  return useMutation({
    mutationKey: LOGS_KEY,
    mutationFn: (vars: { habitId: string; date: string; done: boolean }) =>
      toggleHabitLogCoalesced(vars),
  });
}
