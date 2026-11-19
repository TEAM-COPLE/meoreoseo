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

  return (
    <Column modifiers={[fillMaxSize(), background(c.bg), cornerRadius(18), paddingAll(14)]}>
      <Box modifiers={[fillMaxWidth()]}>
        <Box contentAlignment="centerStart" modifiers={[fillMaxWidth()]}>
          <Button
            {...({ target: 'open:/habits' } as object)}
            colors={{ containerColor: c.bg, contentColor: c.text }}
            contentPadding={{ start: 0, top: 0, end: 0, bottom: 0 }}>
            <Row verticalAlignment="center">
              <Box modifiers={[size(8, 8), background(c.success), cornerRadius(99)]} />
              <Spacer modifiers={[width(6)]} />
              <Text color={c.text} style={{ fontSize: 15, fontWeight: '700' }}>
                습관
              </Text>
              <Spacer modifiers={[width(6)]} />
              <Box modifiers={[background(c.tintSoft), cornerRadius(99), padding(7, 2, 7, 2)]}>
                <Text color={c.tint} style={{ fontSize: 11, fontWeight: '600' }}>
                  {`${props.doneCount}/${props.totalCount}`}
                </Text>
              </Box>
            </Row>
          </Button>
        </Box>
        <Box contentAlignment="centerEnd" modifiers={[fillMaxWidth()]}>
          <Button
            {...({ target: 'open:/habits?add=1' } as object)}
            colors={{ containerColor: c.tintSoft, contentColor: c.tint }}
            contentPadding={{ start: 9, top: 4, end: 9, bottom: 4 }}
            modifiers={[cornerRadius(99)]}>
            <Box contentAlignment="center">
              <Text color={c.tint} style={{ fontSize: 11, fontWeight: '700' }}>
                + 추가
              </Text>
            </Box>
          </Button>
        </Box>
      </Box>

      <Spacer modifiers={[height(10)]} />

      {props.items.length === 0 ? (
        <Button
          {...({ target: 'open:/habits?add=1' } as object)}
          colors={{ containerColor: c.surface, contentColor: c.textSecondary }}
          contentPadding={{ start: 12, top: 12, end: 12, bottom: 12 }}
          modifiers={[fillMaxSize(), cornerRadius(12)]}>
          <Box contentAlignment="center" modifiers={[fillMaxSize()]}>
            <Text color={c.textSecondary} style={{ fontSize: 13, fontWeight: '500' }}>
              등록된 습관이 없어요 · 눌러서 추가
            </Text>
          </Box>
        </Button>
      ) : (
        <Column modifiers={[fillMaxWidth()]}>
          {props.items.slice(0, 4).map((item, idx) => (
            <Column key={item.id} modifiers={[fillMaxWidth()]}>
              {idx > 0 ? <Spacer modifiers={[height(6)]} /> : null}
              <Button
                {...({
                  target: `toggle-habit:${item.id}`,
                  onClick: () => {
                    const nextItems = props.items.map((h) => {
                      if (h.id !== item.id) return h;
                      const nextDone = !h.done;
                      return {
                        ...h,
                        done: nextDone,
                        streak: nextDone ? h.streak + 1 : Math.max(0, h.streak - 1),
                      };
                    });
                    const delta = item.done ? -1 : 1;
                    return {
                      doneCount: Math.max(0, props.doneCount + delta),
                      items: nextItems,
                    };
                  },
                } as object)}
                colors={{ containerColor: c.surface, contentColor: c.text }}
                contentPadding={{ start: 10, top: 8, end: 10, bottom: 8 }}
                modifiers={[fillMaxWidth(), cornerRadius(10)]}>
                <Box modifiers={[fillMaxWidth()]}>
                  <Box contentAlignment="centerStart" modifiers={[fillMaxWidth(), padding(0, 0, item.streak > 0 ? 52 : 0, 0)]}>
                    <Row verticalAlignment="center">
                      <Box
                        contentAlignment="center"
                        modifiers={[
                          size(18, 18),
                          background(item.done ? c.success : c.bg),
                          cornerRadius(99),
                        ]}>
                        <Text
                          color={item.done ? '#FFFFFF' : c.textSecondary}
                          style={{ fontSize: 11, fontWeight: '700' }}>
                          {item.done ? '✓' : ''}
                        </Text>
                      </Box>
                      <Spacer modifiers={[width(8)]} />
                      <Text
                        color={item.done ? c.textSecondary : c.text}
                        maxLines={1}
                        overflow="ellipsis"
                        style={{
                          fontSize: 13,
                          fontWeight: '500',
                          textDecoration: item.done ? 'lineThrough' : 'none',
                        }}>
                        {item.name}
                      </Text>
                    </Row>
                  </Box>
                  {item.streak > 0 ? (
                    <Box contentAlignment="centerEnd" modifiers={[fillMaxWidth()]}>
                      <Text color={c.warm} style={{ fontSize: 11, fontWeight: '600' }}>
                        {`🔥 ${item.streak}일`}
                      </Text>
                    </Box>
                  ) : null}
                </Box>
              </Button>
            </Column>
          ))}
        </Column>
      )}
    </Column>
  );
}

export default createWidget<HabitsWidgetProps>(
  'HabitsWidget',
  HabitsWidgetLayout,
  INITIAL_HABITS_WIDGET_PROPS,
);
