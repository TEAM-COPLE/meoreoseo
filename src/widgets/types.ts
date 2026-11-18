export type WidgetColorScheme = 'light' | 'dark';

export type TodoWidgetItem = {
  id: string;
  title: string;
  dueLabel: string | null;
  isOverdue: boolean;
  done: boolean;
};

export type TodoWidgetProps = {
  colorScheme: WidgetColorScheme;
  dateLabel: string;
  pendingCount: number;
  doneTodayCount: number;
  items: TodoWidgetItem[];
};

export type EventWidgetItem = {
  id: string;
  title: string;
  timeLabel: string;
  isAllDay: boolean;
};

export type EventsWidgetProps = {
  colorScheme: WidgetColorScheme;
  dateLabel: string;
  totalCount: number;
  items: EventWidgetItem[];
};

export type NoteWidgetItem = {
  id: string;
  title: string;
  preview: string;
  pinned: boolean;
  updatedLabel: string;
};

export type NotesWidgetProps = {
  colorScheme: WidgetColorScheme;
  totalCount: number;
  items: NoteWidgetItem[];
};

export type HabitWidgetItem = {
  id: string;
  name: string;
  done: boolean;
  streak: number;
};

export type HabitsWidgetProps = {
  colorScheme: WidgetColorScheme;
  doneCount: number;
  totalCount: number;
  items: HabitWidgetItem[];
};

export type MoneyWidgetProps = {
  colorScheme: WidgetColorScheme;
  monthLabel: string;
  expenseLabel: string;
  incomeLabel: string;
  todayExpenseLabel: string;
  budgetLabel: string | null;
  budgetProgress: number | null;
  isOverBudget: boolean;
};

export type DashboardWidgetProps = {
  colorScheme: WidgetColorScheme;
  dateLabel: string;
  todoPendingCount: number;
  todos: { id: string; title: string; done: boolean }[];
  eventCount: number;
  events: { id: string; title: string; timeLabel: string }[];
  habitDoneCount: number;
  habitTotalCount: number;
  habits: { id: string; name: string; done: boolean; streak: number }[];
  latestNote: { id: string; title: string; preview: string; pinned: boolean } | null;
  moneyMonthExpenseLabel: string;
  moneyTodayExpenseLabel: string;
  moneyBudgetLabel: string | null;
};

/**
 * 위젯 추가 화면(갤러리) 미리보기와 첫 실행 전에 표시되는 기본값.
 * 앱이 실행되어 동기화되면 즉시 실제 사용자 데이터로 교체된다.
 */
export const INITIAL_TODO_WIDGET_PROPS: TodoWidgetProps = {
  colorScheme: 'light',
  dateLabel: '오늘',
  pendingCount: 3,
  doneTodayCount: 1,
  items: [
    { id: 'preview-1', title: '장보기 (우유, 계란)', dueLabel: '오늘', isOverdue: false, done: false },
    { id: 'preview-2', title: '회의 자료 정리하기', dueLabel: '오늘', isOverdue: false, done: false },
    { id: 'preview-3', title: '운동 30분', dueLabel: null, isOverdue: false, done: true },
  ],
};

export const INITIAL_EVENTS_WIDGET_PROPS: EventsWidgetProps = {
  colorScheme: 'light',
  dateLabel: '오늘 일정',
  totalCount: 2,
  items: [
    { id: 'preview-1', title: '팀 주간 미팅', timeLabel: '10:00 – 11:00', isAllDay: false },
    { id: 'preview-2', title: '치과 예약', timeLabel: '15:30', isAllDay: false },
  ],
};

export const INITIAL_NOTES_WIDGET_PROPS: NotesWidgetProps = {
  colorScheme: 'light',
  totalCount: 2,
  items: [
    {
      id: 'preview-1',
      title: '이번 주 목표',
      preview: '매일 물 2L 마시기, 책 20페이지 읽기',
      pinned: true,
      updatedLabel: '오늘',
    },
    {
      id: 'preview-2',
      title: '아이디어 메모',
      preview: '주말 나들이 준비물 체크리스트',
      pinned: false,
      updatedLabel: '어제',
    },
  ],
};

export const INITIAL_HABITS_WIDGET_PROPS: HabitsWidgetProps = {
  colorScheme: 'light',
  doneCount: 2,
  totalCount: 3,
  items: [
    { id: 'preview-1', name: '아침 스트레칭', done: true, streak: 7 },
    { id: 'preview-2', name: '물 1L 마시기', done: true, streak: 12 },
    { id: 'preview-3', name: '영단어 10개', done: false, streak: 4 },
  ],
};

export const INITIAL_MONEY_WIDGET_PROPS: MoneyWidgetProps = {
  colorScheme: 'light',
  monthLabel: '이번 달 가계부',
  expenseLabel: '428,000원',
  incomeLabel: '2,800,000원',
  todayExpenseLabel: '14,500원',
  budgetLabel: '남은 예산 372,000원',
  budgetProgress: 0.54,
  isOverBudget: false,
};

export const INITIAL_DASHBOARD_WIDGET_PROPS: DashboardWidgetProps = {
  colorScheme: 'light',
  dateLabel: '오늘',
  todoPendingCount: 2,
  todos: [
    { id: 'preview-1', title: '장보기 (우유, 계란)', done: false },
    { id: 'preview-2', title: '회의 자료 정리', done: false },
  ],
  eventCount: 2,
  events: [
    { id: 'preview-1', title: '팀 주간 미팅', timeLabel: '10:00' },
    { id: 'preview-2', title: '치과 예약', timeLabel: '15:30' },
  ],
  habitDoneCount: 2,
  habitTotalCount: 3,
  habits: [
    { id: 'preview-1', name: '아침 스트레칭', done: true, streak: 7 },
    { id: 'preview-2', name: '물 1L 마시기', done: false, streak: 4 },
  ],
  latestNote: {
    id: 'preview-1',
    title: '이번 주 목표',
    preview: '매일 물 2L 마시기, 책 20페이지 읽기',
    pinned: true,
  },
  moneyMonthExpenseLabel: '428,000원',
  moneyTodayExpenseLabel: '14,500원',
  moneyBudgetLabel: '남은 예산 372,000원',
};
