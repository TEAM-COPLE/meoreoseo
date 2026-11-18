import { addDays, formatDate, parseISODate, toISODate, WEEKDAY_LABELS } from './dates';

/**
 * 반복 날짜 계산 (반복 할 일·반복 일정이 함께 쓴다).
 * 날짜는 앱의 다른 곳처럼 'YYYY-MM-DD' 문자열로 다룬다.
 *
 * 반복 방법은 데이터베이스에 글자 하나로 저장한다.
 *   예전부터 쓰던 값: 'daily'(매일) 'weekdays'(평일) 'weekly'(매주) 'monthly'(매월) 'yearly'(매년)
 *   새 형식: 'every:<간격>:<단위>[:<덧붙임>]'
 *     every:3:day           3일마다
 *     every:2:week          격주 (기준 날짜의 요일)
 *     every:1:week:1,3,5    매주 월·수·금 (0=일 … 6=토)
 *     every:1:month:last    매월 마지막 날
 *     every:1:month:nth     매월 "셋째 수요일"처럼 (기준 날짜가 몇째 주 무슨 요일인지)
 *     every:2:year          2년마다
 * 같은 뜻이면 예전 값으로 저장해서, 아직 업데이트하지 않은 앱에서도 반복이 보이게 한다.
 */
export type Repeat = string;

export type RepeatUnit = 'day' | 'week' | 'month' | 'year';
export type MonthMode = 'date' | 'nth' | 'last';

/** 반복 방법을 풀어 놓은 모양 */
export type RepeatRule = {
  unit: RepeatUnit;
  /** 몇 일·주·개월·년마다인지 (1 ~ 99) */
  interval: number;
  /** 주 단위일 때 반복할 요일들 (0=일 … 6=토). 비어 있으면 기준 날짜의 요일 */
  weekdays: number[];
  /** 월 단위일 때: 같은 날짜(date) / 몇째 주 무슨 요일(nth) / 마지막 날(last) */
  monthMode: MonthMode;
};

export const MAX_INTERVAL = 99;

const LEGACY: Record<string, RepeatRule> = {
  daily: { unit: 'day', interval: 1, weekdays: [], monthMode: 'date' },
  weekdays: { unit: 'week', interval: 1, weekdays: [1, 2, 3, 4, 5], monthMode: 'date' },
  weekly: { unit: 'week', interval: 1, weekdays: [], monthMode: 'date' },
  monthly: { unit: 'month', interval: 1, weekdays: [], monthMode: 'date' },
  yearly: { unit: 'year', interval: 1, weekdays: [], monthMode: 'date' },
};

const EVERY_RE = /^every:([1-9]\d?):(day|week|month|year)(?::([a-z0-9,]+))?$/;

/** 저장된 반복 값을 풀어 본다. 알 수 없는 값이면 null (반복 안 함으로 본다) */
export function parseRepeat(value: unknown): RepeatRule | null {
  if (typeof value !== 'string') return null;
  const legacy = LEGACY[value];
  if (legacy) return { ...legacy, weekdays: [...legacy.weekdays] };

  const match = EVERY_RE.exec(value);
  if (!match) return null;
  const rule: RepeatRule = {
    unit: match[2] as RepeatUnit,
    interval: Number(match[1]),
    weekdays: [],
    monthMode: 'date',
  };
  const extra = match[3];
  if (extra) {
    if (rule.unit === 'week') {
      const days = extra.split(',').map(Number);
      if (days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) return null;
      rule.weekdays = [...new Set(days)].sort((a, b) => a - b);
    } else if (rule.unit === 'month' && (extra === 'last' || extra === 'nth')) {
      rule.monthMode = extra;
    } else {
      return null;
    }
  }
  return rule;
}

/** 풀어 놓은 반복 방법을 저장할 글자로 바꾼다. */
export function serializeRepeat(rule: RepeatRule): Repeat {
  const interval = Math.min(MAX_INTERVAL, Math.max(1, Math.round(rule.interval) || 1));
  const days = [...new Set(rule.weekdays)].sort((a, b) => a - b);
  if (interval === 1) {
    if (rule.unit === 'day') return 'daily';
    if (rule.unit === 'week' && days.length === 0) return 'weekly';
    if (rule.unit === 'week' && days.join(',') === '1,2,3,4,5') return 'weekdays';
    if (rule.unit === 'month' && rule.monthMode === 'date') return 'monthly';
    if (rule.unit === 'year') return 'yearly';
  }
  let value = `every:${interval}:${rule.unit}`;
  if (rule.unit === 'week' && days.length > 0) value += `:${days.join(',')}`;
  if (rule.unit === 'month' && rule.monthMode !== 'date') value += `:${rule.monthMode}`;
  return value;
}

export function isRepeat(value: unknown): value is Repeat {
  return parseRepeat(value) !== null;
}

