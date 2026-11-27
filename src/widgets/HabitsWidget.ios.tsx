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

import { INITIAL_HABITS_WIDGET_PROPS, type HabitsWidgetProps } from './types';

function HabitsWidgetLayout(props: HabitsWidgetProps, environment: WidgetEnvironment) {
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
      };

  const target = (environment as { target?: string }).target;
  if (target && target.startsWith('toggle-habit:')) {
    const id = target.slice('toggle-habit:'.length);
    const current = props.items.find((item) => item.id === id);
    if (!current) return props as unknown as React.JSX.Element;
    const nextDone = !current.done;
    const nextItems = props.items.map((item) =>
      item.id === id
        ? {
            ...item,
            done: nextDone,
            streak: nextDone ? item.streak + 1 : Math.max(0, item.streak - 1),
          }
        : item,
    );
    return {
      ...props,
      doneCount: Math.max(0, props.doneCount + (nextDone ? 1 : -1)),
      items: nextItems,
    } as unknown as React.JSX.Element;
  }

  const maxItems = environment.widgetFamily === 'systemLarge' ? 5 : 3;

  return (
    <VStack
      alignment="leading"
      spacing={8}
      modifiers={[
        padding({ all: 14 }),
        frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'topLeading' }),
        containerBackground(c.bg, 'widget'),
        widgetURL('meoreoseo://habits'),
      ]}>
      <HStack spacing={6}>
        <Link destination="meoreoseo://habits">
          <HStack spacing={6}>
            <Text modifiers={[font({ size: 15, weight: 'bold' }), foregroundStyle(c.text)]}>
              습관
            </Text>
            <Text
              modifiers={[
                font({ size: 11, weight: 'semibold' }),
                foregroundStyle(c.tint),
                padding({ horizontal: 7, vertical: 2 }),
                background(c.tintSoft),
                cornerRadius(99),
              ]}>
              {`${props.doneCount}/${props.totalCount}`}
            </Text>
          </HStack>
        </Link>
        <Spacer />
        <Link destination="meoreoseo://habits?add=1">
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
            등록된 습관이 없어요
          </Text>
        </VStack>
      ) : (
        <VStack alignment="leading" spacing={6}>
          {props.items.slice(0, maxItems).map((item) => (
            <Button
              key={item.id}
              target={`toggle-habit:${item.id}`}
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
                    foregroundStyle(item.done ? c.success : c.textSecondary),
                  ]}>
                  {item.done ? '✓' : '○'}
                </Text>
                <Text
                  modifiers={[
                    font({ size: 13, weight: 'medium' }),
                    foregroundStyle(item.done ? c.textSecondary : c.text),
                    strikethrough({ isActive: item.done, pattern: 'solid' }),
                  ]}>
                  {item.name}
                </Text>
                <Spacer />
                {item.streak > 0 ? (
                  <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(c.warm)]}>
                    {`🔥 ${item.streak}일`}
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

export default createWidget<HabitsWidgetProps>(
  'HabitsWidget',
  HabitsWidgetLayout,
  INITIAL_HABITS_WIDGET_PROPS,
);
