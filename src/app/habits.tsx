import { router, useLocalSearchParams } from 'expo-router';
import { Flame } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FormModal } from '@/components/ui/form-modal';
import { Card, ListStatus, Screen } from '@/components/ui/screen';
import { SelectionBar, SelectionHeaderActions, SelectionIndicator } from '@/components/ui/selection-bar';
import { TextField } from '@/components/ui/text-field';
import { Radius, Spacing } from '@/constants/theme';
import {
  streakOf,
  useDeleteHabit,
  useDeleteHabits,
  useHabitLogs,
  useHabits,
  useSaveHabit,
  useToggleHabitLog,
  type Habit,
} from '@/hooks/use-habits';
import { hasSelectionModifier, useMultiSelect } from '@/hooks/use-multi-select';
import { useTheme } from '@/hooks/use-theme';
import { useTodayISO } from '@/hooks/use-today';
import { addDays, dayOf, weekdayOf } from '@/lib/dates';
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
  const { add, editId } = useLocalSearchParams<{ add?: string; editId?: string }>();
  const theme = useTheme();
  const habits = useHabits();
  const logs = useHabitLogs();
  const toggle = useToggleHabitLog();
  const removeOne = useDeleteHabit();
  const removeMany = useDeleteHabits();
  const multi = useMultiSelect();
  const [editing, setEditing] = useState<Habit | 'new' | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const paramKey = add || editId ? `${add ?? ''}|${editId ?? ''}` : '';
  const [dismissedParamKey, setDismissedParamKey] = useState('');
  const paramEditing: Habit | 'new' | null =
    paramKey && paramKey !== dismissedParamKey
      ? add
        ? 'new'
        : editId
          ? ((habits.data ?? []).find((h) => h.id === editId) ?? null)
          : null
      : null;

  const activeEditing: Habit | 'new' | null = editing ?? paramEditing;

  function closeForm() {
    setEditing(null);
    if (paramKey) {
      setDismissedParamKey(paramKey);
      router.setParams({ add: '', editId: '' });
    }
  }

  // 최근 7일. 자정이 지나면 자동으로 새 오늘 기준으로 갱신된다.
  const today = useTodayISO();
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)),
    [today],
  );
  const streaks = useMemo(() => {
    const map = new Map<string, number>();
    if (!logs.data) return map;
    for (const habit of habits.data ?? []) {
      map.set(habit.id, streakOf(logs.data.get(habit.id), today));
    }
    return map;
  }, [habits.data, logs.data, today]);

  const habitItems = habits.data ?? [];
  const habitIds = habitItems.map((habit) => habit.id);
  const selectedVisibleIds = habitIds.filter((id) => multi.isSelected(id));
  const canSelect = Boolean(logs.data) && habitIds.length > 0;
  const isSelecting = canSelect && (multi.active || selectedVisibleIds.length > 0);

  const weeklyStats = useMemo(() => {
    const list = habits.data ?? [];
    if (!logs.data || list.length === 0) return null;
    let totalChecks = 0;
    const perDay = days.map((day) => {
      let doneCount = 0;
      for (const habit of list) {
        if (logs.data.get(habit.id)?.has(day)) {
          doneCount += 1;
        }
      }
      totalChecks += doneCount;
      return {
        day,
        label: day === today ? '오늘' : weekdayOf(day),
        doneCount,
        ratio: doneCount / list.length,
      };
    });
    const totalPossible = list.length * days.length;
    const rate = totalPossible > 0 ? Math.round((totalChecks / totalPossible) * 100) : 0;
    return { rate, totalChecks, totalPossible, perDay };
  }, [days, habits.data, logs.data, today]);

  async function deleteSingleHabit(habit: Habit) {
    const ok = await confirm({
      title: '습관을 삭제할까요?',
      message: `'${habit.name}' 습관과 지금까지의 실천 기록이 모두 삭제됩니다.`,
      confirmLabel: '삭제',
    });
    if (!ok) return;
    setDeleteError(null);
    try {
      await removeOne.mutateAsync(habit.id);
    } catch (e) {
      setDeleteError(errorMessage(e));
    }
  }

  async function deleteSelected() {
    if (selectedVisibleIds.length === 0) return;
    const count = selectedVisibleIds.length;
    const ok = await confirm({
      title: `습관 ${count}개를 삭제할까요?`,
      message: '선택한 습관들과 지금까지의 실천 기록이 모두 삭제됩니다.',
      confirmLabel: `${count}개 삭제`,
    });
    if (!ok) return;
    setDeleteError(null);
    try {
      await removeMany.mutateAsync(selectedVisibleIds);
      multi.clear();
    } catch (e) {
      setDeleteError(errorMessage(e));
    }
  }

  return (
    <Screen
      title="습관"
      onBack={leave}
      onRefresh={() => Promise.all([habits.refetch(), logs.refetch()])}
      action={
        <SelectionHeaderActions
          selecting={isSelecting}
          canSelect={canSelect}
          onAdd={() => setEditing('new')}
          onStartSelect={() => {
            setDeleteError(null);
            multi.enter();
          }}
          onCancelSelect={() => {
            multi.clear();
            setDeleteError(null);
          }}
        />
      }
      overlay={
        isSelecting ? (
          <SelectionBar
            count={selectedVisibleIds.length}
            totalCount={habitIds.length}
            deleting={removeMany.isPending}
            onSelectAll={() => multi.selectAll(habitIds)}
            onDeselectAll={() => {
              multi.deselectAll();
              setDeleteError(null);
            }}
            onClear={() => {
              multi.clear();
              setDeleteError(null);
            }}
            onDelete={deleteSelected}
          />
        ) : undefined
      }>
      {deleteError ? (
        <ThemedText type="small" themeColor="danger">
          {deleteError}
        </ThemedText>
      ) : null}

      <ListStatus
        loading={habits.isPending || logs.isPending}
        error={habits.error ?? logs.error}
        empty={habitItems.length === 0}
        emptyText={'아직 습관이 없습니다. "추가"를 눌러 매일 할 일을 정해 보세요.'}
        onRetry={() => {
          habits.refetch();
          logs.refetch();
        }}
      />

      {weeklyStats ? (
        <Card>
          <View style={styles.summaryHeader}>
            <ThemedText type="smallBold">최근 7일 달성률</ThemedText>
            <ThemedText type="smallBold" themeColor="tint">
              {weeklyStats.rate}% ({weeklyStats.totalChecks}/{weeklyStats.totalPossible})
            </ThemedText>
          </View>
          <View style={[styles.rateTrack, { backgroundColor: theme.backgroundSelected }]}>
            <View
              style={[
                styles.rateFill,
                {
                  backgroundColor: theme.tint,
                  width: `${Math.min(100, Math.max(0, weeklyStats.rate))}%`,
                },
              ]}
            />
          </View>
          <View style={styles.weekBars}>
            {weeklyStats.perDay.map((entry) => (
              <View key={entry.day} style={styles.weekBarCol}>
                <View style={[styles.weekBarTrack, { backgroundColor: theme.backgroundSelected }]}>
                  <View
                    style={[
                      styles.weekBarFill,
                      {
                        backgroundColor: entry.day === today ? theme.tint : theme.accentWarm,
                        height: `${Math.round(entry.ratio * 100)}%`,
                      },
                    ]}
                  />
                </View>
                <ThemedText
                  type="small"
                  themeColor={entry.day === today ? 'tint' : 'textSecondary'}>
                  {entry.label}
                </ThemedText>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      {logs.data
        ? habitItems.map((habit) => {
            const dates = logs.data.get(habit.id);
            const streak = streaks.get(habit.id) ?? 0;
            const selected = multi.isSelected(habit.id);
            return (
              <Card
                key={habit.id}
                selected={selected}
                selecting={isSelecting}
                onPress={isSelecting ? (e) => multi.handlePress(habit.id, habitIds, e) : undefined}
                onLongPress={() => {
                  setDeleteError(null);
                  multi.start(habit.id);
                }}>
                <View style={styles.header}>
                  {isSelecting ? <SelectionIndicator selected={selected} /> : null}
                  {isSelecting ? (
                    <View style={styles.name}>
                      <ThemedText type="default">{habit.name}</ThemedText>
                    </View>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${habit.name} 수정`}
                      delayLongPress={320}
                      onPress={(e) => {
                        if (hasSelectionModifier(e)) {
                          setDeleteError(null);
                          multi.start(habit.id);
                          return;
                        }
                        setEditing(habit);
                      }}
                      onLongPress={() => {
                        setDeleteError(null);
                        multi.start(habit.id);
                      }}
                      style={styles.name}>
                      <ThemedText type="default">{habit.name}</ThemedText>
                    </Pressable>
                  )}
                  <View
                    style={[
                      styles.streakPill,
                      { backgroundColor: streak > 0 ? theme.tintSoft : theme.backgroundSelected },
                    ]}>
                    {streak > 0 ? <Flame size={12} color={theme.tint} strokeWidth={2} /> : null}
                    <ThemedText
                      type="smallBold"
                      themeColor={streak > 0 ? 'tint' : 'textSecondary'}
                      style={styles.streakPillText}>
                      {streak > 0 ? `${streak}일 연속` : '오늘부터 시작'}
                    </ThemedText>
                  </View>
                  {!isSelecting ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${habit.name} 삭제`}
                      disabled={removeOne.isPending}
                      hitSlop={6}
                      onPress={() => deleteSingleHabit(habit)}
                      style={({ pressed }) => [
                        styles.deletePill,
                        {
                          backgroundColor: theme.dangerSoft,
                          opacity: removeOne.isPending ? 0.5 : pressed ? 0.72 : 1,
                        },
                      ]}>
                      <ThemedText type="smallBold" style={{ color: theme.danger }}>
                        삭제
                      </ThemedText>
                    </Pressable>
                  ) : null}
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
                          delayLongPress={320}
                          onPress={(e) =>
                            isSelecting
                              ? multi.handlePress(habit.id, habitIds, e)
                              : toggle.mutate({ habitId: habit.id, date, done })
                          }
                          onLongPress={() => {
                            setDeleteError(null);
                            multi.start(habit.id);
                          }}
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

      {activeEditing ? (
        <HabitForm
          habit={activeEditing === 'new' ? null : activeEditing}
          onClose={closeForm}
        />
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
    if (
      !habit ||
      !(await confirm({
        title: '습관을 삭제할까요?',
        message: `'${habit.name}' 습관과 지금까지의 실천 기록이 모두 삭제됩니다.`,
        confirmLabel: '삭제',
      }))
    ) {
      return;
    }
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
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  streakPillText: {
    fontSize: 12,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
  },
  deletePill: {
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one,
    borderRadius: Radius.full,
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
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rateTrack: {
    height: 6,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  rateFill: {
    height: 6,
    borderRadius: Radius.full,
  },
  weekBars: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: Spacing.one,
  },
  weekBarCol: {
    alignItems: 'center',
    gap: Spacing.one,
    flex: 1,
  },
  weekBarTrack: {
    width: 14,
    height: 44,
    borderRadius: Radius.full,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  weekBarFill: {
    width: '100%',
    borderRadius: Radius.full,
  },
});
