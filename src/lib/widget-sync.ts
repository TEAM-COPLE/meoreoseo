import { router } from 'expo-router';
import { addUserInteractionListener } from 'expo-widgets';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { streakOf } from '@/hooks/use-habits';
import { useColorScheme } from '@/hooks/use-theme';
import {
  MeoreoseoAllInOneWidget,
  type MeoreoseoWidgetProps,
  type WidgetTab,
} from '@/widgets/meoreoseo-widgets';

import { hasActiveSession, useAuth } from './auth';
import type { Tables } from './database.types';
import { addDays, formatDate, formatTime, monthRange, todayISO, yearMonthOf } from './dates';
import { formatWon } from './format';
import {
  getLocalNote,
  isValidUuid,
  listLocalEvents,
  listLocalHabitLogs,
  listLocalHabits,
  listLocalNotes,
  listLocalTodos,
  listLocalTransactions,
  saveLocalTransaction,
  toggleLocalHabitLog,
  toggleLocalTodo,
  updateLocalNote,
} from './local-store';
import { queryClient } from './query';
import { supabase } from './supabase';

const ACTION_MARKER = '_action:';
const HISTORY_DAYS = 400;

/** 위젯에서 허용된 원터치 빠른 지출 프리셋만 실행되도록 화이트리스트로 제한한다. */
const ALLOWED_QUICK_EXPENSES: Readonly<Record<string, { category: string; amount: number }>> = {
  '식비:10000': { category: '식비', amount: 10000 },
  '교통:1500': { category: '교통', amount: 1500 },
};

let currentWidgetTab: WidgetTab = 'todos';
let currentIsDark = false;
let currentScope = 'local';
let lastSnapshotJson = '';
let syncTimer: ReturnType<typeof setTimeout> | null = null;

function isWidgetTab(value: string): value is WidgetTab {
  return (
    value === 'todos' ||
    value === 'calendar' ||
    value === 'habits' ||
    value === 'notes' ||
    value === 'money'
  );
}

/**
 * 현재 기기 저장소(비로그인) 또는 Supabase 데이터베이스(로그인)에서
 * 안드로이드 홈 화면 위젯에 보여줄 다섯 기능의 요약 데이터를 모은다.
 * 이미 QueryClient 캐시에 최신 데이터가 있으면 네트워크 재요청 없이 즉시 재사용한다.
 */