/** 양식의 "반복" 빠른 선택지. 'none' 은 반복 안 함, 'custom' 은 직접 설정 */
export const REPEAT_PRESETS = [
  { value: 'none', label: '안 함' },
  { value: 'daily', label: '매일' },
  { value: 'weekdays', label: '평일' },
  { value: 'every:1:week:0,6', label: '주말' },
  { value: 'weekly', label: '매주' },
  { value: 'every:2:week', label: '격주' },
  { value: 'monthly', label: '매월' },
  { value: 'every:1:month:last', label: '매월 말일' },
  { value: 'yearly', label: '매년' },
  { value: 'custom', label: '직접 설정' },
] as const;

/** 빠른 선택지에 있는 반복 값인지 (null 은 '안 함') */
export function isPresetRepeat(value: string | null): boolean {
  return REPEAT_PRESETS.some((preset) => preset.value !== 'custom' && preset.value === (value ?? 'none'));
}

/** 요일을 월요일부터 보여주는 순서 */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const NTH_LABELS = ['첫째', '둘째', '셋째', '넷째'];

/** 기준 날짜가 그 달의 "몇째 주 무슨 요일"인지 보여줄 글자. 예: '셋째 수요일', '마지막 금요일' */
export function nthWeekdayLabel(anchor: string): string {
  const date = parseISODate(anchor);
  const nth = Math.ceil(date.getDate() / 7);
  return `${nth >= 5 ? '마지막' : NTH_LABELS[nth - 1]} ${WEEKDAY_LABELS[date.getDay()]}요일`;
}

/** 예: '매일', '평일', '매주 월요일', '격주 월·수요일', '3일마다', '매월 25일', '매월 마지막 날', '매년 3월 1일' */
export function repeatLabel(repeat: Repeat, anchor: string): string {
  const rule = parseRepeat(repeat);
  if (!rule) return '';
  const date = parseISODate(anchor);
  const n = rule.interval;
  switch (rule.unit) {
    case 'day':
      return n === 1 ? '매일' : `${n}일마다`;
    case 'week': {
      const days = rule.weekdays.length > 0 ? rule.weekdays : [date.getDay()];
      const prefix = n === 1 ? '매주' : n === 2 ? '격주' : `${n}주마다`;
      const key = days.join(',');
      if (key === '1,2,3,4,5') return n === 1 ? '평일' : `${prefix} 평일`;
      if (key === '0,6') return n === 1 ? '주말' : `${prefix} 주말`;
      if (days.length === 7) return n === 1 ? '매일' : `${prefix} 매일`;
      const names = WEEKDAY_ORDER.filter((day) => days.includes(day)).map((day) => WEEKDAY_LABELS[day]);
      return `${prefix} ${names.join('·')}요일`;
    }
    case 'month': {
      const prefix = n === 1 ? '매월' : `${n}개월마다`;
      if (rule.monthMode === 'last') return `${prefix} 마지막 날`;
      if (rule.monthMode === 'nth') return `${prefix} ${nthWeekdayLabel(anchor)}`;
      return `${prefix} ${date.getDate()}일`;
    }
    case 'year':
      return `${n === 1 ? '매년' : `${n}년마다`} ${date.getMonth() + 1}월 ${date.getDate()}일`;
  }
}

/** 두 날짜 사이의 날 수 (b - a) */
function daysBetween(a: string, b: string): number {
  return daysBetweenDates(parseISODate(a), parseISODate(b));
}

function daysBetweenDates(a: Date, b: Date): number {
  // 서머타임이 있는 지역에서도 하루 단위로 맞도록 반올림한다.
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** 그 날짜가 속한 주의 일요일 */
function weekStartOf(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay());
}

/** date 가 anchor(기준 날짜)부터 시작하는 반복의 한 날짜인지 */
function matchesRule(rule: RepeatRule, anchor: Date, date: Date): boolean {
  switch (rule.unit) {
    case 'day':
      return daysBetweenDates(anchor, date) % rule.interval === 0;
    case 'week': {
      const days = rule.weekdays.length > 0 ? rule.weekdays : [anchor.getDay()];
      if (!days.includes(date.getDay())) return false;
      const weeks = Math.round(daysBetweenDates(weekStartOf(anchor), weekStartOf(date)) / 7);
      return weeks % rule.interval === 0;
    }
    case 'month': {
      const months =
        (date.getFullYear() - anchor.getFullYear()) * 12 + (date.getMonth() - anchor.getMonth());
      if (months % rule.interval !== 0) return false;
      const last = lastDayOfMonth(date.getFullYear(), date.getMonth());
      if (rule.monthMode === 'last') return date.getDate() === last;
      if (rule.monthMode === 'nth') {
        if (date.getDay() !== anchor.getDay()) return false;
        const nth = Math.ceil(anchor.getDate() / 7);
        // 다섯째 주는 없는 달이 많아서 "마지막 주"로 본다.
        return nth >= 5 ? date.getDate() + 7 > last : Math.ceil(date.getDate() / 7) === nth;
      }
      // 그 달에 그 날이 없으면(예: 2월 31일) 그 달의 마지막 날로 한다.
      return date.getDate() === Math.min(anchor.getDate(), last);
    }
    case 'year': {
      const years = date.getFullYear() - anchor.getFullYear();
      if (years % rule.interval !== 0 || date.getMonth() !== anchor.getMonth()) return false;
      const last = lastDayOfMonth(date.getFullYear(), date.getMonth());
      return date.getDate() === Math.min(anchor.getDate(), last);
    }
  }
}

