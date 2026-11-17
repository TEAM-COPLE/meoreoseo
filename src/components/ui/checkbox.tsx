import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  checked: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  /** 화면 낭독기가 읽어줄 이름 (예: 할 일 제목) */
  label: string;
  disabled?: boolean;
};

/** 동그란 완료 표시 버튼. */
export function Checkbox({ checked, onPress, onLongPress, label, disabled }: Props) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      delayLongPress={320}
      hitSlop={10}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.box,
        {
          borderColor: checked ? theme.tint : theme.textSecondary,
          backgroundColor: checked ? theme.tint : 'transparent',
          opacity: pressed || disabled ? 0.6 : 1,
        },
      ]}>
      {checked ? <ThemedText style={[styles.check, { color: theme.onTint }]}>✓</ThemedText> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    width: 26,
    height: 26,
    borderRadius: Radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: 700,
  },
});
