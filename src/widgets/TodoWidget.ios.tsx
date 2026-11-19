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

import { INITIAL_TODO_WIDGET_PROPS, type TodoWidgetProps } from './types';

function TodoWidgetLayout(props: TodoWidgetProps, environment: WidgetEnvironment) {
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
        danger: '#FF7B8B',
        dangerSoft: '#331B24',
      }
    : {
        bg: '#FFFFFF',
        surface: '#F4F5FA',
        text: '#171626',
        textSecondary: '#6B6C84',
        tint: '#6354EA',
        tintSoft: '#EEECFD',
        danger: '#D92D46',
        dangerSoft: '#FFF0F2',
      };

  const target = (environment as { target?: string }).target;
  if (target && target.startsWith('toggle-todo:')) {
    const id = target.slice('toggle-todo:'.length);
    const nextItems = props.items.map((item) =>
      item.id === id ? { ...item, done: !item.done } : item,
    );
    const toggled = nextItems.find((item) => item.id === id);
    const delta = toggled ? (toggled.done ? -1 : 1) : 0;
    return {
      ...props,
      pendingCount: Math.max(0, props.pendingCount + delta),
      items: nextItems,
    } as unknown as React.JSX.Element;
  }

  const maxItems = environment.widgetFamily === 'systemLarge' ? 6 : 3;

  return (
    <VStack
      alignment="leading"
      spacing={8}
      modifiers={[
        padding({ all: 14 }),
        frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'topLeading' }),
        containerBackground(c.bg, 'widget'),
        widgetURL('meoreoseo://todos'),
      ]}>
      <HStack spacing={6}>
        <Link destination="meoreoseo://todos">
          <HStack spacing={6}>
            <Text modifiers={[font({ size: 15, weight: 'bold' }), foregroundStyle(c.text)]}>
              할 일
            </Text>
            <Text
              modifiers={[
                font({ size: 11, weight: 'semibold' }),
                foregroundStyle(c.tint),
                padding({ horizontal: 7, vertical: 2 }),
                background(c.tintSoft),
                cornerRadius(99),
              ]}>
              {`${props.pendingCount}개 남음`}
            </Text>
          </HStack>
        </Link>
        <Spacer />
        <Link destination="meoreoseo://todos?add=1">
          <Text
            modifiers={[
              font({ size: 11, weight: 'bold' }),
              foregroundStyle(c.tint),
              padding({ horizontal: 9, vertical: 4 }),
              background(c.tintSoft),
              cornerRadius(99),
            ]}>
            + 추가
          </Text>
        </Link>
      </HStack>

      {props.items.length === 0 ? (
        <VStack
          modifiers={[
            frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'center' }),
            background(c.surface),
            cornerRadius(12),
          ]}>
          <Text modifiers={[font({ size: 13 }), foregroundStyle(c.textSecondary)]}>
            남은 할 일이 없어요
          </Text>
        </VStack>
      ) : (
        <VStack alignment="leading" spacing={6}>
          {props.items.slice(0, maxItems).map((item) => (
            <Button
              key={item.id}
              target={`toggle-todo:${item.id}`}
              modifiers={[buttonStyle('plain')]}>
              <HStack
                spacing={8}
                modifiers={[
                  padding({ horizontal: 10, vertical: 7 }),
                  frame({ maxWidth: Infinity, alignment: 'leading' }),
                  background(c.surface),
                  cornerRadius(10),
                ]}>
                <Text
                  modifiers={[
                    font({ size: 13, weight: 'bold' }),
                    foregroundStyle(item.done ? c.tint : c.textSecondary),
                  ]}>
                  {item.done ? '☑' : '☐'}
                </Text>
                <Text
                  modifiers={[
                    font({ size: 13, weight: 'medium' }),
                    foregroundStyle(item.done ? c.textSecondary : c.text),
                    strikethrough({ isActive: item.done, pattern: 'solid' }),
                  ]}>
                  {item.title}
                </Text>
                <Spacer />
                {item.dueLabel ? (
                  <Text
                    modifiers={[
                      font({ size: 10, weight: 'semibold' }),
                      foregroundStyle(item.isOverdue ? c.danger : c.tint),
                      padding({ horizontal: 6, vertical: 2 }),
                      background(item.isOverdue ? c.dangerSoft : c.tintSoft),
                      cornerRadius(6),
                    ]}>
                    {item.dueLabel}
                  </Text>
                ) : null}
              </HStack>
            </Button>
          ))}
        </VStack>
      )}
    </VStack>
  );
}

export default createWidget<TodoWidgetProps>(
  'TodoWidget',
  TodoWidgetLayout,
  INITIAL_TODO_WIDGET_PROPS,
);
