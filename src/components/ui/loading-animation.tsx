import { Image } from 'expo-image';
import { useEffect, useState, type PropsWithChildren } from 'react';
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme, useThemeMode } from '@/hooks/use-theme';

const USE_NATIVE_DRIVER = Platform.OS !== 'web';
const STAGGER_MS = 95;
const ENTER_DURATION_MS = 440;

/**
 * 영상 속 카드들이 위에서 아래로 하나씩 부드럽게 나타나는 등장 애니메이션.
 * 웹과 앱(iOS·Android) 모두에서 동일하게 동작한다.
 */
export function StaggeredReveal({
  index = 0,
  style,
  children,
}: PropsWithChildren<{
  index?: number;
  style?: StyleProp<ViewStyle>;
}>) {
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: ENTER_DURATION_MS,
      delay: index * STAGGER_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: USE_NATIVE_DRIVER,
    });
    anim.start();
    return () => anim.stop();
  }, [index, progress]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [22, 0],
  });
  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.97, 1],
  });

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [{ translateY }, { scale }],
        },
      ]}>
      {children}
    </Animated.View>
  );
}

/**
 * DB 데이터를 불러오는 동안 은은하게 맥박치듯 반짝이는 스켈레톤 블록.
 */
export function ShimmerBlock({
  width = '100%',
  height = 14,
  borderRadius = Radius.small,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const [pulse] = useState(() => new Animated.Value(0.38));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.9,
          duration: 850,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(pulse, {
          toValue: 0.38,
          duration: 850,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: theme.backgroundSelected,
          opacity: pulse,
        },
        style,
      ]}
    />
  );
}

export type SectionSkeletonVariant = 'weather' | 'list' | 'stats';

/**
 * 오늘 화면 각 카드 안에서 DB가 불러와지는 동안 보여줄 스켈레톤 레이아웃.
 */
export function SectionSkeleton({ variant = 'list' }: { variant?: SectionSkeletonVariant }) {
  if (variant === 'weather') {
    return (
      <View style={styles.sectionSkeleton}>
        <View style={styles.weatherRow}>
          <ShimmerBlock width={48} height={48} borderRadius={Radius.full} />
          <View style={styles.weatherMeta}>
            <ShimmerBlock width="45%" height={22} borderRadius={Radius.small} />
            <ShimmerBlock width="72%" height={13} borderRadius={Radius.small} />
          </View>
        </View>
        <ShimmerBlock width="58%" height={13} borderRadius={Radius.small} />
      </View>
    );
  }

  if (variant === 'stats') {
    return (
      <View style={styles.statsRow}>
        {[0, 1, 2].map((col) => (
          <View key={col} style={styles.statCol}>
            <ShimmerBlock width="60%" height={12} />
            <ShimmerBlock width="82%" height={18} />
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.sectionSkeleton}>
      <View style={styles.listRow}>
        <ShimmerBlock width={20} height={20} borderRadius={6} />
        <ShimmerBlock width="68%" height={15} />
      </View>
      <View style={styles.listRow}>
        <ShimmerBlock width={20} height={20} borderRadius={6} />
        <ShimmerBlock width="48%" height={15} />
      </View>
    </View>
  );
}

/**
 * 목록 화면(할 일, 일정, 메모, 가계부, 습관)에서 DB 로딩 중 보여주는 계단식 스켈레톤 카드 목록.
 */
export function SkeletonList({ count = 4 }: { count?: number }) {
  const theme = useTheme();
  const rows = Array.from({ length: count }, (_, i) => i);

  return (
    <View style={styles.listContainer} accessibilityLabel="데이터를 불러오는 중">
      {rows.map((i) => (
        <StaggeredReveal key={i} index={i}>
          <View
            style={[
              styles.skeletonCard,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
              },
            ]}>
            <View style={styles.cardHeaderRow}>
              <ShimmerBlock width={i % 2 === 0 ? '42%' : '34%'} height={16} />
              <ShimmerBlock width={52} height={13} />
            </View>
            <ShimmerBlock width={i % 2 === 0 ? '82%' : '68%'} height={14} />
            {i === 0 ? <ShimmerBlock width="54%" height={14} /> : null}
          </View>
        </StaggeredReveal>
      ))}
    </View>
  );
}

/**
 * 단일 메모 로딩 중 보여주는 스켈레톤 화면.
 */
export function NoteSkeleton() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.noteRoot,
        {
          backgroundColor: theme.background,
          paddingTop: insets.top + Spacing.three,
          paddingBottom: insets.bottom + Spacing.four,
        },
      ]}
      accessibilityLabel="메모를 불러오는 중">
      <View style={styles.noteInner}>
        <StaggeredReveal index={0}>
          <ShimmerBlock width="55%" height={28} borderRadius={Radius.small} />
        </StaggeredReveal>
        <StaggeredReveal index={1}>
          <View style={styles.noteBody}>
            <ShimmerBlock width="92%" height={15} />
            <ShimmerBlock width="84%" height={15} />
            <ShimmerBlock width="76%" height={15} />
            <ShimmerBlock width="60%" height={15} />
          </View>
        </StaggeredReveal>
      </View>
    </View>
  );
}

