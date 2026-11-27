import { router, useLocalSearchParams } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FormModal } from '@/components/ui/form-modal';
import { Card, ListStatus, Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { TextField } from '@/components/ui/text-field';
import { TimeDialPicker } from '@/components/ui/time-dial-picker';
import { Radius, Spacing } from '@/constants/theme';
import { useNotificationSettings } from '@/hooks/use-notification-settings';
import {
  useAddRoutines,
  useDeleteRoutine,
  useRoutineLogs,
  useRoutines,
  useSaveRoutine,
  useToggleRoutineLog,
  type Routine,
} from '@/hooks/use-routines';
import { useTheme } from '@/hooks/use-theme';
import { useTodayISO } from '@/hooks/use-today';
import { WEEKDAY_LABELS } from '@/lib/dates';
import { confirm, errorMessage } from '@/lib/format';
import { notificationsSupported } from '@/lib/notifications';
import {
  routineHourMinute,
  routinesForDate,
  routineTimeLabel,
  SAMPLE_ROUTINES,
  toTimeOfDay,
  WEEKDAY_ORDER,
  WEEKDAY_PRESETS,
  weekdaysLabel,
  type RoutineKind,
} from '@/lib/routines';

/** 오늘 화면으로 돌아간다. 이 화면을 주소로 바로 연 경우에는 돌아갈 곳이 없으므로 새로 연다. */
function leave() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/');
  }
}

/**
 * 하루 루틴 관리 화면. 오늘 화면의 "하루 루틴" 상자에서 "관리"를 누르면 열린다.
 * 시간별 루틴(예: 06:00 아침 브리핑, 06:10 샤워, 07:00 운동)을 추가·수정·삭제하고 요일을 고른다.
 * 휴대폰 앱에서는 정한 시각에 알림이 온다(알림 예약은 components/notification-sync.tsx 가 한다).
 */
