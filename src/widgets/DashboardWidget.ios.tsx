import { Button, HStack, Link, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  background,
  buttonStyle,
  containerBackground,
  cornerRadius,
  font,
  foregroundStyle,
  frame,
  padding,
  strikethrough,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
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
    <VStack
      alignment="leading"
      spacing={8}
      modifiers={[
        padding({ all: 14 }),
        frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'topLeading' }),
        containerBackground(c.bg, 'widget'),
        widgetURL('meoreoseo://'),
      ]}>
      <Link destination="meoreoseo://">
        <HStack spacing={6}>
          <Text modifiers={[font({ size: 15, weight: 'bold' }), foregroundStyle(c.text)]}>
            {`멀어서 · ${props.dateLabel}`}
          </Text>
          <Spacer />
          <Text
            modifiers={[
              font({ size: 10, weight: 'semibold' }),
              foregroundStyle(c.tint),
              padding({ horizontal: 7, vertical: 2 }),
              background(c.tintSoft),
              cornerRadius(99),
            ]}>
            {`할 일 ${props.todoPendingCount} · 일정 ${props.eventCount}`}
          </Text>
        </HStack>
      </Link>

      {/* 할 일 */}
      <VStack
        alignment="leading"
        spacing={4}
        modifiers={[
          padding({ all: 10 }),
          frame({ maxWidth: Infinity, alignment: 'leading' }),
          background(c.surface),
          cornerRadius(12),
        ]}>
        <Link destination="meoreoseo://todos">
          <HStack>
            <Text modifiers={[font({ size: 11, weight: 'bold' }), foregroundStyle(c.tint)]}>
              할 일
            </Text>
            <Spacer />
            <Text modifiers={[font({ size: 10 }), foregroundStyle(c.textSecondary)]}>
              {`${props.todoPendingCount}개 남음`}
            </Text>
          </HStack>
        </Link>
        {props.todos.length === 0 ? (
          <Text modifiers={[font({ size: 12 }), foregroundStyle(c.textSecondary)]}>
            남은 할 일이 없어요
          </Text>
        ) : (
          props.todos.slice(0, 2).map((todo) => (
            <Button
              key={todo.id}
              target={`toggle-todo:${todo.id}`}
              modifiers={[buttonStyle('plain')]}>
              <HStack spacing={6}>
                <Text
                  modifiers={[
                    font({ size: 12, weight: 'bold' }),
                    foregroundStyle(todo.done ? c.tint : c.textSecondary),
                  ]}>
                  {todo.done ? '☑' : '☐'}
                </Text>
                <Text
                  modifiers={[
                    font({ size: 12, weight: 'medium' }),
                    foregroundStyle(todo.done ? c.textSecondary : c.text),
                    strikethrough({ isActive: todo.done, pattern: 'solid' }),
                  ]}>
                  {todo.title}
                </Text>
              </HStack>
            </Button>
          ))
        )}
      </VStack>

      {/* 일정 & 습관 */}
      <HStack spacing={6}>
        <Link destination="meoreoseo://calendar">
          <VStack
            alignment="leading"
            spacing={3}
            modifiers={[
              padding({ all: 10 }),
              frame({ maxWidth: Infinity, alignment: 'topLeading' }),
              background(c.surface),
              cornerRadius(12),
            ]}>
            <Text modifiers={[font({ size: 11, weight: 'bold' }), foregroundStyle(c.warm)]}>
              {`일정 (${props.eventCount})`}
            </Text>
            {props.events.length === 0 ? (
              <Text modifiers={[font({ size: 11 }), foregroundStyle(c.textSecondary)]}>
                일정 없음
              </Text>
            ) : (
              props.events.slice(0, 2).map((ev) => (
                <Text
                  key={ev.id}
                  modifiers={[font({ size: 11, weight: 'medium' }), foregroundStyle(c.text)]}>
                  {`${ev.timeLabel} ${ev.title}`}
                </Text>
              ))
            )}
          </VStack>
        </Link>

        <VStack
          alignment="leading"
          spacing={3}
          modifiers={[
            padding({ all: 10 }),
            frame({ maxWidth: Infinity, alignment: 'topLeading' }),
            background(c.surface),
            cornerRadius(12),
          ]}>
          <Link destination="meoreoseo://habits">
            <Text modifiers={[font({ size: 11, weight: 'bold' }), foregroundStyle(c.success)]}>
              {`습관 (${props.habitDoneCount}/${props.habitTotalCount})`}
            </Text>
          </Link>
          {props.habits.length === 0 ? (
            <Text modifiers={[font({ size: 11 }), foregroundStyle(c.textSecondary)]}>
              습관 없음
            </Text>
          ) : (
            props.habits.slice(0, 2).map((habit) => (
              <Button
                key={habit.id}
                target={`toggle-habit:${habit.id}`}
                modifiers={[buttonStyle('plain')]}>
                <Text
                  modifiers={[
                    font({ size: 11, weight: 'medium' }),
                    foregroundStyle(habit.done ? c.textSecondary : c.text),
                  ]}>
                  {`${habit.done ? '✓' : '○'} ${habit.name}`}
                </Text>
              </Button>
            ))
          )}
        </VStack>
      </HStack>

      {/* 메모 & 가계부 */}
      <HStack spacing={6}>
        <Link
          destination={
            props.latestNote.id ? `meoreoseo://note/${props.latestNote.id}` : 'meoreoseo://notes'
          }>
          <VStack
            alignment="leading"
            spacing={2}
            modifiers={[
              padding({ all: 10 }),
              frame({ maxWidth: Infinity, alignment: 'topLeading' }),
              background(c.surface),
              cornerRadius(12),
            ]}>
            <Text modifiers={[font({ size: 11, weight: 'bold' }), foregroundStyle(c.tint)]}>
              메모
            </Text>
            <Text
              modifiers={[
                font({ size: 11, weight: 'semibold' }),
                foregroundStyle(props.latestNote.id ? c.text : c.textSecondary),
              ]}>
              {props.latestNote.id
                ? props.latestNote.pinned
                  ? `📌 ${props.latestNote.title}`
                  : props.latestNote.title
                : '작성된 메모 없음'}
            </Text>
          </VStack>
        </Link>

        <Link destination="meoreoseo://money">
          <VStack
            alignment="leading"
            spacing={2}
            modifiers={[
              padding({ all: 10 }),
              frame({ maxWidth: Infinity, alignment: 'topLeading' }),
              background(c.surface),
              cornerRadius(12),
            ]}>
            <Text modifiers={[font({ size: 11, weight: 'bold' }), foregroundStyle(c.danger)]}>
              가계부
            </Text>
            <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(c.text)]}>
              {`이번 달 ${props.moneyMonthExpenseLabel}`}
            </Text>
          </VStack>
        </Link>
      </HStack>
    </VStack>
  );
}

export default createWidget<DashboardWidgetProps>(
  'DashboardWidget',
  DashboardWidgetLayout,
  INITIAL_DASHBOARD_WIDGET_PROPS,
);
