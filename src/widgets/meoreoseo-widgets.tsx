import {
  Box,
  Button,
  Column,
  FilledTonalButton,
  Row,
  Text,
  TextButton,
} from '@expo/ui/jetpack-compose';
import {
  background,
  cornerRadius,
  fillMaxSize,
  fillMaxWidth,
  padding,
  paddingAll,
} from '@expo/ui/jetpack-compose/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

export type WidgetTab = 'todos' | 'calendar' | 'habits' | 'notes' | 'money';

export type WidgetTodoItem = {
  id: string;
  title: string;
  dueLabel: string;
  done: boolean;
  priority: number;
};

export type WidgetEventItem = {
  id: string;
  title: string;
  dateLabel: string;
  timeLabel: string;
};

export type WidgetHabitItem = {
  id: string;
  name: string;
  streak: number;
  doneToday: boolean;
};

export type WidgetNoteItem = {
  id: string;
  title: string;
  preview: string;
  pinned: boolean;
};

export type WidgetTransactionItem = {
  id: string;
  category: string;
  memo: string;
  amountLabel: string;
  isIncome: boolean;
};

export type MeoreoseoWidgetProps = {
  activeTab: WidgetTab;
  isDark: boolean;
  todayLabel: string;
  openTodoCount: number;
  doneTodoCount: number;
  todos: WidgetTodoItem[];
  events: WidgetEventItem[];
  habitsDoneCount: number;
  habitsTotalCount: number;
  habits: WidgetHabitItem[];
  notes: WidgetNoteItem[];
  incomeAmount: number;
  expenseAmount: number;
  incomeLabel: string;
  expenseLabel: string;
  balanceLabel: string;
  transactions: WidgetTransactionItem[];
};

export const INITIAL_WIDGET_PROPS: MeoreoseoWidgetProps = {
  activeTab: 'todos',
  isDark: false,
  todayLabel: '오늘',
  openTodoCount: 0,
  doneTodoCount: 0,
  todos: [],
  events: [],
  habitsDoneCount: 0,
  habitsTotalCount: 0,
  habits: [],
  notes: [],
  incomeAmount: 0,
  expenseAmount: 0,
  incomeLabel: '0원',
  expenseLabel: '0원',
  balanceLabel: '0원',
  transactions: [],
};

/**
 * 1. 멀어서 통합 위젯 (할 일 · 일정 · 습관 · 메모 · 가계부 5가지 기능을 위젯 안에서 모두 전환·조작)
 */
