import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { FormModal } from '@/components/ui/form-modal';
import { Card, ListStatus, Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { Radius, Spacing } from '@/constants/theme';
import {
  streakOf,
  useDeleteHabit,
  useHabitLogs,
  useHabits,
  useSaveHabit,
  useToggleHabitLog,
  type Habit,
} from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import { dayOf, lastDays, weekdayOf } from '@/lib/dates';
import { confirm, errorMessage } from '@/lib/format';

/** 오늘 화면으로 돌아간다. 이 화면을 주소로 바로 연 경우에는 돌아갈 곳이 없으므로 새로 연다. */
function leave() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/');
  }
}

/**
 * 습관 관리 화면. 오늘 화면의 습관 상자에서 "관리"를 누르면 열린다.
 * 습관을 추가·수정·삭제하고, 지난 7일의 기록을 보고 고칠 수 있다.
 * (Android 는 아래 탭이 5개까지라, 오늘 화면에서 매일 체크할 수 있는 습관을 탭에서 뺐다.)
 */
export default function HabitsScreen() {
  const theme = useTheme();
  const habits = useHabits();
  const logs = useHabitLogs();
  const toggle = useToggleHabitLog();
  const [editing, setEditing] = useState<Habit | 'new' | null>(null);

  // 최근 7일. 마지막이 오늘이다.
  const days = useMemo(() => lastDays(7), []);
  const today = days[days.length - 1];
  const streaks = useMemo(() => {
    const map = new Map<string, number>();
    if (!logs.data) return map;
    for (const habit of habits.data ?? []) {
      map.set(habit.id, streakOf(logs.data.get(habit.id)));
    }
    return map;
  }, [habits.data, logs.data]);

  return (
    <Screen
      title="습관"
      onBack={leave}
      action={<Button label="추가" size="small" onPress={() => setEditing('new')} />}>
      <ListStatus
        loading={habits.isPending || logs.isPending}
        error={habits.error ?? logs.error}
        empty={(habits.data ?? []).length === 0}
        emptyText={'아직 습관이 없습니다. "추가"를 눌러 매일 할 일을 정해 보세요.'}
        onRetry={() => {
          habits.refetch();
          logs.refetch();
        }}
      />

      {logs.data
        ? (habits.data ?? []).map((habit) => {
            const dates = logs.data.get(habit.id);
            const streak = streaks.get(habit.id) ?? 0;
            return (
              <Card key={habit.id}>
                <View style={styles.header}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${habit.name} 수정`}
                    onPress={() => setEditing(habit)}
                    style={styles.name}>
                    <ThemedText type="default">{habit.name}</ThemedText>
                  </Pressable>
                  <ThemedText type="small" themeColor={streak > 0 ? 'tint' : 'textSecondary'}>
                    {streak > 0 ? `${streak}일 연속` : '오늘부터 시작'}
                  </ThemedText>
                </View>

                <View style={styles.days}>
                  {days.map((date) => {
                    const done = dates?.has(date) ?? false;
                    return (
                      <View key={date} style={styles.day}>
                        <ThemedText
                          type="small"
                          themeColor={date === today ? 'text' : 'textSecondary'}>
                          {weekdayOf(date)}
                        </ThemedText>
                        <Pressable
                          accessibilityRole="checkbox"
                          accessibilityLabel={`${habit.name}, ${dayOf(date)}일`}
                          accessibilityState={{ checked: done }}
                          disabled={toggle.isPending}
                          onPress={() => toggle.mutate({ habitId: habit.id, date, done })}
                          style={({ pressed }) => [
                            styles.dot,
                            {
                              backgroundColor: done ? theme.tint : 'transparent',
                              borderColor: done
                                ? theme.tint
                                : date === today
                                  ? theme.text
                                  : theme.border,
                              opacity: pressed ? 0.6 : 1,
                            },
                          ]}>
                          <ThemedText
                            type="small"
                            style={{ color: done ? theme.onTint : theme.textSecondary }}>
                            {dayOf(date)}
                          </ThemedText>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              </Card>
            );
          })
        : null}

      {toggle.error ? (
        <ThemedText type="small" themeColor="danger">
          기록하지 못했습니다. 다시 시도해 주세요.
        </ThemedText>
      ) : null}

      {editing ? (
        <HabitForm habit={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      ) : null}
    </Screen>
  );
}

function HabitForm({ habit, onClose }: { habit: Habit | null; onClose: () => void }) {
  const save = useSaveHabit();
  const remove = useDeleteHabit();
  const [name, setName] = useState(habit?.name ?? '');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) {
      setError('습관 이름을 입력해 주세요.');
      return;
    }
    try {
      await save.mutateAsync({ id: habit?.id, name: name.trim() });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function deleteHabit() {
    if (!habit || !(await confirm('이 습관과 지금까지의 기록을 모두 삭제할까요?'))) return;
    try {
      await remove.mutateAsync(habit.id);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <FormModal
      title={habit ? '습관 수정' : '새 습관'}
      onClose={onClose}
      onSubmit={submit}
      submitting={save.isPending || remove.isPending}
      onDelete={habit ? deleteHabit : undefined}
      error={error}>
      <TextField
        label="이름"
        value={name}
        onChangeText={setName}
        placeholder="예: 물 2리터 마시기"
        maxLength={100}
        autoFocus={!habit}
        onSubmitEditing={submit}
      />
    </FormModal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  name: {
    flex: 1,
  },
  days: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  day: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  dot: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
