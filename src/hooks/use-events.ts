import { useQuery } from '@tanstack/react-query';

import { requireUserId, useAuth } from '@/lib/auth';
import type { Tables } from '@/lib/database.types';
import { addDays, formatTime, monthRange, todayISO, type YearMonth } from '@/lib/dates';
import { requestGoogleSync } from '@/lib/google-calendar';
import { check, useInvalidatingMutation } from '@/lib/query';
import { isRepeat, occurrencesBetween } from '@/lib/repeat';
import { supabase } from '@/lib/supabase';

type EventRow = Tables<'events'>;

/**
 * 화면에 보여줄 일정 하나.
 * 반복 일정은 날짜마다 하나씩 펼쳐지며, event_date 는 그 칸의 날짜, series_date 는 원래 시작 날짜다.
 */
export type CalendarEvent = EventRow & {
  /** 원래 저장된 시작 날짜 (반복 일정이 아니면 event_date 와 같다) */
  series_date: string;
  /** 목록에서 쓰는 고유 이름. 반복 일정은 같은 id 가 여러 날짜에 나오므로 날짜를 붙인다. */
  key: string;
};

export type EventInput = {
  id?: string;
  title: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  memo: string | null;
  /** 반복 방법 (반복 안 하면 null) */
  repeat: string | null;
  /** 반복이 끝나는 날 (없으면 계속) */
  repeat_until: string | null;
  /** 붙인 태그의 id (없으면 null) */
  tag_id: string | null;
};

const KEY = ['events'];

/** 일정의 시간을 보여줄 글자로 바꾼다. 예: '하루 종일', '14:30', '14:30 – 16:00' */
export function timeLabel(event: Pick<EventRow, 'start_time' | 'end_time'>): string {
  if (!event.start_time) return '하루 종일';
  const start = formatTime(event.start_time);
  return event.end_time ? `${start} – ${formatTime(event.end_time)}` : start;
}

/** 저장된 일정 줄들을 start ~ end 기간의 날짜별 일정으로 펼친다. 날짜순, 같은 날이면 시작 시간순. */
export function expandEvents(rows: EventRow[], start: string, end: string): CalendarEvent[] {
  const result: CalendarEvent[] = [];
  for (const row of rows) {
    const repeat = row.repeat ?? null;
    if (isRepeat(repeat)) {
      // 반복 중 빠진 날짜 (구글 캘린더에서 그날만 지웠거나 따로 고친 날)
      const skipped = new Set(row.excluded_dates ?? []);
      for (const date of occurrencesBetween(row.event_date, repeat, start, end, row.repeat_until)) {
        if (skipped.has(date)) continue;
        result.push({ ...row, event_date: date, series_date: row.event_date, key: `${row.id}:${date}` });
      }
    } else if (row.event_date >= start && row.event_date <= end) {
      result.push({ ...row, repeat: null, series_date: row.event_date, key: row.id });
    }
  }
  return result.sort((a, b) => {
    if (a.event_date !== b.event_date) return a.event_date.localeCompare(b.event_date);
    if (a.start_time === b.start_time) return 0;
    if (a.start_time === null) return -1;
    if (b.start_time === null) return 1;
    return a.start_time.localeCompare(b.start_time);
  });
}

/**
 * start ~ end 기간의 일정을 불러와 날짜별로 펼친다. 위젯도 이 함수를 쓴다.
 */
export async function loadEvents(start: string, end: string): Promise<CalendarEvent[]> {
  requireUserId();
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .lte('event_date', end)
    // 기간 안에 시작하는 일정 + 그 전에 시작했지만 아직 끝나지 않은 반복 일정
    .or(
      `event_date.gte.${start},and(repeat.not.is.null,or(repeat_until.is.null,repeat_until.gte.${start}))`,
    );
  check(error);
  return expandEvents(data ?? [], start, end);
}

/** 한 달 동안의 일정. 반복 일정은 날짜마다 펼쳐진다. */
export function useEvents(month: YearMonth) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { start, end } = monthRange(month);

  return useQuery({
    queryKey: [...KEY, userId, start, end],
    enabled: userId !== null,
    queryFn: () => loadEvents(start, end),
  });
}

/** 오늘부터 `days` 일 뒤까지의 일정. 알림을 예약할 때 쓴다. */
export function useUpcomingEvents(days: number, enabled = true) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const start = todayISO();
  const end = addDays(start, days);

  return useQuery({
    // KEY 로 시작하므로 일정을 추가·수정·삭제하면 이 목록도 함께 새로 받아온다.
    queryKey: [...KEY, userId, 'upcoming', start, end],
    enabled: enabled && userId !== null,
    queryFn: () => loadEvents(start, end),
  });
}

/** 일정을 바꾼 뒤 부른다. 구글 캘린더가 연결되어 있으면 곧 구글에도 반영된다. */
function afterChange() {
  requestGoogleSync();
}

export function useSaveEvent() {
  return useInvalidatingMutation(KEY, async ({ id, ...values }: EventInput) => {
    requireUserId();
    const repeat = isRepeat(values.repeat) ? values.repeat : null;
    const row = { ...values, repeat, repeat_until: repeat ? values.repeat_until : null };
    if (row.repeat_until && row.repeat_until < row.event_date) {
      throw new Error('반복 종료일은 시작 날짜보다 늦어야 합니다.');
    }
    const { error } = id
      ? await supabase.from('events').update(row).eq('id', id)
      : await supabase.from('events').insert(row);
    check(error);
    afterChange();
  });
}

/** 일정을 지운다. 반복 일정이면 반복 전체가 지워진다. */
export function useDeleteEvent() {
  return useInvalidatingMutation(KEY, async (id: string) => {
    requireUserId();
    const { error } = await supabase.from('events').delete().eq('id', id);
    check(error);
    afterChange();
  });
}

/** 고른 일정 여러 개를 한꺼번에 지운다. 반복 일정이 있으면 반복 전체가 지워진다. */
export function useDeleteEvents() {
  return useInvalidatingMutation(KEY, async (ids: string[]) => {
    if (ids.length === 0) return;
    requireUserId();
    const { error } = await supabase.from('events').delete().in('id', ids);
    check(error);
    afterChange();
  });
}

/**
 * 반복 일정을 이 날짜부터 끝낸다(이전 날짜는 그대로 남는다).
 * 첫 날짜에서 끝내면 일정 전체를 지운다.
 */
export function useEndEventRepeat() {
  return useInvalidatingMutation(
    KEY,
    async ({ event, from }: { event: CalendarEvent; from: string }) => {
      requireUserId();
      if (from <= event.series_date) {
        check((await supabase.from('events').delete().eq('id', event.id)).error);
        afterChange();
        return;
      }
      const until = addDays(from, -1);
      const { error } = await supabase
        .from('events')
        .update({ repeat_until: until })
        .eq('id', event.id);
      check(error);
      afterChange();
    },
  );
}
