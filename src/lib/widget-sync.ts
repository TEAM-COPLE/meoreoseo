import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { addUserInteractionListener } from 'expo-widgets';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';

import { loadEvents, type CalendarEvent } from '@/hooks/use-events';
import { streakOf } from '@/hooks/use-habits';
import { useColorScheme } from '@/hooks/use-theme';
import { toggleTodo } from '@/hooks/use-todos';
import {
  MeoreoseoAllInOneWidget,
  MeoreoseoCalendarWidget,
  MeoreoseoHabitsWidget,
  MeoreoseoMoneyWidget,
  MeoreoseoNotesWidget,
  MeoreoseoTodosWidget,
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
  listLocalHabitLogs,
  listLocalHabits,
  listLocalNotes,
  listLocalTodos,
  listLocalTransactions,
  saveLocalTransaction,
  toggleLocalHabitLog,
  updateLocalNote,
} from './local-store';
import { queryClient } from './query';
import { isWaitingRepeat } from './repeat';
import { supabase } from './supabase';

const ACTION_MARKER = '_action:';
const HISTORY_DAYS = 400;

export type WidgetOpenScreen = 'todos' | 'calendar' | 'habits' | 'money';
export type WidgetOpenRequest =
  | { mode: 'add'; token: number }
  | { mode: 'edit'; editId: string; token: number }
  | null;

const openRequests: Record<WidgetOpenScreen, WidgetOpenRequest> = {
  todos: null,
  calendar: null,
  habits: null,
  money: null,
};
const openRequestListeners = new Set<() => void>();

function setWidgetOpenRequest(screen: WidgetOpenScreen, request: WidgetOpenRequest): void {
  openRequests[screen] = request;
  for (const listener of openRequestListeners) {
    listener();
  }
}

export function clearWidgetOpenRequest(screen: WidgetOpenScreen): void {
  if (openRequests[screen] !== null) {
    openRequests[screen] = null;
    for (const listener of openRequestListeners) {
      listener();
    }
  }
}

export function useWidgetOpenRequest(screen: WidgetOpenScreen): WidgetOpenRequest {
  return useSyncExternalStore(
    (listener) => {
      openRequestListeners.add(listener);
      return () => {
        openRequestListeners.delete(listener);
      };
    },
    () => openRequests[screen],
    () => null,
  );
}

/** 위젯에서 허용된 원터치 빠른 지출 프리셋만 실행되도록 화이트리스트로 제한한다. */
const ALLOWED_QUICK_EXPENSES: Readonly<Record<string, { category: string; amount: number }>> = {
  '식비:10000': { category: '식비', amount: 10000 },
  '교통:1500': { category: '교통', amount: 1500 },
  '식비:5000': { category: '식비', amount: 5000 },
};

let currentWidgetTab: WidgetTab = 'todos';
let currentIsDark = false;
let currentScope = 'local';
let lastSnapshotJson = '';
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let handledInitialUrl: string | null = null;

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
 * 캐시가 무효화(invalidated)되지 않았고 강제 새로고침이 아닐 때만 캐시 데이터를 돌려준다.
 * 위젯 액션 직후나 백그라운드에서 invalidateQueries 만 호출된 경우에는
 * 오래된 캐시 대신 저장소/DB의 최신 데이터를 읽도록 보장한다.
 */
function getFreshCachedData<T>(key: readonly unknown[], forceFresh: boolean): T | undefined {
  if (forceFresh) return undefined;
  const state = queryClient.getQueryState(key);
  if (!state || state.isInvalidated) return undefined;
  return queryClient.getQueryData<T>(key);
}

/**
 * 현재 기기 저장소(비로그인) 또는 Supabase 데이터베이스(로그인)에서
 * 안드로이드 홈 화면 위젯에 보여줄 다섯 기능의 요약 데이터를 모은다.
 */
