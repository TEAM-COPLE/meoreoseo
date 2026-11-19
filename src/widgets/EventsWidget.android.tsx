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

  return (
    <Column modifiers={[fillMaxSize(), background(c.bg), cornerRadius(18), paddingAll(14)]}>
      <Row verticalAlignment="center" modifiers={[fillMaxWidth()]}>
        <Button
          {...({ target: 'open:/calendar' } as object)}
          colors={{ containerColor: c.bg, contentColor: c.text }}
          contentPadding={{ start: 0, top: 0, end: 0, bottom: 0 }}>
          <Row verticalAlignment="center">
            <Box modifiers={[size(8, 8), background(c.warm), cornerRadius(99)]} />
            <Spacer modifiers={[width(6)]} />
            <Text color={c.text} style={{ fontSize: 15, fontWeight: '700' }}>
              일정
            </Text>
            <Spacer modifiers={[width(6)]} />
            <Box modifiers={[background(c.tintSoft), cornerRadius(99), padding(7, 2, 7, 2)]}>
              <Text color={c.tint} style={{ fontSize: 11, fontWeight: '600' }}>
                {`${props.totalCount}건`}
              </Text>
            </Box>
          </Row>
        </Button>
        <Spacer />
        <Button
          {...({ target: 'open:/calendar?add=1' } as object)}
          colors={{ containerColor: c.tintSoft, contentColor: c.tint }}
          contentPadding={{ start: 9, top: 4, end: 9, bottom: 4 }}
          modifiers={[cornerRadius(99)]}>
          <Text color={c.tint} style={{ fontSize: 11, fontWeight: '700' }}>
            + 추가
          </Text>
        </Button>
      </Row>

      <Spacer modifiers={[height(10)]} />

      {props.items.length === 0 ? (
        <Button
          {...({ target: 'open:/calendar?add=1' } as object)}
          colors={{ containerColor: c.surface, contentColor: c.textSecondary }}
          contentPadding={{ start: 12, top: 12, end: 12, bottom: 12 }}
          modifiers={[fillMaxSize(), cornerRadius(12)]}>
          <Text color={c.textSecondary} style={{ fontSize: 13, fontWeight: '500' }}>
            오늘 일정이 없어요 · 눌러서 추가
          </Text>
        </Button>
      ) : (
        <Column modifiers={[fillMaxWidth()]}>
          {props.items.slice(0, 4).map((item, idx) => (
            <Column key={item.id} modifiers={[fillMaxWidth()]}>
              {idx > 0 ? <Spacer modifiers={[height(6)]} /> : null}
              <Button
                {...({ target: 'open:/calendar' } as object)}
                colors={{ containerColor: c.surface, contentColor: c.text }}
                contentPadding={{ start: 10, top: 8, end: 10, bottom: 8 }}
                modifiers={[fillMaxWidth(), cornerRadius(10)]}>
                <Row verticalAlignment="center" modifiers={[fillMaxWidth()]}>
                  <Box
                    modifiers={[
                      width(3),
                      height(24),
                      background(item.isAllDay ? c.warm : c.tint),
                      cornerRadius(99),
                    ]}
                  />
                  <Spacer modifiers={[width(8)]} />
                  <Column modifiers={[fillMaxWidth()]}>
                    <Text
                      color={c.text}
                      maxLines={1}
                      overflow="ellipsis"
                      style={{ fontSize: 13, fontWeight: '600' }}>
                      {item.title}
                    </Text>
                    <Text color={c.textSecondary} style={{ fontSize: 11, fontWeight: '400' }}>
                      {item.timeLabel}
                    </Text>
                  </Column>
                </Row>
              </Button>
            </Column>
          ))}
        </Column>
      )}
    </Column>
  );
}

export default createWidget<EventsWidgetProps>(
  'EventsWidget',
  EventsWidgetLayout,
  INITIAL_EVENTS_WIDGET_PROPS,
);
