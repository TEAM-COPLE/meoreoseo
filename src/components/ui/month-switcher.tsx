import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatMonth, shiftMonth, type YearMonth } from '@/lib/dates';

type Props = {
  month: YearMonth;
  onChange: (month: YearMonth) => void;
};

/** "‹ 2026년 11월 ›" 처럼 달을 앞뒤로 넘기는 줄. */
export function MonthSwitcher({ month, onChange }: Props) {
  return (
    <View style={styles.row}>
      <ArrowButton label="이전 달" Icon={ChevronLeft} onPress={() => onChange(shiftMonth(month, -1))} />
      <ThemedText type="default" style={styles.label}>
        {formatMonth(month)}
      </ThemedText>
      <ArrowButton label="다음 달" Icon={ChevronRight} onPress={() => onChange(shiftMonth(month, 1))} />
    </View>
  );
}

function ArrowButton({
  label,
  Icon,
  onPress,
}: {
  label: string;
  Icon: LucideIcon;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: theme.backgroundSelected, opacity: pressed ? 0.7 : 1 },
      ]}>
      <Icon size={18} color={theme.text} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontWeight: 700,
  },
  button: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
