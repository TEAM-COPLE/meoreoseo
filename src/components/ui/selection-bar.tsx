import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** 선택 모드에서 각 블럭에 표시하는 동그란 선택 체크 표시. */
export function SelectionIndicator({ selected }: { selected: boolean }) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.indicator,
        {
          borderColor: selected ? theme.tint : theme.textSecondary,
          backgroundColor: selected ? theme.tint : 'transparent',
        },
      ]}>
      {selected ? (
        <ThemedText style={[styles.indicatorCheck, { color: theme.onTint }]}>✓</ThemedText>
      ) : null}
    </View>
  );
}

/** 화면 아래에 떠서 선택 개수 · 전체 선택 · 취소 · 삭제를 제공하는 막대. */
export function SelectionBar({
  count,
  totalCount,
  deleting = false,
  onSelectAll,
  onClear,
  onDelete,
}: {
  count: number;
  totalCount: number;
  deleting?: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onDelete: () => void;
}) {
  const theme = useTheme();
  const allSelected = totalCount > 0 && count >= totalCount;

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: theme.background,
          borderColor: theme.border,
        },
      ]}>
      <View style={styles.left}>
        <View style={[styles.countBadge, { backgroundColor: theme.tintSoft }]}>
          <ThemedText type="smallBold" style={{ color: theme.tint }} numberOfLines={1}>
            {count}개 선택
          </ThemedText>
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={deleting || totalCount === 0}
          hitSlop={8}
          onPress={allSelected ? onClear : onSelectAll}
          style={({ pressed }) => [
            styles.textAction,
            { opacity: deleting ? 0.5 : pressed ? 0.65 : 1 },
          ]}>
          <ThemedText type="smallBold" themeColor="textSecondary" numberOfLines={1}>
            {allSelected ? '전체 해제' : '전체 선택'}
          </ThemedText>
        </Pressable>
      </View>

      <View style={styles.right}>
        <Pressable
          accessibilityRole="button"
          disabled={deleting}
          onPress={onClear}
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: theme.backgroundElement,
              opacity: deleting ? 0.5 : pressed ? 0.72 : 1,
            },
          ]}>
          <ThemedText type="smallBold" numberOfLines={1}>
            취소
          </ThemedText>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          disabled={deleting || count === 0}
          onPress={onDelete}
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: theme.dangerSolid,
              opacity: deleting || count === 0 ? 0.55 : pressed ? 0.8 : 1,
            },
          ]}>
          {deleting ? (
            <ActivityIndicator size="small" color={theme.onDanger} />
          ) : (
            <ThemedText type="smallBold" style={{ color: theme.onDanger }} numberOfLines={1}>
              {`${count}개 삭제`}
            </ThemedText>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  indicator: {
    width: 24,
    height: 24,
    borderRadius: Radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicatorCheck: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '700',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    borderRadius: Radius.large,
    borderWidth: 1,
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: Spacing.two + 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 10,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexShrink: 1,
  },
  countBadge: {
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one,
    borderRadius: Radius.full,
  },
  textAction: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.one,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  button: {
    minHeight: 36,
    paddingHorizontal: Spacing.three - 2,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
