import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { isDevMode, requireUserId, useAuth } from '@/lib/auth';
import { addDays, todayISO } from '@/lib/dates';
import {
  localDeleteRoutine,
  localListRoutineLogs,
  localListRoutines,
  localSaveRoutines,
  localSetRoutineLogDone,
  type LocalRoutineValues,
} from '@/lib/local-db';
import { check } from '@/lib/query';
import { sortRoutines, type Routine } from '@/lib/routines';
import { supabase } from '@/lib/supabase';

/**
 * 하루 루틴 데이터 읽기·저장.
 * 서버(Supabase)에 저장하므로 웹과 휴대폰에서 같은 루틴이 보인다.
 */

export type { Routine } from '@/lib/routines';

/** 루틴을 저장할 때 넣는 값 */
export type RoutineValues = LocalRoutineValues;

const KEY = ['routines'];
const LOGS_KEY = ['routine-logs'];

/** 완료 기록을 며칠 전까지 불러올지 */
const HISTORY_DAYS = 60;

/** 내 루틴 전체. 시각 순서로 정렬해서 돌려준다. */
export function useRoutines(enabled = true) {
  const { userId } = useAuth();
  return useQuery({
    queryKey: [...KEY, userId],
    enabled: enabled && userId !== null,
    queryFn: async (): Promise<Routine[]> => {
      if (isDevMode()) return sortRoutines(await localListRoutines());
      const { data, error } = await supabase
        .from('routines')
        .select('*')
        .order('time_of_day')
        .order('created_at');
      check(error);
      return sortRoutines(data ?? []);
    },
  });
}

/**
 * 루틴별로 "완료한 날짜 모음"을 돌려준다.
 * 예: logs.get(routineId)?.has('2026-11-21')
 */
export function useRoutineLogs(enabled = true) {
  const { userId } = useAuth();
  return useQuery({
    queryKey: [...LOGS_KEY, userId],
    enabled: enabled && userId !== null,
    queryFn: async () => {
      const sinceDate = addDays(todayISO(), -HISTORY_DAYS);
      const rows = isDevMode()
        ? await localListRoutineLogs(sinceDate)
        : await (async () => {
            const { data, error } = await supabase
              .from('routine_logs')
              .select('routine_id, log_date')
              .gte('log_date', sinceDate);
            check(error);
            return data ?? [];
          })();

      const byRoutine = new Map<string, Set<string>>();
      for (const log of rows) {
        const dates = byRoutine.get(log.routine_id) ?? new Set<string>();
        dates.add(log.log_date);
        byRoutine.set(log.routine_id, dates);
      }
      return byRoutine;
    },
  });
}

/** 루틴 여러 개를 한꺼번에 추가하거나 고친다. id 가 있으면 고치고, 없으면 새로 만든다. */
async function saveRoutines(items: { id?: string; values: RoutineValues }[]): Promise<void> {
  requireUserId();
  if (isDevMode()) {
    await localSaveRoutines(items);
    return;
  }
  const inserts = items.filter((item) => !item.id).map((item) => item.values);
  if (inserts.length > 0) {
    const { error } = await supabase.from('routines').insert(inserts);
    check(error);
  }
  for (const item of items) {
    if (!item.id) continue;
    const { error } = await supabase.from('routines').update(item.values).eq('id', item.id);
    check(error);
  }
}

/** 루틴 하나를 추가하거나 고친다. */
export function useSaveRoutine() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: KEY,
    mutationFn: ({ id, values }: { id?: string; values: RoutineValues }) =>
      saveRoutines([{ id, values }]),
    onSuccess: () => client.invalidateQueries({ queryKey: KEY }),
  });
}

/** 예시 루틴처럼 여러 개를 한 번에 추가한다. */
export function useAddRoutines() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: KEY,
    mutationFn: (list: RoutineValues[]) => saveRoutines(list.map((values) => ({ values }))),
    onSuccess: () => client.invalidateQueries({ queryKey: KEY }),
  });
}

/** 루틴을 지운다. 그 루틴의 완료 기록도 함께 지워진다. */
export function useDeleteRoutine() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: KEY,
    mutationFn: async (id: string) => {
      requireUserId();
      if (isDevMode()) {
        await localDeleteRoutine(id);
        return;
      }
      const { error } = await supabase.from('routines').delete().eq('id', id);
      check(error);
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: KEY });
      client.invalidateQueries({ queryKey: LOGS_KEY });
    },
  });
}

type ToggleVars = { routineId: string; date: string; done: boolean };

/**
 * 어떤 날의 루틴 완료 표시를 켜거나 끈다. `done` 은 "지금 완료 상태인지"다(누르면 반대로 바뀐다).
 * 누르자마자 화면에 먼저 반영하고, 저장에 실패하면 원래대로 되돌린다.
 */
export function useToggleRoutineLog() {
  const client = useQueryClient();
  const { userId } = useAuth();
  const cacheKey = [...LOGS_KEY, userId];

  function setCached(routineId: string, date: string, done: boolean) {
    client.setQueryData<Map<string, Set<string>>>(cacheKey, (old) => {
      if (!old) return old;
      const next = new Map(old);
      const dates = new Set(next.get(routineId) ?? []);
      if (done) dates.add(date);
      else dates.delete(date);
      next.set(routineId, dates);
      return next;
    });
  }

  return useMutation({
    mutationKey: LOGS_KEY,
    mutationFn: async ({ routineId, date, done }: ToggleVars) => {
      requireUserId();
      const target = !done;
      if (isDevMode()) {
        await localSetRoutineLogDone(routineId, date, target);
        return;
      }
      if (target) {
        const { error } = await supabase
          .from('routine_logs')
          .upsert(
            { routine_id: routineId, log_date: date },
            { onConflict: 'routine_id,log_date', ignoreDuplicates: true },
          );
        check(error);
      } else {
        const { error } = await supabase
          .from('routine_logs')
          .delete()
          .eq('routine_id', routineId)
          .eq('log_date', date);
        check(error);
      }
    },
    onMutate: ({ routineId, date, done }: ToggleVars) => setCached(routineId, date, !done),
    onError: (_error, { routineId, date, done }) => setCached(routineId, date, done),
  });
}
