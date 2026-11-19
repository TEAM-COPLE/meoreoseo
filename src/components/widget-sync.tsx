import { requireOptionalNativeModule } from 'expo';
import { router, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState, Linking, Platform } from 'react-native';

import { useMonthlyBudget } from '@/hooks/use-budget';
import { useEvents } from '@/hooks/use-events';
import { useHabitLogs, useHabits, useToggleHabitLog } from '@/hooks/use-habits';
import { useNotes } from '@/hooks/use-notes';
import { useColorScheme } from '@/hooks/use-theme';
import { useTodos, useToggleTodo } from '@/hooks/use-todos';
import { useTransactions } from '@/hooks/use-transactions';
import { todayISO, yearMonthOf } from '@/lib/dates';

/** Expo Go 등 네이티브 위젯 모듈이 없는 환경에서는 false 다. */
const widgetsSupported = Platform.OS !== 'web' && requireOptionalNativeModule('ExpoWidgets') !== null;

function loadWidgetsSync() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('@/widgets/sync') as typeof import('@/widgets/sync')).syncAllWidgets;
}

function loadAddUserInteractionListener() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('expo-widgets') as typeof import('expo-widgets')).addUserInteractionListener;
}

/**
 * 앱 데이터(할 일, 일정, 메모, 습관, 가계부)와 테마를 모든 홈 화면 위젯에 동기화하고,
 * 위젯에서 누른 완료 체크·화면 이동 이벤트를 처리한다.
 * 화면에는 아무것도 그리지 않는다.
 */
export function WidgetSync() {
  const today = todayISO();
  const month = yearMonthOf(today);
  const colorScheme = useColorScheme();

  const todosQuery = useTodos();
  const eventsQuery = useEvents(month);
  const notesQuery = useNotes();
  const habitsQuery = useHabits();
  const habitLogsQuery = useHabitLogs();
  const transactionsQuery = useTransactions(month);
  const { budget } = useMonthlyBudget();

  const toggleTodo = useToggleTodo();
  const toggleHabitLog = useToggleHabitLog();

  const latestRef = useRef({
    todos: todosQuery.data ?? [],
    habitLogs: habitLogsQuery.data ?? new Map<string, Set<string>>(),
    toggleTodoMutate: toggleTodo.mutate,
    toggleHabitLogMutate: toggleHabitLog.mutate,
  });

  useEffect(() => {
    latestRef.current = {
      todos: todosQuery.data ?? [],
      habitLogs: habitLogsQuery.data ?? new Map<string, Set<string>>(),
      toggleTodoMutate: toggleTodo.mutate,
      toggleHabitLogMutate: toggleHabitLog.mutate,
    };
  }, [todosQuery.data, habitLogsQuery.data, toggleTodo.mutate, toggleHabitLog.mutate]);

  useEffect(() => {
    if (!widgetsSupported) return;
    const timer = setTimeout(() => {
      try {
        loadWidgetsSync()({
          colorScheme,
          todos: todosQuery.data,
          events: eventsQuery.data,
          notes: notesQuery.data,
          habits: habitsQuery.data,
          habitLogs: habitLogsQuery.data,
          transactions: transactionsQuery.data,
          monthlyBudget: budget,
        });
      } catch {
        // 위젯 동기화 중 오류가 나도 앱에는 영향을 주지 않는다.
      }
    }, 400);
    return () => clearTimeout(timer);
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
    if (!widgetsSupported) return;
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      try {
        loadWidgetsSync()({
          colorScheme,
          todos: todosQuery.data,
          events: eventsQuery.data,
          notes: notesQuery.data,
          habits: habitsQuery.data,
          habitLogs: habitLogsQuery.data,
          transactions: transactionsQuery.data,
          monthlyBudget: budget,
        });
      } catch {
        // 위젯 동기화 중 오류가 나도 앱에는 영향을 주지 않는다.
      }
    });
    return () => appStateSub.remove();
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
    if (!widgetsSupported) return;
    let sub: { remove: () => void } | null = null;
    try {
      sub = loadAddUserInteractionListener()((event) => {
        const target = event.target;
        if (!target) return;

        if (target.startsWith('toggle-todo:')) {
          const id = target.slice('toggle-todo:'.length);
          const todo = latestRef.current.todos.find((t) => t.id === id);
          if (todo) {
            latestRef.current.toggleTodoMutate(todo);
          }
          return;
        }

        if (target.startsWith('toggle-habit:')) {
          const habitId = target.slice('toggle-habit:'.length);
          const currentToday = todayISO();
          const done = latestRef.current.habitLogs.get(habitId)?.has(currentToday) ?? false;
          latestRef.current.toggleHabitLogMutate({ habitId, date: currentToday, done });
          return;
        }

        if (target.startsWith('open:')) {
          const rawRoute = target.slice('open:'.length);
          const nonce = Date.now();
          let route = rawRoute;
          if (rawRoute === '/note/new') {
            route = `/note/new?t=${nonce}`;
          } else if (rawRoute.includes('add=1')) {
            route = rawRoute.replace('add=1', `add=${nonce}`);
          }
          const deepLink = `meoreoseo://${route.replace(/^\/+/, '')}`;
          router.push(route as Href);
          Linking.openURL(deepLink).catch(() => {});
        }
      });
    } catch {
      // Expo Go 등 위젯 이벤트가 없는 환경에서는 무시한다.
    }
    return () => sub?.remove();
  }, []);

  return null;
}
