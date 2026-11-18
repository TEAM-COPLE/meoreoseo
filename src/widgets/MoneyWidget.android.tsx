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
      <Button
        {...({ target: 'open:/money' } as object)}
        colors={{ containerColor: c.bg, contentColor: c.text }}
        contentPadding={{ start: 0, top: 0, end: 0, bottom: 0 }}
        modifiers={[fillMaxSize()]}>
        <Column modifiers={[fillMaxSize()]}>
          <Row verticalAlignment="center" modifiers={[fillMaxWidth()]}>
            <Box modifiers={[size(8, 8), background(c.tint), cornerRadius(99)]} />
            <Spacer modifiers={[width(6)]} />
            <Text color={c.text} style={{ fontSize: 15, fontWeight: '700' }}>
              {props.monthLabel}
            </Text>
            <Spacer />
            <Box modifiers={[background(c.tintSoft), cornerRadius(99), padding(7, 2, 7, 2)]}>
              <Text color={c.tint} style={{ fontSize: 11, fontWeight: '600' }}>
                {`오늘 ${props.todayExpenseLabel}`}
              </Text>
            </Box>
          </Row>

          <Spacer modifiers={[height(10)]} />

          <Row verticalAlignment="center" modifiers={[fillMaxWidth()]}>
            <Column
              modifiers={[
                background(c.surface),
                cornerRadius(12),
                paddingAll(10),
              ]}>
              <Text color={c.textSecondary} style={{ fontSize: 11, fontWeight: '500' }}>
                지출
              </Text>
              <Spacer modifiers={[height(2)]} />
              <Text color={c.danger} style={{ fontSize: 15, fontWeight: '700' }}>
                {props.expenseLabel}
              </Text>
            </Column>
            <Spacer modifiers={[width(8)]} />
            <Column
              modifiers={[
                fillMaxWidth(),
                background(c.surface),
                cornerRadius(12),
                paddingAll(10),
              ]}>
              <Text color={c.textSecondary} style={{ fontSize: 11, fontWeight: '500' }}>
                수입
              </Text>
              <Spacer modifiers={[height(2)]} />
              <Text color={c.success} style={{ fontSize: 15, fontWeight: '700' }}>
                {props.incomeLabel}
              </Text>
            </Column>
          </Row>

          {props.budgetLabel ? (
            <Column modifiers={[fillMaxWidth()]}>
              <Spacer modifiers={[height(10)]} />
              <Text
                color={props.isOverBudget ? c.danger : c.textSecondary}
                style={{ fontSize: 11, fontWeight: '600' }}>
                {props.budgetLabel}
              </Text>
              {props.budgetProgress !== null ? (
                <Column modifiers={[fillMaxWidth()]}>
                  <Spacer modifiers={[height(4)]} />
                  <LinearProgressIndicator
                    progress={props.budgetProgress}
                    color={props.isOverBudget ? c.danger : c.tint}
                    trackColor={c.surface}
                    modifiers={[fillMaxWidth(), height(6), cornerRadius(99)]}
                  />
                </Column>
              ) : null}
            </Column>
          ) : null}
        </Column>
      </Button>
    </Column>
  );
}

export default createWidget<MoneyWidgetProps>(
  'MoneyWidget',
  MoneyWidgetLayout,
  INITIAL_MONEY_WIDGET_PROPS,
);