export async function buildWidgetSnapshot(forceFresh = false): Promise<MeoreoseoWidgetProps> {
  const today = todayISO();
  const month = yearMonthOf(today);
  const { start, end } = monthRange(month);
  const sinceDate = addDays(today, -HISTORY_DAYS);
  const signedIn = hasActiveSession();
  const scope = signedIn ? currentScope : 'local';

  const todosKey = ['todos', scope] as const;
  const eventsKey = ['events', scope, start, end] as const;
  const habitsKey = ['habits', scope] as const;
  const habitLogsKey = ['habit-logs', scope] as const;
  const notesKey = ['notes', scope] as const;
  const transactionsKey = ['transactions', scope, start, end] as const;

  const cachedTodos = getFreshCachedData<Tables<'todos'>[]>(todosKey, forceFresh);
  // 일정 캐시에는 반복 일정이 날짜마다 펼쳐진 값(CalendarEvent)이 들어 있다.
  const cachedEvents = getFreshCachedData<CalendarEvent[]>(eventsKey, forceFresh);
  const cachedHabits = getFreshCachedData<Tables<'habits'>[]>(habitsKey, forceFresh);
  const cachedLogsMap = getFreshCachedData<Map<string, Set<string>>>(habitLogsKey, forceFresh);
  const cachedNotes = getFreshCachedData<Tables<'notes'>[]>(notesKey, forceFresh);
  const cachedTransactions = getFreshCachedData<Tables<'transactions'>[]>(
    transactionsKey,
    forceFresh,
  );

  const [allTodos, events, habits, habitLogs, notes, transactions] = await Promise.all([
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
    // 반복 일정도 날짜마다 펼쳐서 받는다(앱 화면과 같은 함수).
    cachedEvents ? Promise.resolve(cachedEvents) : loadEvents(start, end).catch(() => []),
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

  // 아직 차례가 오지 않은 반복 할 일은 체크할 수 없으므로 위젯에는 보여주지 않는다.
  const todos = allTodos.filter((todo) => !isWaitingRepeat(todo, today));
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
      // 반복 일정은 같은 id 가 여러 날짜에 나오므로 날짜가 붙은 key 를 쓴다.
      id: event.key,
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
    incomeAmount: income,
    expenseAmount: expense,
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
 * 안드로이드 홈 화면에 배치된 모든 멀어서 위젯(통합 위젯 + 기능별 단독 위젯 5종)을 최신 데이터로 갱신한다.
 * 이전 스냅샷과 내용이 완전히 같으면 네이티브 브리지 호출을 건너뛴다.
 */
export async function syncAllWidgets(force = false): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const snapshot = await buildWidgetSnapshot(force);
    const json = JSON.stringify(snapshot);
    if (!force && json === lastSnapshotJson) return;
    lastSnapshotJson = json;

    const widgets = [
      MeoreoseoAllInOneWidget,
      MeoreoseoTodosWidget,
      MeoreoseoCalendarWidget,
      MeoreoseoHabitsWidget,
      MeoreoseoNotesWidget,
      MeoreoseoMoneyWidget,
    ];

    for (const widget of widgets) {
      try {
        widget.updateSnapshot(snapshot);
      } catch {
        // 개별 위젯이 배치되지 않았거나 사용할 수 없는 환경에서는 무시한다.
      }
    }
  } catch {
    // 위젯이 배치되지 않았거나 사용할 수 없는 환경에서는 무시한다.
  }
}

export function scheduleWidgetSync(force = false) {
  if (Platform.OS !== 'android') return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    syncAllWidgets(force);
  }, 150);
}

/**
 * 위젯의 일정 버튼 이름("event:아이디:날짜")에서 일정 아이디만 꺼낸다.
 * 반복 일정은 같은 아이디가 여러 날짜에 나오므로 위젯에는 날짜를 붙인 key 를 보낸다.
 */
function eventIdOf(openAction: string): string {
  return openAction.slice('event:'.length).split(':')[0];
}

function buildDeepLinkForOpenAction(openAction: string): string {
  if (openAction === 'todos' || openAction === 'todos:add') {
    return 'meoreoseo://todos?add=1&from=widget';
  }
  if (openAction === 'todos:list') {
    return 'meoreoseo://todos?from=widget';
  }
  if (openAction.startsWith('todo:')) {
    const id = openAction.slice('todo:'.length);
    return `meoreoseo://todos?editId=${encodeURIComponent(id)}&from=widget`;
  }
  if (openAction === 'calendar' || openAction === 'calendar:add') {
    return 'meoreoseo://calendar?add=1&from=widget';
  }
  if (openAction === 'calendar:list') {
    return 'meoreoseo://calendar?from=widget';
  }
  if (openAction.startsWith('event:')) {
    const id = eventIdOf(openAction);
    return `meoreoseo://calendar?editId=${encodeURIComponent(id)}&from=widget`;
  }
  if (openAction === 'habits' || openAction === 'habits:add') {
    return 'meoreoseo://habits?add=1&from=widget';
  }
  if (openAction === 'habits:list') {
    return 'meoreoseo://habits?from=widget';
  }
  if (openAction.startsWith('habit:')) {
    const id = openAction.slice('habit:'.length);
    return `meoreoseo://habits?editId=${encodeURIComponent(id)}&from=widget`;
  }
  if (openAction === 'notes' || openAction === 'notes:list') {
    return 'meoreoseo://notes?from=widget';
  }
  if (openAction === 'note:new') {
    return 'meoreoseo://note/new?from=widget';
  }
  if (openAction.startsWith('note:')) {
    const id = openAction.slice('note:'.length);
    return `meoreoseo://note/${encodeURIComponent(id)}?from=widget`;
  }
  if (openAction === 'money' || openAction === 'money:add') {
    return 'meoreoseo://money?add=1&from=widget';
  }
  if (openAction === 'money:list') {
    return 'meoreoseo://money?from=widget';
  }
  if (openAction.startsWith('tx:')) {
    const id = openAction.slice('tx:'.length);
    return `meoreoseo://money?editId=${encodeURIComponent(id)}&from=widget`;
  }
  return 'meoreoseo://?from=widget';
}