export async function buildWidgetSnapshot(): Promise<MeoreoseoWidgetProps> {
  const today = todayISO();
  const month = yearMonthOf(today);
  const { start, end } = monthRange(month);
  const sinceDate = addDays(today, -HISTORY_DAYS);
  const signedIn = hasActiveSession();
  const scope = signedIn ? currentScope : 'local';

  const cachedTodos = queryClient.getQueryData<Tables<'todos'>[]>(['todos', scope]);
  const cachedEvents = queryClient.getQueryData<Tables<'events'>[]>(['events', scope, start, end]);
  const cachedHabits = queryClient.getQueryData<Tables<'habits'>[]>(['habits', scope]);
  const cachedLogsMap = queryClient.getQueryData<Map<string, Set<string>>>(['habit-logs', scope]);
  const cachedNotes = queryClient.getQueryData<Tables<'notes'>[]>(['notes', scope]);
  const cachedTransactions = queryClient.getQueryData<Tables<'transactions'>[]>([
    'transactions',
    scope,
    start,
    end,
  ]);

  const [todos, events, habits, habitLogs, notes, transactions] = await Promise.all([
    cachedTodos
      ? Promise.resolve(cachedTodos)
      : signedIn
        ? supabase
            .from('todos')
            .select('*')
            .order('done')
            .order('due_date', { ascending: true, nullsFirst: false })
            .order('created_at', { ascending: false })
            .limit(50)
            .then(({ data }) => data ?? [])
        : listLocalTodos(),
    cachedEvents
      ? Promise.resolve(cachedEvents)
      : signedIn
        ? supabase
            .from('events')
            .select('*')
            .gte('event_date', start)
            .lte('event_date', end)
            .order('event_date')
            .order('start_time', { ascending: true, nullsFirst: true })
            .then(({ data }) => data ?? [])
        : listLocalEvents(start, end),
    cachedHabits
      ? Promise.resolve(cachedHabits)
      : signedIn
        ? supabase
            .from('habits')
            .select('*')
            .eq('archived', false)
            .order('created_at')
            .then(({ data }) => data ?? [])
        : listLocalHabits(),
    cachedLogsMap
      ? Promise.resolve(null)
      : signedIn
        ? supabase
            .from('habit_logs')
            .select('habit_id, log_date')
            .gte('log_date', sinceDate)
            .then(({ data }) => data ?? [])
        : listLocalHabitLogs(sinceDate),
    cachedNotes
      ? Promise.resolve(cachedNotes)
      : signedIn
        ? supabase
            .from('notes')
            .select('*')
            .order('pinned', { ascending: false })
            .order('updated_at', { ascending: false })
            .limit(10)
            .then(({ data }) => data ?? [])
        : listLocalNotes(),
    cachedTransactions
      ? Promise.resolve(cachedTransactions)
      : signedIn
        ? supabase
            .from('transactions')
            .select('*')
            .gte('occurred_on', start)
            .lte('occurred_on', end)
            .order('occurred_on', { ascending: false })
            .order('created_at', { ascending: false })
            .then(({ data }) => data ?? [])
        : listLocalTransactions(start, end),
  ]);

  let logsByHabit: Map<string, Set<string>>;
  if (cachedLogsMap) {
    logsByHabit = cachedLogsMap;
  } else {
    logsByHabit = new Map<string, Set<string>>();
    for (const log of habitLogs ?? []) {
      const set = logsByHabit.get(log.habit_id) ?? new Set<string>();
      set.add(log.log_date);
      logsByHabit.set(log.habit_id, set);
    }
  }

  let openTodoCount = 0;
  let doneTodoCount = 0;
  for (const todo of todos) {
    if (todo.done) doneTodoCount += 1;
    else openTodoCount += 1;
  }

  const upcomingEvents = events.filter((e) => e.event_date >= today);

  let habitsDoneCount = 0;
  const habitItems = habits.map((habit) => {
    const dates = logsByHabit.get(habit.id);
    const doneToday = dates?.has(today) ?? false;
    if (doneToday) habitsDoneCount += 1;
    return {
      id: habit.id,
      name: habit.name,
      streak: streakOf(dates),
      doneToday,
    };
  });

  let income = 0;
  let expense = 0;
  for (const tx of transactions) {
    if (tx.kind === 'income') income += tx.amount;
    else if (tx.kind === 'expense') expense += tx.amount;
  }

  return {
    activeTab: currentWidgetTab,
    isDark: currentIsDark,
    todayLabel: formatDate(today),
    openTodoCount,
    doneTodoCount,
    todos: todos.slice(0, 6).map((todo) => ({
      id: todo.id,
      title: todo.title,
      dueLabel: todo.due_date ? formatDate(todo.due_date) : '',
      done: todo.done,
      priority: todo.priority,
    })),
    events: upcomingEvents.slice(0, 5).map((event) => ({
      id: event.id,
      title: event.title,
      dateLabel: event.event_date === today ? '오늘' : formatDate(event.event_date),
      timeLabel: event.start_time
        ? event.end_time
          ? `${formatTime(event.start_time)}–${formatTime(event.end_time)}`
          : formatTime(event.start_time)
        : '하루 종일',
    })),
    habitsDoneCount,
    habitsTotalCount: habitItems.length,
    habits: habitItems.slice(0, 6),
    notes: notes.slice(0, 5).map((note) => ({
      id: note.id,
      title: note.title.trim() || '제목 없음',
      preview: note.body.replace(/\s+/g, ' ').trim().slice(0, 30),
      pinned: note.pinned,
    })),
    incomeLabel: formatWon(income),
    expenseLabel: formatWon(expense),
    balanceLabel: formatWon(income - expense),
    transactions: transactions.slice(0, 4).map((tx) => ({
      id: tx.id,
      category: tx.category,
      memo: tx.memo ?? '',
      amountLabel: `${tx.kind === 'income' ? '+' : '-'}${formatWon(tx.amount)}`,
      isIncome: tx.kind === 'income',
    })),
  };
}

/**
 * 안드로이드 홈 화면에 배치된 모든 멀어서 위젯(통합 위젯 + 기능별 위젯 5종)을 최신 데이터로 갱신한다.
 * 이전 스냅샷과 내용이 완전히 같으면 네이티브 브리지 호출을 건너뛴다.
 */
export async function syncAllWidgets(force = false): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const snapshot = await buildWidgetSnapshot();
    const json = JSON.stringify(snapshot);
    if (!force && json === lastSnapshotJson) return;
    lastSnapshotJson = json;

    MeoreoseoAllInOneWidget.updateSnapshot(snapshot);
  } catch {
    // 위젯이 배치되지 않았거나 사용할 수 없는 환경에서는 무시한다.
  }
}

function scheduleWidgetSync() {
  if (Platform.OS !== 'android') return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    syncAllWidgets();
  }, 200);
}

