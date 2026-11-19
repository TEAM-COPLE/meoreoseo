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
    const nextPending = nextItems.filter((item) => !item.done).length;
    return {
      ...props,
      pendingCount: nextPending,
      items: nextItems,
    } as unknown as React.JSX.Element;
  }

  return (
    <Column modifiers={[fillMaxSize(), background(c.bg), cornerRadius(18), paddingAll(14)]}>
      <Box modifiers={[fillMaxWidth()]}>
        <Box contentAlignment="centerStart" modifiers={[fillMaxWidth()]}>
          <Button
            {...({ target: 'open:/todos' } as object)}
            colors={{ containerColor: c.bg, contentColor: c.text }}
            contentPadding={{ start: 0, top: 0, end: 0, bottom: 0 }}>
            <Row verticalAlignment="center">
              <Box modifiers={[size(8, 8), background(c.tint), cornerRadius(99)]} />
              <Spacer modifiers={[width(6)]} />
              <Text color={c.text} style={{ fontSize: 15, fontWeight: '700' }}>
                할 일
              </Text>
              <Spacer modifiers={[width(6)]} />
              <Box modifiers={[background(c.tintSoft), cornerRadius(99), padding(7, 2, 7, 2)]}>
                <Text color={c.tint} style={{ fontSize: 11, fontWeight: '600' }}>
                  {`${props.pendingCount}개 남음`}
                </Text>
              </Box>
            </Row>
          </Button>
        </Box>
        <Box contentAlignment="centerEnd" modifiers={[fillMaxWidth()]}>
          <Button
            {...({ target: 'open:/todos?add=1' } as object)}
            colors={{ containerColor: c.tintSoft, contentColor: c.tint }}
            contentPadding={{ start: 9, top: 4, end: 9, bottom: 4 }}
            modifiers={[cornerRadius(99)]}>
            <Text color={c.tint} style={{ fontSize: 11, fontWeight: '700' }}>
              + 추가
            </Text>
          </Button>
        </Box>
      </Box>

      <Spacer modifiers={[height(10)]} />

      {props.items.length === 0 ? (
        <Button
          {...({ target: 'open:/todos?add=1' } as object)}
          colors={{ containerColor: c.surface, contentColor: c.textSecondary }}
          contentPadding={{ start: 12, top: 12, end: 12, bottom: 12 }}
          modifiers={[fillMaxSize(), cornerRadius(12)]}>
          <Text color={c.textSecondary} style={{ fontSize: 13, fontWeight: '500' }}>
            남은 할 일이 없어요 · 눌러서 추가
          </Text>
        </Button>
      ) : (
        <Column modifiers={[fillMaxWidth()]}>
          {props.items.slice(0, 4).map((item, idx) => (
            <Column key={item.id} modifiers={[fillMaxWidth()]}>
              {idx > 0 ? <Spacer modifiers={[height(6)]} /> : null}
              <Button
                {...({ target: `toggle-todo:${item.id}` } as object)}
                colors={{ containerColor: c.surface, contentColor: c.text }}
                contentPadding={{ start: 10, top: 8, end: 10, bottom: 8 }}
                modifiers={[fillMaxWidth(), cornerRadius(10)]}>
                <Box modifiers={[fillMaxWidth()]}>
                  <Box contentAlignment="centerStart" modifiers={[fillMaxWidth(), padding(0, 0, item.dueLabel ? 46 : 0, 0)]}>
                    <Row verticalAlignment="center">
                      <Box
                        contentAlignment="center"
                        modifiers={[
                          size(18, 18),
                          background(item.done ? c.tint : c.bg),
                          cornerRadius(6),
                        ]}>
                        <Text
                          color={item.done ? '#FFFFFF' : c.tint}
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
                        {item.title}
                      </Text>
                    </Row>
                  </Box>
                  {item.dueLabel ? (
                    <Box contentAlignment="centerEnd" modifiers={[fillMaxWidth()]}>
                      <Box
                        modifiers={[
                          background(item.isOverdue ? c.dangerSoft : c.tintSoft),
                          cornerRadius(6),
                          padding(6, 2, 6, 2),
                        ]}>
                        <Text
                          color={item.isOverdue ? c.danger : c.tint}
                          style={{ fontSize: 10, fontWeight: '600' }}>
                          {item.dueLabel}
                        </Text>
                      </Box>
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

export default createWidget<TodoWidgetProps>(
  'TodoWidget',
  TodoWidgetLayout,
  INITIAL_TODO_WIDGET_PROPS,
);
