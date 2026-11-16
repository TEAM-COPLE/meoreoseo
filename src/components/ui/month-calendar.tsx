import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { WEEKDAY_LABELS, dayOf, monthGrid, todayISO, type YearMonth } from '@/lib/dates';

import { MonthSwitcher } from './month-switcher';

type Props = {
  /** 지금 보여주는 달 */
  month: YearMonth;
  onChangeMonth: (month: YearMonth) => void;
  /** 선택된 날짜 ('YYYY-MM-DD') */
  selected?: string | null;
  onSelect: (iso: string) => void;
  /** 점으로 표시할 날짜들 (예: 일정이 있는 날) */
  marks?: ReadonlySet<string>;
};

/** 한 달짜리 달력. 일정 화면과 날짜 고르기에서 함께 쓴다. */
export function MonthCalendar({ month, onChangeMonth, selected, onSelect, marks }: Props) {
  const theme = useTheme();
  const today = todayISO();
  const weeks = monthGrid(month);

  return (
    <View style={styles.wrapper}>
      <MonthSwitcher month={month} onChange={onChangeMonth} />

      <View style={styles.week}>
        {WEEKDAY_LABELS.map((label) => (
          <View key={label} style={styles.cell}>
            <ThemedText type="small" themeColor="textSecondary">
              {label}
            </ThemedText>
          </View>
        ))}
      </View>

      {weeks.map((week, weekIndex) => (
        <View key={weekIndex} style={styles.week}>
          {week.map((iso, dayIndex) => {
            if (!iso) return <View key={dayIndex} style={styles.cell} />;

            const isSelected = iso === selected;
            const isToday = iso === today;
            return (
              <View key={iso} style={styles.cell}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${month.month + 1}월 ${dayOf(iso)}일`}
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => onSelect(iso)}
                  style={({ pressed }) => [
                    styles.day,
                    isSelected && { backgroundColor: theme.tint },
                    !isSelected && isToday && { borderColor: theme.tint },
                    pressed && styles.pressed,
                  ]}>
                  <ThemedText
                    type="small"
                    style={{ color: isSelected ? theme.onTint : theme.text }}>
                    {dayOf(iso)}
                  </ThemedText>
                  <View
                    style={[
                      styles.mark,
                      marks?.has(iso) && {
                        backgroundColor: isSelected ? theme.onTint : theme.tint,
                      },
                    ]}
                  />
                </Pressable>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: Spacing.one,
  },
  week: {
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 2,
  },
  day: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  pressed: {
    opacity: 0.7,
  },
  mark: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 1,
  },
});
