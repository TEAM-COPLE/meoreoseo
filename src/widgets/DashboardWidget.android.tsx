import { Box, Button, Column, Row, Spacer, Text } from '@expo/ui/jetpack-compose';
import {
  background,
  cornerRadius,
  fillMaxSize,
  fillMaxWidth,
  height,
  padding,
  paddingAll,
  size,
  width,
} from '@expo/ui/jetpack-compose/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import { INITIAL_DASHBOARD_WIDGET_PROPS, type DashboardWidgetProps } from './types';

function DashboardWidgetLayout(props: DashboardWidgetProps, environment: WidgetEnvironment) {
  'widget';

  const isDark = (environment.colorScheme ?? props.colorScheme) === 'dark';
  const c = isDark
    ? {
        bg: '#1F1E2E',
        surface: '#2B2A40',
        text: '#F5F5FA',
        textSecondary: '#8F8FA8',
        tint: '#9B8AFB',
        tintSoft: '#282447',
        success: '#4ADE80',
        warm: '#F5A623',
        danger: '#FF7B8B',
      }
    : {
        bg: '#FFFFFF',
        surface: '#F4F5FA',
        text: '#171626',
        textSecondary: '#6B6C84',
        tint: '#6354EA',
        tintSoft: '#EEECFD',
        success: '#0E9F6E',
        warm: '#D9820B',
        danger: '#D92D46',
      };

  const target = (environment as { target?: string }).target;
  if (target && target.startsWith('toggle-todo:')) {
    const id = target.slice('toggle-todo:'.length);
    const nextTodos = props.todos.map((item) =>
      item.id === id ? { ...item, done: !item.done } : item,
    );
    const delta = nextTodos.find((t) => t.id === id)?.done ? -1 : 1;
    return {
      ...props,
      todoPendingCount: Math.max(0, props.todoPendingCount + delta),
      todos: nextTodos,
    } as unknown as React.JSX.Element;
  }
  if (target && target.startsWith('toggle-habit:')) {
    const id = target.slice('toggle-habit:'.length);
    const nextHabits = props.habits.map((item) => {
      if (item.id !== id) return item;
      const nextDone = !item.done;
      return {
        ...item,
        done: nextDone,
        streak: nextDone ? item.streak + 1 : Math.max(0, item.streak - 1),
      };
    });
    const delta = nextHabits.find((h) => h.id === id)?.done ? 1 : -1;
    return {
      ...props,
      habitDoneCount: Math.max(0, props.habitDoneCount + delta),
      habits: nextHabits,
    } as unknown as React.JSX.Element;
  }

  return (
    <Column modifiers={[fillMaxSize(), background(c.bg), cornerRadius(18), paddingAll(14)]}>
      {/* 헤더 */}
      <Button
        {...({ target: 'open:/' } as object)}
        colors={{ containerColor: c.bg, contentColor: c.text }}
        contentPadding={{ start: 0, top: 0, end: 0, bottom: 0 }}
        modifiers={[fillMaxWidth()]}>
        <Row verticalAlignment="center" modifiers={[fillMaxWidth()]}>
          <Box modifiers={[size(8, 8), background(c.tint), cornerRadius(99)]} />
          <Spacer modifiers={[width(6)]} />
          <Text color={c.text} style={{ fontSize: 15, fontWeight: '700' }}>
            {`멀어서 · ${props.dateLabel}`}
          </Text>
          <Spacer />
          <Box modifiers={[background(c.tintSoft), cornerRadius(99), padding(7, 2, 7, 2)]}>
            <Text color={c.tint} style={{ fontSize: 10, fontWeight: '600' }}>
              {`할 일 ${props.todoPendingCount} · 일정 ${props.eventCount}`}
            </Text>
          </Box>
        </Row>
      </Button>

      <Spacer modifiers={[height(8)]} />

      {/* 할 일 & 일정 */}
      <Column modifiers={[fillMaxWidth(), background(c.surface), cornerRadius(12), paddingAll(10)]}>
        <Row verticalAlignment="center" modifiers={[fillMaxWidth()]}>
          <Text color={c.tint} style={{ fontSize: 11, fontWeight: '700' }}>
            할 일
          </Text>
          <Spacer />
          <Text color={c.textSecondary} style={{ fontSize: 10, fontWeight: '500' }}>
            {`${props.todoPendingCount}개 남음`}
          </Text>
        </Row>
        <Spacer modifiers={[height(4)]} />
        {props.todos.length === 0 ? (
          <Text color={c.textSecondary} style={{ fontSize: 12 }}>
            남은 할 일이 없어요
          </Text>
        ) : (
          props.todos.slice(0, 2).map((todo) => (
            <Button
              key={todo.id}
              {...({ target: `toggle-todo:${todo.id}` } as object)}
              colors={{ containerColor: c.surface, contentColor: c.text }}
              contentPadding={{ start: 0, top: 2, end: 0, bottom: 2 }}
              modifiers={[fillMaxWidth()]}>
              <Row verticalAlignment="center" modifiers={[fillMaxWidth()]}>
                <Text
                  color={todo.done ? c.tint : c.textSecondary}
                  style={{ fontSize: 12, fontWeight: '700' }}>
                  {todo.done ? '☑' : '☐'}
                </Text>
                <Spacer modifiers={[width(6)]} />
                <Text
                  color={todo.done ? c.textSecondary : c.text}
                  maxLines={1}
                  overflow="ellipsis"
                  style={{
                    fontSize: 12,
                    fontWeight: '500',
                    textDecoration: todo.done ? 'lineThrough' : 'none',
                  }}>
                  {todo.title}
                </Text>
              </Row>
            </Button>
          ))
        )}
      </Column>

      <Spacer modifiers={[height(6)]} />

      {/* 일정 & 습관 */}
      <Row modifiers={[fillMaxWidth()]}>
        <Button
          {...({ target: 'open:/calendar' } as object)}
          colors={{ containerColor: c.surface, contentColor: c.text }}
          contentPadding={{ start: 10, top: 8, end: 10, bottom: 8 }}
          modifiers={[width(148), cornerRadius(12)]}>
          <Column modifiers={[fillMaxWidth()]}>
            <Text color={c.warm} style={{ fontSize: 11, fontWeight: '700' }}>
              {`일정 (${props.eventCount})`}
            </Text>
            <Spacer modifiers={[height(3)]} />
            {props.events.length === 0 ? (
              <Text color={c.textSecondary} style={{ fontSize: 11 }}>
                일정 없음
              </Text>
            ) : (
              props.events.slice(0, 2).map((ev) => (
                <Text
                  key={ev.id}
                  color={c.text}
                  maxLines={1}
                  overflow="ellipsis"
                  style={{ fontSize: 11, fontWeight: '500' }}>
                  {`${ev.timeLabel} ${ev.title}`}
                </Text>
              ))
            )}
          </Column>
        </Button>

        <Spacer modifiers={[width(6)]} />

        <Column
          modifiers={[fillMaxWidth(), background(c.surface), cornerRadius(12), paddingAll(8)]}>
          <Button
            {...({ target: 'open:/habits' } as object)}
            colors={{ containerColor: c.surface, contentColor: c.text }}
            contentPadding={{ start: 0, top: 0, end: 0, bottom: 0 }}
            modifiers={[fillMaxWidth()]}>
            <Text color={c.success} style={{ fontSize: 11, fontWeight: '700' }}>
              {`습관 (${props.habitDoneCount}/${props.habitTotalCount})`}
            </Text>
          </Button>
          <Spacer modifiers={[height(3)]} />
          {props.habits.length === 0 ? (
            <Text color={c.textSecondary} style={{ fontSize: 11 }}>
              습관 없음
            </Text>
          ) : (
            props.habits.slice(0, 2).map((habit) => (
              <Button
                key={habit.id}
                {...({ target: `toggle-habit:${habit.id}` } as object)}
                colors={{ containerColor: c.surface, contentColor: c.text }}
                contentPadding={{ start: 0, top: 1, end: 0, bottom: 1 }}
                modifiers={[fillMaxWidth()]}>
                <Text
                  color={habit.done ? c.textSecondary : c.text}
                  maxLines={1}
                  overflow="ellipsis"
                  style={{ fontSize: 11, fontWeight: '500' }}>
                  {`${habit.done ? '✓' : '○'} ${habit.name}`}
                </Text>
              </Button>
            ))
          )}
        </Column>
      </Row>

      <Spacer modifiers={[height(6)]} />

      {/* 메모 & 가계부 */}
      <Row modifiers={[fillMaxWidth()]}>
        <Button
          {...({
            target: props.latestNote.id ? `open:/note/${props.latestNote.id}` : 'open:/notes',
          } as object)}
          colors={{ containerColor: c.surface, contentColor: c.text }}
          contentPadding={{ start: 10, top: 8, end: 10, bottom: 8 }}
          modifiers={[width(148), cornerRadius(12)]}>
          <Column modifiers={[fillMaxWidth()]}>
            <Text color={c.tint} style={{ fontSize: 11, fontWeight: '700' }}>
              메모
            </Text>
            <Spacer modifiers={[height(2)]} />
            <Text
              color={props.latestNote.id ? c.text : c.textSecondary}
              maxLines={1}
              overflow="ellipsis"
              style={{ fontSize: 11, fontWeight: '600' }}>
              {props.latestNote.id
                ? (props.latestNote.pinned ? `📌 ${props.latestNote.title}` : props.latestNote.title)
                : '작성된 메모 없음'}
            </Text>
          </Column>
        </Button>

        <Spacer modifiers={[width(6)]} />

        <Button
          {...({ target: 'open:/money' } as object)}
          colors={{ containerColor: c.surface, contentColor: c.text }}
          contentPadding={{ start: 10, top: 8, end: 10, bottom: 8 }}
          modifiers={[fillMaxWidth(), cornerRadius(12)]}>
          <Column modifiers={[fillMaxWidth()]}>
            <Text color={c.danger} style={{ fontSize: 11, fontWeight: '700' }}>
              가계부
            </Text>
            <Spacer modifiers={[height(2)]} />
            <Text
              color={c.text}
              maxLines={1}
              overflow="ellipsis"
              style={{ fontSize: 11, fontWeight: '600' }}>
              {`이번 달 ${props.moneyMonthExpenseLabel}`}
            </Text>
          </Column>
        </Button>
      </Row>
    </Column>
  );
}

export default createWidget<DashboardWidgetProps>(
  'DashboardWidget',
  DashboardWidgetLayout,
  INITIAL_DASHBOARD_WIDGET_PROPS,
);
