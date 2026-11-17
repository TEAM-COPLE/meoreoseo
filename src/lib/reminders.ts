import type { Tables } from './database.types';
import { addDays, formatDate, formatTime, parseISODate, toISODate } from './dates';
import type { DayForecast } from './weather';
import { describeWeather, formatTemperature } from './weather-format';

/**
 * 알림 계획.
 *
 * 이 파일은 "무엇을 언제 알릴지"만 정한다(휴대폰 기능을 쓰지 않는 순수한 계산).
 * 실제로 휴대폰에 알림을 예약하는 일은 notifications.ts 가 맡는다.
 */

/** 사용자가 고른 알림 설정. 휴대폰마다 따로 저장한다(hooks/use-notification-settings.ts). */
export type NotificationSettings = {
  /** 알림 전체를 켤지 */
  enabled: boolean;
  /** 할 일: 마감일 아침에 알림 */
  todos: boolean;
  /** 일정: 시작 전에 알림 */
  events: boolean;
  /** 습관: 매일 저녁에 알림 */
  habits: boolean;
  /** 오류 알림: 앱에서 오류가 나면 바로 알림으로 알려준다. "알림 받기"와 따로 켜고 끈다. */
  errors: boolean;
  /** 아침 브리핑: 매일 아침 날씨·할 일·일정을 한 번에 요약해서 알림 */
  briefing: boolean;
};

export const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: false,
  todos: true,
  events: true,
  habits: true,
  errors: true,
  briefing: true,
};

/** 아침 브리핑을 보내는 시각(오전 7시) */
export const BRIEFING_HOUR = 7;
/** 아침 브리핑을 며칠 치 미리 예약해 둘지. 날씨 예보가 3일치라 3일로 맞춘다. */
const BRIEFING_DAYS_AHEAD = 3;
/** 비 올 확률이 이 값 이상이면 우산을 챙기라고 알려준다. */
const UMBRELLA_CHANCE = 50;
/** 할 일 마감일과 하루 종일 일정을 알리는 시각(오전 9시) */
export const MORNING_HOUR = 9;
/** 습관을 알리는 시각(오후 9시) */
export const HABIT_HOUR = 21;
/** 일정 시작 몇 분 전에 알릴지 */
export const EVENT_LEAD_MINUTES = 10;
/** 일정을 며칠 뒤까지 미리 예약해 둘지 */
export const EVENT_DAYS_AHEAD = 30;
/** 습관 알림을 며칠 치 미리 예약해 둘지. 앱을 열 때마다 다시 채워진다. */
const HABIT_DAYS_AHEAD = 14;
/** 한 번에 예약하는 알림의 최대 개수. 가까운 것부터 채운다. */
const MAX_REMINDERS = 60;

/** 예약할 알림 하나 */
export type Reminder = {
  at: Date;
  title: string;
  body: string;
};

export type ReminderData = {
  todos: Pick<Tables<'todos'>, 'title' | 'due_date' | 'done'>[];
  events: Pick<Tables<'events'>, 'title' | 'event_date' | 'start_time'>[];
  /** 습관의 개수 */
  habitCount: number;
  /** 그중 오늘 이미 체크한 개수 */
  habitsDoneToday: number;
  /** 날씨 예보. 아직 못 받았거나 실패했으면 비워 두고, 브리핑에서 날씨 줄만 뺀다. */
  forecast?: { city: string; days: DayForecast[] } | null;
};

/** 브리핑 알림의 날씨 한 줄. 예: "🌧️ 광명 5°/9° 비 · 비 60% ☂️ 우산 챙기세요" */
function weatherLine(city: string, day: DayForecast): string {
  const { icon, label } = describeWeather(day.code, true);
  let line = `${icon} ${city} ${formatTemperature(day.low)}/${formatTemperature(day.high)} ${label}`;
  if (day.rainChance !== null && day.rainChance > 0) line += ` · 비 ${day.rainChance}%`;
  if (day.rainChance !== null && day.rainChance >= UMBRELLA_CHANCE) line += ' ☂️ 우산 챙기세요';
  return line;
}

