import { HStack, Link, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  background,
  containerBackground,
  cornerRadius,
  font,
  foregroundStyle,
  frame,
  padding,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import { INITIAL_EVENTS_WIDGET_PROPS, type EventsWidgetProps } from './types';

function EventsWidgetLayout(props: EventsWidgetProps, environment: WidgetEnvironment) {
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
        warm: '#F5A623',
      }
    : {
        bg: '#FFFFFF',
        surface: '#F4F5FA',
        text: '#171626',
        textSecondary: '#6B6C84',
        tint: '#6354EA',
        tintSoft: '#EEECFD',
        warm: '#D9820B',
      };

  const maxItems = environment.widgetFamily === 'systemLarge' ? 5 : 3;

  return (
    <VStack
      alignment="leading"
      spacing={8}
      modifiers={[
        padding({ all: 14 }),
        frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'topLeading' }),
        containerBackground(c.bg, 'widget'),
        widgetURL('meoreoseo://calendar'),
      ]}>
      <Link destination="meoreoseo://calendar">
        <HStack spacing={6}>
          <Text modifiers={[font({ size: 15, weight: 'bold' }), foregroundStyle(c.text)]}>
            일정
          </Text>
          <Text
            modifiers={[
              font({ size: 11, weight: 'semibold' }),
              foregroundStyle(c.tint),
              padding({ horizontal: 7, vertical: 2 }),
              background(c.tintSoft),
              cornerRadius(99),
            ]}>
            {`${props.totalCount}건`}
          </Text>
          <Spacer />
          <Text modifiers={[font({ size: 11 }), foregroundStyle(c.textSecondary)]}>
            {props.dateLabel}
          </Text>
        </HStack>
      </Link>

      {props.items.length === 0 ? (
        <VStack
          modifiers={[
            frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'center' }),
            background(c.surface),
            cornerRadius(12),
          ]}>
          <Text modifiers={[font({ size: 13 }), foregroundStyle(c.textSecondary)]}>
            오늘 일정이 없어요
          </Text>
        </VStack>
      ) : (
        <VStack alignment="leading" spacing={6}>
          {props.items.slice(0, maxItems).map((item) => (
            <HStack
              key={item.id}
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
                  foregroundStyle(item.isAllDay ? c.warm : c.tint),
                ]}>
                |
              </Text>
              <VStack alignment="leading" spacing={2}>
                <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(c.text)]}>
                  {item.title}
                </Text>
                <Text modifiers={[font({ size: 11 }), foregroundStyle(c.textSecondary)]}>
                  {item.timeLabel}
                </Text>
              </VStack>
            </HStack>
          ))}
        </VStack>
      )}
    </VStack>
  );
}

export default createWidget<EventsWidgetProps>(
  'EventsWidget',
  EventsWidgetLayout,
  INITIAL_EVENTS_WIDGET_PROPS,
);
