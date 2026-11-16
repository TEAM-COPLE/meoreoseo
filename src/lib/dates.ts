/**
 * 날짜 도우미.
 * 앱 안에서 날짜는 항상 'YYYY-MM-DD' 문자열로 다룬다(데이터베이스의 date 형식과 같다).
 */

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

export const WEEKDAY_LABELS: readonly string[] = WEEKDAYS;

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseISODate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function addDays(iso: string, amount: number): string {
  const date = parseISODate(iso);
  date.setDate(date.getDate() + amount);
  return toISODate(date);
}

/** 오늘을 마지막으로 하는 최근 n일. 오래된 날짜가 먼저 온다. */
export function lastDays(count: number): string[] {
  const today = todayISO();
  return Array.from({ length: count }, (_, i) => addDays(today, i - (count - 1)));
}

/** 예: '11월 15일 (일)' */
export function formatDate(iso: string): string {
  const date = parseISODate(iso);
  return `${date.getMonth() + 1}월 ${date.getDate()}일 (${WEEKDAYS[date.getDay()]})`;
}

export function weekdayOf(iso: string): string {
  return WEEKDAYS[parseISODate(iso).getDay()];
}

export function dayOf(iso: string): number {
  return parseISODate(iso).getDate();
}

/** month 는 0(1월)부터 11(12월)까지다. */
export type YearMonth = { year: number; month: number };

export function yearMonthOf(iso: string): YearMonth {
  const date = parseISODate(iso);
  return { year: date.getFullYear(), month: date.getMonth() };
}

export function shiftMonth({ year, month }: YearMonth, amount: number): YearMonth {
  const date = new Date(year, month + amount, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

/** 예: '2026년 11월' */
export function formatMonth({ year, month }: YearMonth): string {
  return `${year}년 ${month + 1}월`;
}

/** 그 달의 첫날과 마지막 날. */
export function monthRange({ year, month }: YearMonth): { start: string; end: string } {
  return {
    start: toISODate(new Date(year, month, 1)),
    end: toISODate(new Date(year, month + 1, 0)),
  };
}

/**
 * 달력에 그릴 주 단위 배열. 일요일부터 시작하고, 그 달이 아닌 칸은 null 이다.
 */
export function monthGrid({ year, month }: YearMonth): (string | null)[][] {
  const firstWeekday = new Date(year, month, 1).getDay();
  const dayCount = new Date(year, month + 1, 0).getDate();

  const cells: (string | null)[] = Array.from({ length: firstWeekday }, () => null);
  for (let day = 1; day <= dayCount; day++) {
    cells.push(toISODate(new Date(year, month, day)));
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

/** 데이터베이스의 '14:30:00' 을 '14:30' 으로 줄인다. */
export function formatTime(time: string | null): string {
  return time ? time.slice(0, 5) : '';
}

/** '14:30' 처럼 24시간 형식인지 확인한다. */
export function isValidTime(text: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text);
}
