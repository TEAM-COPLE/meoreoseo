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

  return (
    <Column modifiers={[fillMaxSize(), background(c.bg), cornerRadius(18), paddingAll(14)]}>
      {/* 헤더 */}
      <Box modifiers={[fillMaxWidth()]}>
        <Box contentAlignment="centerStart" modifiers={[fillMaxWidth()]}>
          <Button
            {...({ target: 'open:/' } as object)}
            colors={{ containerColor: c.bg, contentColor: c.text }}
            contentPadding={{ start: 0, top: 0, end: 0, bottom: 0 }}>
            <Row verticalAlignment="center">
              <Box modifiers={[size(8, 8), background(c.tint), cornerRadius(99)]} />
              <Spacer modifiers={[width(6)]} />
              <Text color={c.text} style={{ fontSize: 15, fontWeight: '700' }}>
                {`멀어서 · ${props.dateLabel}`}
              </Text>
            </Row>
          </Button>
        </Box>
        <Box contentAlignment="centerEnd" modifiers={[fillMaxWidth()]}>
          <Box modifiers={[background(c.tintSoft), cornerRadius(99), padding(7, 2, 7, 2)]}>
            <Text color={c.tint} style={{ fontSize: 10, fontWeight: '600' }}>
              {`할 일 ${props.todoPendingCount} · 일정 ${props.eventCount}`}
            </Text>
          </Box>
        </Box>
      </Box>

      <Spacer modifiers={[height(8)]} />

      {/* 빠른 추가 바 */}
      <Row verticalAlignment="center" modifiers={[fillMaxWidth()]}>
        <Button
          {...({ target: 'open:/todos?add=1' } as object)}
          colors={{ containerColor: c.tintSoft, contentColor: c.tint }}
          contentPadding={{ start: 8, top: 4, end: 8, bottom: 4 }}
          modifiers={[cornerRadius(99)]}>
          <Box contentAlignment="center">
            <Text color={c.tint} style={{ fontSize: 10, fontWeight: '700' }}>
              + 할 일
            </Text>
          </Box>
        </Button>
        <Spacer modifiers={[width(5)]} />
        <Button
          {...({ target: 'open:/calendar?add=1' } as object)}
          colors={{ containerColor: c.tintSoft, contentColor: c.tint }}
          contentPadding={{ start: 8, top: 4, end: 8, bottom: 4 }}
          modifiers={[cornerRadius(99)]}>
          <Box contentAlignment="center">
            <Text color={c.tint} style={{ fontSize: 10, fontWeight: '700' }}>
              + 일정
            </Text>
          </Box>
        </Button>
        <Spacer modifiers={[width(5)]} />
        <Button
          {...({ target: 'open:/note/new' } as object)}
          colors={{ containerColor: c.tintSoft, contentColor: c.tint }}
          contentPadding={{ start: 8, top: 4, end: 8, bottom: 4 }}
          modifiers={[cornerRadius(99)]}>
          <Box contentAlignment="center">
            <Text color={c.tint} style={{ fontSize: 10, fontWeight: '700' }}>
              + 메모
            </Text>
          </Box>
        </Button>
        <Spacer modifiers={[width(5)]} />
        <Button
          {...({ target: 'open:/money?add=1' } as object)}
          colors={{ containerColor: c.tintSoft, contentColor: c.tint }}
          contentPadding={{ start: 8, top: 4, end: 8, bottom: 4 }}
          modifiers={[cornerRadius(99)]}>
          <Box contentAlignment="center">
            <Text color={c.tint} style={{ fontSize: 10, fontWeight: '700' }}>
              + 지출
            </Text>
          </Box>
        </Button>
      </Row>

      <Spacer modifiers={[height(8)]} />

      {/* 할 일 */}
      <Column modifiers={[fillMaxWidth(), background(c.surface), cornerRadius(10), paddingAll(10)]}>
        <Button
          {...({ target: 'open:/todos' } as object)}
          colors={{ containerColor: c.surface, contentColor: c.tint }}
          contentPadding={{ start: 0, top: 0, end: 0, bottom: 0 }}
          modifiers={[fillMaxWidth()]}>
          <Box modifiers={[fillMaxWidth()]}>
            <Box contentAlignment="centerStart" modifiers={[fillMaxWidth()]}>
              <Text color={c.tint} style={{ fontSize: 11, fontWeight: '700' }}>
                할 일
              </Text>
            </Box>
            <Box contentAlignment="centerEnd" modifiers={[fillMaxWidth()]}>
              <Text color={c.textSecondary} style={{ fontSize: 10, fontWeight: '500' }}>
                {`${props.todoPendingCount}개 남음`}
              </Text>
            </Box>
          </Box>
        </Button>
        <Spacer modifiers={[height(4)]} />
        {props.todos.length === 0 ? (
          <Text color={c.textSecondary} style={{ fontSize: 12 }}>
            남은 할 일이 없어요
          </Text>
        ) : (
          props.todos.slice(0, 2).map((todo) => (
            <Button
              key={todo.id}
              {...({
                target: `toggle-todo:${todo.id}`,
                onClick: () => {
                  const nextTodos = props.todos.map((item) =>
                    item.id === todo.id ? { ...item, done: !item.done } : item,
                  );
                  const delta = todo.done ? 1 : -1;
                  return {
                    todoPendingCount: Math.max(0, props.todoPendingCount + delta),
                    todos: nextTodos,
                  };
                },
              } as object)}
              colors={{ containerColor: c.surface, contentColor: c.text }}
              contentPadding={{ start: 0, top: 3, end: 0, bottom: 3 }}
              modifiers={[fillMaxWidth()]}>
              <Row verticalAlignment="center" modifiers={[fillMaxWidth()]}>
                <Box
                  contentAlignment="center"
                  modifiers={[
                    size(15, 15),
                    background(todo.done ? c.tint : c.bg),
                    cornerRadius(4),
                  ]}>
                  <Text
                    color={todo.done ? '#FFFFFF' : c.tint}
                    style={{ fontSize: 10, fontWeight: '700' }}>
                    {todo.done ? '✓' : ''}
                  </Text>
                </Box>
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

      {/* 일정 */}
      <Button
        {...({ target: 'open:/calendar' } as object)}
        colors={{ containerColor: c.surface, contentColor: c.text }}
        contentPadding={{ start: 10, top: 8, end: 10, bottom: 8 }}
        modifiers={[fillMaxWidth(), cornerRadius(10)]}>
        <Row verticalAlignment="center" modifiers={[fillMaxWidth()]}>
          <Text color={c.warm} style={{ fontSize: 11, fontWeight: '700' }}>
            {`일정 (${props.eventCount})`}
          </Text>
          <Spacer modifiers={[width(8)]} />
          <Text
            color={props.events.length > 0 ? c.text : c.textSecondary}
            maxLines={1}
            overflow="ellipsis"
            style={{ fontSize: 12, fontWeight: '500' }}>
            {props.events.length > 0
              ? `${props.events[0].timeLabel} ${props.events[0].title}`
              : '오늘 일정 없음'}
          </Text>
        </Row>
      </Button>

      <Spacer modifiers={[height(6)]} />

      {/* 습관 */}
      <Button
        {...({
          target: props.habits.length > 0 ? `toggle-habit:${props.habits[0].id}` : 'open:/habits',
          onClick:
            props.habits.length > 0
              ? () => {
                  const first = props.habits[0];
                  const nextHabits = props.habits.map((item) => {
                    if (item.id !== first.id) return item;
                    const nextDone = !item.done;
                    return {
                      ...item,
                      done: nextDone,
                      streak: nextDone ? item.streak + 1 : Math.max(0, item.streak - 1),
                    };
                  });
                  const delta = first.done ? -1 : 1;
                  return {
                    habitDoneCount: Math.max(0, props.habitDoneCount + delta),
                    habits: nextHabits,
                  };
                }
              : undefined,
        } as object)}
        colors={{ containerColor: c.surface, contentColor: c.text }}
        contentPadding={{ start: 10, top: 8, end: 10, bottom: 8 }}
        modifiers={[fillMaxWidth(), cornerRadius(10)]}>
        <Row verticalAlignment="center" modifiers={[fillMaxWidth()]}>
          <Text color={c.success} style={{ fontSize: 11, fontWeight: '700' }}>
            {`습관 (${props.habitDoneCount}/${props.habitTotalCount})`}
          </Text>
          <Spacer modifiers={[width(8)]} />
          <Text
            color={props.habits.length > 0 ? c.text : c.textSecondary}
            maxLines={1}
            overflow="ellipsis"
            style={{ fontSize: 12, fontWeight: '500' }}>
            {props.habits.length > 0
              ? `${props.habits[0].done ? '✓' : '○'} ${props.habits[0].name}`
              : '등록된 습관 없음'}
          </Text>
        </Row>
      </Button>

      <Spacer modifiers={[height(6)]} />

      {/* 메모 */}
      <Button
        {...({
          target: props.latestNote.id ? `open:/note/${props.latestNote.id}` : 'open:/notes',
        } as object)}
        colors={{ containerColor: c.surface, contentColor: c.text }}
        contentPadding={{ start: 10, top: 8, end: 10, bottom: 8 }}
        modifiers={[fillMaxWidth(), cornerRadius(10)]}>
        <Row verticalAlignment="center" modifiers={[fillMaxWidth()]}>
          <Text color={c.tint} style={{ fontSize: 11, fontWeight: '700' }}>
            메모
          </Text>
          <Spacer modifiers={[width(8)]} />
          <Text
            color={props.latestNote.id ? c.text : c.textSecondary}
            maxLines={1}
            overflow="ellipsis"
            style={{ fontSize: 12, fontWeight: '500' }}>
            {props.latestNote.id
              ? props.latestNote.pinned
                ? `📌 ${props.latestNote.title}`
                : props.latestNote.title
              : '작성된 메모 없음'}
          </Text>
        </Row>
      </Button>

      <Spacer modifiers={[height(6)]} />

      {/* 가계부 */}
      <Button
        {...({ target: 'open:/money' } as object)}
        colors={{ containerColor: c.surface, contentColor: c.text }}
        contentPadding={{ start: 10, top: 8, end: 10, bottom: 8 }}
        modifiers={[fillMaxWidth(), cornerRadius(10)]}>
        <Box modifiers={[fillMaxWidth()]}>
          <Box contentAlignment="centerStart" modifiers={[fillMaxWidth(), padding(0, 0, 88, 0)]}>
            <Row verticalAlignment="center">
              <Text color={c.danger} style={{ fontSize: 11, fontWeight: '700' }}>
                가계부
              </Text>
              <Spacer modifiers={[width(8)]} />
              <Text color={c.text} maxLines={1} overflow="ellipsis" style={{ fontSize: 12, fontWeight: '600' }}>
                {`이번 달 ${props.moneyMonthExpenseLabel}`}
              </Text>
            </Row>
          </Box>
          <Box contentAlignment="centerEnd" modifiers={[fillMaxWidth()]}>
            <Text color={c.textSecondary} style={{ fontSize: 11, fontWeight: '500' }}>
              {`오늘 ${props.moneyTodayExpenseLabel}`}
            </Text>
          </Box>
        </Box>
      </Button>
    </Column>
  );
}

export default createWidget<DashboardWidgetProps>(
  'DashboardWidget',
  DashboardWidgetLayout,
  INITIAL_DASHBOARD_WIDGET_PROPS,
);
