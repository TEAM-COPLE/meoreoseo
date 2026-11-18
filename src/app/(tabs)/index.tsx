import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState, type PropsWithChildren } from 'react';
import { Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  SectionSkeleton,
  StaggeredReveal,
  type SectionSkeletonVariant,
} from '@/components/ui/loading-animation';
import { Card, Screen } from '@/components/ui/screen';
import { getWeatherAtmosphere, WeatherBackdrop } from '@/components/weather-backdrop';
import { WeatherCityPicker } from '@/components/weather-city-picker';
import { Radius, Spacing } from '@/constants/theme';
import { useMonthlyBudget } from '@/hooks/use-budget';
import { timeLabel, useEvents } from '@/hooks/use-events';
import { streakOf, useDeleteHabit, useHabitLogs, useHabits, useToggleHabitLog } from '@/hooks/use-habits';
import { useTheme, useThemeMode } from '@/hooks/use-theme';
import {
  TODAY_SECTION_LABELS,
  useTodayLayout,
  type TodaySectionId,
} from '@/hooks/use-today-layout';
import { useTodos, useToggleTodo, type Todo } from '@/hooks/use-todos';
import { useTransactions } from '@/hooks/use-transactions';
import { useSaveWeatherCity, useWeather, useWeatherCity } from '@/hooks/use-weather';
import { formatDate, toISODate, todayISO, yearMonthOf } from '@/lib/dates';
import { confirm, errorMessage, formatWon } from '@/lib/format';
import { todoStartOf } from '@/lib/repeat';
import { describeWeather, formatTemperature } from '@/lib/weather';

/**
 * 오늘 화면. 앱을 열면 가장 먼저 보인다.
 * 다른 화면에 흩어져 있는 것 중 "오늘 볼 것"만 모아서 보여준다.
 * 데이터는 각 기능의 훅(use-todos 등)을 그대로 쓰므로, 여기서 체크하면 다른 화면에도 반영된다.
 */
export default function TodayScreen() {
  const today = todayISO();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const isWideWeb = Platform.OS === 'web' && width >= 960;
  const { order, hidden, collapsed, moveSection, toggleHidden, toggleCollapsed, resetLayout } =
    useTodayLayout();
  const [editingLayout, setEditingLayout] = useState(false);

  const visibleOrder = order.filter((id) => !hidden.includes(id));
  const showWeatherTop = visibleOrder.includes('weather');
  const gridSections = visibleOrder.filter((id) => id !== 'weather');

  function renderSection(id: TodaySectionId, index: number) {
    const isCollapsed = collapsed.includes(id);
    const onToggleCollapse = () => toggleCollapsed(id);
    switch (id) {
      case 'weather':
        return (
          <WeatherSection
            key={id}
            index={index}
            collapsed={isCollapsed}
            onToggleCollapse={onToggleCollapse}
          />
        );
      case 'todos':
        return (
          <TodoSection
            key={id}
            today={today}
            index={index}
            collapsed={isCollapsed}
            onToggleCollapse={onToggleCollapse}
          />
        );
      case 'events':
        return (
          <EventSection
            key={id}
            today={today}
            index={index}
            collapsed={isCollapsed}
            onToggleCollapse={onToggleCollapse}
          />
        );
      case 'habits':
        return (
          <HabitSection
            key={id}
            today={today}
            index={index}
            collapsed={isCollapsed}
            onToggleCollapse={onToggleCollapse}
          />
        );
      case 'money':
        return (
          <MoneySection
            key={id}
            today={today}
            index={index}
            collapsed={isCollapsed}
            onToggleCollapse={onToggleCollapse}
          />
        );
    }
  }

  return (
    <Screen
      title="오늘"
      wide
      onRefresh={() => queryClient.refetchQueries({ type: 'active' })}
      action={
        <Button
          label="편집"
          variant="secondary"
          size="small"
          onPress={() => setEditingLayout(true)}
        />
      }>
      <View style={styles.topMetaRow}>
        <ThemedText type="default" themeColor="textSecondary">
          {formatDate(today)}
        </ThemedText>
        <View style={styles.quickActions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/todos', params: { add: '1' } })}
            style={({ pressed }) => [
              styles.quickPill,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
                opacity: pressed ? 0.7 : 1,
              },
            ]}>
            <ThemedText type="small" themeColor="tint">
              + 할 일
            </ThemedText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/money', params: { add: '1' } })}
            style={({ pressed }) => [
              styles.quickPill,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
                opacity: pressed ? 0.7 : 1,
              },
            ]}>
            <ThemedText type="small" themeColor="tint">
              + 가계부
            </ThemedText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/note/new')}
            style={({ pressed }) => [
              styles.quickPill,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
                opacity: pressed ? 0.7 : 1,
              },
            ]}>
            <ThemedText type="small" themeColor="tint">
              + 메모
            </ThemedText>
          </Pressable>
        </View>
      </View>

      {isWideWeb ? (
        <>
          {showWeatherTop ? renderSection('weather', 0) : null}
          <View style={styles.webGrid}>
            {gridSections.map((id, idx) => (
              <View key={id} style={styles.webGridItem}>
                {renderSection(id, showWeatherTop ? idx + 1 : idx)}
              </View>
            ))}
          </View>
        </>
      ) : (
        visibleOrder.map((id, idx) => renderSection(id, idx))
      )}

      {visibleOrder.length === 0 ? (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            표시할 카드가 없습니다. 오른쪽 위 &quot;편집&quot;을 눌러 카드를 다시 켜 보세요.
          </ThemedText>
        </Card>
      ) : null}

      <TodayLayoutModal
        visible={editingLayout}
        order={order}
        hidden={hidden}
        onMove={moveSection}
        onToggleHidden={toggleHidden}
        onReset={resetLayout}
        onClose={() => setEditingLayout(false)}
      />
    </Screen>
  );
}