const AllInOneWidgetLayout = (props: MeoreoseoWidgetProps, env: WidgetEnvironment) => {
  'widget';

  const dark = props.isDark ?? env.colorScheme === 'dark';
  const bg = dark ? '#0E0F11' : '#FFFFFF';
  const cardBg = dark ? '#1C1E21' : '#F2F3F5';
  const textPrimary = dark ? '#F2F3F5' : '#11181C';
  const textSecondary = dark ? '#A6ABB3' : '#60646C';
  const tint = dark ? '#8DA2FB' : '#3B5BDB';
  const onTint = dark ? '#0B1020' : '#FFFFFF';
  const danger = dark ? '#FF8787' : '#C92A2A';
  const success = dark ? '#5FD3A6' : '#0B7A55';

  const currentTab: WidgetTab = props.activeTab || 'todos';
  const todos = props.todos || [];
  const events = props.events || [];
  const habits = props.habits || [];
  const notes = props.notes || [];
  const transactions = props.transactions || [];

  const formatKoreanWon = (amount: number): string => {
    const sign = amount < 0 ? '-' : '';
    const abs = Math.abs(Math.trunc(amount));
    return `${sign}${String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}원`;
  };

  const applyQuickExpense = (category: string, amount: number): MeoreoseoWidgetProps => {
    const nextIncome = props.incomeAmount ?? 0;
    const nextExpense = (props.expenseAmount ?? 0) + amount;
    const nextTx: WidgetTransactionItem = {
      id: `quick_${category}_${nextExpense}`,
      category,
      memo: '위젯 빠른 기록',
      amountLabel: `-${formatKoreanWon(amount)}`,
      isIncome: false,
    };
    return {
      ...props,
      expenseAmount: nextExpense,
      expenseLabel: formatKoreanWon(nextExpense),
      balanceLabel: formatKoreanWon(nextIncome - nextExpense),
      transactions: [nextTx, ...transactions].slice(0, 4),
    };
  };

  const tabs: { key: WidgetTab; label: string }[] = [
    { key: 'todos', label: '할 일' },
    { key: 'calendar', label: '일정' },
    { key: 'habits', label: '습관' },
    { key: 'notes', label: '메모' },
    { key: 'money', label: '가계부' },
  ];

  return (
    <Column modifiers={[fillMaxSize(), cornerRadius(16), background(bg), paddingAll(12)]}>
      {/* 상단 5개 기능 전환 탭 막대 */}
      <Row modifiers={[fillMaxWidth(), padding(0, 0, 0, 8)]} verticalAlignment="center">
        {tabs.map((tab) => {
          const selected = currentTab === tab.key;
          return (
            <Box key={`action:tab:${tab.key}`} modifiers={[padding(0, 0, 4, 0)]}>
              <Button
                {...({ target: `btn__action:tab:${tab.key}` } as object)}
                colors={{
                  containerColor: selected ? tint : cardBg,
                  contentColor: selected ? onTint : textPrimary,
                }}
                contentPadding={{ start: 8, top: 4, end: 8, bottom: 4 }}
                onClick={() => ({ ...props, activeTab: tab.key })}>
                <Text
                  color={selected ? onTint : textPrimary}
                  style={{ fontSize: 12, fontWeight: selected ? 'bold' : 'normal' }}>
                  {tab.label}
                </Text>
              </Button>
            </Box>
          );
        })}
      </Row>

      {/* 1. 할 일 탭 */}
      {currentTab === 'todos' ? (
        <Column modifiers={[fillMaxWidth()]}>
          <Row modifiers={[fillMaxWidth(), padding(0, 0, 0, 6)]} verticalAlignment="center">
            <Text color={textSecondary} style={{ fontSize: 12, fontWeight: 'bold' }}>
              {`진행 중 ${props.openTodoCount ?? 0} · 완료 ${props.doneTodoCount ?? 0}`}
            </Text>
            <Box key="action:open:todos:add" modifiers={[padding(8, 0, 0, 0)]}>
              <FilledTonalButton
                {...({ target: 'btn__action:open:todos:add' } as object)}
                colors={{ containerColor: cardBg, contentColor: tint }}
                contentPadding={{ start: 8, top: 2, end: 8, bottom: 2 }}
                onClick={() => ({ ...props })}>
                <Text color={tint} style={{ fontSize: 11, fontWeight: 'bold' }}>
                  + 할 일 추가
                </Text>
              </FilledTonalButton>
            </Box>
          </Row>

          {todos.length === 0 ? (
            <Box modifiers={[fillMaxWidth(), cornerRadius(12), background(cardBg), paddingAll(12)]}>
              <Text color={textSecondary} style={{ fontSize: 13 }}>
                등록된 할 일이 없습니다. 위쪽 버튼으로 추가해 보세요.
              </Text>
            </Box>
          ) : (
            todos.slice(0, 4).map((todo) => (
              <Row
                key={`todo_row_${todo.id}`}
                modifiers={[fillMaxWidth(), padding(0, 2, 0, 2)]}
                verticalAlignment="center">
                <Box key={`action:todo:toggle:${todo.id}`} modifiers={[padding(0, 0, 8, 0)]}>
                  <Button
                    {...({ target: `btn__action:todo:toggle:${todo.id}` } as object)}
                    colors={{
                      containerColor: todo.done ? tint : cardBg,
                      contentColor: todo.done ? onTint : textPrimary,
                    }}
                    contentPadding={{ start: 8, top: 4, end: 8, bottom: 4 }}
                    onClick={() => {
                      const nextTodos = todos.map((item) =>
                        item.id === todo.id ? { ...item, done: !item.done } : item,
                      );
                      return {
                        ...props,
                        todos: nextTodos,
                        openTodoCount: nextTodos.filter((item) => !item.done).length,
                        doneTodoCount: nextTodos.filter((item) => item.done).length,
                      };
                    }}>
                    <Text
                      color={todo.done ? onTint : textPrimary}
                      style={{ fontSize: 12, fontWeight: 'bold' }}>
                      {todo.done ? '✓' : '○'}
                    </Text>
                  </Button>
                </Box>
                <Box key={`action:open:todo:${todo.id}`} modifiers={[fillMaxWidth()]}>
                  <TextButton
                    {...({ target: `btn__action:open:todo:${todo.id}` } as object)}
                    colors={{ contentColor: todo.done ? textSecondary : textPrimary }}
                    contentPadding={{ start: 2, top: 2, end: 2, bottom: 2 }}
                    onClick={() => ({ ...props })}>
                    <Text
                      color={todo.done ? textSecondary : textPrimary}
                      maxLines={1}
                      style={{
                        fontSize: 13,
                        fontWeight: 'bold',
                        textDecoration: todo.done ? 'lineThrough' : 'none',
                      }}>
                      {todo.dueLabel ? `${todo.title} (${todo.dueLabel})` : todo.title}
                    </Text>
                  </TextButton>
                </Box>
              </Row>
            ))
          )}
        </Column>
      ) : null}

      {/* 2. 일정 탭 */}
      {currentTab === 'calendar' ? (
        <Column modifiers={[fillMaxWidth()]}>
          <Row modifiers={[fillMaxWidth(), padding(0, 0, 0, 6)]} verticalAlignment="center">
            <Text color={textSecondary} style={{ fontSize: 12, fontWeight: 'bold' }}>
              {props.todayLabel || '이번 달 일정'}
            </Text>
            <Box key="action:open:calendar:add" modifiers={[padding(8, 0, 0, 0)]}>
              <FilledTonalButton
                {...({ target: 'btn__action:open:calendar:add' } as object)}
                colors={{ containerColor: cardBg, contentColor: tint }}
                contentPadding={{ start: 8, top: 2, end: 8, bottom: 2 }}
                onClick={() => ({ ...props })}>
                <Text color={tint} style={{ fontSize: 11, fontWeight: 'bold' }}>
                  + 일정 추가
                </Text>
              </FilledTonalButton>
            </Box>
          </Row>

          {events.length === 0 ? (
            <Box modifiers={[fillMaxWidth(), cornerRadius(12), background(cardBg), paddingAll(12)]}>
              <Text color={textSecondary} style={{ fontSize: 13 }}>
                예정된 일정이 없습니다. 위쪽 버튼으로 추가해 보세요.
              </Text>
            </Box>
          ) : (
            events.slice(0, 4).map((event) => (
              <Box
                key={`action:open:event:${event.id}`}
                modifiers={[fillMaxWidth(), padding(0, 2, 0, 2)]}>
                <Button
                  {...({ target: `btn__action:open:event:${event.id}` } as object)}
                  colors={{ containerColor: cardBg, contentColor: textPrimary }}
                  contentPadding={{ start: 10, top: 6, end: 10, bottom: 6 }}
                  onClick={() => ({ ...props })}>
                  <Text color={textPrimary} maxLines={1} style={{ fontSize: 12, fontWeight: 'bold' }}>
                    {`${event.dateLabel} · ${event.timeLabel}  ${event.title}`}
                  </Text>
                </Button>
              </Box>
            ))
          )}
        </Column>
      ) : null}

      {/* 3. 습관 탭 */}
      {currentTab === 'habits' ? (
        <Column modifiers={[fillMaxWidth()]}>
          <Row modifiers={[fillMaxWidth(), padding(0, 0, 0, 6)]} verticalAlignment="center">
            <Text color={textSecondary} style={{ fontSize: 12, fontWeight: 'bold' }}>
              {`오늘 실천 ${props.habitsDoneCount ?? 0} / ${props.habitsTotalCount ?? 0}`}
            </Text>
            <Box key="action:open:habits:add" modifiers={[padding(8, 0, 0, 0)]}>
              <FilledTonalButton
                {...({ target: 'btn__action:open:habits:add' } as object)}
                colors={{ containerColor: cardBg, contentColor: tint }}
                contentPadding={{ start: 8, top: 2, end: 8, bottom: 2 }}
                onClick={() => ({ ...props })}>
                <Text color={tint} style={{ fontSize: 11, fontWeight: 'bold' }}>
                  + 습관 추가
                </Text>
              </FilledTonalButton>
            </Box>
          </Row>

          {habits.length === 0 ? (
            <Box modifiers={[fillMaxWidth(), cornerRadius(12), background(cardBg), paddingAll(12)]}>
              <Text color={textSecondary} style={{ fontSize: 13 }}>
                아직 등록된 습관이 없습니다. 위쪽 버튼으로 추가해 보세요.
              </Text>
            </Box>
          ) : (
            habits.slice(0, 4).map((habit) => (
              <Row
                key={`habit_row_${habit.id}`}
                modifiers={[fillMaxWidth(), padding(0, 2, 0, 2)]}
                verticalAlignment="center">
                <Box key={`action:habit:toggle:${habit.id}`} modifiers={[padding(0, 0, 8, 0)]}>
                  <Button
                    {...({ target: `btn__action:habit:toggle:${habit.id}` } as object)}
                    colors={{
                      containerColor: habit.doneToday ? tint : cardBg,
                      contentColor: habit.doneToday ? onTint : textPrimary,
                    }}
                    contentPadding={{ start: 8, top: 4, end: 8, bottom: 4 }}
                    onClick={() => {
                      const nextHabits = habits.map((item) => {
                        if (item.id !== habit.id) return item;
                        const nextDone = !item.doneToday;
                        const nextStreak = nextDone
                          ? item.streak + 1
                          : Math.max(0, item.streak - 1);
                        return { ...item, doneToday: nextDone, streak: nextStreak };
                      });
                      return {
                        ...props,
                        habits: nextHabits,
                        habitsDoneCount: nextHabits.filter((item) => item.doneToday).length,
                      };
                    }}>
                    <Text
                      color={habit.doneToday ? onTint : textPrimary}
                      style={{ fontSize: 12, fontWeight: 'bold' }}>
                      {habit.doneToday ? '✓ 완료' : '실천'}
                    </Text>
                  </Button>
                </Box>
                <Box key={`action:open:habit:${habit.id}`} modifiers={[fillMaxWidth()]}>
                  <TextButton
                    {...({ target: `btn__action:open:habit:${habit.id}` } as object)}
                    colors={{ contentColor: textPrimary }}
                    contentPadding={{ start: 2, top: 2, end: 2, bottom: 2 }}
                    onClick={() => ({ ...props })}>
                    <Text color={textPrimary} maxLines={1} style={{ fontSize: 13, fontWeight: 'bold' }}>
                      {habit.streak > 0
                        ? `${habit.name} (${habit.streak}일 연속)`
                        : habit.name}
                    </Text>
                  </TextButton>
                </Box>
              </Row>
            ))
          )}
        </Column>
      ) : null}

      {/* 4. 메모 탭 */}
      {currentTab === 'notes' ? (
        <Column modifiers={[fillMaxWidth()]}>
          <Row modifiers={[fillMaxWidth(), padding(0, 0, 0, 6)]} verticalAlignment="center">
            <Text color={textSecondary} style={{ fontSize: 12, fontWeight: 'bold' }}>
              {`메모 ${notes.length}개`}
            </Text>
            <Box key="action:open:note:new" modifiers={[padding(8, 0, 0, 0)]}>
              <FilledTonalButton
                {...({ target: 'btn__action:open:note:new' } as object)}
                colors={{ containerColor: cardBg, contentColor: tint }}
                contentPadding={{ start: 8, top: 2, end: 8, bottom: 2 }}
                onClick={() => ({ ...props })}>
                <Text color={tint} style={{ fontSize: 11, fontWeight: 'bold' }}>
                  + 새 메모
                </Text>
              </FilledTonalButton>
            </Box>
          </Row>

          {notes.length === 0 ? (
            <Box modifiers={[fillMaxWidth(), cornerRadius(12), background(cardBg), paddingAll(12)]}>
              <Text color={textSecondary} style={{ fontSize: 13 }}>
                작성된 메모가 없습니다. 위쪽 버튼으로 작성해 보세요.
              </Text>
            </Box>
          ) : (
            notes.slice(0, 3).map((note) => (
              <Row
                key={`note_row_${note.id}`}
                modifiers={[fillMaxWidth(), padding(0, 2, 0, 2)]}
                verticalAlignment="center">
                <Box key={`action:note:pin:${note.id}`} modifiers={[padding(0, 0, 6, 0)]}>
                  <Button
                    {...({ target: `btn__action:note:pin:${note.id}` } as object)}
                    colors={{
                      containerColor: note.pinned ? tint : cardBg,
                      contentColor: note.pinned ? onTint : textSecondary,
                    }}
                    contentPadding={{ start: 6, top: 3, end: 6, bottom: 3 }}
                    onClick={() => ({
                      ...props,
                      notes: notes.map((item) =>
                        item.id === note.id ? { ...item, pinned: !item.pinned } : item,
                      ),
                    })}>
                    <Text
                      color={note.pinned ? onTint : textSecondary}
                      style={{ fontSize: 11, fontWeight: 'bold' }}>
                      {note.pinned ? '고정됨' : '고정'}
                    </Text>
                  </Button>
                </Box>
                <Box key={`action:open:note:${note.id}`} modifiers={[fillMaxWidth()]}>
                  <TextButton
                    {...({ target: `btn__action:open:note:${note.id}` } as object)}
                    colors={{ contentColor: textPrimary }}
                    contentPadding={{ start: 4, top: 2, end: 4, bottom: 2 }}
                    onClick={() => ({ ...props })}>
                    <Text color={textPrimary} maxLines={1} style={{ fontSize: 13, fontWeight: 'bold' }}>
                      {note.preview ? `${note.title} — ${note.preview}` : note.title}
                    </Text>
                  </TextButton>
                </Box>
              </Row>
            ))
          )}
        </Column>
      ) : null}

      {/* 5. 가계부 탭 */}
      {currentTab === 'money' ? (
        <Column modifiers={[fillMaxWidth()]}>
          <Box
            modifiers={[
              fillMaxWidth(),
              cornerRadius(12),
              background(cardBg),
              padding(10, 8, 10, 8),
            ]}>
            <Row modifiers={[fillMaxWidth()]} verticalAlignment="center">
              <Column modifiers={[padding(0, 0, 12, 0)]}>
                <Text color={textSecondary} style={{ fontSize: 11 }}>
                  이번 달 수입
                </Text>
                <Text color={success} style={{ fontSize: 13, fontWeight: 'bold' }}>
                  {props.incomeLabel || '0원'}
                </Text>
              </Column>
              <Column modifiers={[padding(0, 0, 12, 0)]}>
                <Text color={textSecondary} style={{ fontSize: 11 }}>
                  이번 달 지출
                </Text>
                <Text color={danger} style={{ fontSize: 13, fontWeight: 'bold' }}>
                  {props.expenseLabel || '0원'}
                </Text>
              </Column>
              <Column>
                <Text color={textSecondary} style={{ fontSize: 11 }}>
                  남은 돈
                </Text>
                <Text color={textPrimary} style={{ fontSize: 13, fontWeight: 'bold' }}>
                  {props.balanceLabel || '0원'}
                </Text>
              </Column>
            </Row>
          </Box>

          {/* 위젯에서 원터치로 바로 지출 기록하기 + 가계부 추가 창 열기 */}
          <Row modifiers={[fillMaxWidth(), padding(0, 6, 0, 6)]} verticalAlignment="center">
            <Box key="action:money:quick:식비:10000" modifiers={[padding(0, 0, 4, 0)]}>
              <Button
                {...({ target: 'btn__action:money:quick:식비:10000' } as object)}
                colors={{ containerColor: cardBg, contentColor: textPrimary }}
                contentPadding={{ start: 6, top: 3, end: 6, bottom: 3 }}
                onClick={() => applyQuickExpense('식비', 10000)}>
                <Text color={textPrimary} style={{ fontSize: 11 }}>
                  +식비 1만
                </Text>
              </Button>
            </Box>
            <Box key="action:money:quick:교통:1500" modifiers={[padding(0, 0, 4, 0)]}>
              <Button
                {...({ target: 'btn__action:money:quick:교통:1500' } as object)}
                colors={{ containerColor: cardBg, contentColor: textPrimary }}
                contentPadding={{ start: 6, top: 3, end: 6, bottom: 3 }}
                onClick={() => applyQuickExpense('교통', 1500)}>
                <Text color={textPrimary} style={{ fontSize: 11 }}>
                  +교통 1,500
                </Text>
              </Button>
            </Box>
            <Box key="action:open:money:add">
              <FilledTonalButton
                {...({ target: 'btn__action:open:money:add' } as object)}
                colors={{ containerColor: tint, contentColor: onTint }}
                contentPadding={{ start: 8, top: 3, end: 8, bottom: 3 }}
                onClick={() => ({ ...props })}>
                <Text color={onTint} style={{ fontSize: 11, fontWeight: 'bold' }}>
                  + 가계부 추가
                </Text>
              </FilledTonalButton>
            </Box>
          </Row>

          {transactions.slice(0, 2).map((tx) => (
            <Box
              key={`action:open:tx:${tx.id}`}
              modifiers={[fillMaxWidth(), padding(0, 1, 0, 1)]}>
              <TextButton
                {...({ target: `btn__action:open:tx:${tx.id}` } as object)}
                colors={{ contentColor: textPrimary }}
                contentPadding={{ start: 2, top: 2, end: 2, bottom: 2 }}
                onClick={() => ({ ...props })}>
                <Text
                  color={tx.isIncome ? success : textPrimary}
                  maxLines={1}
                  style={{ fontSize: 12, fontWeight: 'bold' }}>
                  {tx.memo
                    ? `${tx.category} (${tx.memo})  ${tx.amountLabel}`
                    : `${tx.category}  ${tx.amountLabel}`}
                </Text>
              </TextButton>
            </Box>
          ))}
        </Column>
      ) : null}
    </Column>
  );
};

