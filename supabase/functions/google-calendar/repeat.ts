/**
 * 반복 규칙 바꾸기: 멀어서의 반복 값 ↔ 구글 캘린더의 RRULE.
 *
 * 멀어서의 반복 값 모양은 앱의 src/lib/repeat.ts 와 같다.
 *   'daily' 'weekdays' 'weekly' 'monthly' 'yearly'
 *   'every:<간격>:day|week|month|year[:요일들|last|nth]'
 * 구글(그리고 대부분의 캘린더)은 iCalendar 표준의 RRULE 글자를 쓴다.
 *   예: RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE
 * 서버 함수는 앱 코드를 그대로 불러올 수 없어서, 필요한 부분만 여기 옮겨 두었다.
 */

export type RepeatUnit = 'day' | 'week' | 'month' | 'year';
export type MonthMode = 'date' | 'nth' | 'last';
export type RepeatRule = {
  unit: RepeatUnit;
  interval: number;
  /** 주 단위 반복 요일 (0=일 … 6=토). 비어 있으면 기준 날짜의 요일 */
  weekdays: number[];
  monthMode: MonthMode;
};

const LEGACY: Record<string, RepeatRule> = {
  daily: { unit: 'day', interval: 1, weekdays: [], monthMode: 'date' },
  weekdays: { unit: 'week', interval: 1, weekdays: [1, 2, 3, 4, 5], monthMode: 'date' },
  weekly: { unit: 'week', interval: 1, weekdays: [], monthMode: 'date' },
  monthly: { unit: 'month', interval: 1, weekdays: [], monthMode: 'date' },
  yearly: { unit: 'year', interval: 1, weekdays: [], monthMode: 'date' },
};

const EVERY_RE = /^every:([1-9]\d?):(day|week|month|year)(?::([a-z0-9,]+))?$/;
const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

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
      if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return null;
      rule.weekdays = [...new Set(days)].sort((a, b) => a - b);
    } else if (rule.unit === 'month' && (extra === 'last' || extra === 'nth')) {
      rule.monthMode = extra;
    } else {
      return null;
    }
  }
  return rule;
}

export function serializeRepeat(rule: RepeatRule): string {
  const interval = Math.min(99, Math.max(1, Math.round(rule.interval) || 1));
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

// ───────────────────────── 날짜 도우미 ('YYYY-MM-DD') ─────────────────────────

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split('-').map(Number);
  return [y, m, d];
}

export function dateOf(iso: string): Date {
  const [y, m, d] = parts(iso);
  return new Date(Date.UTC(y, m - 1, d));
}