/** 비 올 확률이 이 값(%) 이상이면 우산을 챙기라고 알려준다. */
const UMBRELLA_RAIN_CHANCE = 50;

/** 고른 도시의 지금 날씨와 오늘 최고·최저 기온. "지역 변경"으로 도시를 바꾼다. */
function WeatherSection({
  index,
  collapsed,
  onToggleCollapse,
}: {
  index: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const { resolvedScheme } = useThemeMode();
  const city = useWeatherCity();
  const weather = useWeather(city.data);
  const saveCity = useSaveWeatherCity();
  // 도시 고르는 목록을 펼쳤는지 여부
  const [picking, setPicking] = useState(false);

  const now = weather.data;
  const look = now ? describeWeather(now.code, now.isDay) : null;
  const atmosphere = now ? getWeatherAtmosphere(now.code, now.isDay, resolvedScheme) : null;

  return (
    <Section
      index={index}
      highlight={!atmosphere}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      cardStyle={
        atmosphere
          ? {
              backgroundColor: atmosphere.background,
              borderColor: atmosphere.border,
              overflow: 'hidden',
            }
          : undefined
      }
      backdrop={now ? <WeatherBackdrop code={now.code} isDay={now.isDay} /> : null}
      title={city.data ? `날씨 · ${city.data.name}` : '날씨'}
      linkLabel={picking ? '닫기' : '지역 변경'}
      onLink={() => setPicking((open) => !open)}>
      {picking ? (
        <WeatherCityPicker
          disabled={saveCity.isPending}
          onSelect={(place) => {
            saveCity.mutate(place);
            setPicking(false);
          }}
        />
      ) : null}

      <SectionStatus
        loading={city.isPending || weather.isPending}
        error={weather.error}
        onRetry={weather.refetch}
        variant="weather"
      />

      {now && look ? (
        <>
          <View style={styles.weatherMain}>
            <ThemedText style={styles.weatherIcon} accessibilityLabel={look.label}>
              {look.icon}
            </ThemedText>
            <View style={styles.rowBody}>
              <ThemedText type="default" style={styles.weatherTemp}>
                {formatTemperature(now.temperature)} {look.label}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                체감 {formatTemperature(now.feelsLike)} · 최고 {formatTemperature(now.high)} · 최저{' '}
                {formatTemperature(now.low)}
              </ThemedText>
            </View>
          </View>
          {now.rainChance !== null ? (
            <ThemedText
              type="small"
              themeColor={now.rainChance >= UMBRELLA_RAIN_CHANCE ? 'tint' : 'textSecondary'}>
              {`비 올 확률 ${now.rainChance}%`}
              {now.rainChance >= UMBRELLA_RAIN_CHANCE ? ' · 우산을 챙기세요' : ''}
            </ThemedText>
          ) : null}
        </>
      ) : null}

      {saveCity.error ? <SaveError /> : null}
    </Section>
  );
}

/**
 * 오늘 챙길 할 일인지 판단한다: 시작일(없으면 마감일)이 오늘이거나 지났고, 아직 안 했거나 오늘 끝낸 것.
 * 시작일 ~ 마감일 기간 중인 할 일도 여기에 들어간다.
 */
function isForToday(todo: Todo, today: string): boolean {
  const start = todoStartOf(todo);
  if (start === null || start > today) return false;
  if (!todo.done) return true;
  // 오늘 완료한 것은 체크된 채로 남겨 둔다. 누르자마자 사라지면 잘못 눌렀을 때 되돌리기 어렵다.
  return todo.done_at !== null && toISODate(new Date(todo.done_at)) === today;
}

function TodoSection({
  today,
  index,
  collapsed,
  onToggleCollapse,
}: {
  today: string;
  index: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const todos = useTodos();
  const toggle = useToggleTodo();

  const all = todos.data ?? [];
  const items = all.filter((todo) => isForToday(todo, today));
  // 마감일이 없거나 나중인 할 일의 수. 오늘 할 것이 없을 때 알려준다.
  const laterCount = all.filter((todo) => !todo.done).length - items.filter((t) => !t.done).length;

  return (
    <Section
      index={index}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      title="할 일"
      onQuickAdd={() => router.push({ pathname: '/todos', params: { add: '1' } })}
      linkLabel="전체 보기"
      onLink={() => router.navigate('/todos')}>
      <SectionStatus
        loading={todos.isPending}
        error={todos.error}
        onRetry={todos.refetch}
        variant="list"
      />

      {todos.data && items.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          오늘 마감인 할 일이 없습니다.
          {laterCount > 0 ? ` 진행 중인 다른 할 일이 ${laterCount}개 있습니다.` : ''}
        </ThemedText>
      ) : null}

      {items.map((todo) => {
        const overdue = !todo.done && todo.due_date !== null && todo.due_date < today;
        return (
          <View key={todo.id} style={styles.row}>
            <Checkbox
              checked={todo.done}
              label={`${todo.title} 완료 표시`}
              onPress={() => toggle.mutate(todo)}
            />
            <View style={styles.rowBody}>
              <ThemedText
                type="default"
                themeColor={todo.done ? 'textSecondary' : 'text'}
                style={todo.done && styles.doneTitle}>
                {todo.title}
              </ThemedText>
              {overdue && todo.due_date ? (
                <ThemedText type="small" themeColor="danger">
                  {formatDate(todo.due_date)} · 기한 지남
                </ThemedText>
              ) : null}
            </View>
          </View>
        );
      })}

      {toggle.error ? <SaveError /> : null}
    </Section>
  );
}

function EventSection({
  today,
  index,
  collapsed,
  onToggleCollapse,
}: {
  today: string;
  index: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const events = useEvents(yearMonthOf(today));
  const items = (events.data ?? []).filter((event) => event.event_date === today);

  return (
    <Section
      index={index}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      title="일정"
      onQuickAdd={() => router.push({ pathname: '/calendar', params: { add: '1' } })}
      linkLabel="달력 보기"
      onLink={() => router.navigate('/calendar')}>
      <SectionStatus
        loading={events.isPending}
        error={events.error}
        onRetry={events.refetch}
        variant="list"
      />

      {events.data && items.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          오늘은 일정이 없습니다.
        </ThemedText>
      ) : null}

      {items.map((event) => (
        <View key={event.key} style={styles.row}>
          <ThemedText type="small" themeColor="tint" style={styles.time}>
            {timeLabel(event)}
          </ThemedText>
          <ThemedText type="default" style={styles.rowBody}>
            {event.title}
          </ThemedText>
        </View>
      ))}
    </Section>
  );
}

function HabitSection({
  today,
  index,
  collapsed,
  onToggleCollapse,
}: {
  today: string;
  index: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const habits = useHabits();
  const logs = useHabitLogs();
  const toggle = useToggleHabitLog();
  const removeHabit = useDeleteHabit();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const items = habits.data ?? [];
  const ready = habits.data !== undefined && logs.data !== undefined;
  const doneCount = items.filter((habit) => logs.data?.get(habit.id)?.has(today)).length;

  async function deleteHabit(id: string, name: string) {
    const ok = await confirm({
      title: '습관을 삭제할까요?',
      message: `'${name}' 습관과 지금까지의 실천 기록이 모두 삭제됩니다.`,
      confirmLabel: '삭제',
    });
    if (!ok) return;
    setDeleteError(null);
    try {
      await removeHabit.mutateAsync(id);
    } catch (e) {
      setDeleteError(errorMessage(e));
    }
  }

  return (
    <Section
      index={index}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      title={ready && items.length > 0 ? `습관 ${doneCount}/${items.length}` : '습관'}
      // 습관을 추가·수정하거나 지난 7일을 보려면 습관 화면(src/app/habits.tsx)으로 간다.
      linkLabel="관리"
      onLink={() => router.push('/habits')}>
      <SectionStatus
        loading={habits.isPending || logs.isPending}
        error={habits.error ?? logs.error}
        onRetry={() => {
          habits.refetch();
          logs.refetch();
        }}
        variant="list"
      />

      {ready && items.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          {'아직 습관이 없습니다. "관리"를 눌러 매일 할 일을 정해 보세요.'}
        </ThemedText>
      ) : null}

      {ready
        ? items.map((habit) => {
            const dates = logs.data?.get(habit.id);
            const done = dates?.has(today) ?? false;
            const streak = streakOf(dates);
            return (
              <View key={habit.id} style={styles.row}>
                <Checkbox
                  checked={done}
                  label={`${habit.name} 오늘 실천 표시`}
                  onPress={() => toggle.mutate({ habitId: habit.id, date: today, done })}
                  onLongPress={() => deleteHabit(habit.id, habit.name)}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${habit.name} 수정 또는 삭제`}
                  delayLongPress={320}
                  onPress={() => router.push({ pathname: '/habits', params: { editId: habit.id } })}
                  onLongPress={() => deleteHabit(habit.id, habit.name)}
                  style={({ pressed }) => [styles.rowBody, pressed && styles.pressed]}>
                  <ThemedText type="default">{habit.name}</ThemedText>
                </Pressable>
                {streak > 0 ? (
                  <ThemedText type="small" themeColor="tint">
                    {streak}일 연속
                  </ThemedText>
                ) : null}
              </View>
            );
          })
        : null}

      {toggle.error ? <SaveError /> : null}
      {deleteError ? (
        <ThemedText type="small" themeColor="danger">
          {deleteError}
        </ThemedText>
      ) : null}
    </Section>
  );
}

function MoneySection({
  today,
  index,
  collapsed,
  onToggleCollapse,
}: {
  today: string;
  index: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const theme = useTheme();
  const { budget } = useMonthlyBudget();
  const transactions = useTransactions(yearMonthOf(today));
  const items = transactions.data ?? [];

  const sum = (list: typeof items) => list.reduce((total, item) => total + item.amount, 0);
  const expenses = items.filter((item) => item.kind === 'expense');
  const income = sum(items.filter((item) => item.kind === 'income'));
  const expense = sum(expenses);
  const todayExpense = sum(expenses.filter((item) => item.occurred_on === today));
  const budgetRatio = budget && budget > 0 ? expense / budget : 0;
  const budgetColor =
    budgetRatio >= 1 ? theme.danger : budgetRatio >= 0.75 ? theme.accentWarm : theme.tint;

  return (
    <Section
      index={index}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      title="이번 달 가계부"
      onQuickAdd={() => router.push({ pathname: '/money', params: { add: '1' } })}
      linkLabel="내역 보기"
      onLink={() => router.navigate('/money')}>
      <SectionStatus
        loading={transactions.isPending}
        error={transactions.error}
        onRetry={transactions.refetch}
        variant="stats"
      />

      {transactions.data ? (
        <>
          <View style={styles.stats}>
            <Stat label="오늘 쓴 돈" value={formatWon(todayExpense)} color={theme.text} />
            <Stat label="이번 달 지출" value={formatWon(expense)} color={theme.danger} />
            <Stat label="남은 돈" value={formatWon(income - expense)} color={theme.text} />
          </View>
          {budget ? (
            <View style={styles.budgetWrap}>
              <View style={[styles.budgetTrack, { backgroundColor: theme.backgroundSelected }]}>
                <View
                  style={[
                    styles.budgetFill,
                    {
                      backgroundColor: budgetColor,
                      width: `${Math.min(100, Math.max(0, budgetRatio * 100))}%`,
                    },
                  ]}
                />
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                예산 {formatWon(budget)} 중 {Math.round(budgetRatio * 100)}% 사용
              </ThemedText>
            </View>
          ) : null}
          {items.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              이번 달에는 아직 기록이 없습니다.
            </ThemedText>
          ) : null}
        </>
      ) : null}
    </Section>
  );
}

/** 제목 줄(왼쪽 제목, 오른쪽 이동/추가/접기 버튼)과 내용을 담는 상자. */
function Section({
  index = 0,
  highlight = false,
  collapsed = false,
  onToggleCollapse,
  onQuickAdd,
  cardStyle,
  backdrop,
  title,
  linkLabel,
  onLink,
  children,
}: PropsWithChildren<{
  index?: number;
  highlight?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onQuickAdd?: () => void;
  cardStyle?: StyleProp<ViewStyle>;
  backdrop?: React.ReactNode;
  title: string;
  linkLabel: string;
  onLink: () => void;
}>) {
  const theme = useTheme();
  return (
    <StaggeredReveal index={index}>
      <Card highlight={highlight} style={cardStyle}>
        {backdrop}
        <View style={styles.sectionHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${title} ${collapsed ? '펼치기' : '접기'}`}
            onPress={onToggleCollapse}
            style={styles.sectionTitlePress}>
            <ThemedText accessibilityRole="header" type="default" style={styles.sectionTitle}>
              {title}
            </ThemedText>
            {onToggleCollapse ? (
              <ThemedText type="small" themeColor="textSecondary">
                {collapsed ? '▸' : '▾'}
              </ThemedText>
            ) : null}
          </Pressable>
          {onQuickAdd ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${title} 빠르게 추가`}
              hitSlop={8}
              onPress={onQuickAdd}
              style={({ pressed }) => [
                styles.sectionAddBtn,
                { backgroundColor: theme.tintSoft, opacity: pressed ? 0.7 : 1 },
              ]}>
              <ThemedText type="smallBold" themeColor="tint">
                +
              </ThemedText>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${title} ${linkLabel}`}
            hitSlop={10}
            onPress={onLink}
            style={({ pressed }) => pressed && styles.pressed}>
            <ThemedText type="small" themeColor="tint">
              {linkLabel} ›
            </ThemedText>
          </Pressable>
        </View>
        {!collapsed ? children : null}
      </Card>
    </StaggeredReveal>
  );
}

function TodayLayoutModal({
  visible,
  order,
  hidden,
  onMove,
  onToggleHidden,
  onReset,
  onClose,
}: {
  visible: boolean;
  order: TodaySectionId[];
  hidden: TodaySectionId[];
  onMove: (id: TodaySectionId, dir: -1 | 1) => void;
  onToggleHidden: (id: TodaySectionId) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const theme = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={styles.modalBackdrop}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.modalCard,
            { backgroundColor: theme.backgroundElement, borderColor: theme.border },
          ]}>
          <ThemedText type="default" style={styles.modalTitle}>
            오늘 화면 구성
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            카드 순서를 바꾸거나 필요 없는 카드를 숨길 수 있습니다.
          </ThemedText>

          <View style={styles.layoutList}>
            {order.map((id, idx) => {
              const isHidden = hidden.includes(id);
              return (
                <View
                  key={id}
                  style={[
                    styles.layoutRow,
                    { backgroundColor: theme.background, borderColor: theme.border },
                  ]}>
                  <ThemedText
                    type="smallBold"
                    themeColor={isHidden ? 'textSecondary' : 'text'}
                    style={styles.layoutName}>
                    {TODAY_SECTION_LABELS[id]}
                  </ThemedText>
                  <View style={styles.layoutControls}>
                    <Pressable
                      disabled={idx === 0}
                      onPress={() => onMove(id, -1)}
                      style={[styles.iconBtn, { opacity: idx === 0 ? 0.3 : 1 }]}>
                      <ThemedText type="small">▲</ThemedText>
                    </Pressable>
                    <Pressable
                      disabled={idx === order.length - 1}
                      onPress={() => onMove(id, 1)}
                      style={[styles.iconBtn, { opacity: idx === order.length - 1 ? 0.3 : 1 }]}>
                      <ThemedText type="small">▼</ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={() => onToggleHidden(id)}
                      style={[
                        styles.visPill,
                        {
                          backgroundColor: isHidden ? theme.backgroundSelected : theme.tintSoft,
                        },
                      ]}>
                      <ThemedText
                        type="smallBold"
                        style={{ color: isHidden ? theme.textSecondary : theme.tint }}>
                        {isHidden ? '숨김' : '표시'}
                      </ThemedText>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>

          <View style={styles.modalFooter}>
            <Button label="기본값 복원" variant="secondary" size="small" onPress={onReset} />
            <Button label="완료" size="small" onPress={onClose} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** 상자 안에서 "불러오는 중"이나 "불러오지 못함"을 작게 보여준다. 정상일 때는 아무것도 그리지 않는다. */
function SectionStatus({
  loading,
  error,
  onRetry,
  variant = 'list',
}: {
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  variant?: SectionSkeletonVariant;
}) {
  if (loading) {
    return <SectionSkeleton variant={variant} />;
  }
  if (error) {
    return (
      <View style={styles.row}>
        <ThemedText type="small" themeColor="danger" style={styles.rowBody}>
          불러오지 못했습니다.
        </ThemedText>
        <Button label="다시 시도" variant="secondary" size="small" onPress={onRetry} />
      </View>
    );
  }
  return null;
}

function SaveError() {
  return (
    <ThemedText type="small" themeColor="danger">
      저장하지 못했습니다. 다시 시도해 주세요.
    </ThemedText>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.stat}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="default" style={[styles.statValue, { color }]}>
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  sectionTitle: {
    flex: 1,
    fontWeight: 700,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 36,
  },
  rowBody: {
    flex: 1,
  },
  doneTitle: {
    textDecorationLine: 'line-through',
  },
  time: {
    minWidth: 96,
  },
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  stat: {
    flexGrow: 1,
    flexBasis: 96,
    gap: Spacing.half,
  },
  statValue: {
    fontWeight: 700,
  },
  pressed: {
    opacity: 0.6,
  },
  weatherMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  weatherIcon: {
    fontSize: 40,
    lineHeight: 48,
  },
  weatherTemp: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: 700,
  },
  topMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  quickActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  quickPill: {
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one + 1,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  webGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
    alignItems: 'flex-start',
  },
  webGridItem: {
    flexBasis: '48%',
    flexGrow: 1,
    minWidth: 320,
  },
  sectionTitlePress: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  sectionAddBtn: {
    width: 24,
    height: 24,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  budgetWrap: {
    gap: Spacing.one,
  },
  budgetTrack: {
    height: 7,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  budgetFill: {
    height: 7,
    borderRadius: Radius.full,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 10, 18, 0.56)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.three,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: Radius.large,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  modalTitle: {
    fontWeight: 700,
    fontSize: 18,
  },
  layoutList: {
    gap: Spacing.two,
  },
  layoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three - 4,
    paddingVertical: Spacing.two,
    borderRadius: Radius.medium,
    borderWidth: 1,
  },
  layoutName: {
    flex: 1,
  },
  layoutControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  iconBtn: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  visPill: {
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one,
    borderRadius: Radius.full,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