/**
 * 2. 멀어서 · 할 일 단독 위젯
 */
const TodosWidgetLayout = (props: MeoreoseoWidgetProps, env: WidgetEnvironment) => {
  'widget';

  const dark = props.isDark ?? env.colorScheme === 'dark';
  const bg = dark ? '#0E0F11' : '#FFFFFF';
  const cardBg = dark ? '#1C1E21' : '#F2F3F5';
  const textPrimary = dark ? '#F2F3F5' : '#11181C';
  const textSecondary = dark ? '#A6ABB3' : '#60646C';
  const tint = dark ? '#8DA2FB' : '#3B5BDB';
  const onTint = dark ? '#0B1020' : '#FFFFFF';

  const todos = props.todos || [];

  return (
    <Column modifiers={[fillMaxSize(), cornerRadius(16), background(bg), paddingAll(12)]}>
      <Row modifiers={[fillMaxWidth(), padding(0, 0, 0, 8)]} verticalAlignment="center">
        <Box key="action:open:todos:list" modifiers={[padding(0, 0, 6, 0)]}>
          <TextButton
            {...({ target: 'btn__action:open:todos:list' } as object)}
            colors={{ contentColor: textPrimary }}
            contentPadding={{ start: 2, top: 2, end: 4, bottom: 2 }}
            onClick={() => ({ ...props })}>
            <Text color={textPrimary} style={{ fontSize: 14, fontWeight: 'bold' }}>
              할 일
            </Text>
          </TextButton>
        </Box>
        <Text color={textSecondary} style={{ fontSize: 12, fontWeight: 'bold' }}>
          {`진행 중 ${props.openTodoCount ?? 0} · 완료 ${props.doneTodoCount ?? 0}`}
        </Text>
        <Box key="action:open:todos:add" modifiers={[padding(8, 0, 0, 0)]}>
          <FilledTonalButton
            {...({ target: 'btn__action:open:todos:add' } as object)}
            colors={{ containerColor: tint, contentColor: onTint }}
            contentPadding={{ start: 8, top: 3, end: 8, bottom: 3 }}
            onClick={() => ({ ...props })}>
            <Text color={onTint} style={{ fontSize: 11, fontWeight: 'bold' }}>
              + 할 일 추가
            </Text>
          </FilledTonalButton>
        </Box>
      </Row>

      {todos.length === 0 ? (
        <Box modifiers={[fillMaxWidth(), cornerRadius(12), background(cardBg), paddingAll(12)]}>
          <Text color={textSecondary} style={{ fontSize: 13 }}>
            등록된 할 일이 없습니다. &quot;+ 할 일 추가&quot;를 눌러 시작해 보세요.
          </Text>
        </Box>
      ) : (
        todos.slice(0, 5).map((todo) => (
          <Row
            key={`todo_only_row_${todo.id}`}
            modifiers={[fillMaxWidth(), padding(0, 2, 0, 2)]}
            verticalAlignment="center">
            <Box key={`action:todo:toggle:${todo.id}`} modifiers={[padding(0, 0, 8, 0)]}>
              <Button
                {...({ target: `btn__action:todo:toggle:${todo.id}` } as object)}
                colors={{
                  containerColor: todo.done ? tint : cardBg,
                  contentColor: todo.done ? onTint : textPrimary,
                }}
                contentPadding={{ start: 8, top: 4, end: 8, bottom: 4 }}
                onClick={() => {
                  const nextTodos = todos.map((item) =>
                    item.id === todo.id ? { ...item, done: !item.done } : item,
                  );
                  return {
                    ...props,
                    todos: nextTodos,
                    openTodoCount: nextTodos.filter((item) => !item.done).length,
                    doneTodoCount: nextTodos.filter((item) => item.done).length,
                  };
                }}>
                <Text
                  color={todo.done ? onTint : textPrimary}
                  style={{ fontSize: 12, fontWeight: 'bold' }}>
                  {todo.done ? '✓' : '○'}
                </Text>
              </Button>
            </Box>
            <Box key={`action:open:todo:${todo.id}`} modifiers={[fillMaxWidth()]}>
              <TextButton
                {...({ target: `btn__action:open:todo:${todo.id}` } as object)}
                colors={{ contentColor: todo.done ? textSecondary : textPrimary }}
                contentPadding={{ start: 2, top: 2, end: 2, bottom: 2 }}
                onClick={() => ({ ...props })}>
                <Text
                  color={todo.done ? textSecondary : textPrimary}
                  maxLines={1}
                  style={{
                    fontSize: 13,
                    fontWeight: 'bold',
                    textDecoration: todo.done ? 'lineThrough' : 'none',
                  }}>
                  {todo.dueLabel ? `${todo.title} (${todo.dueLabel})` : todo.title}
                </Text>
              </TextButton>
            </Box>
          </Row>
        ))
      )}
    </Column>
  );
};