export default function RoutinesScreen() {
  const { add, editId } = useLocalSearchParams<{ add?: string; editId?: string }>();
  const theme = useTheme();
  const routines = useRoutines();
  const logs = useRoutineLogs();
  const toggle = useToggleRoutineLog();
  const addMany = useAddRoutines();
  const settings = useNotificationSettings().data;
  const [editing, setEditing] = useState<Routine | 'new' | null>(null);
  const [sampleError, setSampleError] = useState<string | null>(null);

  // 오늘 화면에서 "+"나 루틴 이름을 눌러 들어온 경우, 주소에 담긴 값으로 양식을 바로 연다.
  const paramKey = add || editId ? `${add ?? ''}|${editId ?? ''}` : '';
  const [dismissedParamKey, setDismissedParamKey] = useState('');
  const paramEditing: Routine | 'new' | null =
    paramKey && paramKey !== dismissedParamKey
      ? add
        ? 'new'
        : ((routines.data ?? []).find((r) => r.id === editId) ?? null)
      : null;
  const activeEditing = editing ?? paramEditing;

  function closeForm() {
    setEditing(null);
    if (paramKey) {
      setDismissedParamKey(paramKey);
      router.setParams({ add: '', editId: '' });
    }
  }

  const today = useTodayISO();
  const items = routines.data ?? [];
  const todayIds = useMemo(
    () => new Set(routinesForDate(routines.data ?? [], today).map((r) => r.id)),
    [routines.data, today],
  );

  async function addSamples() {
    setSampleError(null);
    try {
      await addMany.mutateAsync(
        SAMPLE_ROUTINES.map((sample) => ({
          ...sample,
          weekdays: [0, 1, 2, 3, 4, 5, 6],
          notify: true,
        })),
      );
    } catch (e) {
      setSampleError(errorMessage(e));
    }
  }

  // 알림이 어떻게 오는지 한 줄로 알려 준다.
  const notifyHint = !notificationsSupported
    ? '알림은 휴대폰 앱에서 울려요. 여기서 만든 루틴은 휴대폰에도 그대로 보여요.'
    : !settings?.enabled
      ? '지금은 알림이 꺼져 있어요. 설정에서 "알림 받기"를 켜면 루틴 시각에 알려 드려요.'
      : !settings.routines
        ? '설정에서 "하루 루틴" 알림이 꺼져 있어요.'
        : '루틴 시각마다 휴대폰으로 알려 드려요. 앱을 가끔 열어 주면 다음 7일 치 알림이 채워져요.';
  const notifyOff = notificationsSupported && (!settings?.enabled || !settings.routines);

  return (
    <Screen
      title="하루 루틴"
      onBack={leave}
      onRefresh={() => Promise.all([routines.refetch(), logs.refetch()])}
      action={
        <Button
          label="추가"
          icon={(color) => <Plus size={14} color={color} strokeWidth={2.4} />}
          size="small"
          onPress={() => setEditing('new')}
        />
      }>
      <View style={[styles.hint, { backgroundColor: theme.tintSoft }]}>
        <ThemedText type="small" themeColor="tint" style={styles.hintText}>
          {notifyHint}
        </ThemedText>
        {notifyOff ? (
          <Button
            label="설정 열기"
            variant="secondary"
            size="small"
            onPress={() => router.push('/settings')}
          />
        ) : null}
      </View>

      <ListStatus
        loading={routines.isPending || logs.isPending}
        error={routines.error ?? logs.error}
        empty={items.length === 0}
        emptyText={'아직 루틴이 없어요. "+ 추가"를 눌러 시간별로 할 일을 정해 보세요.'}
        onRetry={() => {
          routines.refetch();
          logs.refetch();
        }}
      />

      {routines.data && items.length === 0 ? (
        <Card>
          <ThemedText type="smallBold">예시로 시작해 볼까요?</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {SAMPLE_ROUTINES.map((s) => `${s.time_of_day.slice(0, 5)} ${s.title}`).join(' · ')}
          </ThemedText>
          <View style={styles.sampleRow}>
            <Button
              label="예시 루틴 넣기"
              size="small"
              loading={addMany.isPending}
              onPress={addSamples}
            />
          </View>
          {sampleError ? (
            <ThemedText type="small" themeColor="danger">
              {sampleError}
            </ThemedText>
          ) : null}
        </Card>
      ) : null}

      {logs.data
        ? items.map((routine) => {
            const forToday = todayIds.has(routine.id);
            const done = logs.data.get(routine.id)?.has(today) ?? false;
            return (
              <Card key={routine.id}>
                <View style={styles.row}>
                  {forToday ? (
                    <Checkbox
                      checked={done}
                      label={`${routine.title} 오늘 완료 표시`}
                      onPress={() =>
                        toggle.mutate({ routineId: routine.id, date: today, done })
                      }
                    />
                  ) : (
                    <View style={styles.checkboxSpacer} />
                  )}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${routine.title} 수정`}
                    onPress={() => setEditing(routine)}
                    style={({ pressed }) => [styles.body, pressed && styles.pressed]}>
                    <View style={styles.titleLine}>
                      <ThemedText type="smallBold" themeColor="accentWarm" style={styles.time}>
                        {routineTimeLabel(routine)}
                      </ThemedText>
                      <ThemedText
                        type="default"
                        themeColor={done ? 'textSecondary' : 'text'}
                        style={[styles.title, done && styles.doneTitle]}
                        numberOfLines={1}>
                        {routine.title}
                      </ThemedText>
                    </View>
                    <ThemedText type="small" themeColor="textSecondary">
                      {weekdaysLabel(routine.weekdays)}
                      {routine.kind === 'briefing' ? ' · ☀️ 할 일·일정·날씨 요약' : ''}
                      {routine.notify ? ' · 🔔 알림' : ' · 🔕 알림 끔'}
                      {forToday ? '' : ' · 오늘은 쉬는 날'}
                    </ThemedText>
                  </Pressable>
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
        <RoutineForm routine={activeEditing === 'new' ? null : activeEditing} onClose={closeForm} />
      ) : null}
    </Screen>
  );
}

const KIND_OPTIONS = [
  { value: 'normal', label: '보통 루틴' },
  { value: 'briefing', label: '☀️ 아침 브리핑' },
] as const;

const NOTIFY_OPTIONS = [
  { value: 'on', label: '🔔 알림 받기' },
  { value: 'off', label: '🔕 알림 끄기' },
] as const;

/** 루틴 추가·수정 양식 */
function RoutineForm({ routine, onClose }: { routine: Routine | null; onClose: () => void }) {
  const theme = useTheme();
  const save = useSaveRoutine();
  const remove = useDeleteRoutine();
  const initial = routine ? routineHourMinute(routine) : { hour: 7, minute: 0 };
  const [title, setTitle] = useState(routine?.title ?? '');
  const [hour, setHour] = useState(initial.hour);
  const [minute, setMinute] = useState(initial.minute);
  const [weekdays, setWeekdays] = useState<number[]>(routine?.weekdays ?? [0, 1, 2, 3, 4, 5, 6]);
  const [kind, setKind] = useState<RoutineKind>(
    routine?.kind === 'briefing' ? 'briefing' : 'normal',
  );
  const [notify, setNotify] = useState(routine?.notify ?? true);
  const [error, setError] = useState<string | null>(null);

  function toggleDay(day: number) {
    setWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b),
    );
  }

  async function submit() {
    if (!title.trim()) {
      setError('루틴 이름을 입력해 주세요.');
      return;
    }
    if (weekdays.length === 0) {
      setError('요일을 하루 이상 골라 주세요.');
      return;
    }
    try {
      await save.mutateAsync({
        id: routine?.id,
        values: {
          title: title.trim(),
          time_of_day: toTimeOfDay(hour, minute),
          weekdays,
          kind,
          notify,
        },
      });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function deleteRoutine() {
    if (
      !routine ||
      !(await confirm({
        title: '루틴을 삭제할까요?',
        message: `'${routine.title}' 루틴과 완료 기록이 모두 삭제됩니다.`,
        confirmLabel: '삭제',
      }))
    ) {
      return;
    }
    try {
      await remove.mutateAsync(routine.id);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <FormModal
      title={routine ? '루틴 수정' : '새 루틴'}
      onClose={onClose}
      onSubmit={submit}
      submitting={save.isPending || remove.isPending}
      onDelete={routine ? deleteRoutine : undefined}
      error={error}>
      <TextField
        label="이름"
        value={title}
        onChangeText={(text) => {
          setTitle(text);
          setError(null);
        }}
        placeholder="예: 샤워, 운동 가기"
        maxLength={100}
        autoFocus={!routine}
      />

      <Segmented
        label="종류"
        options={KIND_OPTIONS}
        value={kind}
        onChange={(next) => {
          setKind(next);
          // 아침 브리핑으로 바꾸면서 이름이 비어 있으면 이름도 채워 준다.
          if (next === 'briefing' && !title.trim()) setTitle('아침 브리핑');
        }}
      />
      {kind === 'briefing' ? (
        <ThemedText type="small" themeColor="textSecondary">
          알림에 오늘 할 일, 일정, 날씨 요약을 담아 보내요. 설정의 &quot;아침 브리핑&quot; 대신 이
          시각에 와요.
        </ThemedText>
      ) : null}

      <View style={styles.field}>
        <View style={styles.fieldHeader}>
          <ThemedText type="small" themeColor="textSecondary">
            시각
          </ThemedText>
          <ThemedText type="smallBold" themeColor="tint">
            {toTimeOfDay(hour, minute).slice(0, 5)}
          </ThemedText>
        </View>
        <TimeDialPicker
          hour={hour}
          minute={minute}
          onChange={(nextHour, nextMinute) => {
            setHour(nextHour);
            setMinute(nextMinute);
          }}
        />
      </View>

      <View style={styles.field}>
        <View style={styles.fieldHeader}>
          <ThemedText type="small" themeColor="textSecondary">
            요일
          </ThemedText>
          <ThemedText type="smallBold" themeColor="tint">
            {weekdays.length > 0 ? weekdaysLabel(weekdays) : '고르지 않음'}
          </ThemedText>
        </View>
        <View style={styles.dayRow}>
          {WEEKDAY_ORDER.map((day) => {
            const selected = weekdays.includes(day);
            return (
              <Pressable
                key={day}
                accessibilityRole="checkbox"
                accessibilityLabel={`${WEEKDAY_LABELS[day]}요일`}
                accessibilityState={{ checked: selected }}
                onPress={() => {
                  toggleDay(day);
                  setError(null);
                }}
                style={({ pressed }) => [
                  styles.dayChip,
                  {
                    backgroundColor: selected ? theme.tint : theme.backgroundElement,
                    borderColor: selected ? theme.tint : theme.border,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}>
                <ThemedText
                  type="smallBold"
                  style={{ color: selected ? theme.onTint : theme.text }}>
                  {WEEKDAY_LABELS[day]}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.presetRow}>
          {WEEKDAY_PRESETS.map((preset) => (
            <Button
              key={preset.label}
              label={preset.label}
              variant="secondary"
              size="small"
              onPress={() => {
                setWeekdays([...preset.days]);
                setError(null);
              }}
            />
          ))}
        </View>
      </View>

      <Segmented
        label="알림"
        options={NOTIFY_OPTIONS}
        value={notify ? 'on' : 'off'}
        onChange={(value) => setNotify(value === 'on')}
      />
    </FormModal>
  );
}

const styles = StyleSheet.create({
  hint: {
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
  hintText: {
    alignSelf: 'stretch',
  },
  sampleRow: {
    flexDirection: 'row',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  checkboxSpacer: {
    width: 26,
  },
  body: {
    flex: 1,
    gap: Spacing.half,
  },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  time: {
    fontVariant: ['tabular-nums'],
  },
  title: {
    flex: 1,
  },
  doneTitle: {
    textDecorationLine: 'line-through',
  },
  pressed: {
    opacity: 0.6,
  },
  field: {
    gap: Spacing.two,
  },
  fieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.one,
  },
  dayChip: {
    flex: 1,
    height: 36,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
});
