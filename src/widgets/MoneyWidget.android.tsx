import {
  Box,
  Button,
  Column,
  LinearProgressIndicator,
  Row,
  Spacer,
  Text,
} from '@expo/ui/jetpack-compose';
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

import { INITIAL_MONEY_WIDGET_PROPS, type MoneyWidgetProps } from './types';

function MoneyWidgetLayout(props: MoneyWidgetProps, environment: WidgetEnvironment) {
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
        success: '#4ADE80',
      }
    : {
        bg: '#FFFFFF',
        surface: '#F4F5FA',
        text: '#171626',
        textSecondary: '#6B6C84',
        tint: '#6354EA',
        tintSoft: '#EEECFD',
        danger: '#D92D46',
        success: '#0E9F6E',
      };

  return (
    <Column modifiers={[fillMaxSize(), background(c.bg), cornerRadius(18), paddingAll(14)]}>
      <Box modifiers={[fillMaxWidth()]}>
        <Box contentAlignment="centerStart" modifiers={[fillMaxWidth()]}>
          <Button
            {...({ target: 'open:/money' } as object)}
            colors={{ containerColor: c.bg, contentColor: c.text }}
            contentPadding={{ start: 0, top: 0, end: 0, bottom: 0 }}>
            <Row verticalAlignment="center">
              <Box modifiers={[size(8, 8), background(c.tint), cornerRadius(99)]} />
              <Spacer modifiers={[width(6)]} />
              <Text color={c.text} style={{ fontSize: 15, fontWeight: '700' }}>
                {props.monthLabel}
              </Text>
            </Row>
          </Button>
        </Box>
        <Box contentAlignment="centerEnd" modifiers={[fillMaxWidth()]}>
          <Button
            {...({ target: 'open:/money?add=1' } as object)}
            colors={{ containerColor: c.tintSoft, contentColor: c.tint }}
            contentPadding={{ start: 9, top: 4, end: 9, bottom: 4 }}
            modifiers={[cornerRadius(99)]}>
            <Box contentAlignment="center">
              <Text color={c.tint} style={{ fontSize: 11, fontWeight: '700' }}>
                + 기록
              </Text>
            </Box>
          </Button>
        </Box>
      </Box>

      <Spacer modifiers={[height(10)]} />

      <Button
        {...({ target: 'open:/money' } as object)}
        colors={{ containerColor: c.surface, contentColor: c.text }}
        contentPadding={{ start: 12, top: 9, end: 12, bottom: 9 }}
        modifiers={[fillMaxWidth(), cornerRadius(10)]}>
        <Box modifiers={[fillMaxWidth()]}>
          <Box contentAlignment="centerStart" modifiers={[fillMaxWidth()]}>
            <Text color={c.textSecondary} style={{ fontSize: 12, fontWeight: '600' }}>
              지출
            </Text>
          </Box>
          <Box contentAlignment="centerEnd" modifiers={[fillMaxWidth()]}>
            <Text color={c.danger} style={{ fontSize: 14, fontWeight: '700' }}>
              {props.expenseLabel}
            </Text>
          </Box>
        </Box>
      </Button>

      <Spacer modifiers={[height(6)]} />

      <Button
        {...({ target: 'open:/money' } as object)}
        colors={{ containerColor: c.surface, contentColor: c.text }}
        contentPadding={{ start: 12, top: 9, end: 12, bottom: 9 }}
        modifiers={[fillMaxWidth(), cornerRadius(10)]}>
        <Box modifiers={[fillMaxWidth()]}>
          <Box contentAlignment="centerStart" modifiers={[fillMaxWidth()]}>
            <Text color={c.textSecondary} style={{ fontSize: 12, fontWeight: '600' }}>
              수입
            </Text>
          </Box>
          <Box contentAlignment="centerEnd" modifiers={[fillMaxWidth()]}>
            <Text color={c.success} style={{ fontSize: 14, fontWeight: '700' }}>
              {props.incomeLabel}
            </Text>
          </Box>
        </Box>
      </Button>

      <Spacer modifiers={[height(8)]} />

      <Box modifiers={[fillMaxWidth()]}>
        <Box contentAlignment="centerStart" modifiers={[fillMaxWidth(), padding(0, 0, 96, 0)]}>
          <Text
            color={props.isOverBudget ? c.danger : c.textSecondary}
            maxLines={1}
            overflow="ellipsis"
            style={{ fontSize: 11, fontWeight: '600' }}>
            {props.budgetLabel || '이번 달 요약'}
          </Text>
        </Box>
        <Box contentAlignment="centerEnd" modifiers={[fillMaxWidth()]}>
          <Text color={c.tint} style={{ fontSize: 11, fontWeight: '600' }}>
            {`오늘 ${props.todayExpenseLabel}`}
          </Text>
        </Box>
      </Box>

      {props.budgetProgress >= 0 ? (
        <Column modifiers={[fillMaxWidth()]}>
          <Spacer modifiers={[height(5)]} />
          <LinearProgressIndicator
            progress={props.budgetProgress}
            color={props.isOverBudget ? c.danger : c.tint}
            trackColor={c.surface}
            modifiers={[fillMaxWidth(), height(6), cornerRadius(99)]}
          />
        </Column>
      ) : null}
    </Column>
  );
}

export default createWidget<MoneyWidgetProps>(
  'MoneyWidget',
  MoneyWidgetLayout,
  INITIAL_MONEY_WIDGET_PROPS,
);
