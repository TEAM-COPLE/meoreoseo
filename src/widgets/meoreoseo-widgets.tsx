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
  incomeLabel: '0원',
  expenseLabel: '0원',
  balanceLabel: '0원',
  transactions: [],
};

/**
 * 멀어서 통합 위젯 (할 일 · 일정 · 습관 · 메모 · 가계부 5가지 기능을 위젯 안에서 모두 전환·조작)
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
            <Box key="action:open:todos" modifiers={[padding(8, 0, 0, 0)]}>
              <FilledTonalButton
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
                <Column modifiers={[fillMaxWidth()]}>
                  <Text
                    color={todo.done ? textSecondary : textPrimary}
                    maxLines={1}
                    style={{
                      fontSize: 13,
                      fontWeight: 'bold',
                      textDecoration: todo.done ? 'lineThrough' : 'none',
                    }}>
                    {todo.title}
                  </Text>
                  {todo.dueLabel ? (
                    <Text color={textSecondary} maxLines={1} style={{ fontSize: 11 }}>
                      {todo.dueLabel}
                    </Text>
                  ) : null}
                </Column>
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
            <Box key="action:open:calendar" modifiers={[padding(8, 0, 0, 0)]}>
              <FilledTonalButton
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
                예정된 일정이 없습니다.
              </Text>
            </Box>
          ) : (
            events.slice(0, 4).map((event) => (
              <Row
                key={`event_row_${event.id}`}
                modifiers={[
                  fillMaxWidth(),
                  cornerRadius(10),
                  background(cardBg),
                  padding(10, 6, 10, 6),
                ]}
                verticalAlignment="center">
                <Column modifiers={[fillMaxWidth()]}>
                  <Text color={tint} maxLines={1} style={{ fontSize: 11, fontWeight: 'bold' }}>
                    {`${event.dateLabel} · ${event.timeLabel}`}
                  </Text>
                  <Text color={textPrimary} maxLines={1} style={{ fontSize: 13, fontWeight: 'bold' }}>
                    {event.title}
                  </Text>
                </Column>
              </Row>
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
            <Box key="action:open:habits" modifiers={[padding(8, 0, 0, 0)]}>
              <FilledTonalButton
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
                아직 등록된 습관이 없습니다.
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
                <Column modifiers={[fillMaxWidth()]}>
                  <Text color={textPrimary} maxLines={1} style={{ fontSize: 13, fontWeight: 'bold' }}>
                    {habit.name}
                  </Text>
                  <Text color={habit.streak > 0 ? tint : textSecondary} style={{ fontSize: 11 }}>
                    {habit.streak > 0 ? `${habit.streak}일 연속 실천 중` : '오늘부터 시작'}
                  </Text>
                </Column>
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
                작성된 메모가 없습니다.
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

          {/* 위젯에서 원터치로 바로 지출 기록하기 + 가계부 열기 */}
          <Row modifiers={[fillMaxWidth(), padding(0, 6, 0, 6)]} verticalAlignment="center">
            <Box key="action:money:quick:식비:10000" modifiers={[padding(0, 0, 4, 0)]}>
              <Button
                colors={{ containerColor: cardBg, contentColor: textPrimary }}
                contentPadding={{ start: 6, top: 3, end: 6, bottom: 3 }}
                onClick={() => ({ ...props })}>
                <Text color={textPrimary} style={{ fontSize: 11 }}>
                  +식비 1만
                </Text>
              </Button>
            </Box>
            <Box key="action:money:quick:교통:1500" modifiers={[padding(0, 0, 4, 0)]}>
              <Button
                colors={{ containerColor: cardBg, contentColor: textPrimary }}
                contentPadding={{ start: 6, top: 3, end: 6, bottom: 3 }}
                onClick={() => ({ ...props })}>
                <Text color={textPrimary} style={{ fontSize: 11 }}>
                  +교통 1,500
                </Text>
              </Button>
            </Box>
            <Box key="action:open:money">
              <FilledTonalButton
                colors={{ containerColor: tint, contentColor: onTint }}
                contentPadding={{ start: 8, top: 3, end: 8, bottom: 3 }}
                onClick={() => ({ ...props })}>
                <Text color={onTint} style={{ fontSize: 11, fontWeight: 'bold' }}>
                  + 직접 입력
                </Text>
              </FilledTonalButton>
            </Box>
          </Row>

          {transactions.slice(0, 2).map((tx) => (
            <Row
              key={`tx_row_${tx.id}`}
              modifiers={[fillMaxWidth(), padding(0, 2, 0, 2)]}
              verticalAlignment="center">
              <Text color={textPrimary} maxLines={1} style={{ fontSize: 12, fontWeight: 'bold' }}>
                {tx.memo ? `${tx.category} (${tx.memo})` : tx.category}
              </Text>
              <Text
                color={tx.isIncome ? success : textSecondary}
                style={{ fontSize: 12, fontWeight: 'bold' }}
                modifiers={[padding(6, 0, 0, 0)]}>
                {tx.amountLabel}
              </Text>
            </Row>
          ))}
        </Column>
      ) : null}
    </Column>
  );
};

export const MeoreoseoAllInOneWidget = createWidget(
  'MeoreoseoAllInOneWidget',
  AllInOneWidgetLayout,
  INITIAL_WIDGET_PROPS,
);

export default MeoreoseoAllInOneWidget;
