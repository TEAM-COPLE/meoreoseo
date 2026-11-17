import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { addUserInteractionListener } from 'expo-widgets';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';

import { loadEvents, type CalendarEvent } from '@/hooks/use-events';
import {
  flushPendingHabitLogToggles,
  getKnownHabitLogDone,
  streakOf,
  toggleHabitLogCoalesced,
} from '@/hooks/use-habits';
import { useColorScheme } from '@/hooks/use-theme';
import {
  flushPendingTodoToggles,
  getKnownTodo,
  toggleTodoCoalesced,
} from '@/hooks/use-todos';
import {
  INITIAL_WIDGET_PROPS,
  MeoreoseoAllInOneWidget,
  MeoreoseoCalendarWidget,
  MeoreoseoHabitsWidget,
  MeoreoseoMoneyWidget,
  MeoreoseoNotesWidget,
  MeoreoseoTodosWidget,
  type MeoreoseoWidgetProps,
  type WidgetTab,
} from '@/widgets/meoreoseo-widgets';

import { ensureActiveSession, hasActiveSession, useAuth } from './auth';
import type { Tables } from './database.types';
import { addDays, formatDate, formatTime, monthRange, todayISO, yearMonthOf } from './dates';
import { reportError } from './error-report';
import { formatWon } from './format';
import { queryClient } from './query';
import { isWaitingRepeat } from './repeat';
import { supabase } from './supabase';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(id: string): boolean {
  return UUID_RE.test(id);
}

const ACTION_MARKER = '_action:';
const HISTORY_DAYS = 400;
const WIDGET_CACHE_TTL_MS = 2 * 60 * 1000;
const WIDGET_TOGGLE_DEBOUNCE_MS = 650;

export type WidgetDomain =
  | 'todos'
  | 'events'
  | 'habits'
  | 'habit-logs'
  | 'notes'
  | 'transactions';

export type WidgetSyncOptions = {
  forceDomains?: WidgetDomain[] | 'all';
  delayMs?: number;
};

const ALL_DOMAINS: readonly WidgetDomain[] = [
  'todos',
  'events',
  'habits',
  'habit-logs',
  'notes',
  'transactions',
];

function isWidgetDomain(value: unknown): value is WidgetDomain {
  return (
    value === 'todos' ||
    value === 'events' ||
    value === 'habits' ||
    value === 'habit-logs' ||
    value === 'notes' ||
    value === 'transactions'
  );
}

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
let currentScope = '';
let lastSnapshotJson = '';
let lastBuiltSnapshot: MeoreoseoWidgetProps | null = null;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let syncInFlight: Promise<void> | null = null;
let syncQueued = false;
const queuedForceDomains = new Set<WidgetDomain>();
let isSeedingQueryCache = false;
let handledInitialUrl: string | null = null;

type WidgetDomainCache = {
  scope: string;
  today: string;
  month: string;
  todos?: Tables<'todos'>[];
  events?: CalendarEvent[];
  habits?: Tables<'habits'>[];
  logsMap?: Map<string, Set<string>>;
  notes?: Tables<'notes'>[];
  transactions?: Tables<'transactions'>[];
  fetchedAt: Partial<Record<WidgetDomain, number>>;
};

let widgetCache: WidgetDomainCache = {
  scope: '',
  today: '',
  month: '',
  fetchedAt: {},
};

const dirtyDomains = new Set<WidgetDomain>(ALL_DOMAINS);
const inFlightDomainFetches = new Map<string, Promise<unknown>>();

function ensureWidgetCacheContext(scope: string, today: string, month: string): void {
  if (
    widgetCache.scope !== scope ||
    widgetCache.today !== today ||
    widgetCache.month !== month
  ) {
    widgetCache = { scope, today, month, fetchedAt: {} };
    for (const domain of ALL_DOMAINS) dirtyDomains.add(domain);
  }
}

function isWidgetTab(value: string): value is WidgetTab {
  return (
    value === 'todos' ||
    value === 'calendar' ||
    value === 'habits' ||
    value === 'notes' ||
    value === 'money'
  );
}

function normalizeForceDomains(force?: boolean | WidgetSyncOptions): Set<WidgetDomain> {
  if (force === true) return new Set(ALL_DOMAINS);
  if (!force || typeof force === 'boolean') return new Set();
  if (force.forceDomains === 'all') return new Set(ALL_DOMAINS);
  return new Set(force.forceDomains ?? []);
}

