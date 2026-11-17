import { ActivityIndicator, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  label: string;
  onPress: () => void;
  /** primary: 주된 동작, secondary: 보조 동작, danger: 삭제처럼 되돌릴 수 없는 동작 */
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'medium' | 'small';
  loading?: boolean;
  disabled?: boolean;
  /** 구글·카카오 버튼처럼 정해진 색을 써야 할 때만 넘긴다. variant 의 색보다 우선한다. */
  colors?: { background: string; text: string };
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'medium',
  loading = false,
  disabled = false,
  colors,
  style,
}: Props) {
  const theme = useTheme();
  const inactive = disabled || loading;

  const backgroundColor =
    colors?.background ??
    (variant === 'primary'
      ? theme.tint
      : variant === 'danger'
        ? theme.dangerSoft
        : theme.backgroundElement);
  const color =
    colors?.text ??
    (variant === 'primary' ? theme.onTint : variant === 'danger' ? theme.danger : theme.text);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        size === 'small' && styles.small,
        { backgroundColor, opacity: inactive ? 0.5 : pressed ? 0.75 : 1 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <ThemedText type={size === 'small' ? 'smallBold' : 'default'} style={{ color }}>
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 46,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  small: {
    minHeight: 34,
    paddingHorizontal: Spacing.three - 2,
    borderRadius: Radius.full,
  },
});
