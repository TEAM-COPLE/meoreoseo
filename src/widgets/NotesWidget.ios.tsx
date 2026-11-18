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
      }
    : {
        bg: '#FFFFFF',
        surface: '#F4F5FA',
        text: '#171626',
        textSecondary: '#6B6C84',
        tint: '#6354EA',
        tintSoft: '#EEECFD',
      };

  const maxItems = environment.widgetFamily === 'systemLarge' ? 4 : 2;

  return (
    <VStack
      alignment="leading"
      spacing={8}
      modifiers={[
        padding({ all: 14 }),
        frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'topLeading' }),
        containerBackground(c.bg, 'widget'),
        widgetURL('meoreoseo://notes'),
      ]}>
      <Link destination="meoreoseo://notes">
        <HStack spacing={6}>
          <Text modifiers={[font({ size: 15, weight: 'bold' }), foregroundStyle(c.text)]}>
            메모
          </Text>
          <Text
            modifiers={[
              font({ size: 11, weight: 'semibold' }),
              foregroundStyle(c.tint),
              padding({ horizontal: 7, vertical: 2 }),
              background(c.tintSoft),
              cornerRadius(99),
            ]}>
            {`${props.totalCount}개`}
          </Text>
          <Spacer />
          <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(c.tint)]}>
            전체 보기
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
            작성된 메모가 없어요
          </Text>
        </VStack>
      ) : (
        <VStack alignment="leading" spacing={6}>
          {props.items.slice(0, maxItems).map((item) => (
            <Link key={item.id} destination={`meoreoseo://note/${item.id}`}>
              <VStack
                alignment="leading"
                spacing={2}
                modifiers={[
                  padding({ horizontal: 10, vertical: 7 }),
                  frame({ maxWidth: Infinity, alignment: 'leading' }),
                  background(c.surface),
                  cornerRadius(10),
                ]}>
                <HStack>
                  <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(c.text)]}>
                    {item.pinned ? `📌 ${item.title}` : item.title}
                  </Text>
                  <Spacer />
                  <Text modifiers={[font({ size: 10 }), foregroundStyle(c.textSecondary)]}>
                    {item.updatedLabel}
                  </Text>
                </HStack>
                {item.preview ? (
                  <Text modifiers={[font({ size: 11 }), foregroundStyle(c.textSecondary)]}>
                    {item.preview}
                  </Text>
                ) : null}
              </VStack>
            </Link>
          ))}
        </VStack>
      )}
    </VStack>
  );
}

export default createWidget<NotesWidgetProps>(
  'NotesWidget',
  NotesWidgetLayout,
  INITIAL_NOTES_WIDGET_PROPS,
);
