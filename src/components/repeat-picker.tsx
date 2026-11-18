import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Segmented } from '@/components/ui/segmented';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { dayOf, parseISODate, WEEKDAY_LABELS } from '@/lib/dates';
import {
  isPresetRepeat,
  MAX_INTERVAL,
  nthWeekdayLabel,
  parseRepeat,
  REPEAT_PRESETS,
  serializeRepeat,
  WEEKDAY_ORDER,
  type MonthMode,
  type RepeatRule,
  type RepeatUnit,
} from '@/lib/repeat';

const UNITS = [
  { value: 'day', label: '일' },
  { value: 'week', label: '주' },
  { value: 'month', label: '개월' },
  { value: 'year', label: '년' },
] as const;

type Props = {
  /** 반복 값 (반복 안 하면 null) */
  value: string | null;
  onChange: (value: string | null) => void;
  /** 반복의 기준 날짜. "매주 수요일", "매월 18일" 같은 글자를 만들 때 쓴다. */
  anchor: string;
};

/**
 * 할 일·일정 양식의 "반복" 고르기.
 * 자주 쓰는 반복은 바로 고르고, "직접 설정"에서는 간격(N일·주·개월·년마다), 요일, 매월 방식을 정한다.
 */
export function RepeatPicker({ value, onChange, anchor }: Props) {
  const theme = useTheme();
  const [customOpen, setCustomOpen] = useState(() => !isPresetRepeat(value));
  // 반복을 끄면(예: 마감일을 지움) 직접 설정 칸도 닫는다.
  const showCustom = customOpen && value !== null;
  const selected: string = showCustom ? 'custom' : (value ?? 'none');

  const anchorDay = parseISODate(anchor).getDay();
  const rule: RepeatRule = parseRepeat(value) ?? {
    unit: 'week',
    interval: 1,
    weekdays: [],
    monthMode: 'date',
  };
  const shownDays = rule.weekdays.length > 0 ? rule.weekdays : [anchorDay];

  function choosePreset(next: string) {
    if (next === 'custom') {
      setCustomOpen(true);
      // 반복이 꺼져 있었다면 "매주"부터 시작한다.
      if (value === null) onChange(serializeRepeat({ ...rule, weekdays: [anchorDay] }));
      return;
    }
    setCustomOpen(false);
    onChange(next === 'none' ? null : next);
  }

  function update(patch: Partial<RepeatRule>) {
    onChange(serializeRepeat({ ...rule, ...patch }));
  }

  function toggleDay(day: number) {
    const next = shownDays.includes(day)
      ? shownDays.filter((d) => d !== day)
      : [...shownDays, day];
    // 요일은 하나 이상 남겨 둔다.
    if (next.length === 0) return;
    update({ weekdays: next });
  }

  const monthModes = [
    { value: 'date', label: `${dayOf(anchor)}일` },
    { value: 'nth', label: nthWeekdayLabel(anchor) },
    { value: 'last', label: '마지막 날' },
  ] as const;

  return (
    <View style={styles.wrapper}>
      <Segmented<string>
        label="반복"
        options={REPEAT_PRESETS}
        value={selected}
        onChange={choosePreset}
      />

      {showCustom ? (
        <View style={[styles.box, { borderColor: theme.border }]}>
          <View style={styles.intervalRow}>
            <StepButton
              label="−"
              accessibilityLabel="간격 줄이기"
              disabled={rule.interval <= 1}
              onPress={() => update({ interval: rule.interval - 1 })}
            />
            <ThemedText type="default" style={styles.intervalText}>
              {rule.interval}
            </ThemedText>
            <StepButton
              label="+"
              accessibilityLabel="간격 늘리기"
              disabled={rule.interval >= MAX_INTERVAL}
              onPress={() => update({ interval: rule.interval + 1 })}
            />
            <View style={styles.units}>
              <Segmented<RepeatUnit>
                options={UNITS}
                value={rule.unit}
                onChange={(unit) => update({ unit })}
              />
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              마다
            </ThemedText>
          </View>

          {rule.unit === 'week' ? (
            <View style={styles.days} accessibilityLabel="반복할 요일">
              {WEEKDAY_ORDER.map((day) => {
                const on = shownDays.includes(day);
                return (
                  <Pressable
                    key={day}
                    accessibilityRole="checkbox"
                    accessibilityLabel={`${WEEKDAY_LABELS[day]}요일`}
                    accessibilityState={{ checked: on }}
                    onPress={() => toggleDay(day)}
                    style={({ pressed }) => [
                      styles.day,
                      {
                        backgroundColor: on ? theme.tint : theme.backgroundElement,
                        opacity: pressed ? 0.75 : 1,
                      },
                    ]}>
                    <ThemedText type="small" style={{ color: on ? theme.onTint : theme.text }}>
                      {WEEKDAY_LABELS[day]}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {rule.unit === 'month' ? (
            <Segmented<MonthMode>
              options={monthModes}
              value={rule.monthMode}
              onChange={(monthMode) => update({ monthMode })}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function StepButton({
  label,
  accessibilityLabel,
  disabled,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [
        styles.step,
        { backgroundColor: theme.backgroundElement, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
      ]}>
      <ThemedText type="default">{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: Spacing.two,
  },
  box: {
    padding: Spacing.three - 4,
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.three - 4,
  },
  intervalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  intervalText: {
    minWidth: 28,
    textAlign: 'center',
    fontWeight: 700,
  },
  units: {
    flexShrink: 1,
  },
  step: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  days: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  day: {
    width: 38,
    height: 38,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