/**
 * 앱/웹 초기 실행 시 로그인 세션 및 DB 연결을 기다리는 동안 보여주는 전체 로딩 화면.
 * 영상의 은은한 곡선 배경과 로고, 그리고 위에서 아래로 하나씩 나타나는 5개 카드 애니메이션을 사용한다.
 */
export function AppLoadingScreen({ statusText }: { statusText?: string }) {
  const theme = useTheme();
  const { resolvedScheme } = useThemeMode();
  const insets = useSafeAreaInsets();
  const isDark = resolvedScheme === 'dark';

  const arcColor = isDark ? 'rgba(155, 138, 251, 0.11)' : 'rgba(99, 84, 234, 0.08)';
  const cardBorder = theme.border;

  return (
    <View
      style={[styles.appRoot, { backgroundColor: theme.background }]}
      accessibilityLabel={statusText ?? '앱을 불러오는 중'}>
      {/* 영상의 은은한 곡선 글래스 배경 */}
      <View pointerEvents="none" style={styles.backdrop}>
        <View style={[styles.arcTop, { borderColor: arcColor }]} />
        <View style={[styles.arcBottom, { borderColor: arcColor }]} />
      </View>

      <View
        style={[
          styles.appContent,
          {
            paddingTop: insets.top + Spacing.three,
            paddingBottom: insets.bottom + Spacing.four,
          },
        ]}>
        {/* 상단 브랜드 로고 + 탭 플레이스홀더 */}
        <StaggeredReveal index={0}>
          <View style={styles.brandBar}>
            <Image
              source={require('@/assets/images/logo-mark.png')}
              style={styles.logo}
              contentFit="contain"
            />
            <View style={styles.tabPills}>
              <ShimmerBlock width={46} height={26} borderRadius={Radius.full} />
              <ShimmerBlock width={46} height={26} borderRadius={Radius.full} />
              <ShimmerBlock width={46} height={26} borderRadius={Radius.full} />
            </View>
          </View>
        </StaggeredReveal>

        {statusText ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.statusLabel}>
            {statusText}
          </ThemedText>
        ) : null}

        {/* 영상처럼 1번~5번 카드가 위에서 아래로 순차 등장 */}
        <StaggeredReveal index={1}>
          <View
            style={[
              styles.skeletonCard,
              { backgroundColor: theme.backgroundElement, borderColor: cardBorder },
            ]}>
            <View style={styles.cardHeaderRow}>
              <ShimmerBlock width="34%" height={16} />
              <ShimmerBlock width={54} height={13} />
            </View>
            <SectionSkeleton variant="weather" />
          </View>
        </StaggeredReveal>

        <StaggeredReveal index={2}>
          <View
            style={[
              styles.skeletonCard,
              { backgroundColor: theme.backgroundElement, borderColor: cardBorder },
            ]}>
            <View style={styles.cardHeaderRow}>
              <ShimmerBlock width="22%" height={16} />
              <ShimmerBlock width={54} height={13} />
            </View>
            <SectionSkeleton variant="list" />
          </View>
        </StaggeredReveal>

        <StaggeredReveal index={3}>
          <View
            style={[
              styles.skeletonCard,
              { backgroundColor: theme.backgroundElement, borderColor: cardBorder },
            ]}>
            <View style={styles.cardHeaderRow}>
              <ShimmerBlock width="20%" height={16} />
              <ShimmerBlock width={54} height={13} />
            </View>
            <ShimmerBlock width="52%" height={14} />
          </View>
        </StaggeredReveal>

        <StaggeredReveal index={4}>
          <View
            style={[
              styles.skeletonCard,
              { backgroundColor: theme.backgroundElement, borderColor: cardBorder },
            ]}>
            <View style={styles.cardHeaderRow}>
              <ShimmerBlock width="28%" height={16} />
              <ShimmerBlock width={54} height={13} />
            </View>
            <SectionSkeleton variant="stats" />
          </View>
        </StaggeredReveal>
      </View>
    </View>
  );
}

