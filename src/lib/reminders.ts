import type { Tables } from './database.types';
import { addDays, formatTime, parseISODate, toISODate } from './dates';

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
};

export const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: false,
  todos: true,
  events: true,
  habits: true,
};

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
};

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
