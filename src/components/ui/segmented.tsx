import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Option<T> = { value: T; label: string };

type Props<T> = {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
};

/** 여러 선택지 중 하나를 고르는 버튼 묶음. 선택지가 많으면 다음 줄로 넘어간다. */
export function Segmented<T extends string | number>({ options, value, onChange, label }: Props<T>) {
  const theme = useTheme();

  return (
    <View style={styles.wrapper}>
      {label ? (
        <ThemedText type="small" themeColor="textSecondary">
          {label}
        </ThemedText>
      ) : null}
      <View style={styles.row} accessibilityRole="radiogroup">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={String(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: selected ? theme.tint : theme.backgroundElement,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}>
              <ThemedText type="small" style={{ color: selected ? theme.onTint : theme.text }}>
                {option.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    minHeight: 36,
    paddingHorizontal: Spacing.three - 2,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