/**
 * 3. 멀어서 · 일정 단독 위젯
 */
const CalendarWidgetLayout = (props: MeoreoseoWidgetProps, env: WidgetEnvironment) => {
  'widget';

  const dark = props.isDark ?? env.colorScheme === 'dark';
  const bg = dark ? '#0E0F11' : '#FFFFFF';
  const cardBg = dark ? '#1C1E21' : '#F2F3F5';
  const textPrimary = dark ? '#F2F3F5' : '#11181C';
  const textSecondary = dark ? '#A6ABB3' : '#60646C';
  const tint = dark ? '#8DA2FB' : '#3B5BDB';
  const onTint = dark ? '#0B1020' : '#FFFFFF';

  const events = props.events || [];

  return (
    <Column modifiers={[fillMaxSize(), cornerRadius(16), background(bg), paddingAll(12)]}>
      <Row modifiers={[fillMaxWidth(), padding(0, 0, 0, 8)]} verticalAlignment="center">
        <Box key="action:open:calendar:list" modifiers={[padding(0, 0, 6, 0)]}>
          <TextButton
            {...({ target: 'btn__action:open:calendar:list' } as object)}
            colors={{ contentColor: textPrimary }}
            contentPadding={{ start: 2, top: 2, end: 4, bottom: 2 }}
            onClick={() => ({ ...props })}>
            <Text color={textPrimary} style={{ fontSize: 14, fontWeight: 'bold' }}>
              일정
            </Text>
          </TextButton>
        </Box>
        <Text color={textSecondary} style={{ fontSize: 12, fontWeight: 'bold' }}>
          {props.todayLabel || '이번 달 일정'}
        </Text>
        <Box key="action:open:calendar:add" modifiers={[padding(8, 0, 0, 0)]}>
          <FilledTonalButton
            {...({ target: 'btn__action:open:calendar:add' } as object)}
            colors={{ containerColor: tint, contentColor: onTint }}
            contentPadding={{ start: 8, top: 3, end: 8, bottom: 3 }}
            onClick={() => ({ ...props })}>
            <Text color={onTint} style={{ fontSize: 11, fontWeight: 'bold' }}>
              + 일정 추가
            </Text>
          </FilledTonalButton>
        </Box>
      </Row>

      {events.length === 0 ? (
        <Box modifiers={[fillMaxWidth(), cornerRadius(12), background(cardBg), paddingAll(12)]}>
          <Text color={textSecondary} style={{ fontSize: 13 }}>
            예정된 일정이 없습니다. &quot;+ 일정 추가&quot;를 눌러 등록해 보세요.
          </Text>
        </Box>
      ) : (
        events.slice(0, 4).map((event) => (
          <Box
            key={`action:open:event:${event.id}`}
            modifiers={[fillMaxWidth(), padding(0, 2, 0, 2)]}>
            <Button
              {...({ target: `btn__action:open:event:${event.id}` } as object)}
              colors={{ containerColor: cardBg, contentColor: textPrimary }}
              contentPadding={{ start: 10, top: 6, end: 10, bottom: 6 }}
              onClick={() => ({ ...props })}>
              <Text color={textPrimary} maxLines={1} style={{ fontSize: 12, fontWeight: 'bold' }}>
                {`${event.dateLabel} · ${event.timeLabel}  ${event.title}`}
              </Text>
            </Button>
          </Box>
        ))
      )}
    </Column>
  );
};

