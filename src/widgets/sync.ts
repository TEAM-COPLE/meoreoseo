import { timeLabel, type CalendarEvent } from '@/hooks/use-events';
import { streakOf, type Habit } from '@/hooks/use-habits';
import type { Note } from '@/hooks/use-notes';
import type { Todo } from '@/hooks/use-todos';
import type { Transaction } from '@/hooks/use-transactions';
import { formatDate, todayISO, toISODate, yearMonthOf } from '@/lib/dates';
import { formatWon } from '@/lib/format';
import { isWaitingRepeat } from '@/lib/repeat';

import DashboardWidget from './DashboardWidget';
import EventsWidget from './EventsWidget';
import HabitsWidget from './HabitsWidget';
import MoneyWidget from './MoneyWidget';
import NotesWidget from './NotesWidget';
import TodoWidget from './TodoWidget';
import type {
  DashboardWidgetProps,
  EventsWidgetProps,
  HabitsWidgetProps,
  MoneyWidgetProps,
  NotesWidgetProps,
  TodoWidgetProps,
  WidgetColorScheme,
} from './types';

export type WidgetSyncInput = {
  colorScheme: WidgetColorScheme;
  todos?: Todo[];
  events?: CalendarEvent[];
  notes?: Note[];
  habits?: Habit[];
  habitLogs?: Map<string, Set<string>>;
  transactions?: Transaction[];
  monthlyBudget: number | null;
};

/** 이전 스냅샷과 동일한 위젯은 네이티브 브리지를 다시 호출하지 않도록 직렬화 값을 기억한다. */
const lastSnapshotJson = new Map<string, string>();

function pushIfChanged<T>(name: string, props: T, updater: (p: T) => void): void {
  const serialized = JSON.stringify(props);
  if (lastSnapshotJson.get(name) === serialized) return;
  updater(props);
  lastSnapshotJson.set(name, serialized);
}

function shortDueLabel(dueDate: string | null, today: string): { label: string; isOverdue: boolean } {
  if (!dueDate) return { label: '', isOverdue: false };
  if (dueDate < today) return { label: '지남', isOverdue: true };
  if (dueDate === today) return { label: '오늘', isOverdue: false };
  const parts = dueDate.split('-');
  if (parts.length === 3) {
    return { label: `${Number(parts[1])}/${Number(parts[2])}`, isOverdue: false };
  }
  return { label: dueDate, isOverdue: false };
}

function shortUpdatedLabel(isoTimestamp: string, today: string): string {
  const datePart = isoTimestamp.slice(0, 10);
  if (datePart === today) return '오늘';
  const parts = datePart.split('-');
  if (parts.length === 3) return `${Number(parts[1])}/${Number(parts[2])}`;
  return '';
}

/** 위젯은 한 줄 요약만 그리므로, 긴 메모 본문이 Binder 한계를 넘지 않게 앞부분만 잘라 정리한다. */
function notePreview(body: string): string {
  return body.slice(0, 300).replace(/\s+/g, ' ').trim().slice(0, 120);
}

function isCompletedToday(todo: Todo, today: string): boolean {
  return todo.done && todo.done_at !== null && toISODate(new Date(todo.done_at)) === today;
}

export function buildTodoWidgetProps(input: WidgetSyncInput, today = todayISO()): TodoWidgetProps {
  const activeTodos = (input.todos ?? []).filter((t) => !isWaitingRepeat(t, today));
  const pending = activeTodos.filter((t) => !t.done);
  const completedToday = activeTodos.filter((t) => isCompletedToday(t, today));
  const visible = [...pending, ...completedToday].slice(0, 6);

  return {
    colorScheme: input.colorScheme,
    dateLabel: formatDate(today),
    pendingCount: pending.length,
    doneTodayCount: completedToday.length,
    items: visible.map((t) => {
      const { label, isOverdue } = shortDueLabel(t.due_date, today);
      return {
        id: t.id,
        title: t.title.slice(0, 120),
        dueLabel: label,
        isOverdue,
        done: t.done,
      };
    }),
  };
}

