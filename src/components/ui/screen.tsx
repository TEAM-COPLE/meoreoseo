import { router } from 'expo-router';
import { useEffect, useRef, useState, type PropsWithChildren, type ReactNode, type Ref } from 'react';
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme, useThemeMode, type ThemeMode } from '@/hooks/use-theme';
import { setSwipeLocked } from '@/lib/swipe-navigation';

import { Button } from './button';
import { SkeletonList } from './loading-animation';

type Props = PropsWithChildren<{
  title: string;
  /** 제목 오른쪽에 놓을 버튼 (예: "추가") */
  action?: ReactNode;
  /** 넘기면 제목 왼쪽에 "‹" 뒤로 가기 버튼이 생긴다. 탭이 아닌 화면에서 쓴다. */
  onBack?: () => void;
  /** 화면 아래쪽에 떠 있는 작업 막대(예: 멀티 삭제 바) */
  overlay?: ReactNode;
  /** 아래로 당겨서 새로고침할 때 호출할 함수 */
  onRefresh?: () => Promise<unknown> | void;
  /** 웹 데스크톱 넓은 화면에서 최대 너비를 넓힐지 여부 */
  wide?: boolean;
  /** false 면 잠시 스크롤을 멈춘다. 상자를 끌어서 옮기는 동안 화면이 같이 움직이지 않게 할 때 쓴다. */
  scrollEnabled?: boolean;
  /** 스크롤 위치를 직접 옮겨야 할 때(상자를 끌다가 화면 끝에 닿으면 자동 스크롤) 쓰는 ref */
  scrollRef?: Ref<ScrollViewInstance>;
  /** 스크롤 위치·내용 크기·화면 크기를 알아야 할 때 넘긴다. */
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onContentSizeChange?: (width: number, height: number) => void;
  onScrollLayout?: (event: LayoutChangeEvent) => void;
}>;

/**
 * 탭 화면의 공통 틀: 위쪽 제목 줄 + 스크롤되는 내용.
 * 제목 줄 오른쪽에서 테마를 바꾸거나 "설정" 화면으로 갈 수 있다.
 */
export function Screen({
  title,
  action,
  onBack,
  overlay,
  onRefresh,
  wide = false,
  scrollEnabled = true,
  scrollRef,
  onScroll,
  onContentSizeChange,
  onScrollLayout,
  children,
}: Props) {
  const theme = useTheme();
  const { mode, resolvedScheme, setMode } = useThemeMode();
  const [themeOpen, setThemeOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const bottomInset = onBack ? Spacing.four : BottomTabInset + Spacing.four;
  const maxWidth = wide && Platform.OS === 'web' && width >= 960 ? 1080 : MaxContentWidth;
  const isNative = Platform.OS !== 'web';

  // 모바일 전용 커스텀 플로팅 스크롤바 상태
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [thumbTranslateY] = useState(() => new Animated.Value(0));
  const [scrollbarOpacity] = useState(() => new Animated.Value(0));
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trackTop = insets.top + Spacing.two;
  const trackBottom = insets.bottom + bottomInset + (overlay ? 76 : 0);
  const trackHeight = Math.max(0, viewportHeight - trackTop - trackBottom);
  const scrollableDistance = Math.max(0, contentHeight - viewportHeight);
  const showCustomScrollbar = isNative && scrollableDistance > 24 && trackHeight > 48;
  const thumbHeight = showCustomScrollbar
    ? Math.max(32, Math.min(110, (viewportHeight / contentHeight) * trackHeight))
    : 0;
  const maxThumbOffset = Math.max(0, trackHeight - thumbHeight);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  function revealScrollbar() {
    if (!showCustomScrollbar) return;
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    Animated.timing(scrollbarOpacity, {
      toValue: 1,
      duration: 120,
      useNativeDriver: true,
    }).start();
    hideTimerRef.current = setTimeout(() => {
      Animated.timing(scrollbarOpacity, {
        toValue: 0,
        duration: 380,
        useNativeDriver: true,
      }).start();
    }, 750);
  }

  function handleInternalScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    onScroll?.(event);
    if (!showCustomScrollbar) return;
    const y = event.nativeEvent.contentOffset.y;
    const ratio = scrollableDistance > 0 ? Math.min(1, Math.max(0, y / scrollableDistance)) : 0;
    thumbTranslateY.setValue(ratio * maxThumbOffset);
    revealScrollbar();
  }

  function handleInternalContentSizeChange(w: number, h: number) {
    onContentSizeChange?.(w, h);
    if (isNative) setContentHeight(h);
  }

  function handleInternalLayout(event: LayoutChangeEvent) {
    onScrollLayout?.(event);
    if (isNative) setViewportHeight(event.nativeEvent.layout.height);
  }

  useEffect(() => {
    if (scrollEnabled) return;
    setSwipeLocked(true);
    return () => setSwipeLocked(false);
  }, [scrollEnabled]);

  async function handleRefresh() {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <ScrollView
        ref={scrollRef}
        scrollEnabled={scrollEnabled}
        showsVerticalScrollIndicator={!isNative}
        onScroll={isNative || onScroll ? handleInternalScroll : undefined}
        scrollEventThrottle={isNative || onScroll ? 16 : undefined}
        onContentSizeChange={handleInternalContentSizeChange}
        onLayout={handleInternalLayout}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.tint}
              colors={[theme.tint]}
            />
          ) : undefined
        }
        contentContainerStyle={[
          styles.content,
          {
            maxWidth,
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
            accessibilityLabel="테마 선택"
            hitSlop={8}
            onPress={() => setThemeOpen(true)}
            style={({ pressed }) => [
              styles.account,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
                opacity: pressed ? 0.7 : 1,
              },
            ]}>
            <ThemedText type="small">테마</ThemedText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="설정"
            hitSlop={8}
            onPress={() => router.push('/settings')}
            style={({ pressed }) => [
              styles.account,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
                opacity: pressed ? 0.7 : 1,
              },
            ]}>
            <ThemedText type="small">설정</ThemedText>
          </Pressable>
        </View>

        {children}
      </ScrollView>

      {showCustomScrollbar ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.scrollbarTrack,
            {
              top: trackTop,
              bottom: trackBottom,
              opacity: scrollbarOpacity,
            },
          ]}>
          <Animated.View
            style={[
              styles.scrollbarThumb,
              {
                height: thumbHeight,
                backgroundColor: theme.tint,
                transform: [{ translateY: thumbTranslateY }],
              },
            ]}
          />
        </Animated.View>
      ) : null}

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

      <ThemePickerModal
        visible={themeOpen}
        mode={mode}
        resolvedScheme={resolvedScheme}
        onSelect={(next) => {
          setMode(next);
          setThemeOpen(false);
        }}
        onClose={() => setThemeOpen(false)}
      />
    </View>
  );
}