/**
 * 4. 멀어서 · 습관 단독 위젯
 */
const HabitsWidgetLayout = (props: MeoreoseoWidgetProps, env: WidgetEnvironment) => {
  'widget';

  const dark = props.isDark ?? env.colorScheme === 'dark';
  const bg = dark ? '#0E0F11' : '#FFFFFF';
  const cardBg = dark ? '#1C1E21' : '#F2F3F5';
  const textPrimary = dark ? '#F2F3F5' : '#11181C';
  const textSecondary = dark ? '#A6ABB3' : '#60646C';
  const tint = dark ? '#8DA2FB' : '#3B5BDB';
  const onTint = dark ? '#0B1020' : '#FFFFFF';

  const habits = props.habits || [];

  return (
    <Column modifiers={[fillMaxSize(), cornerRadius(16), background(bg), paddingAll(12)]}>
      <Row modifiers={[fillMaxWidth(), padding(0, 0, 0, 8)]} verticalAlignment="center">
        <Box key="action:open:habits:list" modifiers={[padding(0, 0, 6, 0)]}>
          <TextButton
            {...({ target: 'btn__action:open:habits:list' } as object)}
            colors={{ contentColor: textPrimary }}
            contentPadding={{ start: 2, top: 2, end: 4, bottom: 2 }}
            onClick={() => ({ ...props })}>
            <Text color={textPrimary} style={{ fontSize: 14, fontWeight: 'bold' }}>
              습관
            </Text>
          </TextButton>
        </Box>
        <Text color={textSecondary} style={{ fontSize: 12, fontWeight: 'bold' }}>
          {`오늘 실천 ${props.habitsDoneCount ?? 0} / ${props.habitsTotalCount ?? 0}`}
        </Text>
        <Box key="action:open:habits:add" modifiers={[padding(8, 0, 0, 0)]}>
          <FilledTonalButton
            {...({ target: 'btn__action:open:habits:add' } as object)}
            colors={{ containerColor: tint, contentColor: onTint }}
            contentPadding={{ start: 8, top: 3, end: 8, bottom: 3 }}
            onClick={() => ({ ...props })}>
            <Text color={onTint} style={{ fontSize: 11, fontWeight: 'bold' }}>
              + 습관 추가
            </Text>
          </FilledTonalButton>
        </Box>
      </Row>

      {habits.length === 0 ? (
        <Box modifiers={[fillMaxWidth(), cornerRadius(12), background(cardBg), paddingAll(12)]}>
          <Text color={textSecondary} style={{ fontSize: 13 }}>
            등록된 습관이 없습니다. &quot;+ 습관 추가&quot;를 눌러 시작해 보세요.
          </Text>
        </Box>
      ) : (
        habits.slice(0, 5).map((habit) => (
          <Row
            key={`habit_only_row_${habit.id}`}
            modifiers={[fillMaxWidth(), padding(0, 2, 0, 2)]}
            verticalAlignment="center">
            <Box key={`action:habit:toggle:${habit.id}`} modifiers={[padding(0, 0, 8, 0)]}>
              <Button
                {...({ target: `btn__action:habit:toggle:${habit.id}` } as object)}
                colors={{
                  containerColor: habit.doneToday ? tint : cardBg,
                  contentColor: habit.doneToday ? onTint : textPrimary,
                }}
                contentPadding={{ start: 8, top: 4, end: 8, bottom: 4 }}
                onClick={() => {
                  const nextHabits = habits.map((item) => {
                    if (item.id !== habit.id) return item;
                    const nextDone = !item.doneToday;
                    const nextStreak = nextDone
                      ? item.streak + 1
                      : Math.max(0, item.streak - 1);
                    return { ...item, doneToday: nextDone, streak: nextStreak };
                  });
                  return {
                    ...props,
                    habits: nextHabits,
                    habitsDoneCount: nextHabits.filter((item) => item.doneToday).length,
                  };
                }}>
                <Text
                  color={habit.doneToday ? onTint : textPrimary}
                  style={{ fontSize: 12, fontWeight: 'bold' }}>
                  {habit.doneToday ? '✓ 완료' : '실천'}
                </Text>
              </Button>
            </Box>
            <Box key={`action:open:habit:${habit.id}`} modifiers={[fillMaxWidth()]}>
              <TextButton
                {...({ target: `btn__action:open:habit:${habit.id}` } as object)}
                colors={{ contentColor: textPrimary }}
                contentPadding={{ start: 2, top: 2, end: 2, bottom: 2 }}
                onClick={() => ({ ...props })}>
                <Text color={textPrimary} maxLines={1} style={{ fontSize: 13, fontWeight: 'bold' }}>
                  {habit.streak > 0 ? `${habit.name} (${habit.streak}일 연속)` : habit.name}
                </Text>
              </TextButton>
            </Box>
          </Row>
        ))
      )}
    </Column>
  );
};

