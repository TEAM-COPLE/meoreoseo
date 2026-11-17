import { router } from 'expo-router';
import { useState, type PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, Screen } from '@/components/ui/screen';
import { WeatherCityPicker } from '@/components/weather-city-picker';
import { Spacing } from '@/constants/theme';
import { timeLabel, useEvents } from '@/hooks/use-events';
import { streakOf, useDeleteHabit, useHabitLogs, useHabits, useToggleHabitLog } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import { useTodos, useToggleTodo, type Todo } from '@/hooks/use-todos';
import { useTransactions } from '@/hooks/use-transactions';
import { useSaveWeatherCity, useWeather, useWeatherCity } from '@/hooks/use-weather';
import { formatDate, toISODate, todayISO, yearMonthOf } from '@/lib/dates';
import { confirm, errorMessage, formatWon } from '@/lib/format';
import { describeWeather, formatTemperature } from '@/lib/weather';

/**
 * 오늘 화면. 앱을 열면 가장 먼저 보인다.
 * 다른 화면에 흩어져 있는 것 중 "오늘 볼 것"만 모아서 보여준다.
 * 데이터는 각 기능의 훅(use-todos 등)을 그대로 쓰므로, 여기서 체크하면 다른 화면에도 반영된다.
 */
export default function TodayScreen() {
  const today = todayISO();

  return (
    <Screen title="오늘">
      <ThemedText type="default" themeColor="textSecondary">
        {formatDate(today)}
      </ThemedText>

      <WeatherSection />
      <TodoSection today={today} />
      <EventSection today={today} />
      <HabitSection today={today} />
      <MoneySection today={today} />
    </Screen>
  );
}

/** 비 올 확률이 이 값(%) 이상이면 우산을 챙기라고 알려준다. */
const UMBRELLA_RAIN_CHANCE = 50;

/** 고른 도시의 지금 날씨와 오늘 최고·최저 기온. "지역 변경"으로 도시를 바꾼다. */
function WeatherSection() {
  const city = useWeatherCity();
  const weather = useWeather(city.data);
  const saveCity = useSaveWeatherCity();
  // 도시 고르는 목록을 펼쳤는지 여부
  const [picking, setPicking] = useState(false);

  const now = weather.data;
  const look = now ? describeWeather(now.code, now.isDay) : null;

  return (
    <Section
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

/** 오늘 챙길 할 일인지 판단한다: 마감이 오늘이거나 지났고, 아직 안 했거나 오늘 끝낸 것. */
function isForToday(todo: Todo, today: string): boolean {
  if (todo.due_date === null || todo.due_date > today) return false;
  if (!todo.done) return true;
  // 오늘 완료한 것은 체크된 채로 남겨 둔다. 누르자마자 사라지면 잘못 눌렀을 때 되돌리기 어렵다.
  return todo.done_at !== null && toISODate(new Date(todo.done_at)) === today;
}

function TodoSection({ today }: { today: string }) {
  const todos = useTodos();
  const toggle = useToggleTodo();

  const all = todos.data ?? [];
  const items = all.filter((todo) => isForToday(todo, today));
  // 마감일이 없거나 나중인 할 일의 수. 오늘 할 것이 없을 때 알려준다.
  const laterCount = all.filter((todo) => !todo.done).length - items.filter((t) => !t.done).length;

  return (
    <Section title="할 일" linkLabel="전체 보기" onLink={() => router.navigate('/todos')}>
      <SectionStatus loading={todos.isPending} error={todos.error} onRetry={todos.refetch} />

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

function EventSection({ today }: { today: string }) {
  const events = useEvents(yearMonthOf(today));
  const items = (events.data ?? []).filter((event) => event.event_date === today);

  return (
    <Section title="일정" linkLabel="달력 보기" onLink={() => router.navigate('/calendar')}>
      <SectionStatus loading={events.isPending} error={events.error} onRetry={events.refetch} />

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

function HabitSection({ today }: { today: string }) {
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

function MoneySection({ today }: { today: string }) {
  const theme = useTheme();
  const transactions = useTransactions(yearMonthOf(today));
  const items = transactions.data ?? [];

  const sum = (list: typeof items) => list.reduce((total, item) => total + item.amount, 0);
  const expenses = items.filter((item) => item.kind === 'expense');
  const income = sum(items.filter((item) => item.kind === 'income'));
  const expense = sum(expenses);
  const todayExpense = sum(expenses.filter((item) => item.occurred_on === today));

  return (
    <Section title="이번 달 가계부" linkLabel="내역 보기" onLink={() => router.navigate('/money')}>
      <SectionStatus
        loading={transactions.isPending}
        error={transactions.error}
        onRetry={transactions.refetch}
      />

      {transactions.data ? (
        <>
          <View style={styles.stats}>
            <Stat label="오늘 쓴 돈" value={formatWon(todayExpense)} color={theme.text} />
            <Stat label="이번 달 지출" value={formatWon(expense)} color={theme.danger} />
            <Stat label="남은 돈" value={formatWon(income - expense)} color={theme.text} />
          </View>
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

/** 제목 줄(왼쪽 제목, 오른쪽 이동 버튼)과 내용을 담는 상자. */
function Section({
  title,
  linkLabel,
  onLink,
  children,
}: PropsWithChildren<{ title: string; linkLabel: string; onLink: () => void }>) {
  return (
    <Card>
      <View style={styles.sectionHeader}>
        <ThemedText accessibilityRole="header" type="default" style={styles.sectionTitle}>
          {title}
        </ThemedText>
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
      {children}
    </Card>
  );
}

/** 상자 안에서 "불러오는 중"이나 "불러오지 못함"을 작게 보여준다. 정상일 때는 아무것도 그리지 않는다. */
function SectionStatus({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const theme = useTheme();

  if (loading) {
    return (
      <View style={styles.status}>
        <ActivityIndicator color={theme.textSecondary} />
      </View>
    );
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
  status: {
    paddingVertical: Spacing.two,
    alignItems: 'center',
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
});