export function buildEventsWidgetProps(input: WidgetSyncInput, today = todayISO()): EventsWidgetProps {
  const todayEvents = (input.events ?? []).filter((e) => e.event_date === today);
  return {
    colorScheme: input.colorScheme,
    dateLabel: formatDate(today),
    totalCount: todayEvents.length,
    items: todayEvents.slice(0, 5).map((e) => ({
      id: e.key,
      title: e.title.slice(0, 120),
      timeLabel: timeLabel(e),
      isAllDay: !e.start_time,
    })),
  };
}

export function buildNotesWidgetProps(input: WidgetSyncInput, today = todayISO()): NotesWidgetProps {
  const notes = input.notes ?? [];
  return {
    colorScheme: input.colorScheme,
    totalCount: notes.length,
    items: notes.slice(0, 4).map((n) => ({
      id: n.id,
      title: (n.title.trim() || '제목 없음').slice(0, 120),
      preview: notePreview(n.body),
      pinned: n.pinned,
      updatedLabel: shortUpdatedLabel(n.updated_at, today),
    })),
  };
}

export function buildHabitsWidgetProps(input: WidgetSyncInput, today = todayISO()): HabitsWidgetProps {
  const habits = input.habits ?? [];
  const habitLogs = input.habitLogs ?? new Map<string, Set<string>>();
  let doneCount = 0;
  const items = habits.slice(0, 5).map((h) => {
    const dates = habitLogs.get(h.id);
    const done = dates?.has(today) ?? false;
    if (done) doneCount += 1;
    return {
      id: h.id,
      name: h.name.slice(0, 100),
      done,
      streak: streakOf(dates, today),
    };
  });

  const totalDoneCount = habits.reduce(
    (acc, h) => acc + (habitLogs.get(h.id)?.has(today) ? 1 : 0),
    0,
  );

  return {
    colorScheme: input.colorScheme,
    doneCount: totalDoneCount || doneCount,
    totalCount: habits.length,
    items,
  };
}

export function buildMoneyWidgetProps(input: WidgetSyncInput, today = todayISO()): MoneyWidgetProps {
  const { month } = yearMonthOf(today);
  let expense = 0;
  let income = 0;
  let todayExpense = 0;

  for (const tx of input.transactions ?? []) {
    if (tx.kind === 'expense') {
      expense += tx.amount;
      if (tx.occurred_on === today) todayExpense += tx.amount;
    } else {
      income += tx.amount;
    }
  }

  let budgetLabel = '';
  let budgetProgress = -1;
  let isOverBudget = false;

  if (input.monthlyBudget && input.monthlyBudget > 0) {
    const remaining = input.monthlyBudget - expense;
    isOverBudget = remaining < 0;
    budgetLabel = isOverBudget
      ? `예산 초과 ${formatWon(Math.abs(remaining))}`
      : `남은 예산 ${formatWon(remaining)}`;
    budgetProgress = Math.min(1, Math.max(0, expense / input.monthlyBudget));
  } else {
    const net = income - expense;
    budgetLabel = `이번 달 수지 ${net >= 0 ? '+' : ''}${formatWon(net)}`;
  }

  return {
    colorScheme: input.colorScheme,
    monthLabel: `${month + 1}월 가계부`,
    expenseLabel: formatWon(expense),
    incomeLabel: formatWon(income),
    todayExpenseLabel: formatWon(todayExpense),
    budgetLabel,
    budgetProgress,
    isOverBudget,
  };
}

function composeDashboardProps(
  colorScheme: WidgetColorScheme,
  today: string,
  todoProps: TodoWidgetProps,
  eventProps: EventsWidgetProps,
  habitProps: HabitsWidgetProps,
  noteProps: NotesWidgetProps,
  moneyProps: MoneyWidgetProps,
): DashboardWidgetProps {
  return {
    colorScheme,
    dateLabel: formatDate(today),
    todoPendingCount: todoProps.pendingCount,
    todos: todoProps.items.slice(0, 2).map((t) => ({
      id: t.id,
      title: t.title,
      done: t.done,
    })),
    eventCount: eventProps.totalCount,
    events: eventProps.items.slice(0, 2).map((e) => ({
      id: e.id,
      title: e.title,
      timeLabel: e.isAllDay ? '종일' : e.timeLabel.split(' – ')[0],
    })),
    habitDoneCount: habitProps.doneCount,
    habitTotalCount: habitProps.totalCount,
    habits: habitProps.items.slice(0, 2).map((h) => ({
      id: h.id,
      name: h.name,
      done: h.done,
      streak: h.streak,
    })),
    latestNote: noteProps.items[0]
      ? {
          id: noteProps.items[0].id,
          title: noteProps.items[0].title,
          preview: '',
          pinned: noteProps.items[0].pinned,
        }
      : { id: '', title: '', preview: '', pinned: false },
    moneyMonthExpenseLabel: moneyProps.expenseLabel,
    moneyTodayExpenseLabel: moneyProps.todayExpenseLabel,
    moneyBudgetLabel: moneyProps.budgetLabel,
  };
}

