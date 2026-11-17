import { useQuery } from '@tanstack/react-query';

import { hasActiveSession, useAuth } from '@/lib/auth';
import type { Tables } from '@/lib/database.types';
import { monthRange, type YearMonth } from '@/lib/dates';
import { deleteLocalEvent, listLocalEvents, saveLocalEvent } from '@/lib/local-store';
import { check, useInvalidatingMutation } from '@/lib/query';
import { supabase } from '@/lib/supabase';

export type CalendarEvent = Tables<'events'>;

export type EventInput = {
  id?: string;
  title: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  memo: string | null;
};

const KEY = ['events'];

/** 한 달 동안의 일정. 날짜순, 같은 날이면 시작 시간순이다. */
export function useEvents(month: YearMonth) {
  const { session } = useAuth();
  const scope = session?.user.id ?? 'local';
  const { start, end } = monthRange(month);

  return useQuery({
    queryKey: [...KEY, scope, start, end],
    queryFn: async () => {
      if (!session) {
        return listLocalEvents(start, end);
      }
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .gte('event_date', start)
        .lte('event_date', end)
        .order('event_date')
        .order('start_time', { ascending: true, nullsFirst: true });
      check(error);
      return data ?? [];
    },
  });
}

export function useSaveEvent() {
  return useInvalidatingMutation(KEY, async ({ id, ...values }: EventInput) => {
    if (!hasActiveSession()) {
      await saveLocalEvent({ id, ...values });
      return;
    }
    const { error } = id
      ? await supabase.from('events').update(values).eq('id', id)
      : await supabase.from('events').insert(values);
    check(error);
  });
}

export function useDeleteEvent() {
  return useInvalidatingMutation(KEY, async (id: string) => {
    if (!hasActiveSession()) {
      await deleteLocalEvent(id);
      return;
    }
    const { error } = await supabase.from('events').delete().eq('id', id);
    check(error);
  });
}