export function isoOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, amount: number): string {
  const date = dateOf(iso);
  date.setUTCDate(date.getUTCDate() + amount);
  return isoOf(date);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((dateOf(b).getTime() - dateOf(a).getTime()) / 86_400_000);
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

// ───────────────────────── 반복 날짜 계산 (앱과 같은 규칙) ─────────────────────────

function matchesRule(rule: RepeatRule, anchor: Date, date: Date): boolean {
  const days = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86_400_000);
  switch (rule.unit) {
    case 'day':
      return days(anchor, date) % rule.interval === 0;
    case 'week': {
      const wd = rule.weekdays.length > 0 ? rule.weekdays : [anchor.getUTCDay()];
      if (!wd.includes(date.getUTCDay())) return false;
      const startA = new Date(anchor.getTime() - anchor.getUTCDay() * 86_400_000);
      const startD = new Date(date.getTime() - date.getUTCDay() * 86_400_000);
      return Math.round(days(startA, startD) / 7) % rule.interval === 0;
    }
    case 'month': {
      const months =
        (date.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
        (date.getUTCMonth() - anchor.getUTCMonth());
      if (months % rule.interval !== 0) return false;
      const last = lastDayOfMonth(date.getUTCFullYear(), date.getUTCMonth());
      if (rule.monthMode === 'last') return date.getUTCDate() === last;
      if (rule.monthMode === 'nth') {
        if (date.getUTCDay() !== anchor.getUTCDay()) return false;
        const nth = Math.ceil(anchor.getUTCDate() / 7);
        return nth >= 5 ? date.getUTCDate() + 7 > last : Math.ceil(date.getUTCDate() / 7) === nth;
      }
      return date.getUTCDate() === Math.min(anchor.getUTCDate(), last);
    }
    case 'year': {
      const years = date.getUTCFullYear() - anchor.getUTCFullYear();
      if (years % rule.interval !== 0 || date.getUTCMonth() !== anchor.getUTCMonth()) return false;
      const last = lastDayOfMonth(date.getUTCFullYear(), date.getUTCMonth());
      return date.getUTCDate() === Math.min(anchor.getUTCDate(), last);
    }
  }
}

/** anchor 부터 count 번째 반복 날짜 (COUNT 로 끝나는 구글 반복을 "끝나는 날"로 바꿀 때 쓴다) */
export function nthOccurrence(anchor: string, rule: RepeatRule, count: number): string | null {
  const anchorDate = dateOf(anchor);
  const cursor = dateOf(anchor);
  let found = 0;
  // 최대 약 30년까지만 살펴본다.
  for (let i = 0; i < 11_000; i++) {
    if (i === 0 || matchesRule(rule, anchorDate, cursor)) {
      found++;
      if (found >= count) return isoOf(cursor);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return null;
}

// ───────────────────────── 멀어서 → 구글 ─────────────────────────

/**
 * 멀어서 반복 값을 RRULE 한 줄로 바꾼다.
 * untilRule: RRULE 에 넣을 UNTIL 값(하루 종일 일정은 YYYYMMDD, 시간 일정은 UTC 시각) — 없으면 계속 반복.
 */
export function toRRule(repeat: string, anchor: string, untilRule: string | null): string | null {
  const rule = parseRepeat(repeat);
  if (!rule) return null;
  const anchorDate = dateOf(anchor);
  const items: string[] = [];
  switch (rule.unit) {
    case 'day':
      items.push('FREQ=DAILY');
      break;
    case 'week': {
      const days = rule.weekdays.length > 0 ? rule.weekdays : [anchorDate.getUTCDay()];
      items.push('FREQ=WEEKLY', `BYDAY=${days.map((d) => DAY_CODES[d]).join(',')}`, 'WKST=SU');
      break;
    }
    case 'month':
      items.push('FREQ=MONTHLY');
      if (rule.monthMode === 'last') items.push('BYMONTHDAY=-1');
      if (rule.monthMode === 'nth') {
        const nth = Math.ceil(anchorDate.getUTCDate() / 7);
        items.push(`BYDAY=${nth >= 5 ? -1 : nth}${DAY_CODES[anchorDate.getUTCDay()]}`);
      }
      break;
    case 'year':
      items.push('FREQ=YEARLY');
      break;
  }
  if (rule.interval > 1) items.push(`INTERVAL=${rule.interval}`);
  if (untilRule) items.push(`UNTIL=${untilRule}`);
  return `RRULE:${items.join(';')}`;
}

// ───────────────────────── 구글 → 멀어서 ─────────────────────────

export type ParsedRecurrence = {
  /** 멀어서 반복 값 (표현할 수 없으면 null) */
  repeat: string | null;
  /** 반복이 끝나는 날 (YYYY-MM-DD) */
  until: string | null;
  /** 반복에서 빠지는 날짜들 */
  excluded: string[];
  /** 멀어서가 다 표현하지 못하는 반복이었는지 (그럼 구글 쪽 반복을 건드리지 않는다) */
  unsupported: boolean;
};

/**
 * 구글 일정의 recurrence 줄들을 멀어서 반복으로 바꾼다.
 * toLocalDate: 구글의 UNTIL/EXDATE 값(YYYYMMDD 또는 YYYYMMDDTHHMMSS[Z])을 우리 날짜로 바꾸는 함수
 */
export function fromRecurrence(
  lines: string[] | undefined,
  anchor: string,
  toLocalDate: (value: string, tzid: string | null) => string | null,
): ParsedRecurrence {
  const result: ParsedRecurrence = { repeat: null, until: null, excluded: [], unsupported: false };
  if (!lines || lines.length === 0) return result;

  for (const line of lines) {
    if (line.startsWith('EXDATE')) {
      const [head, values] = splitOnce(line, ':');
      const tzid = /TZID=([^;:]+)/.exec(head)?.[1] ?? null;
      for (const value of (values ?? '').split(',')) {
        const date = toLocalDate(value.trim(), tzid);
        if (date) result.excluded.push(date);
      }
    } else if (line.startsWith('RRULE:')) {
      if (result.repeat !== null || result.unsupported) {
        // RRULE 이 두 개 이상이면 멀어서로는 표현할 수 없다.
        result.unsupported = true;
        result.repeat = null;
        continue;
      }
      const parsed = fromRRule(line.slice(6), anchor, toLocalDate);
      if (!parsed) {
        result.unsupported = true;
      } else {
        result.repeat = parsed.repeat;
        result.until = parsed.until;
      }
    } else if (line.startsWith('RDATE')) {
      // 따로 더해진 날짜는 표현할 수 없다.
      result.unsupported = true;
    }
  }
  if (result.unsupported) result.repeat = null;
  result.excluded = [...new Set(result.excluded)].sort().slice(0, 500);
  return result;
}

function splitOnce(text: string, sep: string): [string, string | undefined] {
  const i = text.indexOf(sep);
  return i < 0 ? [text, undefined] : [text.slice(0, i), text.slice(i + 1)];
}

function fromRRule(
  body: string,
  anchor: string,
  toLocalDate: (value: string, tzid: string | null) => string | null,
): { repeat: string; until: string | null } | null {
  const map = new Map<string, string>();
  for (const pair of body.split(';')) {
    const [key, value] = splitOnce(pair, '=');
    if (value !== undefined) map.set(key.toUpperCase(), value.toUpperCase());
  }
  // 멀어서가 모르는 조건이 있으면 포기한다.
  const known = new Set(['FREQ', 'INTERVAL', 'BYDAY', 'BYMONTHDAY', 'UNTIL', 'COUNT', 'WKST', 'BYMONTH']);
  for (const key of map.keys()) if (!known.has(key)) return null;

  const anchorDate = dateOf(anchor);
  const interval = Number(map.get('INTERVAL') ?? '1');
  if (!Number.isInteger(interval) || interval < 1 || interval > 99) return null;
  const rule: RepeatRule = { unit: 'day', interval, weekdays: [], monthMode: 'date' };
  const byDay = map.get('BYDAY');
  const byMonthDay = map.get('BYMONTHDAY');
  const byMonth = map.get('BYMONTH');

  switch (map.get('FREQ')) {
    case 'DAILY':
      if (byMonthDay || byMonth) return null;
      if (byDay) {
        // "평일마다" 를 DAILY+BYDAY 로 만드는 캘린더도 있다.
        const days = plainDays(byDay);
        if (!days || interval !== 1) return null;
        rule.unit = 'week';
        rule.weekdays = days;
      } else {
        rule.unit = 'day';
      }
      break;
    case 'WEEKLY': {
      if (byMonthDay || byMonth) return null;
      rule.unit = 'week';
      if (byDay) {
        const days = plainDays(byDay);
        if (!days) return null;
        rule.weekdays = days.length === 1 && days[0] === anchorDate.getUTCDay() ? [] : days;
      }
      break;
    }
    case 'MONTHLY':
      if (byMonth) return null;
      rule.unit = 'month';
      if (byMonthDay) {
        if (byDay) return null;
        if (byMonthDay === '-1') rule.monthMode = 'last';
        else if (Number(byMonthDay) !== anchorDate.getUTCDate()) return null;
      } else if (byDay) {
        const match = /^(-1|[1-5])(SU|MO|TU|WE|TH|FR|SA)$/.exec(byDay);
        if (!match) return null;
        if (DAY_CODES.indexOf(match[2]) !== anchorDate.getUTCDay()) return null;
        const anchorNth = Math.ceil(anchorDate.getUTCDate() / 7);
        const nth = Number(match[1]);
        const sameNth = nth === -1 ? anchorNth >= 5 || anchorDate.getUTCDate() + 7 > lastDayOfMonth(anchorDate.getUTCFullYear(), anchorDate.getUTCMonth()) : nth === anchorNth;
        if (!sameNth) return null;
        rule.monthMode = 'nth';
      }
      break;
    case 'YEARLY':
      if (byDay || (byMonthDay && Number(byMonthDay) !== anchorDate.getUTCDate())) return null;
      if (byMonth && Number(byMonth) !== anchorDate.getUTCMonth() + 1) return null;
      rule.unit = 'year';
      break;
    default:
      return null;
  }

  let until: string | null = null;
  const untilValue = map.get('UNTIL');
  if (untilValue) until = toLocalDate(untilValue, null);
  const count = map.get('COUNT');
  if (count) {
    const n = Number(count);
    if (!Number.isInteger(n) || n < 1) return null;
    until = nthOccurrence(anchor, rule, n);
  }
  return { repeat: serializeRepeat(rule), until };
}

/** 'MO,WE' 같은 요일 목록을 숫자로. '2MO' 처럼 앞에 숫자가 붙으면 표현할 수 없어 null */
function plainDays(byDay: string): number[] | null {
  const days: number[] = [];
  for (const code of byDay.split(',')) {
    const index = DAY_CODES.indexOf(code);
    if (index < 0) return null;
    days.push(index);
  }
  return [...new Set(days)].sort((a, b) => a - b);
}
