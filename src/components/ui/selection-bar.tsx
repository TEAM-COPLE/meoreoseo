import { Check, Plus, Trash2 } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { hasActiveConfirm } from '@/components/ui/confirm-modal';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * 화면 오른쪽 위 제목 줄에 놓는 선택·추가 버튼 묶음.
 * 웹에서는 "선택" 버튼을 함께 보여주고, 선택 모드일 때는 "취소" 버튼을 보여준다.
 */
export function SelectionHeaderActions({
  selecting,
  canSelect,
  addLabel = '추가',
  onAdd,
  onStartSelect,
  onCancelSelect,
}: {
  selecting: boolean;
  canSelect: boolean;
  addLabel?: string;
  onAdd: () => void;
  onStartSelect: () => void;
  onCancelSelect: () => void;
}) {
  const addIcon = (color: string) => <Plus size={14} color={color} strokeWidth={2.4} />;

  if (Platform.OS !== 'web') {
    return selecting ? null : <Button label={addLabel} icon={addIcon} size="small" onPress={onAdd} />;
  }
  if (selecting) {
    return <Button label="취소" variant="secondary" size="small" onPress={onCancelSelect} />;
  }
  return (
    <View style={styles.headerActions}>
      {canSelect ? (
        <Button label="선택" variant="secondary" size="small" onPress={onStartSelect} />
      ) : null}
      <Button label={addLabel} icon={addIcon} size="small" onPress={onAdd} />
    </View>
  );
}

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
      {selected ? <Check size={13} color={theme.onTint} strokeWidth={2.75} /> : null}
    </View>
  );
}

/** 화면 아래에 떠서 선택 개수 · 전체 선택 · 취소 · 삭제를 제공하는 막대. */
export function SelectionBar({
  count,
  totalCount,
  deleting = false,
  onSelectAll,
  onDeselectAll,
  onClear,
  onDelete,
}: {
  count: number;
  totalCount: number;
  deleting?: boolean;
  onSelectAll: () => void;
  onDeselectAll?: () => void;
  onClear: () => void;
  onDelete: () => void;
}) {
  const theme = useTheme();
  const allSelected = totalCount > 0 && count >= totalCount;
  const clearRef = useRef(onClear);
  const deletingRef = useRef(deleting);

  useEffect(() => {
    clearRef.current = onClear;
    deletingRef.current = deleting;
  }, [deleting, onClear]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !deletingRef.current && !hasActiveConfirm()) {
        clearRef.current();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <View
      style={[
        styles.bar,
        Platform.OS === 'web' && styles.webBar,
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
          onPress={allSelected ? (onDeselectAll ?? onClear) : onSelectAll}
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
            <View style={styles.deleteInner}>
              <Trash2 size={14} color={theme.onDanger} strokeWidth={2} />
              <ThemedText type="smallBold" style={{ color: theme.onDanger }} numberOfLines={1}>
                {count > 0 ? `${count}개 삭제` : '삭제'}
              </ThemedText>
            </View>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  indicator: {
    width: 24,
    height: 24,
    borderRadius: Radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
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
  // userSelect 는 웹 전용이라 RN ViewStyle 타입에 없어 캐스팅한다.
  webBar: {
    userSelect: 'none',
  } as ViewStyle,
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