/**
 * 캐시가 무효화(invalidated)되지 않았고 강제 새로고침이 아닐 때만 캐시 데이터를 돌려준다.
 */
function getFreshCachedData<T>(key: readonly unknown[], forceThisDomain: boolean): T | undefined {
  if (forceThisDomain) return undefined;
  const state = queryClient.getQueryState(key);
  if (!state || state.isInvalidated || state.data === undefined) return undefined;
  return state.data as T;
}

function dedupeDomainFetch<T>(fetchKey: string, fetcher: () => Promise<T>): Promise<T> {
  const existing = inFlightDomainFetches.get(fetchKey);
  if (existing) return existing as Promise<T>;
  const promise = fetcher().finally(() => {
    inFlightDomainFetches.delete(fetchKey);
  });
  inFlightDomainFetches.set(fetchKey, promise);
  return promise;
}

function seedQueryCacheIfMissing<T>(key: readonly unknown[], data: T): void {
  const state = queryClient.getQueryState(key);
  if (state && !state.isInvalidated && state.data !== undefined) return;
  isSeedingQueryCache = true;
  try {
    queryClient.setQueryData(key, data);
  } finally {
    isSeedingQueryCache = false;
  }
}

async function resolveDomain<T>(
  domain: WidgetDomain,
  queryKey: readonly unknown[],
  forceSet: Set<WidgetDomain>,
  getCached: () => T | undefined,
  setCached: (value: T, updatedAt: number) => void,
  fetcher: () => Promise<T>,
  seedQueryCache = false,
): Promise<T> {
  const forceThis = forceSet.has(domain);
  const fromQuery = getFreshCachedData<T>(queryKey, forceThis);
  if (fromQuery !== undefined) {
    const updatedAt = queryClient.getQueryState(queryKey)?.dataUpdatedAt ?? Date.now();
    setCached(fromQuery, updatedAt);
    dirtyDomains.delete(domain);
    return fromQuery;
  }

  const cachedValue = getCached();
  const fetchedAt = widgetCache.fetchedAt[domain] ?? 0;
  if (
    !forceThis &&
    !dirtyDomains.has(domain) &&
    cachedValue !== undefined &&
    Date.now() - fetchedAt < WIDGET_CACHE_TTL_MS
  ) {
    return cachedValue;
  }

  const fetchKey = `${widgetCache.scope}:${widgetCache.month}:${domain}`;
  const fresh = await dedupeDomainFetch(fetchKey, fetcher);
  setCached(fresh, Date.now());
  dirtyDomains.delete(domain);
  if (seedQueryCache) {
    seedQueryCacheIfMissing(queryKey, fresh);
  }
  return fresh;
}

function sortNotes(items: Tables<'notes'>[]): Tables<'notes'>[] {
  return [...items].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updated_at.localeCompare(a.updated_at);
  });
}

function sortTodos(items: Tables<'todos'>[]): Tables<'todos'>[] {
  return [...items].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.due_date !== b.due_date) {
      if (a.due_date === null) return 1;
      if (b.due_date === null) return -1;
      return a.due_date.localeCompare(b.due_date);
    }
    return b.created_at.localeCompare(a.created_at);
  });
}

