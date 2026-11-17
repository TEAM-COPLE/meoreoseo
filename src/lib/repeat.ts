import { addDays, parseISODate, toISODate, WEEKDAY_LABELS } from './dates';

/**
 * 반복 날짜 계산 (반복 할 일·반복 일정이 함께 쓴다).
 * 날짜는 앱의 다른 곳처럼 'YYYY-MM-DD' 문자열로 다룬다.
 */

export type Repeat = 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly';

/** 양식의 "반복" 선택지. 'none' 은 반복 안 함 */
export const REPEAT_OPTIONS = [
  { value: 'none', label: '안 함' },
  { value: 'daily', label: '매일' },
  { value: 'weekdays', label: '평일' },
  { value: 'weekly', label: '매주' },
  { value: 'monthly', label: '매월' },
  { value: 'yearly', label: '매년' },
] as const;

export type RepeatChoice = (typeof REPEAT_OPTIONS)[number]['value'];

export function isRepeat(value: unknown): value is Repeat {
  return (
    value === 'daily' ||
    value === 'weekdays' ||
    value === 'weekly' ||
    value === 'monthly' ||
    value === 'yearly'
  );
}

/** 예: '매일', '평일', '매주 월요일', '매월 25일', '매년 3월 1일' */
export function repeatLabel(repeat: Repeat, anchor: string): string {
  const date = parseISODate(anchor);
  switch (repeat) {
    case 'daily':
      return '매일';
    case 'weekdays':
      return '평일';
    case 'weekly':
      return `매주 ${WEEKDAY_LABELS[date.getDay()]}요일`;
    case 'monthly':
      return `매월 ${date.getDate()}일`;
    case 'yearly':
      return `매년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
  }
}

/** 두 날짜 사이의 날 수 (b - a) */
function daysBetween(a: string, b: string): number {
  const ms = parseISODate(b).getTime() - parseISODate(a).getTime();
  // 서머타임이 있는 지역에서도 하루 단위로 맞도록 반올림한다.
  return Math.round(ms / 86_400_000);
}

/**
 * 기준 날짜(anchor)로부터 k 번째 달(또는 해)의 같은 날.
 * 그 달에 그 날이 없으면(예: 2월 31일) 그 달의 마지막 날로 한다.
 */
function shiftMonthsClamped(anchor: string, months: number): string {
  const base = parseISODate(anchor);
  const year = base.getFullYear();
  const month = base.getMonth() + months;
  const lastDay = new Date(year, month + 1, 0).getDate();
  return toISODate(new Date(year, month, Math.min(base.getDate(), lastDay)));
}

function isWeekday(iso: string): boolean {
  const day = parseISODate(iso).getDay();
  return day !== 0 && day !== 6;
}

/** 한 번에 펼치는 날짜의 최대 개수 (실수로 너무 긴 기간을 넣었을 때를 막는다) */
const MAX_OCCURRENCES = 400;

/**
 * anchor 부터 반복되는 날짜 중 from ~ to 사이(둘 다 포함)에 있는 것.
 * until 이 있으면 그날까지만 반복한다. anchor 보다 이른 날짜는 없다.
 */
export function occurrencesBetween(
  anchor: string,
  repeat: Repeat,
  from: string,
  to: string,
  until?: string | null,
): string[] {
  const last = until && until < to ? until : to;
  const first = from > anchor ? from : anchor;
  if (first > last) return [];

  const result: string[] = [];
  const push = (date: string) => {
    if (date >= first && date <= last) result.push(date);
  };

  if (repeat === 'daily' || repeat === 'weekdays') {
    for (let date = first; date <= last && result.length < MAX_OCCURRENCES; date = addDays(date, 1)) {
      if (repeat === 'daily' || isWeekday(date)) result.push(date);
    }
    return result;
  }

  if (repeat === 'weekly') {
    // first 이상인 가장 가까운 같은 요일부터 7일씩
    const skip = Math.ceil(daysBetween(anchor, first) / 7);
    for (
      let date = addDays(anchor, skip * 7);
      date <= last && result.length < MAX_OCCURRENCES;
      date = addDays(date, 7)
    ) {
      push(date);
    }
    return result;
  }

  // 매월·매년: 기준 날짜에서 몇 달 뒤인지로 계산한다(짧은 달 때문에 날짜가 밀리지 않게).
  const step = repeat === 'monthly' ? 1 : 12;
  const anchorDate = parseISODate(anchor);
  const firstDate = parseISODate(first);
  const monthsToFirst =
    (firstDate.getFullYear() - anchorDate.getFullYear()) * 12 +
    (firstDate.getMonth() - anchorDate.getMonth());
  // 한 칸 앞에서부터 확인해야 경계의 날짜를 놓치지 않는다.
  let k = Math.max(0, Math.floor(monthsToFirst / step) - 1);
  for (let i = 0; i < MAX_OCCURRENCES; i++, k++) {
    const date = shiftMonthsClamped(anchor, k * step);
    if (date > last) break;
    push(date);
  }
  return result;
}

/**
 * 반복 할 일을 완료했을 때 다음 마감일.
 * after(방금 끝낸 할 일의 마감일)보다 뒤이고, notBefore(보통 오늘) 이후인 첫 반복 날짜.
 * 며칠 밀린 할 일을 끝내도 지난 날짜가 아니라 오늘 이후로 잡힌다.
 */
export function nextOccurrence(
  anchor: string,
  repeat: Repeat,
  after: string,
  notBefore: string,
): string {
  const dayAfter = addDays(after, 1);
  const from = dayAfter > notBefore ? dayAfter : notBefore;
  // 매년 반복도 찾을 수 있게 넉넉히 400일 뒤까지 본다.
  const found = occurrencesBetween(anchor, repeat, from, addDays(from, 400));
  return found[0] ?? addDays(from, 1);
}