/** 그날 아침 브리핑 알림의 내용을 만든다. */
function briefingFor(date: string, data: ReminderData): Reminder {
  const lines: string[] = [];

  const day = data.forecast?.days.find((item) => item.date === date);
  if (data.forecast && day) lines.push(weatherLine(data.forecast.city, day));

  // 마감이 그날이거나 이미 지난(밀린) 할 일
  const todos = data.todos.filter((todo) => !todo.done && todo.due_date && todo.due_date <= date);
  if (todos.length > 0) {
    const overdue = todos.filter((todo) => (todo.due_date as string) < date).length;
    lines.push(`✅ 할 일 ${todos.length}개${overdue > 0 ? ` (밀린 일 ${overdue}개)` : ''}`);
  }

  // 그날 일정. 하루 종일 일정을 먼저, 그다음 시작 시간 순서로 첫 일정을 보여준다.
  const events = data.events
    .filter((event) => event.event_date === date)
    .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''));
  if (events.length > 0) {
    const first = events[0];
    const when = first.start_time ? `${formatTime(first.start_time)} ` : '';
    const more = events.length > 1 ? ` 외 ${events.length - 1}개` : '';
    lines.push(`📅 ${when}${first.title}${more}`);
  }

  if (todos.length === 0 && events.length === 0) lines.push('오늘은 예정된 할 일과 일정이 없어요.');

  return {
    at: at(date, BRIEFING_HOUR),
    title: `좋은 아침이에요 · ${formatDate(date)}`,
    body: lines.join('\n'),
  };
}

/** 'YYYY-MM-DD' 날짜의 몇 시 몇 분을 Date 로 만든다. */
function at(isoDate: string, hour: number, minute = 0): Date {
  const date = parseISODate(isoDate);
  date.setHours(hour, minute, 0, 0);
  return date;
}

/**
 * 지금 시점에서 예약해야 할 알림 목록을 만든다. 이미 지난 시각의 알림은 넣지 않는다.
 * @param now 현재 시각. 시험할 때 바꿔 넣을 수 있도록 밖에서 받는다.
 */
export function buildReminders(
  settings: NotificationSettings,
  data: ReminderData,
  now: Date = new Date(),
): Reminder[] {
  if (!settings.enabled) return [];

  const reminders: Reminder[] = [];
  const today = toISODate(now);

  if (settings.todos) {
    for (const todo of data.todos) {
      if (todo.done || !todo.due_date) continue;
      reminders.push({
        at: at(todo.due_date, MORNING_HOUR),
        title: '오늘 마감인 할 일',
        body: todo.title,
      });
    }
  }

  if (settings.events) {
    for (const event of data.events) {
      if (event.start_time) {
        const [hour, minute] = event.start_time.split(':').map(Number);
        const start = at(event.event_date, hour, minute);
        reminders.push({
          at: new Date(start.getTime() - EVENT_LEAD_MINUTES * 60_000),
          title: event.title,
          body: `${formatTime(event.start_time)}에 시작합니다.`,
        });
      } else {
        reminders.push({
          at: at(event.event_date, MORNING_HOUR),
          title: event.title,
          body: '오늘 하루 종일 일정입니다.',
        });
      }
    }
  }

  if (settings.briefing) {
    for (let offset = 0; offset < BRIEFING_DAYS_AHEAD; offset++) {
      reminders.push(briefingFor(addDays(today, offset), data));
    }
  }

  if (settings.habits && data.habitCount > 0) {
    const remaining = data.habitCount - data.habitsDoneToday;
    for (let offset = 0; offset < HABIT_DAYS_AHEAD; offset++) {
      // 오늘 습관을 이미 다 체크했다면 오늘 저녁에는 알리지 않는다.
      if (offset === 0 && remaining <= 0) continue;
      reminders.push({
        at: at(addDays(today, offset), HABIT_HOUR),
        title: '오늘의 습관',
        body:
          offset === 0
            ? `아직 체크하지 않은 습관이 ${remaining}개 있습니다.`
            : '오늘 습관을 체크해 보세요.',
      });
    }
  }

  return reminders
    .filter((reminder) => reminder.at.getTime() > now.getTime())
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, MAX_REMINDERS);
}