function navigateFromOpenAction(openAction: string) {
  const token = Date.now();
  const stamp = String(token);

  if (openAction === 'todos' || openAction === 'todos:add') {
    setWidgetOpenRequest('todos', { mode: 'add', token });
    router.navigate({ pathname: '/todos', params: { add: stamp } });
  } else if (openAction === 'todos:list') {
    router.navigate('/todos');
  } else if (openAction.startsWith('todo:')) {
    const todoId = openAction.slice('todo:'.length);
    if (isValidUuid(todoId)) {
      setWidgetOpenRequest('todos', { mode: 'edit', editId: todoId, token });
      router.navigate({ pathname: '/todos', params: { editId: todoId } });
    } else {
      router.navigate('/todos');
    }
  } else if (openAction === 'calendar' || openAction === 'calendar:add') {
    setWidgetOpenRequest('calendar', { mode: 'add', token });
    router.navigate({ pathname: '/calendar', params: { add: stamp } });
  } else if (openAction === 'calendar:list') {
    router.navigate('/calendar');
  } else if (openAction.startsWith('event:')) {
    const eventId = eventIdOf(openAction);
    if (isValidUuid(eventId)) {
      setWidgetOpenRequest('calendar', { mode: 'edit', editId: eventId, token });
      router.navigate({ pathname: '/calendar', params: { editId: eventId } });
    } else {
      router.navigate('/calendar');
    }
  } else if (openAction === 'habits' || openAction === 'habits:add') {
    setWidgetOpenRequest('habits', { mode: 'add', token });
    router.navigate({ pathname: '/habits', params: { add: stamp } });
  } else if (openAction === 'habits:list') {
    router.navigate('/habits');
  } else if (openAction.startsWith('habit:')) {
    const habitId = openAction.slice('habit:'.length);
    if (isValidUuid(habitId)) {
      setWidgetOpenRequest('habits', { mode: 'edit', editId: habitId, token });
      router.navigate({ pathname: '/habits', params: { editId: habitId } });
    } else {
      router.navigate('/habits');
    }
  } else if (openAction === 'notes' || openAction === 'notes:list') {
    router.navigate('/notes');
  } else if (openAction === 'note:new') {
    router.navigate({ pathname: '/note/[id]', params: { id: 'new', t: stamp } });
  } else if (openAction.startsWith('note:')) {
    const noteId = openAction.slice('note:'.length);
    if (isValidUuid(noteId)) {
      router.navigate({ pathname: '/note/[id]', params: { id: noteId } });
    } else {
      router.navigate('/notes');
    }
  } else if (openAction === 'money' || openAction === 'money:add') {
    setWidgetOpenRequest('money', { mode: 'add', token });
    router.navigate({ pathname: '/money', params: { add: stamp } });
  } else if (openAction === 'money:list') {
    router.navigate('/money');
  } else if (openAction.startsWith('tx:')) {
    const txId = openAction.slice('tx:'.length);
    if (isValidUuid(txId)) {
      setWidgetOpenRequest('money', { mode: 'edit', editId: txId, token });
      router.navigate({ pathname: '/money', params: { editId: txId } });
    } else {
      router.navigate('/money');
    }
  }
}

