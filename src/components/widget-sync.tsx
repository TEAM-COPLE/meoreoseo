import { requireOptionalNativeModule } from 'expo';
import { router, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { useMonthlyBudget } from '@/hooks/use-budget';
import { useEvents } from '@/hooks/use-events';
import { toggleHabitLogCoalesced, useHabitLogs, useHabits } from '@/hooks/use-habits';
import { useNotes } from '@/hooks/use-notes';
import { useColorScheme } from '@/hooks/use-theme';
import { toggleTodoCoalesced, useTodos } from '@/hooks/use-todos';
import { useTransactions } from '@/hooks/use-transactions';
import { todayISO, yearMonthOf } from '@/lib/dates';
import type { WidgetColorScheme } from '@/widgets/types';

/** Expo Go 등 네이티브 위젯 모듈이 없는 환경에서는 false 다. */
const widgetsSupported = Platform.OS !== 'web' && requireOptionalNativeModule('ExpoWidgets') !== null;

/** 위젯에서 허용하는 내부 화면 이동 경로만 통과시켜 외부 URL 오픈(Open Redirect)을 막는다. */
const ALLOWED_WIDGET_ROUTE_RE =
  /^\/($|(todos|calendar|notes|habits|money|study|routines|settings|note\/[A-Za-z0-9_-]+)(\?[A-Za-z0-9=&_-]+)?$)/;

function loadWidgetsModule() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@/widgets/sync') as typeof import('@/widgets/sync');
}

function loadAddUserInteractionListener() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('expo-widgets') as typeof import('expo-widgets')).addUserInteractionListener;
}

/** 로그아웃·초기화 시 네이티브 홈 화면 위젯의 개인정보를 즉시 비운다. */
export function clearNativeWidgets(colorScheme: WidgetColorScheme = 'dark'): void {
  if (!widgetsSupported) return;
  try {
    loadWidgetsModule().clearAllWidgets(colorScheme);
  } catch {
    // 무시
  }
}

export function WidgetSync() {
  // 위젯을 지원하지 않는 환경(Expo Go 등)에서는 6개 테이블 쿼리를 실행하지 않는다.
  if (!widgetsSupported) return null;
  return <WidgetSyncActive />;
}

/**
 * 앱 데이터(할 일, 일정, 메모, 습관, 가계부)와 테마를 모든 홈 화면 위젯에 동기화하고,
 * 위젯에서 누른 완료 체크·화면 이동 이벤트를 처리한다.
 */
function WidgetSyncActive() {
  const [today, setToday] = useState(todayISO);
  const month = yearMonthOf(today);
  const colorScheme = useColorScheme();

  const todosQuery = useTodos();
  const eventsQuery = useEvents(month);
  const notesQuery = useNotes();
  const habitsQuery = useHabits();
  const habitLogsQuery = useHabitLogs();
  const transactionsQuery = useTransactions(month);
  const { budget } = useMonthlyBudget();

  const latestRef = useRef({
    colorScheme,
    todos: todosQuery.data,
    events: eventsQuery.data,
    notes: notesQuery.data,
    habits: habitsQuery.data,
    habitLogs: habitLogsQuery.data,
    transactions: transactionsQuery.data,
    monthlyBudget: budget,
  });

  useEffect(() => {
    latestRef.current = {
      colorScheme,
      todos: todosQuery.data,
      events: eventsQuery.data,
      notes: notesQuery.data,
      habits: habitsQuery.data,
      habitLogs: habitLogsQuery.data,
      transactions: transactionsQuery.data,
      monthlyBudget: budget,
    };
  }, [
    colorScheme,
    todosQuery.data,
    eventsQuery.data,
    notesQuery.data,
    habitsQuery.data,
    habitLogsQuery.data,
    transactionsQuery.data,
    budget,
  ]);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        loadWidgetsModule().syncAllWidgets(latestRef.current);
      } catch {
        // 위젯 동기화 중 오류가 나도 앱에는 영향을 주지 않는다.
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [
    today,
    colorScheme,
    todosQuery.data,
    eventsQuery.data,
    notesQuery.data,
    habitsQuery.data,
    habitLogsQuery.data,
    transactionsQuery.data,
    budget,
  ]);

  useEffect(() => {
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const nowToday = todayISO();
      setToday((prev) => (prev === nowToday ? prev : nowToday));
      try {
        loadWidgetsModule().syncAllWidgets(latestRef.current);
      } catch {
        // 위젯 동기화 중 오류가 나도 앱에는 영향을 주지 않는다.
      }
    });
    return () => appStateSub.remove();
  }, []);

  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    try {
      sub = loadAddUserInteractionListener()((event) => {
        const target = event.target;
        if (!target) return;

        if (target.startsWith('toggle-todo:')) {
          const id = target.slice('toggle-todo:'.length);
          if (!id || id.startsWith('preview-')) return;
          const todo = (latestRef.current.todos ?? []).find((t) => t.id === id);
          if (todo) {
            toggleTodoCoalesced(todo, { delayMs: 100 }).catch(() => {});
          }
          return;
        }

        if (target.startsWith('toggle-habit:')) {
          const habitId = target.slice('toggle-habit:'.length);
          if (!habitId || habitId.startsWith('preview-')) return;
          const currentToday = todayISO();
          const done = latestRef.current.habitLogs?.get(habitId)?.has(currentToday) ?? false;
          toggleHabitLogCoalesced({ habitId, date: currentToday, done }, { delayMs: 100 }).catch(
            () => {},
          );
          return;
        }

        if (target.startsWith('open:')) {
          const rawRoute = target.slice('open:'.length);
          if (!ALLOWED_WIDGET_ROUTE_RE.test(rawRoute)) return;
          if (rawRoute.startsWith('/note/preview-')) {
            router.push('/notes');
            return;
          }
          const nonce = Date.now();
          let route = rawRoute;
          if (rawRoute === '/note/new') {
            route = `/note/new?t=${nonce}`;
          } else if (rawRoute.includes('add=1')) {
            route = rawRoute.replace('add=1', `add=${nonce}`);
          }
          router.push(route as Href);
        }
      });
    } catch {
      // Expo Go 등 위젯 이벤트가 없는 환경에서는 무시한다.
    }
    return () => sub?.remove();
  }, []);

  return null;
}