/**
 * 5. 멀어서 · 메모 단독 위젯
 */
const NotesWidgetLayout = (props: MeoreoseoWidgetProps, env: WidgetEnvironment) => {
  'widget';

  const dark = props.isDark ?? env.colorScheme === 'dark';
  const bg = dark ? '#0E0F11' : '#FFFFFF';
  const cardBg = dark ? '#1C1E21' : '#F2F3F5';
  const textPrimary = dark ? '#F2F3F5' : '#11181C';
  const textSecondary = dark ? '#A6ABB3' : '#60646C';
  const tint = dark ? '#8DA2FB' : '#3B5BDB';
  const onTint = dark ? '#0B1020' : '#FFFFFF';

  const notes = props.notes || [];

  return (
    <Column modifiers={[fillMaxSize(), cornerRadius(16), background(bg), paddingAll(12)]}>
      <Row modifiers={[fillMaxWidth(), padding(0, 0, 0, 8)]} verticalAlignment="center">
        <Box key="action:open:notes:list" modifiers={[padding(0, 0, 6, 0)]}>
          <TextButton
            {...({ target: 'btn__action:open:notes:list' } as object)}
            colors={{ contentColor: textPrimary }}
            contentPadding={{ start: 2, top: 2, end: 4, bottom: 2 }}
            onClick={() => ({ ...props })}>
            <Text color={textPrimary} style={{ fontSize: 14, fontWeight: 'bold' }}>
              메모
            </Text>
          </TextButton>
        </Box>
        <Text color={textSecondary} style={{ fontSize: 12, fontWeight: 'bold' }}>
          {`${notes.length}개`}
        </Text>
        <Box key="action:open:note:new" modifiers={[padding(8, 0, 0, 0)]}>
          <FilledTonalButton
            {...({ target: 'btn__action:open:note:new' } as object)}
            colors={{ containerColor: tint, contentColor: onTint }}
            contentPadding={{ start: 8, top: 3, end: 8, bottom: 3 }}
            onClick={() => ({ ...props })}>
            <Text color={onTint} style={{ fontSize: 11, fontWeight: 'bold' }}>
              + 새 메모
            </Text>
          </FilledTonalButton>
        </Box>
      </Row>

      {notes.length === 0 ? (
        <Box modifiers={[fillMaxWidth(), cornerRadius(12), background(cardBg), paddingAll(12)]}>
          <Text color={textSecondary} style={{ fontSize: 13 }}>
            작성된 메모가 없습니다. &quot;+ 새 메모&quot;를 눌러 작성해 보세요.
          </Text>
        </Box>
      ) : (
        notes.slice(0, 4).map((note) => (
          <Row
            key={`note_only_row_${note.id}`}
            modifiers={[fillMaxWidth(), padding(0, 2, 0, 2)]}
            verticalAlignment="center">
            <Box key={`action:note:pin:${note.id}`} modifiers={[padding(0, 0, 6, 0)]}>
              <Button
                {...({ target: `btn__action:note:pin:${note.id}` } as object)}
                colors={{
                  containerColor: note.pinned ? tint : cardBg,
                  contentColor: note.pinned ? onTint : textSecondary,
                }}
                contentPadding={{ start: 6, top: 3, end: 6, bottom: 3 }}
                onClick={() => ({
                  ...props,
                  notes: notes.map((item) =>
                    item.id === note.id ? { ...item, pinned: !item.pinned } : item,
                  ),
                })}>
                <Text
                  color={note.pinned ? onTint : textSecondary}
                  style={{ fontSize: 11, fontWeight: 'bold' }}>
                  {note.pinned ? '고정됨' : '고정'}
                </Text>
              </Button>
            </Box>
            <Box key={`action:open:note:${note.id}`} modifiers={[fillMaxWidth()]}>
              <TextButton
                {...({ target: `btn__action:open:note:${note.id}` } as object)}
                colors={{ contentColor: textPrimary }}
                contentPadding={{ start: 4, top: 2, end: 4, bottom: 2 }}
                onClick={() => ({ ...props })}>
                <Text color={textPrimary} maxLines={1} style={{ fontSize: 13, fontWeight: 'bold' }}>
                  {note.preview ? `${note.title} — ${note.preview}` : note.title}
                </Text>
              </TextButton>
            </Box>
          </Row>
        ))
      )}
    </Column>
  );
};

