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

import { INITIAL_NOTES_WIDGET_PROPS, type NotesWidgetProps } from './types';

function NotesWidgetLayout(props: NotesWidgetProps, environment: WidgetEnvironment) {
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
      <Button
        {...({ target: 'open:/notes' } as object)}
        colors={{ containerColor: c.bg, contentColor: c.text }}
        contentPadding={{ start: 0, top: 0, end: 0, bottom: 0 }}
        modifiers={[fillMaxWidth()]}>
        <Row verticalAlignment="center" modifiers={[fillMaxWidth()]}>
          <Box modifiers={[size(8, 8), background(c.tint), cornerRadius(99)]} />
          <Spacer modifiers={[width(6)]} />
          <Text color={c.text} style={{ fontSize: 15, fontWeight: '700' }}>
            메모
          </Text>
          <Spacer modifiers={[width(6)]} />
          <Box modifiers={[background(c.tintSoft), cornerRadius(99), padding(7, 2, 7, 2)]}>
            <Text color={c.tint} style={{ fontSize: 11, fontWeight: '600' }}>
              {`${props.totalCount}개`}
            </Text>
          </Box>
          <Spacer />
          <Text color={c.tint} style={{ fontSize: 11, fontWeight: '600' }}>
            전체 보기
          </Text>
        </Row>
      </Button>

      <Spacer modifiers={[height(10)]} />

      {props.items.length === 0 ? (
        <Column
          verticalArrangement="center"
          horizontalAlignment="center"
          modifiers={[fillMaxSize(), background(c.surface), cornerRadius(12), paddingAll(12)]}>
          <Text color={c.textSecondary} style={{ fontSize: 13, fontWeight: '500' }}>
            작성된 메모가 없어요
          </Text>
        </Column>
      ) : (
        <Column modifiers={[fillMaxWidth()]}>
          {props.items.slice(0, 3).map((item, idx) => (
            <Column key={item.id} modifiers={[fillMaxWidth()]}>
              {idx > 0 ? <Spacer modifiers={[height(6)]} /> : null}
              <Button
                {...({ target: `open:/note/${item.id}` } as object)}
                colors={{ containerColor: c.surface, contentColor: c.text }}
                contentPadding={{ start: 10, top: 8, end: 10, bottom: 8 }}
                modifiers={[fillMaxWidth(), cornerRadius(10)]}>
                <Column modifiers={[fillMaxWidth()]}>
                  <Row verticalAlignment="center" modifiers={[fillMaxWidth()]}>
                    <Text
                      color={c.text}
                      maxLines={1}
                      overflow="ellipsis"
                      style={{ fontSize: 13, fontWeight: '600' }}>
                      {item.pinned ? `📌 ${item.title}` : item.title}
                    </Text>
                    <Spacer />
                    <Text color={c.textSecondary} style={{ fontSize: 10, fontWeight: '400' }}>
                      {item.updatedLabel}
                    </Text>
                  </Row>
                  {item.preview ? (
                    <Text
                      color={c.textSecondary}
                      maxLines={1}
                      overflow="ellipsis"
                      style={{ fontSize: 11, fontWeight: '400' }}>
                      {item.preview}
                    </Text>
                  ) : null}
                </Column>
              </Button>
            </Column>
          ))}
        </Column>
      )}
    </Column>
  );
}

export default createWidget<NotesWidgetProps>(
  'NotesWidget',
  NotesWidgetLayout,
  INITIAL_NOTES_WIDGET_PROPS,
);