/** 한 번에 펼치는 날짜의 최대 개수 (실수로 너무 긴 기간을 넣었을 때를 막는다) */
const MAX_OCCURRENCES = 400;

/** anchor 부터 반복되는 날짜 중 from ~ to 사이(둘 다 포함)를 하루씩 살펴 최대 limit 개 모은다. */
function collectOccurrences(
  anchor: string,
  rule: RepeatRule,
  from: string,
  to: string,
  limit: number,
): string[] {
  const first = from > anchor ? from : anchor;
  if (first > to) return [];
  const anchorDate = parseISODate(anchor);
  const cursor = parseISODate(first);
  const result: string[] = [];
  for (let iso = first; iso <= to && result.length < limit; ) {
    // 기준 날짜(처음 고른 날짜)는 규칙과 상관없이 항상 들어간다.
    if (iso === anchor || matchesRule(rule, anchorDate, cursor)) result.push(iso);
    cursor.setDate(cursor.getDate() + 1);
    iso = toISODate(cursor);
  }
  return result;
}

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
  const rule = parseRepeat(repeat);
  if (!rule) return [];
  const last = until && until < to ? until : to;
  return collectOccurrences(anchor, rule, from, last, MAX_OCCURRENCES);
}

/** 다음 반복 날짜를 찾을 때 앞으로 며칠까지 살펴볼지 (한 바퀴보다 조금 넉넉하게) */
function lookaheadDays(rule: RepeatRule): number {
  switch (rule.unit) {
    case 'day':
      return rule.interval + 1;
    case 'week':
      return 7 * rule.interval + 7;
    case 'month':
      return 31 * rule.interval + 62;
    case 'year':
      return 366 * rule.interval + 31;
  }
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
  const rule = parseRepeat(repeat);
  if (!rule) return addDays(from, 1);
  const found = collectOccurrences(anchor, rule, from, addDays(from, lookaheadDays(rule)), 1);
  return found[0] ?? addDays(from, 1);
}

/**
 * 반복 할 일을 끝냈을 때 생기는 다음 할 일의 마감일.
 * 항상 내일 이후로 잡는다. 오늘 끝냈으면 오늘 몫은 한 것이므로, 밀린 할 일을 오늘 끝내도
 * 오늘 날짜의 할 일이 또 생기지 않는다.
 */
export function nextTodoDate(anchor: string, repeat: Repeat, due: string, today: string): string {
  return nextOccurrence(anchor, repeat, due, addDays(today, 1));
}

/** 할 일을 시작하는 날. 시작일이 있으면 시작일, 없으면 마감일이다 (둘 다 없으면 null). */
export function todoStartOf(todo: { start_date?: string | null; due_date: string | null }): string | null {
  return todo.start_date ?? todo.due_date;
}

/**
 * 아직 차례가 오지 않은 반복 할 일인지. 이런 할 일은 시작일(없으면 마감일)이 되어야 체크할 수 있다.
 * (반복이 아닌 할 일은 마감일 전에도 미리 끝낼 수 있다.)
 */
export function isWaitingRepeat(
  todo: { done: boolean; repeat: string | null; due_date: string | null; start_date?: string | null },
  today: string,
): boolean {
  const start = todoStartOf(todo);
  return !todo.done && isRepeat(todo.repeat) && start !== null && start > today;
}

/**
 * 반복 할 일의 다음 시작일. 지금 할 일의 "시작일 ~ 마감일" 길이를 그대로 유지한다.
 * 예: 월~수(3일짜리) 할 일을 매주 반복하면 다음 것도 월~수가 된다.
 */
export function nextTodoStart(
  todo: { start_date: string | null; due_date: string },
  nextDue: string,
): string | null {
  if (!todo.start_date) return null;
  return addDays(nextDue, -daysBetween(todo.start_date, todo.due_date));
}

/**
 * 할 일 기간을 보여줄 글자.
 * 예: '11월 18일 (화) – 11월 22일 (토)', '11월 18일 (화)', 시작일만 있으면 '11월 18일 (화)부터'
 */
export function todoPeriodLabel(todo: { start_date: string | null; due_date: string | null }): string {
  if (!todo.due_date) return todo.start_date ? `${formatDate(todo.start_date)}부터` : '';
  if (!todo.start_date || todo.start_date === todo.due_date) return formatDate(todo.due_date);
  return `${formatDate(todo.start_date)} – ${formatDate(todo.due_date)}`;
}