/**
 * 6. 멀어서 · 가계부 단독 위젯
 */
const MoneyWidgetLayout = (props: MeoreoseoWidgetProps, env: WidgetEnvironment) => {
  'widget';

  const dark = props.isDark ?? env.colorScheme === 'dark';
  const bg = dark ? '#0E0F11' : '#FFFFFF';
  const cardBg = dark ? '#1C1E21' : '#F2F3F5';
  const textPrimary = dark ? '#F2F3F5' : '#11181C';
  const textSecondary = dark ? '#A6ABB3' : '#60646C';
  const tint = dark ? '#8DA2FB' : '#3B5BDB';
  const onTint = dark ? '#0B1020' : '#FFFFFF';
  const danger = dark ? '#FF8787' : '#C92A2A';
  const success = dark ? '#5FD3A6' : '#0B7A55';

  const transactions = props.transactions || [];

  const formatKoreanWon = (amount: number): string => {
    const sign = amount < 0 ? '-' : '';
    const abs = Math.abs(Math.trunc(amount));
    return `${sign}${String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}원`;
  };

  const applyQuickExpense = (category: string, amount: number): MeoreoseoWidgetProps => {
    const nextIncome = props.incomeAmount ?? 0;
    const nextExpense = (props.expenseAmount ?? 0) + amount;
    const nextTx: WidgetTransactionItem = {
      id: `quick_${category}_${nextExpense}`,
      category,
      memo: '위젯 빠른 기록',
      amountLabel: `-${formatKoreanWon(amount)}`,
      isIncome: false,
    };
    return {
      ...props,
      expenseAmount: nextExpense,
      expenseLabel: formatKoreanWon(nextExpense),
      balanceLabel: formatKoreanWon(nextIncome - nextExpense),
      transactions: [nextTx, ...transactions].slice(0, 4),
    };
  };

  return (
    <Column modifiers={[fillMaxSize(), cornerRadius(16), background(bg), paddingAll(12)]}>
      <Row modifiers={[fillMaxWidth(), padding(0, 0, 0, 6)]} verticalAlignment="center">
        <Box key="action:open:money:list" modifiers={[padding(0, 0, 6, 0)]}>
          <TextButton
            {...({ target: 'btn__action:open:money:list' } as object)}
            colors={{ contentColor: textPrimary }}
            contentPadding={{ start: 2, top: 2, end: 4, bottom: 2 }}
            onClick={() => ({ ...props })}>
            <Text color={textPrimary} style={{ fontSize: 14, fontWeight: 'bold' }}>
              가계부
            </Text>
          </TextButton>
        </Box>
        <Box key="action:open:money:add" modifiers={[padding(4, 0, 0, 0)]}>
          <FilledTonalButton
            {...({ target: 'btn__action:open:money:add' } as object)}
            colors={{ containerColor: tint, contentColor: onTint }}
            contentPadding={{ start: 8, top: 3, end: 8, bottom: 3 }}
            onClick={() => ({ ...props })}>
            <Text color={onTint} style={{ fontSize: 11, fontWeight: 'bold' }}>
              + 가계부 추가
            </Text>
          </FilledTonalButton>
        </Box>
      </Row>

      <Box
        modifiers={[
          fillMaxWidth(),
          cornerRadius(12),
          background(cardBg),
          padding(10, 8, 10, 8),
        ]}>
        <Row modifiers={[fillMaxWidth()]} verticalAlignment="center">
          <Column modifiers={[padding(0, 0, 12, 0)]}>
            <Text color={textSecondary} style={{ fontSize: 11 }}>
              이번 달 수입
            </Text>
            <Text color={success} style={{ fontSize: 13, fontWeight: 'bold' }}>
              {props.incomeLabel || '0원'}
            </Text>
          </Column>
          <Column modifiers={[padding(0, 0, 12, 0)]}>
            <Text color={textSecondary} style={{ fontSize: 11 }}>
              이번 달 지출
            </Text>
            <Text color={danger} style={{ fontSize: 13, fontWeight: 'bold' }}>
              {props.expenseLabel || '0원'}
            </Text>
          </Column>
          <Column>
            <Text color={textSecondary} style={{ fontSize: 11 }}>
              남은 돈
            </Text>
            <Text color={textPrimary} style={{ fontSize: 13, fontWeight: 'bold' }}>
              {props.balanceLabel || '0원'}
            </Text>
          </Column>
        </Row>
      </Box>

      <Row modifiers={[fillMaxWidth(), padding(0, 6, 0, 6)]} verticalAlignment="center">
        <Box key="action:money:quick:식비:10000" modifiers={[padding(0, 0, 4, 0)]}>
          <Button
            {...({ target: 'btn__action:money:quick:식비:10000' } as object)}
            colors={{ containerColor: cardBg, contentColor: textPrimary }}
            contentPadding={{ start: 6, top: 3, end: 6, bottom: 3 }}
            onClick={() => applyQuickExpense('식비', 10000)}>
            <Text color={textPrimary} style={{ fontSize: 11 }}>
              +식비 1만
            </Text>
          </Button>
        </Box>
        <Box key="action:money:quick:교통:1500" modifiers={[padding(0, 0, 4, 0)]}>
          <Button
            {...({ target: 'btn__action:money:quick:교통:1500' } as object)}
            colors={{ containerColor: cardBg, contentColor: textPrimary }}
            contentPadding={{ start: 6, top: 3, end: 6, bottom: 3 }}
            onClick={() => applyQuickExpense('교통', 1500)}>
            <Text color={textPrimary} style={{ fontSize: 11 }}>
              +교통 1,500
            </Text>
          </Button>
        </Box>
        <Box key="action:money:quick:식비:5000">
          <Button
            {...({ target: 'btn__action:money:quick:식비:5000' } as object)}
            colors={{ containerColor: cardBg, contentColor: textPrimary }}
            contentPadding={{ start: 6, top: 3, end: 6, bottom: 3 }}
            onClick={() => applyQuickExpense('식비', 5000)}>
            <Text color={textPrimary} style={{ fontSize: 11 }}>
              +카페 5,000
            </Text>
          </Button>
        </Box>
      </Row>

      {transactions.slice(0, 2).map((tx) => (
        <Box key={`action:open:tx:${tx.id}`} modifiers={[fillMaxWidth(), padding(0, 1, 0, 1)]}>
          <TextButton
            {...({ target: `btn__action:open:tx:${tx.id}` } as object)}
            colors={{ contentColor: textPrimary }}
            contentPadding={{ start: 2, top: 2, end: 2, bottom: 2 }}
            onClick={() => ({ ...props })}>
            <Text
              color={tx.isIncome ? success : textPrimary}
              maxLines={1}
              style={{ fontSize: 12, fontWeight: 'bold' }}>
              {tx.memo
                ? `${tx.category} (${tx.memo})  ${tx.amountLabel}`
                : `${tx.category}  ${tx.amountLabel}`}
            </Text>
          </TextButton>
        </Box>
      ))}
    </Column>
  );
};

export const MeoreoseoAllInOneWidget = createWidget(
  'MeoreoseoAllInOneWidget',
  AllInOneWidgetLayout,
  INITIAL_WIDGET_PROPS,
);

export const MeoreoseoTodosWidget = createWidget(
  'MeoreoseoTodosWidget',
  TodosWidgetLayout,
  INITIAL_WIDGET_PROPS,
);

export const MeoreoseoCalendarWidget = createWidget(
  'MeoreoseoCalendarWidget',
  CalendarWidgetLayout,
  INITIAL_WIDGET_PROPS,
);

export const MeoreoseoHabitsWidget = createWidget(
  'MeoreoseoHabitsWidget',
  HabitsWidgetLayout,
  INITIAL_WIDGET_PROPS,
);

export const MeoreoseoNotesWidget = createWidget(
  'MeoreoseoNotesWidget',
  NotesWidgetLayout,
  INITIAL_WIDGET_PROPS,
);

export const MeoreoseoMoneyWidget = createWidget(
  'MeoreoseoMoneyWidget',
  MoneyWidgetLayout,
  INITIAL_WIDGET_PROPS,
);

export default MeoreoseoAllInOneWidget;
