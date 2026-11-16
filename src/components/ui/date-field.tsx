import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDate, todayISO, yearMonthOf } from '@/lib/dates';

import { MonthCalendar } from './month-calendar';

type Props = {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  /** true 면 "날짜 없음"으로 되돌릴 수 있다 */
  clearable?: boolean;
};

/** 날짜를 고르는 입력 칸. 누르면 아래에 달력이 펼쳐진다. */
export function DateField({ label, value, onChange, clearable = false }: Props) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => yearMonthOf(value ?? todayISO()));

  return (
    <View style={styles.wrapper}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>

      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} 고르기`}
          onPress={() => setOpen((current) => !current)}
          style={[
            styles.field,
            { backgroundColor: theme.backgroundElement, borderColor: theme.border },
          ]}>
          <ThemedText type="default" themeColor={value ? 'text' : 'textSecondary'}>
            {value ? formatDate(value) : '날짜 없음'}
          </ThemedText>
        </Pressable>

        {clearable && value ? (
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => onChange(null)}>
            <ThemedText type="small" themeColor="textSecondary">
              지우기
            </ThemedText>
          </Pressable>
        ) : null}
      </View>

      {open ? (
        <View style={[styles.calendar, { borderColor: theme.border }]}>
          <MonthCalendar
            month={month}
            onChangeMonth={setMonth}
            selected={value}
            onSelect={(iso) => {
              onChange(iso);
              setOpen(false);
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  field: {
    flex: 1,
    minHeight: 46,
    paddingHorizontal: Spacing.three - 4,
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  calendar: {
    marginTop: Spacing.one,
    padding: Spacing.two,
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