function handleWidgetDeepLinkUrl(url: string) {
  try {
    const parsed = Linking.parse(url);
    const params = parsed.queryParams ?? {};
    if (params.from !== 'widget') return;

    const rawPath = (parsed.hostname ? `${parsed.hostname}/${parsed.path ?? ''}` : parsed.path ?? '')
      .replace(/^\/+|\/+$/g, '');
    const token = Date.now();
    const addParam = params.add ? String(token) : undefined;
    const editIdParam = typeof params.editId === 'string' ? params.editId : undefined;

    if (rawPath === 'todos') {
      if (addParam) {
        setWidgetOpenRequest('todos', { mode: 'add', token });
        router.navigate({ pathname: '/todos', params: { add: addParam } });
      } else if (editIdParam && isValidUuid(editIdParam)) {
        setWidgetOpenRequest('todos', { mode: 'edit', editId: editIdParam, token });
        router.navigate({ pathname: '/todos', params: { editId: editIdParam } });
      } else {
        router.navigate('/todos');
      }
    } else if (rawPath === 'calendar') {
      if (addParam) {
        setWidgetOpenRequest('calendar', { mode: 'add', token });
        router.navigate({ pathname: '/calendar', params: { add: addParam } });
      } else if (editIdParam && isValidUuid(editIdParam)) {
        setWidgetOpenRequest('calendar', { mode: 'edit', editId: editIdParam, token });
        router.navigate({ pathname: '/calendar', params: { editId: editIdParam } });
      } else {
        router.navigate('/calendar');
      }
    } else if (rawPath === 'habits') {
      if (addParam) {
        setWidgetOpenRequest('habits', { mode: 'add', token });
        router.navigate({ pathname: '/habits', params: { add: addParam } });
      } else if (editIdParam && isValidUuid(editIdParam)) {
        setWidgetOpenRequest('habits', { mode: 'edit', editId: editIdParam, token });
        router.navigate({ pathname: '/habits', params: { editId: editIdParam } });
      } else {
        router.navigate('/habits');
      }
    } else if (rawPath === 'notes') {
      router.navigate('/notes');
    } else if (rawPath === 'note/new') {
      router.navigate({ pathname: '/note/[id]', params: { id: 'new', t: String(token) } });
    } else if (rawPath.startsWith('note/')) {
      const noteId = rawPath.slice('note/'.length);
      if (isValidUuid(noteId)) router.navigate({ pathname: '/note/[id]', params: { id: noteId } });
    } else if (rawPath === 'money') {
      if (addParam) {
        setWidgetOpenRequest('money', { mode: 'add', token });
        router.navigate({ pathname: '/money', params: { add: addParam } });
      } else if (editIdParam && isValidUuid(editIdParam)) {
        setWidgetOpenRequest('money', { mode: 'edit', editId: editIdParam, token });
        router.navigate({ pathname: '/money', params: { editId: editIdParam } });
      } else {
        router.navigate('/money');
      }
    }
  } catch {
    // 잘못된 주소 형식은 무시한다.
  }
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
    // 앱 화면과 같은 함수로 완료를 바꾼다(반복 할 일이면 다음 할 일도 만든다).
    const target = hasActiveSession()
      ? (await supabase.from('todos').select('*').eq('id', todoId).maybeSingle()).data
      : (await listLocalTodos()).find((t) => t.id === todoId);
    if (target) await toggleTodo(target).catch(() => {});
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

  if (action.startsWith('open:')) {
    const openAction = action.slice('open:'.length);
    const deepLink = buildDeepLinkForOpenAction(openAction);
    if (AppState.currentState !== 'active') {
      await Linking.openURL(deepLink).catch(() => {});
    }
    navigateFromOpenAction(openAction);
  }
}

/**
 * 앱의 루트 레이아웃에서 실행되어,
 * 1) 앱 데이터나 화면 모드(다크/라이트)가 바뀔 때 안드로이드 위젯 6종(통합 1종 + 기능별 5종)을 자동 갱신하고
 * 2) 위젯에서 누른 버튼 동작(완료 토글, 습관 체크, 빠른 가계부 기록, 각 기능 추가 창·편집 창 열기)을 처리한다.
 */
export function useWidgetBridge(): void {
  const colorScheme = useColorScheme();
  const { session, loading } = useAuth();

  useEffect(() => {
    currentIsDark = colorScheme === 'dark';
    currentScope = session?.user.id ?? 'local';
    if (!loading) {
      scheduleWidgetSync(true);
    }
  }, [colorScheme, session?.user.id, loading]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    Linking.getInitialURL()
      .then((initialUrl) => {
        if (initialUrl && initialUrl !== handledInitialUrl) {
          handledInitialUrl = initialUrl;
          handleWidgetDeepLinkUrl(initialUrl);
        }
      })
      .catch(() => {});

    const urlSub = Linking.addEventListener('url', ({ url }) => {
      handleWidgetDeepLinkUrl(url);
    });

    return () => {
      urlSub.remove();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const unsubscribeQueryCache = queryClient.getQueryCache().subscribe((event) => {
      if (
        event.type === 'updated' &&
        (event.action.type === 'success' || event.action.type === 'invalidate')
      ) {
        scheduleWidgetSync(event.action.type === 'invalidate');
      }
    });

    const unsubscribeMutationCache = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'success') {
        scheduleWidgetSync(true);
      }
    });

    const interactionSub = addUserInteractionListener((event) => {
      handleWidgetAction(event.target).catch(() => {});
    });

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'active') {
        scheduleWidgetSync(true);
      }
    });

    return () => {
      unsubscribeQueryCache();
      unsubscribeMutationCache();
      interactionSub.remove();
      appStateSub.remove();
    };
  }, []);
}