async function handleWidgetAction(rawTarget: string): Promise<void> {
  if (!rawTarget || rawTarget.length > 256) return;
  const index = rawTarget.indexOf(ACTION_MARKER);
  if (index < 0) return;
  const action = rawTarget.slice(index + ACTION_MARKER.length);

  if (action.startsWith('tab:')) {
    const tab = action.slice('tab:'.length);
    if (isWidgetTab(tab)) {
      currentWidgetTab = tab;
      await syncAllWidgets(true);
    }
    return;
  }

  if (action.startsWith('todo:toggle:')) {
    const todoId = action.slice('todo:toggle:'.length);
    if (!isValidUuid(todoId)) return;
    if (!hasActiveSession()) {
      const todos = await listLocalTodos();
      const target = todos.find((t) => t.id === todoId);
      if (target) await toggleLocalTodo(target);
    } else {
      const { data } = await supabase.from('todos').select('*').eq('id', todoId).maybeSingle();
      if (data) {
        const done = !data.done;
        await supabase
          .from('todos')
          .update({ done, done_at: done ? new Date().toISOString() : null })
          .eq('id', todoId);
      }
    }
    await queryClient.invalidateQueries({ queryKey: ['todos'] });
    await syncAllWidgets(true);
    return;
  }

  if (action.startsWith('habit:toggle:')) {
    const habitId = action.slice('habit:toggle:'.length);
    if (!isValidUuid(habitId)) return;
    const today = todayISO();
    if (!hasActiveSession()) {
      const logs = await listLocalHabitLogs(today);
      const done = logs.some((l) => l.habit_id === habitId && l.log_date === today);
      await toggleLocalHabitLog({ habitId, date: today, done });
    } else {
      const { data } = await supabase
        .from('habit_logs')
        .select('id')
        .eq('habit_id', habitId)
        .eq('log_date', today)
        .maybeSingle();
      if (data) {
        await supabase.from('habit_logs').delete().eq('id', data.id);
      } else {
        await supabase.from('habit_logs').insert({ habit_id: habitId, log_date: today });
      }
    }
    await queryClient.invalidateQueries({ queryKey: ['habit-logs'] });
    await syncAllWidgets(true);
    return;
  }

  if (action.startsWith('note:pin:')) {
    const noteId = action.slice('note:pin:'.length);
    if (!isValidUuid(noteId)) return;
    if (!hasActiveSession()) {
      const note = await getLocalNote(noteId);
      if (note) {
        await updateLocalNote(noteId, {
          title: note.title,
          body: note.body,
          pinned: !note.pinned,
        });
      }
    } else {
      const { data } = await supabase.from('notes').select('*').eq('id', noteId).maybeSingle();
      if (data) {
        await supabase.from('notes').update({ pinned: !data.pinned }).eq('id', noteId);
      }
    }
    await queryClient.invalidateQueries({ queryKey: ['notes'] });
    await syncAllWidgets(true);
    return;
  }

  if (action.startsWith('money:quick:')) {
    const presetKey = action.slice('money:quick:'.length);
    const preset = ALLOWED_QUICK_EXPENSES[presetKey];
    if (!preset) return;
    const today = todayISO();
    if (!hasActiveSession()) {
      await saveLocalTransaction({
        kind: 'expense',
        amount: preset.amount,
        category: preset.category,
        memo: '위젯 빠른 기록',
        occurred_on: today,
      });
    } else {
      await supabase.from('transactions').insert({
        kind: 'expense',
        amount: preset.amount,
        category: preset.category,
        memo: '위젯 빠른 기록',
        occurred_on: today,
      });
    }
    await queryClient.invalidateQueries({ queryKey: ['transactions'] });
    await syncAllWidgets(true);
    return;
  }

  if (action === 'open:todos') {
    router.push('/');
  } else if (action === 'open:calendar') {
    router.push('/calendar');
  } else if (action === 'open:habits') {
    router.push('/habits');
  } else if (action === 'open:notes') {
    router.push('/notes');
  } else if (action === 'open:note:new') {
    router.push('/note/new');
  } else if (action.startsWith('open:note:')) {
    const noteId = action.slice('open:note:'.length);
    if (isValidUuid(noteId)) router.push(`/note/${noteId}`);
  } else if (action === 'open:money') {
    router.push('/money');
  }
}

/**
 * 앱의 루트 레이아웃에서 실행되어,
 * 1) 앱 데이터나 화면 모드(다크/라이트)가 바뀔 때 안드로이드 위젯을 자동 갱신하고
 * 2) 위젯에서 누른 버튼 동작(완료 토글, 습관 체크, 빠른 가계부 기록, 화면 열기)을 처리한다.
 */
export function useWidgetBridge(): void {
  const colorScheme = useColorScheme();
  const { session, loading } = useAuth();

  useEffect(() => {
    currentIsDark = colorScheme === 'dark';
    currentScope = session?.user.id ?? 'local';
    if (!loading) {
      scheduleWidgetSync();
    }
  }, [colorScheme, session?.user.id, loading]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const unsubscribeCache = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'success') {
        scheduleWidgetSync();
      }
    });

    const interactionSub = addUserInteractionListener((event) => {
      handleWidgetAction(event.target).catch(() => {});
    });

    return () => {
      unsubscribeCache();
      interactionSub.remove();
    };
  }, []);
}
