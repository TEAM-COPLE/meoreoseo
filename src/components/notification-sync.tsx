import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { useUpcomingEvents } from '@/hooks/use-events';
import { useHabitLogs, useHabits } from '@/hooks/use-habits';
import { useNotificationSettings } from '@/hooks/use-notification-settings';
import { useTodos } from '@/hooks/use-todos';
import { todayISO } from '@/lib/dates';
import {
  cancelAllReminders,
  hasNotificationPermission,
  replaceReminders,
} from '@/lib/notifications';
import { buildReminders, EVENT_DAYS_AHEAD } from '@/lib/reminders';

/**
 * 화면에는 아무것도 그리지 않고, 휴대폰의 예약 알림을 데이터와 맞춰 주는 부품.
 * 로그인해 있는 동안 src/app/_layout.tsx 에 놓여 있다.
 *
 * 할 일·일정·습관·알림 설정 중 하나라도 바뀌면 예약 알림을 다시 만든다.
 */
export function NotificationSync() {
  const settings = useNotificationSettings().data;
  const todos = useTodos().data;
  const events = useUpcomingEvents(EVENT_DAYS_AHEAD).data;
  const habits = useHabits().data;
  const logs = useHabitLogs().data;

  // 앱이 다시 화면에 나타날 때마다 숫자를 올려, 아래의 예약 작업을 한 번 더 돌린다.
  // (날짜가 바뀌었거나 휴대폰 설정에서 알림 권한을 바꿨을 수 있다.)
  const [wakeCount, setWakeCount] = useState(0);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setWakeCount((count) => count + 1);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!settings) return;
    if (!settings.enabled) {
      cancelAllReminders().catch(() => {});
      return;
    }
    // 데이터를 다 받아오기 전에는 건드리지 않는다. 덜 받은 상태로 예약하면 알림이 빠진다.
    if (!todos || !events || !habits || !logs) return;

    const today = todayISO();
    const reminders = buildReminders(settings, {
      todos,
      events,
      habitCount: habits.length,
      habitsDoneToday: habits.filter((habit) => logs.get(habit.id)?.has(today)).length,
    });

    // 연달아 여러 번 바뀔 때(예: 체크를 빠르게 여러 개) 마지막 한 번만 예약한다.
    const timer = setTimeout(async () => {
      try {
        if (await hasNotificationPermission()) {
          await replaceReminders(reminders);
        } else {
          // 휴대폰 설정에서 알림 권한을 껐다면 예약해 둔 것도 지운다.
          await cancelAllReminders();
        }
      } catch {
        // 예약에 실패해도 앱 사용에는 지장이 없다. 다음에 데이터가 바뀌면 다시 시도한다.
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [settings, todos, events, habits, logs, wakeCount]);

  // 로그아웃하면 이 부품이 화면에서 빠진다. 그때 예약해 둔 알림도 지운다.
  useEffect(() => {
    return () => {
      cancelAllReminders().catch(() => {});
    };
  }, []);

  return null;
}
