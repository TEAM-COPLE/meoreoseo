import type { ComponentRef, RefObject } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type TextFieldRef = ComponentRef<typeof TextInput>;

type Props = TextInputProps & {
  label: string;
  /** 여러 줄 입력일 때의 최소 높이 */
  minHeight?: number;
  inputRef?: RefObject<TextFieldRef | null>;
};

/** 이름표(label)가 붙은 입력 칸. */
export function TextField({ label, style, multiline, minHeight, inputRef, ...rest }: Props) {
  const theme = useTheme();

  return (
    <View style={styles.wrapper}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <TextInput
        ref={inputRef}
        accessibilityLabel={label}
        multiline={multiline}
        placeholderTextColor={theme.textSecondary}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={[
          styles.input,
          {
            color: theme.text,
            backgroundColor: theme.backgroundElement,
            borderColor: theme.border,
          },
          multiline && { minHeight: minHeight ?? 96, paddingTop: Spacing.two + 2 },
          style,
        ]}
        {...rest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: Spacing.one,
  },
  input: {
    minHeight: 46,
    paddingHorizontal: Spacing.three - 4,
    paddingVertical: Spacing.two,
    borderRadius: Radius.medium,
    borderWidth: 1,
    fontSize: 16,
  },
});
