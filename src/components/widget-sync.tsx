import { requireOptionalNativeModule } from 'expo';
import { router, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

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
  });

  useEffect(() => {
    latestRef.current = {
      todos: todosQuery.data ?? [],
      habitLogs: habitLogsQuery.data ?? new Map<string, Set<string>>(),
    };
  }, [todosQuery.data, habitLogsQuery.data]);

  useEffect(() => {
    if (!widgetsSupported) return;
    loadWidgetsSync()({
      colorScheme,
      todos: todosQuery.data ?? [],
      events: eventsQuery.data ?? [],
      notes: notesQuery.data ?? [],
      habits: habitsQuery.data ?? [],
      habitLogs: habitLogsQuery.data ?? new Map(),
      transactions: transactionsQuery.data ?? [],
      monthlyBudget: budget,
    });
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
      loadWidgetsSync()({
        colorScheme,
        todos: todosQuery.data ?? [],
        events: eventsQuery.data ?? [],
        notes: notesQuery.data ?? [],
        habits: habitsQuery.data ?? [],
        habitLogs: habitLogsQuery.data ?? new Map(),
        transactions: transactionsQuery.data ?? [],
        monthlyBudget: budget,
      });
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
            toggleTodo.mutate(todo);
          }
          return;
        }

        if (target.startsWith('toggle-habit:')) {
          const habitId = target.slice('toggle-habit:'.length);
          const currentToday = todayISO();
          const done = latestRef.current.habitLogs.get(habitId)?.has(currentToday) ?? false;
          toggleHabitLog.mutate({ habitId, date: currentToday, done });
          return;
        }

        if (target.startsWith('open:')) {
          const route = target.slice('open:'.length) as Href;
          router.push(route);
        }
      });
    } catch {
      // Expo Go 등 위젯 이벤트가 없는 환경에서는 무시한다.
    }
    return () => sub?.remove();
  }, [toggleTodo, toggleHabitLog]);

  return null;
}