/**
 * 앱/웹 최초 실행 시 로그인 확인 및 초기 DB 쿼리가 끝날 때까지
 * AppLoadingScreen 을 오버레이로 유지한 뒤 부드럽게 페이드아웃한다.
 */
export function InitialDbLoadingOverlay({
  authLoading,
  signedIn,
}: {
  authLoading: boolean;
  signedIn: boolean;
}) {
  const [unmounted, setUnmounted] = useState(false);
  const [fade] = useState(() => new Animated.Value(1));
  const readyToFade = !authLoading;

  useEffect(() => {
    if (!readyToFade) return;
    const anim = Animated.timing(fade, {
      toValue: 0,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: USE_NATIVE_DRIVER,
    });
    anim.start(({ finished }) => {
      if (finished) setUnmounted(true);
    });
    return () => anim.stop();
  }, [readyToFade, fade]);

  if (unmounted) return null;

  return (
    <Animated.View
      pointerEvents={readyToFade ? 'none' : 'auto'}
      style={[styles.overlayRoot, { opacity: fade }]}>
      <AppLoadingScreen
        statusText={!authLoading && signedIn ? '데이터를 불러오는 중…' : undefined}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sectionSkeleton: {
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  weatherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  weatherMeta: {
    flex: 1,
    gap: Spacing.two,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 28,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.three,
    paddingVertical: Spacing.one,
  },
  statCol: {
    flex: 1,
    gap: Spacing.one + 2,
  },
  listContainer: {
    gap: Spacing.three,
  },
  skeletonCard: {
    borderRadius: Radius.large,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.two + 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  noteRoot: {
    flex: 1,
  },
  noteInner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    gap: Spacing.four,
  },
  noteBody: {
    gap: Spacing.two + 2,
  },
  appRoot: {
    flex: 1,
    overflow: 'hidden',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
  },
  arcTop: {
    position: 'absolute',
    width: 520,
    height: 520,
    borderRadius: 999,
    borderWidth: 1.5,
    top: -120,
    right: -180,
  },
  arcBottom: {
    position: 'absolute',
    width: 560,
    height: 560,
    borderRadius: 999,
    borderWidth: 1.5,
    bottom: -220,
    left: -160,
  },
  appContent: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    gap: Spacing.three,
  },
  brandBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.one,
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: Radius.small,
  },
  tabPills: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  statusLabel: {
    textAlign: 'center',
  },
  overlayRoot: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 100,
  },
});
