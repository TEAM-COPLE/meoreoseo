import { useQuery } from '@tanstack/react-query';

import { hasActiveSession, useAuth } from '@/lib/auth';
import type { Tables } from '@/lib/database.types';
import { addDays, todayISO } from '@/lib/dates';
import {
  deleteLocalHabit,
  listLocalHabitLogs,
  listLocalHabits,
  saveLocalHabit,
  toggleLocalHabitLog,
} from '@/lib/local-store';
import { check, useInvalidatingMutation } from '@/lib/query';
import { supabase } from '@/lib/supabase';

export type Habit = Tables<'habits'>;

const KEY = ['habits'];
const LOGS_KEY = ['habit-logs'];

/** 연속 기록을 계산하려고 불러오는 기간(일). */
const HISTORY_DAYS = 400;

export function useHabits() {
  const { session } = useAuth();
  const scope = session?.user.id ?? 'local';

  return useQuery({
    queryKey: [...KEY, scope],
    queryFn: async () => {
      if (!session) {
        return listLocalHabits();
      }
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
export function useHabitLogs() {
  const { session } = useAuth();
  const scope = session?.user.id ?? 'local';

  return useQuery({
    queryKey: [...LOGS_KEY, scope],
    queryFn: async () => {
      const sinceDate = addDays(todayISO(), -HISTORY_DAYS);
      let rows: { habit_id: string; log_date: string }[];

      if (!session) {
        rows = await listLocalHabitLogs(sinceDate);
      } else {
        const { data, error } = await supabase
          .from('habit_logs')
          .select('habit_id, log_date')
          .gte('log_date', sinceDate);
        check(error);
        rows = data ?? [];
      }

      const byHabit = new Map<string, Set<string>>();
      for (const log of rows) {
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
  return useInvalidatingMutation(KEY, async ({ id, name }: { id?: string; name: string }) => {
    if (!hasActiveSession()) {
      await saveLocalHabit({ id, name });
      return;
    }
    const { error } = id
      ? await supabase.from('habits').update({ name }).eq('id', id)
      : await supabase.from('habits').insert({ name });
    check(error);
  });
}

/** 습관을 지운다. 그 습관의 실천 기록도 함께 지워진다. */
export function useDeleteHabit() {
  return useInvalidatingMutation(KEY, async (id: string) => {
    if (!hasActiveSession()) {
      await deleteLocalHabit(id);
      return;
    }
    const { error } = await supabase.from('habits').delete().eq('id', id);
    check(error);
  });
}

/** 어떤 날의 실천 표시를 켜거나 끈다. */
export function useToggleHabitLog() {
  return useInvalidatingMutation(
    LOGS_KEY,
    async ({ habitId, date, done }: { habitId: string; date: string; done: boolean }) => {
      if (!hasActiveSession()) {
        await toggleLocalHabitLog({ habitId, date, done });
        return;
      }
      const { error } = done
        ? await supabase.from('habit_logs').delete().eq('habit_id', habitId).eq('log_date', date)
        : await supabase.from('habit_logs').insert({ habit_id: habitId, log_date: date });
      check(error);
    },
  );
}