export function buildDashboardWidgetProps(input: WidgetSyncInput, today = todayISO()): DashboardWidgetProps {
  return composeDashboardProps(
    input.colorScheme,
    today,
    buildTodoWidgetProps(input, today),
    buildEventsWidgetProps(input, today),
    buildHabitsWidgetProps(input, today),
    buildNotesWidgetProps(input, today),
    buildMoneyWidgetProps(input, today),
  );
}

export function syncAllWidgets(input: WidgetSyncInput): void {
  const today = todayISO();
  // 로딩 전(undefined) 데이터로 기존 위젯 내용을 덮어쓰지 않고, 이미 계산한 값을 재사용한다.
  const todoProps = input.todos !== undefined ? buildTodoWidgetProps(input, today) : undefined;
  const eventProps = input.events !== undefined ? buildEventsWidgetProps(input, today) : undefined;
  const noteProps = input.notes !== undefined ? buildNotesWidgetProps(input, today) : undefined;
  const habitProps =
    input.habits !== undefined && input.habitLogs !== undefined
      ? buildHabitsWidgetProps(input, today)
      : undefined;
  const moneyProps =
    input.transactions !== undefined ? buildMoneyWidgetProps(input, today) : undefined;

  const jobs: (() => void)[] = [];
  if (todoProps) {
    jobs.push(() => pushIfChanged('todo', todoProps, (p) => TodoWidget.updateSnapshot(p)));
  }
  if (eventProps) {
    jobs.push(() => pushIfChanged('events', eventProps, (p) => EventsWidget.updateSnapshot(p)));
  }
  if (noteProps) {
    jobs.push(() => pushIfChanged('notes', noteProps, (p) => NotesWidget.updateSnapshot(p)));
  }
  if (habitProps) {
    jobs.push(() => pushIfChanged('habits', habitProps, (p) => HabitsWidget.updateSnapshot(p)));
  }
  if (moneyProps) {
    jobs.push(() => pushIfChanged('money', moneyProps, (p) => MoneyWidget.updateSnapshot(p)));
  }
  if (todoProps && eventProps && noteProps && habitProps && moneyProps) {
    const dashboardProps = composeDashboardProps(
      input.colorScheme,
      today,
      todoProps,
      eventProps,
      habitProps,
      noteProps,
      moneyProps,
    );
    jobs.push(() =>
      pushIfChanged('dashboard', dashboardProps, (p) => DashboardWidget.updateSnapshot(p)),
    );
  }

  for (const run of jobs) {
    try {
      run();
    } catch {
      // Expo Go 등 위젯 네이티브 모듈이 없거나 갱신에 실패하면 조용히 넘어간다.
    }
  }
}

/** 로그아웃·개발 데이터 초기화 시 홈/잠금 화면 위젯에 남은 개인 데이터를 비운다. */
export function clearAllWidgets(colorScheme: WidgetColorScheme = 'dark'): void {
  lastSnapshotJson.clear();
  const today = todayISO();
  const emptyInput: WidgetSyncInput = {
    colorScheme,
    todos: [],
    events: [],
    notes: [],
    habits: [],
    habitLogs: new Map(),
    transactions: [],
    monthlyBudget: null,
  };
  syncAllWidgets(emptyInput);
  // 다음 로그인 후 첫 동기화가 반드시 실행되도록 직렬화 캐시를 다시 비운다.
  lastSnapshotJson.clear();
  void today;
}
