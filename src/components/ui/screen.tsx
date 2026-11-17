import { router } from 'expo-router';
import type { PropsWithChildren, ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme, useThemeMode } from '@/hooks/use-theme';

import { Button } from './button';

type Props = PropsWithChildren<{
  title: string;
  /** 제목 오른쪽에 놓을 버튼 (예: "추가") */
  action?: ReactNode;
  /** 넘기면 제목 왼쪽에 "‹" 뒤로 가기 버튼이 생긴다. 탭이 아닌 화면에서 쓴다. */
  onBack?: () => void;
  /** 화면 아래쪽에 떠 있는 작업 막대(예: 멀티 삭제 바) */
  overlay?: ReactNode;
}>;

/**
 * 탭 화면의 공통 틀: 위쪽 제목 줄 + 스크롤되는 내용.
 * 제목 줄 오른쪽에서 라이트/다크 모드를 바로 전환하거나 "계정" 화면으로 갈 수 있다.
 */
export function Screen({ title, action, onBack, overlay, children }: Props) {
  const theme = useTheme();
  const { resolvedScheme, toggleScheme } = useThemeMode();
  const insets = useSafeAreaInsets();
  const isDark = resolvedScheme === 'dark';
  const bottomInset = onBack ? Spacing.four : BottomTabInset + Spacing.four;

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + Spacing.three,
            paddingBottom: insets.bottom + bottomInset + (overlay ? 76 : 0),
          },
        ]}>
        <View style={styles.header}>
          {onBack ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="뒤로"
              hitSlop={8}
              onPress={onBack}
              style={({ pressed }) => [
                styles.back,
                { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
              ]}>
              <ThemedText type="default">‹</ThemedText>
            </Pressable>
          ) : null}
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

      {overlay ? (
        <View
          pointerEvents="box-none"
          style={[
            styles.overlayContainer,
            {
              bottom: insets.bottom + (onBack ? Spacing.three : BottomTabInset + Spacing.two),
            },
          ]}>
          <View style={styles.overlayInner}>{overlay}</View>
        </View>
      ) : null}
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
export function Card({
  children,
  onPress,
  onLongPress,
  selected = false,
  selecting = false,
  accessibilityLabel,
  accessibilityHint,
  style,
}: PropsWithChildren<{
  onPress?: (event: GestureResponderEvent) => void;
  onLongPress?: () => void;
  selected?: boolean;
  selecting?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}>) {
  const theme = useTheme();
  const baseStyle = [
    styles.card,
    {
      backgroundColor: selected ? theme.tintSoft : theme.backgroundElement,
      borderColor: selected ? theme.tint : 'transparent',
    },
    selecting && Platform.OS === 'web' && styles.noSelect,
    style,
  ];

  if (!onPress && !onLongPress) {
    return <View style={baseStyle}>{children}</View>;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={selected ? { selected: true } : undefined}
      delayLongPress={320}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        ...baseStyle,
        pressed && {
          backgroundColor: selected ? theme.tintSoft : theme.backgroundSelected,
          opacity: selected ? 0.9 : 1,
        },
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
  back: {
    width: 34,
    height: 34,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
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
    borderWidth: 1.5,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  // userSelect 는 웹 전용이라 RN ViewStyle 타입에 없어 캐스팅한다.
  noSelect: {
    userSelect: 'none',
  } as ViewStyle,
  overlayContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 20,
  },
  overlayInner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
  },
});
