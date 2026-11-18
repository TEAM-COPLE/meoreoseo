import { timeLabel, type CalendarEvent } from '@/hooks/use-events';
import { streakOf, type Habit } from '@/hooks/use-habits';
import type { Note } from '@/hooks/use-notes';
import type { Todo } from '@/hooks/use-todos';
import type { Transaction } from '@/hooks/use-transactions';
import { formatDate, todayISO, yearMonthOf } from '@/lib/dates';
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
  todos: Todo[];
  events: CalendarEvent[];
  notes: Note[];
  habits: Habit[];
  habitLogs: Map<string, Set<string>>;
  transactions: Transaction[];
  monthlyBudget: number | null;
};

function shortDueLabel(dueDate: string | null, today: string): { label: string | null; isOverdue: boolean } {
  if (!dueDate) return { label: null, isOverdue: false };
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

function notePreview(body: string): string {
  return body.replace(/\s+/g, ' ').trim();
}

export function buildTodoWidgetProps(input: WidgetSyncInput, today = todayISO()): TodoWidgetProps {
  const activeTodos = input.todos.filter((t) => !isWaitingRepeat(t, today));
  const pending = activeTodos.filter((t) => !t.done);
  const doneTodayCount = activeTodos.filter((t) => t.done).length;
  const visible = [...pending, ...activeTodos.filter((t) => t.done)].slice(0, 6);

  return {
    colorScheme: input.colorScheme,
    dateLabel: formatDate(today),
    pendingCount: pending.length,
    doneTodayCount,
    items: visible.map((t) => {
      const { label, isOverdue } = shortDueLabel(t.due_date, today);
      return {
        id: t.id,
        title: t.title,
        dueLabel: label,
        isOverdue,
        done: t.done,
      };
    }),
  };
}

export function buildEventsWidgetProps(input: WidgetSyncInput, today = todayISO()): EventsWidgetProps {
  const todayEvents = input.events.filter((e) => e.event_date === today);
  return {
    colorScheme: input.colorScheme,
    dateLabel: formatDate(today),
    totalCount: todayEvents.length,
    items: todayEvents.slice(0, 5).map((e) => ({
      id: e.key,
      title: e.title,
      timeLabel: timeLabel(e),
      isAllDay: !e.start_time,
    })),
  };
}

export function buildNotesWidgetProps(input: WidgetSyncInput, today = todayISO()): NotesWidgetProps {
  return {
    colorScheme: input.colorScheme,
    totalCount: input.notes.length,
    items: input.notes.slice(0, 4).map((n) => ({
      id: n.id,
      title: n.title.trim() || '제목 없음',
      preview: notePreview(n.body),
      pinned: n.pinned,
      updatedLabel: shortUpdatedLabel(n.updated_at, today),
    })),
  };
}

export function buildHabitsWidgetProps(input: WidgetSyncInput, today = todayISO()): HabitsWidgetProps {
  let doneCount = 0;
  const items = input.habits.slice(0, 5).map((h) => {
    const dates = input.habitLogs.get(h.id);
    const done = dates?.has(today) ?? false;
    if (done) doneCount += 1;
    return {
      id: h.id,
      name: h.name,
      done,
      streak: streakOf(dates),
    };
  });

  const totalDoneCount = input.habits.reduce(
    (acc, h) => acc + (input.habitLogs.get(h.id)?.has(today) ? 1 : 0),
    0,
  );

  return {
    colorScheme: input.colorScheme,
    doneCount: totalDoneCount || doneCount,
    totalCount: input.habits.length,
    items,
  };
}

export function buildMoneyWidgetProps(input: WidgetSyncInput, today = todayISO()): MoneyWidgetProps {
  const { month } = yearMonthOf(today);
  let expense = 0;
  let income = 0;
  let todayExpense = 0;

  for (const tx of input.transactions) {
    if (tx.kind === 'expense') {
      expense += tx.amount;
      if (tx.occurred_on === today) todayExpense += tx.amount;
    } else {
      income += tx.amount;
    }
  }

  let budgetLabel: string | null = null;
  let budgetProgress: number | null = null;
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

export function buildDashboardWidgetProps(input: WidgetSyncInput, today = todayISO()): DashboardWidgetProps {
  const todoProps = buildTodoWidgetProps(input, today);
  const eventProps = buildEventsWidgetProps(input, today);
  const habitProps = buildHabitsWidgetProps(input, today);
  const noteProps = buildNotesWidgetProps(input, today);
  const moneyProps = buildMoneyWidgetProps(input, today);

  return {
    colorScheme: input.colorScheme,
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
          preview: noteProps.items[0].preview,
          pinned: noteProps.items[0].pinned,
        }
      : null,
    moneyMonthExpenseLabel: moneyProps.expenseLabel,
    moneyTodayExpenseLabel: moneyProps.todayExpenseLabel,
    moneyBudgetLabel: moneyProps.budgetLabel,
  };
}

export function syncAllWidgets(input: WidgetSyncInput): void {
  const today = todayISO();
  // 위젯 하나가 실패해도 나머지 위젯과 앱에는 영향을 주지 않도록 하나씩 따로 보호한다.
  const jobs: [string, () => void][] = [
    ['todo', () => TodoWidget.updateSnapshot(buildTodoWidgetProps(input, today))],
    ['events', () => EventsWidget.updateSnapshot(buildEventsWidgetProps(input, today))],
    ['notes', () => NotesWidget.updateSnapshot(buildNotesWidgetProps(input, today))],
    ['habits', () => HabitsWidget.updateSnapshot(buildHabitsWidgetProps(input, today))],
    ['money', () => MoneyWidget.updateSnapshot(buildMoneyWidgetProps(input, today))],
    ['dashboard', () => DashboardWidget.updateSnapshot(buildDashboardWidgetProps(input, today))],
  ];
  for (const [, run] of jobs) {
    try {
      run();
    } catch {
      // Expo Go 등 위젯 네이티브 모듈이 없거나 갱신에 실패하면 조용히 넘어간다.
    }
  }
}