const THEME_OPTIONS: readonly { value: ThemeMode; label: string; description: string }[] = [
  { value: 'light', label: '라이트 테마', description: '밝고 선명한 화면' },
  { value: 'dark', label: '다크 테마', description: '눈이 편안한 어두운 화면' },
  { value: 'system', label: '기기 설정 따르기', description: '시스템 화면 모드에 맞춤' },
];

function ThemePickerModal({
  visible,
  mode,
  resolvedScheme,
  onSelect,
  onClose,
}: {
  visible: boolean;
  mode: ThemeMode;
  resolvedScheme: 'light' | 'dark';
  onSelect: (next: ThemeMode) => void;
  onClose: () => void;
}) {
  const theme = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="테마 선택 창 닫기"
        onPress={onClose}
        style={styles.modalBackdrop}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.modalCard,
            {
              backgroundColor: theme.backgroundElement,
              borderColor: theme.border,
            },
          ]}>
          <View style={styles.modalHeader}>
            <ThemedText type="default" style={styles.modalTitle}>
              화면 테마
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              현재 {resolvedScheme === 'dark' ? '다크' : '라이트'} 테마 적용 중
            </ThemedText>
          </View>

          <View style={styles.modalOptions}>
            {THEME_OPTIONS.map((option) => {
              const selected = mode === option.value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => onSelect(option.value)}
                  style={({ pressed }) => [
                    styles.themeOption,
                    {
                      backgroundColor: selected ? theme.tintSoft : theme.background,
                      borderColor: selected ? theme.tint : theme.border,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}>
                  <View style={styles.themeOptionText}>
                    <ThemedText
                      type="smallBold"
                      style={{ color: selected ? theme.tint : theme.text }}>
                      {option.label}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {option.description}
                    </ThemedText>
                  </View>
                  {selected ? (
                    <ThemedText type="smallBold" style={{ color: theme.tint }}>
                      ✓
                    </ThemedText>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          <Button label="닫기" variant="secondary" size="small" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
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
  if (loading) {
    return <SkeletonList />;
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
  highlight = false,
  accessibilityLabel,
  accessibilityHint,
  style,
}: PropsWithChildren<{
  onPress?: (event: GestureResponderEvent) => void;
  onLongPress?: () => void;
  selected?: boolean;
  selecting?: boolean;
  highlight?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}>) {
  const theme = useTheme();
  const { resolvedScheme } = useThemeMode();
  const isLight = resolvedScheme === 'light';
  const baseStyle = [
    styles.card,
    {
      backgroundColor: selected || highlight ? theme.tintSoft : theme.backgroundElement,
      borderColor: selected ? theme.tint : highlight ? theme.tint : theme.border,
      borderWidth: selected ? 1.5 : 1,
    },
    isLight && styles.cardShadowLight,
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
  scrollbarTrack: {
    position: 'absolute',
    right: 4,
    width: 4,
    borderRadius: Radius.full,
  },
  scrollbarThumb: {
    width: 4,
    borderRadius: Radius.full,
    opacity: 0.55,
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
    borderWidth: 1,
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
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  cardShadowLight: {
    shadowColor: '#171626',
    shadowOpacity: 0.045,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 10, 18, 0.56)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.three,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: Radius.large,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  modalHeader: {
    gap: Spacing.half,
  },
  modalTitle: {
    fontWeight: 700,
    fontSize: 18,
  },
  modalOptions: {
    gap: Spacing.two,
  },
  themeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    borderRadius: Radius.medium,
    borderWidth: 1.5,
  },
  themeOptionText: {
    gap: Spacing.half,
  },
});
