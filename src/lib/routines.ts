import type { Tables } from './database.types';
import { formatTime, parseISODate, WEEKDAY_LABELS } from './dates';

/**
 * 하루 루틴 도우미.
 *
 * 화면이나 휴대폰 기능을 쓰지 않는 순수한 계산만 모아 둔다.
 * (데이터 읽기·저장은 hooks/use-routines.ts, 알림 내용은 reminders.ts 가 맡는다.)
 */

export type Routine = Tables<'routines'>;

/** 루틴 종류: 보통 루틴 / 아침 브리핑(알림에 오늘 할 일·일정·날씨 요약을 담는다) */
export type RoutineKind = 'normal' | 'briefing';

/** 루틴 하나를 하루에 몇 분째에 하는지. 예: '06:10:00' → 370 */
export function routineMinutes(routine: Pick<Routine, 'time_of_day'>): number {
  const [hour, minute] = routine.time_of_day.split(':').map(Number);
  return (hour || 0) * 60 + (minute || 0);
}

/** 'HH:MM:SS' 시각을 시·분 숫자로 나눈다. */
export function routineHourMinute(routine: Pick<Routine, 'time_of_day'>): {
  hour: number;
  minute: number;
} {
  const total = routineMinutes(routine);
  return { hour: Math.floor(total / 60), minute: total % 60 };
}

/** 시·분 숫자를 데이터베이스에 넣을 'HH:MM:00' 으로 만든다. */
export function toTimeOfDay(hour: number, minute: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hour)}:${pad(minute)}:00`;
}

/** 루틴 시각을 보기 좋게. 예: '06:10:00' → '06:10' */
export function routineTimeLabel(routine: Pick<Routine, 'time_of_day'>): string {
  return formatTime(routine.time_of_day);
}

/** 시각 순서로 정렬한다(같은 시각이면 먼저 만든 것이 앞). */
export function sortRoutines<T extends Pick<Routine, 'time_of_day' | 'created_at'>>(list: T[]): T[] {
  return [...list].sort(
    (a, b) => routineMinutes(a) - routineMinutes(b) || a.created_at.localeCompare(b.created_at),
  );
}

/** 그 날짜('YYYY-MM-DD')의 요일에 하는 루틴만 시각 순서로 골라 준다. */
export function routinesForDate<T extends Pick<Routine, 'time_of_day' | 'created_at' | 'weekdays'>>(
  list: T[],
  isoDate: string,
): T[] {
  const weekday = parseISODate(isoDate).getDay();
  return sortRoutines(list.filter((routine) => routine.weekdays.includes(weekday)));
}

/** 요일 묶음 바로가기 */
export const WEEKDAY_PRESETS = [
  { label: '매일', days: [0, 1, 2, 3, 4, 5, 6] },
  { label: '평일', days: [1, 2, 3, 4, 5] },
  { label: '주말', days: [0, 6] },
] as const;

/** 월요일부터 보여 주는 요일 순서 (0=일 … 6=토) */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

/** 요일 묶음을 짧은 글로. 예: [1,2,3,4,5] → '평일', [1,3,5] → '월·수·금' */
export function weekdaysLabel(weekdays: readonly number[]): string {
  const set = new Set(weekdays);
  for (const preset of WEEKDAY_PRESETS) {
    if (preset.days.length === set.size && preset.days.every((day) => set.has(day))) {
      return preset.label;
    }
  }
  return WEEKDAY_ORDER.filter((day) => set.has(day))
    .map((day) => WEEKDAY_LABELS[day])
    .join('·');
}

/**
 * 오늘의 "지금 할 루틴"과 "다음 루틴"을 고른다.
 * - 지금: 시각이 이미 지났지만 아직 완료하지 않은 루틴 중 가장 늦은 것.
 *         단, 다음 루틴의 시각이 지나면 그 루틴이 "지금"이 된다.
 * - 다음: 아직 시각이 오지 않은 루틴 중 가장 빠른 것.
 * @param todayList 오늘 하는 루틴(시각 순서)
 * @param isDone 오늘 완료했는지 알려 주는 함수
 * @param nowMinutes 지금이 하루의 몇 분째인지
 */
export function pickNowAndNext<T extends Pick<Routine, 'id' | 'time_of_day'>>(
  todayList: T[],
  isDone: (routine: T) => boolean,
  nowMinutes: number,
): { now: T | null; next: T | null } {
  let now: T | null = null;
  let next: T | null = null;
  for (const routine of todayList) {
    const minutes = routineMinutes(routine);
    if (minutes <= nowMinutes) {
      // 지난 루틴 중 완료하지 않은 가장 늦은 것을 "지금"으로 둔다.
      if (!isDone(routine)) now = routine;
    } else if (!next) {
      next = routine;
    }
  }
  return { now, next };
}

/** 몇 분 남았는지를 짧은 글로. 예: 5 → '5분 후', 90 → '1시간 30분 후' */
export function minutesUntilLabel(minutes: number): string {
  if (minutes <= 0) return '지금';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}분 후`;
  return rest === 0 ? `${hours}시간 후` : `${hours}시간 ${rest}분 후`;
}

/** 루틴이 하나도 없을 때 한 번에 넣어 볼 수 있는 예시 */
export const SAMPLE_ROUTINES: {
  title: string;
  time_of_day: string;
  kind: RoutineKind;
}[] = [
  { title: '아침 브리핑', time_of_day: '06:00:00', kind: 'briefing' },
  { title: '샤워', time_of_day: '06:10:00', kind: 'normal' },
  { title: '운동 가기', time_of_day: '07:00:00', kind: 'normal' },
];