function buildSnapshotFromData(
  today: string,
  allTodos: Tables<'todos'>[],
  events: CalendarEvent[],
  habits: Tables<'habits'>[],
  logsByHabit: Map<string, Set<string>>,
  notes: Tables<'notes'>[],
  transactions: Tables<'transactions'>[],
): MeoreoseoWidgetProps {
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
 * Supabase 데이터베이스에서 안드로이드 홈 화면 위젯에 보여줄 다섯 기능의 요약 데이터를 모은다.
 * 로그인되지 않았으면 빈 스냅샷을 돌려주고, 캐시가 살아 있거나 변경되지 않은 기능은 DB에 다시 묻지 않는다.
 */
export async function buildWidgetSnapshot(
  force: boolean | WidgetSyncOptions = false,
): Promise<MeoreoseoWidgetProps> {
  const today = todayISO();
  const month = yearMonthOf(today);
  const monthKey = `${month.year}-${month.month}`;
  const { start, end } = monthRange(month);
  const sinceDate = addDays(today, -HISTORY_DAYS);
  const session = await ensureActiveSession();
  const scope = session?.user.id ?? null;

  if (!scope) {
    return {
      ...INITIAL_WIDGET_PROPS,
      activeTab: currentWidgetTab,
      isDark: currentIsDark,
      todayLabel: formatDate(today),
    };
  }

  currentScope = scope;
  ensureWidgetCacheContext(scope, today, monthKey);
  const forceSet = normalizeForceDomains(force);

  const todosKey = ['todos', scope] as const;
  const eventsKey = ['events', scope, start, end] as const;
  const habitsKey = ['habits', scope] as const;
  const habitLogsKey = ['habit-logs', scope] as const;
  const notesKey = ['notes', scope] as const;
  const transactionsKey = ['transactions', scope, start, end] as const;

  const [allTodos, events, habits, logsByHabit, notes, transactions] = await Promise.all([
    resolveDomain<Tables<'todos'>[]>(
      'todos',
      todosKey,
      forceSet,
      () => widgetCache.todos,
      (v, t) => {
        widgetCache.todos = v;
        widgetCache.fetchedAt.todos = t;
      },
      async () => {
        const { data } = await supabase
          .from('todos')
          .select('*')
          .order('done')
          .order('due_date', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(50);
        return data ?? [];
      },
    ),
    resolveDomain<CalendarEvent[]>(
      'events',
      eventsKey,
      forceSet,
      () => widgetCache.events,
      (v, t) => {
        widgetCache.events = v;
        widgetCache.fetchedAt.events = t;
      },
      () => loadEvents(start, end).catch(() => []),
      true,
    ),
    resolveDomain<Tables<'habits'>[]>(
      'habits',
      habitsKey,
      forceSet,
      () => widgetCache.habits,
      (v, t) => {
        widgetCache.habits = v;
        widgetCache.fetchedAt.habits = t;
      },
      async () => {
        const { data } = await supabase
          .from('habits')
          .select('*')
          .eq('archived', false)
          .order('created_at');
        return data ?? [];
      },
      true,
    ),
    resolveDomain<Map<string, Set<string>>>(
      'habit-logs',
      habitLogsKey,
      forceSet,
      () => widgetCache.logsMap,
      (v, t) => {
        widgetCache.logsMap = v;
        widgetCache.fetchedAt['habit-logs'] = t;
      },
      async () => {
        const { data } = await supabase
          .from('habit_logs')
          .select('habit_id, log_date')
          .gte('log_date', sinceDate);
        const map = new Map<string, Set<string>>();
        for (const log of data ?? []) {
          const set = map.get(log.habit_id) ?? new Set<string>();
          set.add(log.log_date);
          map.set(log.habit_id, set);
        }
        return map;
      },
      true,
    ),
    resolveDomain<Tables<'notes'>[]>(
      'notes',
      notesKey,
      forceSet,
      () => widgetCache.notes,
      (v, t) => {
        widgetCache.notes = v;
        widgetCache.fetchedAt.notes = t;
      },
      async () => {
        const { data } = await supabase
          .from('notes')
          .select('*')
          .order('pinned', { ascending: false })
          .order('updated_at', { ascending: false })
          .limit(10);
        return data ?? [];
      },
    ),
    resolveDomain<Tables<'transactions'>[]>(
      'transactions',
      transactionsKey,
      forceSet,
      () => widgetCache.transactions,
      (v, t) => {
        widgetCache.transactions = v;
        widgetCache.fetchedAt.transactions = t;
      },
      async () => {
        const { data } = await supabase
          .from('transactions')
          .select('*')
          .gte('occurred_on', start)
          .lte('occurred_on', end)
          .order('occurred_on', { ascending: false })
          .order('created_at', { ascending: false });
        return data ?? [];
      },
      true,
    ),
  ]);

  return buildSnapshotFromData(today, allTodos, events, habits, logsByHabit, notes, transactions);
}

const WIDGETS = [
  MeoreoseoAllInOneWidget,
  MeoreoseoTodosWidget,
  MeoreoseoCalendarWidget,
  MeoreoseoHabitsWidget,
  MeoreoseoNotesWidget,
  MeoreoseoMoneyWidget,
] as const;

function pushSnapshotToWidgets(snapshot: MeoreoseoWidgetProps, forcePush = false): void {
  const json = JSON.stringify(snapshot);
  if (!forcePush && json === lastSnapshotJson) return;
  lastSnapshotJson = json;
  lastBuiltSnapshot = snapshot;

  for (const widget of WIDGETS) {
    try {
      widget.updateSnapshot(snapshot);
    } catch {
      // 개별 위젯이 배치되지 않았거나 사용할 수 없는 환경에서는 무시한다.
    }
  }
}

/** 이미 메모리 캐시에 있는 값만으로 즉시 위젯을 갱신한다(DB 요청 없음). */
function pushCachedSnapshotIfReady(): void {
  if (Platform.OS !== 'android') return;
  if (
    !widgetCache.todos ||
    !widgetCache.events ||
    !widgetCache.habits ||
    !widgetCache.logsMap ||
    !widgetCache.notes ||
    !widgetCache.transactions
  ) {
    return;
  }
  const snapshot = buildSnapshotFromData(
    widgetCache.today || todayISO(),
    widgetCache.todos,
    widgetCache.events,
    widgetCache.habits,
    widgetCache.logsMap,
    widgetCache.notes,
    widgetCache.transactions,
  );
  pushSnapshotToWidgets(snapshot);
}

/**
 * 안드로이드 홈 화면에 배치된 모든 멀어서 위젯(통합 위젯 + 기능별 단독 위젯 5종)을 최신 데이터로 갱신한다.
 * 동시 호출은 하나로 합치고, 이전 스냅샷과 내용이 완전히 같으면 네이티브 브리지 호출을 건너뛴다.
 */
export async function syncAllWidgets(
  force: boolean | WidgetSyncOptions = false,
): Promise<void> {
  if (Platform.OS !== 'android') return;

  for (const domain of normalizeForceDomains(force)) {
    queuedForceDomains.add(domain);
  }
  const forcePush = force === true;

  if (syncInFlight) {
    syncQueued = true;
    return syncInFlight;
  }

  syncInFlight = (async () => {
    try {
      do {
        syncQueued = false;
        const batchForce = [...queuedForceDomains];
        queuedForceDomains.clear();
        const snapshot = await buildWidgetSnapshot({ forceDomains: batchForce });
        pushSnapshotToWidgets(snapshot, forcePush);
      } while (syncQueued);
    } catch {
      // 위젯이 배치되지 않았거나 사용할 수 없는 환경에서는 무시한다.
    } finally {
      syncInFlight = null;
    }
  })();

  return syncInFlight;
}

export function scheduleWidgetSync(force: boolean | WidgetSyncOptions = false): void {
  if (Platform.OS !== 'android') return;
  for (const domain of normalizeForceDomains(force)) {
    queuedForceDomains.add(domain);
  }
  const delayMs = typeof force === 'object' && force.delayMs !== undefined ? force.delayMs : 200;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    syncAllWidgets();
  }, delayMs);
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

type PendingNotePin = {
  scope: string;
  note: Tables<'notes'>;
  confirmedPinned: boolean;
  desiredPinned: boolean;
  timer: ReturnType<typeof setTimeout> | null;
};

const pendingNotePins = new Map<string, PendingNotePin>();
const notePinChains = new Map<string, Promise<void>>();
const confirmedNotePinnedMap = new Map<string, boolean>();
const optimisticNotePinnedMap = new Map<string, boolean>();
let quickExpenseChain: Promise<void> = Promise.resolve();

function updateNotePinnedInCaches(scope: string, noteId: string, pinned: boolean): void {
  const key = ['notes', scope];
  if (queryClient.getQueryData<Tables<'notes'>[]>(key) !== undefined) {
    isSeedingQueryCache = true;
    try {
      queryClient.setQueryData<Tables<'notes'>[]>(key, (old) =>
        old ? sortNotes(old.map((item) => (item.id === noteId ? { ...item, pinned } : item))) : old,
      );
    } finally {
      isSeedingQueryCache = false;
    }
  }
  if (widgetCache.scope === scope && widgetCache.notes) {
    widgetCache.notes = sortNotes(
      widgetCache.notes.map((item) => (item.id === noteId ? { ...item, pinned } : item)),
    );
  }
}

function flushNotePinEntry(key: string): Promise<void> {
  const entry = pendingNotePins.get(key);
  if (!entry) return notePinChains.get(key) ?? Promise.resolve();
  pendingNotePins.delete(key);
  if (entry.timer) {
    clearTimeout(entry.timer);
    entry.timer = null;
  }

  const prevChain = notePinChains.get(key) ?? Promise.resolve();
  const nextChain = prevChain
    .catch(() => {})
    .then(async () => {
      const activeScope = hasActiveSession() ? currentScope : null;
      if (!activeScope || activeScope !== entry.scope) return;
      const confirmed = confirmedNotePinnedMap.get(key) ?? entry.confirmedPinned;
      if (entry.desiredPinned === confirmed) return;

      try {
        const { error } = await supabase
          .from('notes')
          .update({ pinned: entry.desiredPinned })
          .eq('id', entry.note.id);
        if (error) throw new Error(error.message);
        confirmedNotePinnedMap.set(key, entry.desiredPinned);
        if (!pendingNotePins.has(key)) {
          optimisticNotePinnedMap.set(key, entry.desiredPinned);
        }
      } catch (err) {
        reportError('notes', err);
        if (!pendingNotePins.has(key)) {
          optimisticNotePinnedMap.set(key, confirmed);
          updateNotePinnedInCaches(entry.scope, entry.note.id, confirmed);
          pushCachedSnapshotIfReady();
        }
      }
    })
    .finally(() => {
      if (notePinChains.get(key) === nextChain && !pendingNotePins.has(key)) {
        notePinChains.delete(key);
        confirmedNotePinnedMap.delete(key);
        optimisticNotePinnedMap.delete(key);
      }
    });

  notePinChains.set(key, nextChain);
  return nextChain;
}

async function flushPendingWidgetNotePins(): Promise<void> {
  const keys = [...pendingNotePins.keys()];
  if (keys.length === 0 && notePinChains.size === 0) return;
  await Promise.allSettled([
    ...keys.map((key) => flushNotePinEntry(key)),
    ...notePinChains.values(),
  ]);
}

function updateTodoInWidgetCache(
  scope: string,
  updater: (items: Tables<'todos'>[]) => Tables<'todos'>[],
): void {
  if (widgetCache.scope !== scope || !widgetCache.todos) return;
  widgetCache.todos = sortTodos(updater(widgetCache.todos));
}

function updateHabitLogInWidgetCache(
  scope: string,
  habitId: string,
  date: string,
  targetDone: boolean,
): void {
  if (widgetCache.scope !== scope || !widgetCache.logsMap) return;
  const nextMap = new Map(widgetCache.logsMap);
  const nextSet = new Set(nextMap.get(habitId) ?? []);
  if (targetDone) nextSet.add(date);
  else nextSet.delete(date);
  nextMap.set(habitId, nextSet);
  widgetCache.logsMap = nextMap;
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
      if (lastBuiltSnapshot) {
        pushSnapshotToWidgets({ ...lastBuiltSnapshot, activeTab: tab });
      } else {
        await syncAllWidgets(false);
      }
    }
    return;
  }

  const session = await ensureActiveSession();
  const scope = session?.user.id ?? null;
  if (!scope) {
    if (AppState.currentState !== 'active') {
      await Linking.openURL('meoreoseo://sign-in').catch(() => {});
    }
    router.navigate('/sign-in');
    return;
  }
  currentScope = scope;

  if (action.startsWith('todo:toggle:')) {
    const todoId = action.slice('todo:toggle:'.length);
    if (!isValidUuid(todoId)) return;

    const known = getKnownTodo(todoId);
    const cachedFromWidget =
      widgetCache.scope === scope ? widgetCache.todos?.find((t) => t.id === todoId) : undefined;
    const target =
      known ??
      cachedFromWidget ??
      (await dedupeDomainFetch(`lookup:todo:${scope}:${todoId}`, async () =>
        (await supabase.from('todos').select('*').eq('id', todoId).maybeSingle()).data,
      ));

    if (!target || isWaitingRepeat(target, todayISO())) return;

    const nextDone = !target.done;
    updateTodoInWidgetCache(scope, (items) =>
      items.map((item) =>
        item.id === todoId
          ? { ...item, done: nextDone, done_at: nextDone ? new Date().toISOString() : null }
          : item,
      ),
    );
    pushCachedSnapshotIfReady();

    try {
      await toggleTodoCoalesced(target, {
        delayMs: WIDGET_TOGGLE_DEBOUNCE_MS,
        onCommitted: (result) => {
          updateTodoInWidgetCache(scope, (items) => {
            let next = items.map((item) => (item.id === result.todo.id ? result.todo : item));
            if (result.createdNext && !next.some((item) => item.id === result.createdNext!.id)) {
              next = [result.createdNext, ...next];
            }
            if (result.deletedNextIds.length > 0) {
              const removed = new Set(result.deletedNextIds);
              next = next.filter((item) => !removed.has(item.id));
            }
            return next;
          });
          pushCachedSnapshotIfReady();
        },
        onRollback: (confirmed) => {
          updateTodoInWidgetCache(scope, (items) =>
            items.map((item) => (item.id === confirmed.id ? confirmed : item)),
          );
          pushCachedSnapshotIfReady();
        },
      });
    } catch (err) {
      reportError('todos', err);
    }
    return;
  }

  if (action.startsWith('habit:toggle:')) {
    const habitId = action.slice('habit:toggle:'.length);
    if (!isValidUuid(habitId)) return;
    const today = todayISO();

    const knownDone = getKnownHabitLogDone(habitId, today);
    const cachedWidgetLogs = widgetCache.scope === scope ? widgetCache.logsMap : undefined;

    let currentDone: boolean;
    if (knownDone !== undefined) {
      currentDone = knownDone;
    } else if (cachedWidgetLogs) {
      currentDone = cachedWidgetLogs.get(habitId)?.has(today) ?? false;
    } else {
      currentDone = await dedupeDomainFetch(`lookup:habit:${scope}:${habitId}:${today}`, async () => {
        const { data } = await supabase
          .from('habit_logs')
          .select('id')
          .eq('habit_id', habitId)
          .eq('log_date', today)
          .maybeSingle();
        return Boolean(data);
      });
    }

    updateHabitLogInWidgetCache(scope, habitId, today, !currentDone);
    pushCachedSnapshotIfReady();

    try {
      await toggleHabitLogCoalesced(
        { habitId, date: today, done: currentDone },
        {
          delayMs: WIDGET_TOGGLE_DEBOUNCE_MS,
          onRollback: (confirmedDone) => {
            updateHabitLogInWidgetCache(scope, habitId, today, confirmedDone);
            pushCachedSnapshotIfReady();
          },
        },
      );
    } catch (err) {
      reportError('habit-logs', err);
    }
    return;
  }

  if (action.startsWith('note:pin:')) {
    const noteId = action.slice('note:pin:'.length);
    if (!isValidUuid(noteId)) return;
    const key = `${scope}:${noteId}`;
    const existing = pendingNotePins.get(key);

    if (existing) {
      if (existing.timer) clearTimeout(existing.timer);
      existing.desiredPinned = !existing.desiredPinned;
      optimisticNotePinnedMap.set(key, existing.desiredPinned);
      updateNotePinnedInCaches(scope, noteId, existing.desiredPinned);
      pushCachedSnapshotIfReady();
      existing.timer = setTimeout(() => {
        flushNotePinEntry(key).catch(() => {});
      }, WIDGET_TOGGLE_DEBOUNCE_MS);
      return;
    }

    const cachedFromQuery = queryClient
      .getQueryData<Tables<'notes'>[]>(['notes', scope])
      ?.find((n) => n.id === noteId);
    const cachedFromWidget =
      widgetCache.scope === scope ? widgetCache.notes?.find((n) => n.id === noteId) : undefined;
    const note =
      cachedFromQuery ??
      cachedFromWidget ??
      (await dedupeDomainFetch(`lookup:note:${scope}:${noteId}`, async () =>
        (await supabase.from('notes').select('*').eq('id', noteId).maybeSingle()).data,
      ));
    if (!note) return;

    // 동시 조회(dedupeDomainFetch) 중 앞선 탭이 이미 pendingNotePins 에 등록했을 수 있으므로 다시 확인한다.
    const racedPending = pendingNotePins.get(key);
    if (racedPending) {
      if (racedPending.timer) clearTimeout(racedPending.timer);
      racedPending.desiredPinned = !racedPending.desiredPinned;
      optimisticNotePinnedMap.set(key, racedPending.desiredPinned);
      updateNotePinnedInCaches(scope, noteId, racedPending.desiredPinned);
      pushCachedSnapshotIfReady();
      racedPending.timer = setTimeout(() => {
        flushNotePinEntry(key).catch(() => {});
      }, WIDGET_TOGGLE_DEBOUNCE_MS);
      return;
    }

    const currentPinned = optimisticNotePinnedMap.get(key) ?? note.pinned;
    const confirmedPinned = confirmedNotePinnedMap.get(key) ?? currentPinned;
    confirmedNotePinnedMap.set(key, confirmedPinned);
    const nextPinned = !currentPinned;
    optimisticNotePinnedMap.set(key, nextPinned);
    updateNotePinnedInCaches(scope, noteId, nextPinned);
    pushCachedSnapshotIfReady();

    const entry: PendingNotePin = {
      scope,
      note,
      confirmedPinned,
      desiredPinned: nextPinned,
      timer: setTimeout(() => {
        flushNotePinEntry(key).catch(() => {});
      }, WIDGET_TOGGLE_DEBOUNCE_MS),
    };
    pendingNotePins.set(key, entry);
    return;
  }

  if (action.startsWith('money:quick:')) {
    const presetKey = action.slice('money:quick:'.length);
    const preset = ALLOWED_QUICK_EXPENSES[presetKey];
    if (!preset) return;

    quickExpenseChain = quickExpenseChain
      .catch(() => {})
      .then(async () => {
        const today = todayISO();
        const month = yearMonthOf(today);
        const monthKey = `${month.year}-${month.month}`;
        const { start, end } = monthRange(month);
        const activeSession = await ensureActiveSession();
        const activeScope = activeSession?.user.id ?? null;
        if (!activeScope) return;

        try {
          const { data: inserted, error } = await supabase
            .from('transactions')
            .insert({
              kind: 'expense',
              amount: preset.amount,
              category: preset.category,
              memo: '위젯 빠른 기록',
              occurred_on: today,
            })
            .select('*')
            .single();
          if (error || !inserted) throw new Error(error?.message ?? '가계부 저장 실패');

          const txKey = ['transactions', activeScope, start, end];
          if (queryClient.getQueryData<Tables<'transactions'>[]>(txKey) !== undefined) {
            isSeedingQueryCache = true;
            try {
              queryClient.setQueryData<Tables<'transactions'>[]>(txKey, (old) =>
                old ? [inserted, ...old] : [inserted],
              );
            } finally {
              isSeedingQueryCache = false;
            }
          }
          if (
            widgetCache.scope === activeScope &&
            widgetCache.month === monthKey &&
            widgetCache.transactions
          ) {
            widgetCache.transactions = [inserted, ...widgetCache.transactions];
            widgetCache.fetchedAt.transactions = Date.now();
            pushCachedSnapshotIfReady();
          } else {
            dirtyDomains.add('transactions');
            scheduleWidgetSync({ forceDomains: ['transactions'], delayMs: 100 });
          }
        } catch (err) {
          reportError('transactions', err);
          dirtyDomains.add('transactions');
          scheduleWidgetSync({ forceDomains: ['transactions'], delayMs: 100 });
        }
      });
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
    currentScope = session?.user.id ?? '';
    if (!loading) {
      scheduleWidgetSync(false);
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
      if (isSeedingQueryCache) return;
      if (event.type !== 'updated') return;
      const rootKey = event.query.queryKey[0];
      if (!isWidgetDomain(rootKey)) return;

      if (event.action.type === 'invalidate') {
        dirtyDomains.add(rootKey);
        if (event.query.getObserversCount() > 0) {
          // 화면에 보고 있는 쿼리는 React Query가 곧 다시 불러오므로, 중복 요청을 피하고 완료를 기다린다.
          scheduleWidgetSync({ delayMs: 400 });
        } else {
          scheduleWidgetSync({ forceDomains: [rootKey], delayMs: 250 });
        }
      } else if (event.action.type === 'success') {
        dirtyDomains.delete(rootKey);
        scheduleWidgetSync({ delayMs: 150 });
      }
    });

    const interactionSub = addUserInteractionListener((event) => {
      handleWidgetAction(event.target).catch(() => {});
    });

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'active') {
        Promise.allSettled([
          flushPendingTodoToggles(),
          flushPendingHabitLogToggles(),
          flushPendingWidgetNotePins(),
          quickExpenseChain,
        ]).finally(() => {
          scheduleWidgetSync(false);
        });
      }
    });

    return () => {
      unsubscribeQueryCache();
      interactionSub.remove();
      appStateSub.remove();
    };
  }, []);
}
