import { router } from 'expo-router';
import type { PropsWithChildren, ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme, useThemeMode } from '@/hooks/use-theme';

import { Button } from './button';

type Props = PropsWithChildren<{
  title: string;
  /** 제목 오른쪽에 놓을 버튼 (예: "추가") */
  action?: ReactNode;
}>;

/**
 * 탭 화면의 공통 틀: 위쪽 제목 줄 + 스크롤되는 내용.
 * 제목 줄 오른쪽에서 라이트/다크 모드를 바로 전환하거나 "계정" 화면으로 갈 수 있다.
 */
export function Screen({ title, action, children }: Props) {
  const theme = useTheme();
  const { resolvedScheme, toggleScheme } = useThemeMode();
  const insets = useSafeAreaInsets();
  const isDark = resolvedScheme === 'dark';

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + Spacing.three,
            paddingBottom: insets.bottom + BottomTabInset + Spacing.four,
          },
        ]}>
        <View style={styles.header}>
          <ThemedText accessibilityRole="header" style={styles.title}>
            {title}
          </ThemedText>
          {action}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
            hitSlop={8}
            onPress={toggleScheme}
            style={({ pressed }) => [
              styles.account,
              { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
            ]}>
            <ThemedText type="small">{isDark ? '라이트' : '다크'}</ThemedText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="계정 및 설정"
            hitSlop={8}
            onPress={() => router.push('/account')}
            style={({ pressed }) => [
              styles.account,
              { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
            ]}>
            <ThemedText type="small">계정</ThemedText>
          </Pressable>
        </View>

        {children}
      </ScrollView>
    </View>
  );
}

/** 목록 상태에 따라 "불러오는 중", "오류", "비어 있음" 중 알맞은 안내를 보여준다. */
export function ListStatus({
  loading,
  error,
  empty,
  emptyText,
  onRetry,
}: {
  loading: boolean;
  error: unknown;
  empty: boolean;
  emptyText: string;
  onRetry: () => void;
}) {
  const theme = useTheme();

  if (loading) {
    return (
      <View style={styles.status}>
        <ActivityIndicator color={theme.textSecondary} />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.status}>
        <ThemedText type="small" themeColor="danger" style={styles.centered}>
          불러오지 못했습니다. 다시 시도해 주세요.
        </ThemedText>
        <Button label="다시 시도" variant="secondary" size="small" onPress={onRetry} />
      </View>
    );
  }
  if (empty) {
    return (
      <View style={styles.status}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
          {emptyText}
        </ThemedText>
      </View>
    );
  }
  return null;
}

/** 목록 항목이나 요약을 담는 둥근 상자. */
export function Card({ children, onPress }: PropsWithChildren<{ onPress?: () => void }>) {
  const theme = useTheme();

  if (!onPress) {
    return (
      <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>{children}</View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
      ]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  title: {
    flex: 1,
    fontSize: 26,
    lineHeight: 34,
    fontWeight: 700,
  },
  account: {
    minHeight: 34,
    paddingHorizontal: Spacing.three - 2,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  status: {
    paddingVertical: Spacing.five,
    alignItems: 'center',
    gap: Spacing.three,
  },
  centered: {
    textAlign: 'center',
  },
  card: {
    borderRadius: Radius.large,
    padding: Spacing.three,
    gap: Spacing.two,
  },
});
