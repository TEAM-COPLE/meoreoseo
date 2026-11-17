import { useQuery } from '@tanstack/react-query';

import { hasActiveSession, useAuth } from '@/lib/auth';
import type { Tables } from '@/lib/database.types';
import { addDays, formatTime, monthRange, todayISO, type YearMonth } from '@/lib/dates';
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

/** 일정의 시간을 보여줄 글자로 바꾼다. 예: '하루 종일', '14:30', '14:30 – 16:00' */
export function timeLabel(event: CalendarEvent): string {
  if (!event.start_time) return '하루 종일';
  const start = formatTime(event.start_time);
  return event.end_time ? `${start} – ${formatTime(event.end_time)}` : start;
}

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

/** 오늘부터 `days` 일 뒤까지의 일정. 알림을 예약할 때 쓴다. */
export function useUpcomingEvents(days: number) {
  const start = todayISO();
  const end = addDays(start, days);

  return useQuery({
    // KEY 로 시작하므로 일정을 추가·수정·삭제하면 이 목록도 함께 새로 받아온다.
    queryKey: [...KEY, 'upcoming', start, end],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('title, event_date, start_time')
        .gte('event_date', start)
        .lte('event_date', end)
        .order('event_date');
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
