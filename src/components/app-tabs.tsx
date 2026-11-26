import { usePathname } from "expo-router";
import { SymbolView, type SFSymbol } from "expo-symbols";
import { useEffect, useState, type ComponentType } from "react";
import {
    Platform,
    Pressable,
    StyleSheet,
    useWindowDimensions,
    View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
    Easing,
    Extrapolation,
    interpolate,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
    type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import CalendarScreen from "@/app/(tabs)/calendar";
import TodayScreen from "@/app/(tabs)/index";
import MoneyScreen from "@/app/(tabs)/money";
import NotesScreen from "@/app/(tabs)/notes";
import StudyScreen from "@/app/(tabs)/study";
import TodosScreen from "@/app/(tabs)/todos";
import { SafeBoundary } from "@/components/safe-boundary";
import { ThemedText } from "@/components/themed-text";
import { Colors, Radius, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-theme";
import { indexOfSwipeRoute, useIsSwipeLocked } from "@/lib/swipe-navigation";

type TabDefinition = {
  path: "/" | "/todos" | "/calendar" | "/study" | "/notes" | "/money";
  label: string;
  sf: SFSymbol;
  md: string;
  Component: ComponentType;
};

const TABS: readonly TabDefinition[] = [
  {
    path: "/",
    label: "오늘",
    sf: "sun.max",
    md: "today",
    Component: TodayScreen,
  },
  {
    path: "/todos",
    label: "할 일",
    sf: "checklist",
    md: "checklist",
    Component: TodosScreen,
  },
  {
    path: "/calendar",
    label: "일정",
    sf: "calendar",
    md: "calendar_month",
    Component: CalendarScreen,
  },
  {
    path: "/study",
    label: "공부",
    sf: "timer",
    md: "timer",
    Component: StudyScreen,
  },
  {
    path: "/notes",
    label: "메모",
    sf: "note.text",
    md: "sticky_note_2",
    Component: NotesScreen,
  },
  {
    path: "/money",
    label: "가계부",
    sf: "wonsign.circle",
    md: "account_balance_wallet",
    Component: MoneyScreen,
  },
];

const TAB_COUNT = TABS.length;
const DOCK_HEIGHT = 62;
const DOCK_PADDING = 6;

/**
 * 휴대폰용 순환 가로 스와이프 페이저 + 플로팅 독 하단 탭 바.
 * 오늘 ↔ 할 일 ↔ 일정 ↔ 공부 ↔ 메모 ↔ 가계부 ↔ 오늘 순서로 양쪽 화면의 실제 블럭이 함께 미끄러지며 전환된다.
 */
export default function AppTabs() {
  const pathname = usePathname();
  const scheme = useColorScheme();
  const colors = Colors[scheme === "dark" ? "dark" : "light"];
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const swipeLocked = useIsSwipeLocked();

  const initialRouteIndex = Math.max(0, indexOfSwipeRoute(pathname));
  const [prevPathname, setPrevPathname] = useState(pathname);
  const [activeIndex, setActiveIndex] = useState(initialRouteIndex);
  const [allTabsMounted, setAllTabsMounted] = useState(false);
  const [dockWidth, setDockWidth] = useState(0);
  const activeIdxSV = useSharedValue(initialRouteIndex);
  const dragX = useSharedValue(0);
  const isAnimating = useSharedValue(false);

  // 초기 구동 시 현재 탭과 양옆 탭(3개)을 먼저 그린 뒤, 나머지 2개 탭은 직후에 마운트해 첫 실행 속도를 높인다.
  useEffect(() => {
    const timer = setTimeout(() => setAllTabsMounted(true), 250);
    return () => clearTimeout(timer);
  }, []);

  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    const routeIdx = indexOfSwipeRoute(pathname);
    if (routeIdx !== -1) {
      setActiveIndex(routeIdx);
    }
  }

  // 위젯 딥링크 등 외부 경로 이동 시 애니메이션 상태를 맞춘다.
  useEffect(() => {
    const routeIdx = indexOfSwipeRoute(pathname);
    if (routeIdx === -1) return;
    activeIdxSV.set(routeIdx);
    dragX.set(0);
    isAnimating.set(false);
  }, [activeIdxSV, dragX, isAnimating, pathname]);

  function handleTabPress(targetIndex: number) {
    if (targetIndex === activeIndex || isAnimating.get()) return;
    let step = targetIndex - activeIndex;
    if (step > 2) step -= TAB_COUNT;
    if (step < -2) step += TAB_COUNT;

    // 탭을 누르는 즉시 하단바 활성 상태를 먼저 바꿔 딜레이를 없앤다.
    setActiveIndex(targetIndex);
    isAnimating.set(true);
    dragX.set(
      withTiming(
        -step * width,
        { duration: 170, easing: Easing.out(Easing.cubic) },
        (finished) => {
          if (finished) {
            activeIdxSV.set(targetIndex);
            dragX.set(0);
            isAnimating.set(false);
          }
        },
      ),
    );
  }

  const panGesture = Gesture.Pan()
    .enabled(!swipeLocked)
    .activeOffsetX([-16, 16])
    .failOffsetY([-14, 14])
    .onUpdate((event) => {
      if (isAnimating.get()) return;
      dragX.set(event.translationX);
    })
    .onEnd((event) => {
      if (isAnimating.get()) return;
      const projected = event.translationX + event.velocityX * 0.16;
      const threshold = width * 0.2;
      if (
        Math.abs(projected) > threshold &&
        Math.abs(event.translationX) > 16
      ) {
        const step = projected < 0 ? 1 : -1;
        const nextIdx = (activeIdxSV.get() + step + TAB_COUNT) % TAB_COUNT;
        // 손을 떼는 즉시 하단바 아이콘/라벨을 전환해 딜레이 없이 반응하게 한다.
        runOnJS(setActiveIndex)(nextIdx);
        isAnimating.set(true);
        dragX.set(
          withTiming(
            -step * width,
            { duration: 150, easing: Easing.out(Easing.cubic) },
            (finished) => {
              if (finished) {
                activeIdxSV.set(nextIdx);
                dragX.set(0);
                isAnimating.set(false);
              }
            },
          ),
        );
      } else {
        dragX.set(
          withSpring(0, {
            damping: 28,
            stiffness: 380,
            mass: 0.75,
          }),
        );
      }
    })
    .onTouchesCancelled(() => {
      if (isAnimating.get()) return;
      dragX.set(
        withSpring(0, {
          damping: 28,
          stiffness: 380,
          mass: 0.75,
        }),
      );
    });

  const slotWidth =
    dockWidth > DOCK_PADDING * 2
      ? (dockWidth - DOCK_PADDING * 2) / TAB_COUNT
      : 0;

  const indicatorAnimatedStyle = useAnimatedStyle(() => {
    if (slotWidth <= 0 || dockWidth <= 0) return { opacity: 0 };
    const rawProgress = activeIdxSV.get() - dragX.get() / Math.max(width, 1);

    // 오늘(0) -> 가계부(4) 경계: 0에서 전체 하단바(tintSoft)로 넓어졌다가 가계부(4)로 모인다.
    if (rawProgress < 0) {
      const t = Math.min(1, Math.max(0, -rawProgress));
      const fullFactor = t <= 0.5 ? t * 2 : (1 - t) * 2;
      const inset = interpolate(
        fullFactor,
        [0, 1],
        [DOCK_PADDING, 0],
        Extrapolation.CLAMP,
      );
      const pillLeft =
        t <= 0.5
          ? interpolate(t, [0, 0.5], [DOCK_PADDING, 0], Extrapolation.CLAMP)
          : interpolate(
              t,
              [0.5, 1],
              [0, DOCK_PADDING + (TAB_COUNT - 1) * slotWidth],
              Extrapolation.CLAMP,
            );
      const pillWidth =
        t <= 0.5
          ? interpolate(
              t,
              [0, 0.5],
              [slotWidth, dockWidth],
              Extrapolation.CLAMP,
            )
          : interpolate(
              t,
              [0.5, 1],
              [dockWidth, slotWidth],
              Extrapolation.CLAMP,
            );

      return {
        opacity: 1,
        top: inset,
        bottom: inset,
        left: pillLeft,
        width: pillWidth,
      };
    }

    // 가계부(4) -> 오늘(0) 경계: 4에서 전체 하단바(tintSoft)로 넓어졌다가 오늘(0)로 모인다.
    if (rawProgress > TAB_COUNT - 1) {
      const t = Math.min(1, Math.max(0, rawProgress - (TAB_COUNT - 1)));
      const fullFactor = t <= 0.5 ? t * 2 : (1 - t) * 2;
      const inset = interpolate(
        fullFactor,
        [0, 1],
        [DOCK_PADDING, 0],
        Extrapolation.CLAMP,
      );
      const pillLeft =
        t <= 0.5
          ? interpolate(
              t,
              [0, 0.5],
              [DOCK_PADDING + (TAB_COUNT - 1) * slotWidth, 0],
              Extrapolation.CLAMP,
            )
          : interpolate(t, [0.5, 1], [0, DOCK_PADDING], Extrapolation.CLAMP);
      const pillWidth =
        t <= 0.5
          ? interpolate(
              t,
              [0, 0.5],
              [slotWidth, dockWidth],
              Extrapolation.CLAMP,
            )
          : interpolate(
              t,
              [0.5, 1],
              [dockWidth, slotWidth],
              Extrapolation.CLAMP,
            );

      return {
        opacity: 1,
        top: inset,
        bottom: inset,
        left: pillLeft,
        width: pillWidth,
      };
    }

    return {
      opacity: 1,
      top: DOCK_PADDING,
      bottom: DOCK_PADDING,
      left: DOCK_PADDING + rawProgress * slotWidth,
      width: slotWidth,
    };
  });

  const dockBottom =
    Math.max(insets.bottom, Spacing.two) + (Platform.OS === "ios" ? 2 : 6);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <GestureDetector gesture={panGesture}>
        <View style={styles.pager}>
          {TABS.map((tab, index) => {
            const ScreenComponent = tab.Component;
            const prevIdx = (activeIndex - 1 + TAB_COUNT) % TAB_COUNT;
            const nextIdx = (activeIndex + 1) % TAB_COUNT;
            const shouldMount =
              allTabsMounted ||
              index === activeIndex ||
              index === prevIdx ||
              index === nextIdx;
            return (
              <PagerPage
                key={tab.path}
                index={index}
                activeIdxSV={activeIdxSV}
                dragX={dragX}
                width={width}
              >
                {shouldMount ? (
                  <SafeBoundary name={`tab:${tab.path}`}>
                    <ScreenComponent />
                  </SafeBoundary>
                ) : null}
              </PagerPage>
            );
          })}
        </View>
      </GestureDetector>

      <View
        pointerEvents="box-none"
        style={[styles.dockWrapper, { bottom: dockBottom }]}
      >
        <View
          onLayout={(e) => setDockWidth(e.nativeEvent.layout.width)}
          style={[
            styles.dock,
            {
              backgroundColor: scheme === "dark" ? "#0F0F12" : colors.backgroundElement,
              borderColor: colors.border,
              shadowColor: scheme === "dark" ? "#000000" : "#111114",
            },
          ]}
        >
          <View pointerEvents="none" style={styles.pillClip}>
            <Animated.View
              style={[
                styles.activePill,
                {
                  backgroundColor: scheme === "dark" ? "#1E1E24" : colors.tintSoft,
                  borderColor: scheme === "dark" ? "#2C2C34" : "transparent",
                  borderWidth: scheme === "dark" ? 1 : 0,
                },
                indicatorAnimatedStyle,
              ]}
            />
          </View>

          {TABS.map((tab, index) => {
            const selected = index === activeIndex;
            const activeColor = scheme === "dark" ? "#FFFFFF" : colors.tint;
            return (
              <Pressable
                key={tab.path}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={tab.label}
                onPress={() => handleTabPress(index)}
                style={({ pressed }) => [
                  styles.tabItem,
                  pressed && styles.tabPressed,
                ]}
              >
                <SymbolView
                  name={{
                    ios: tab.sf,
                    android: tab.md as never,
                  }}
                  size={20}
                  tintColor={selected ? activeColor : colors.textSecondary}
                />
                <ThemedText
                  type="small"
                  style={[
                    styles.tabLabel,
                    { color: selected ? activeColor : colors.textSecondary },
                    selected && styles.tabLabelSelected,
                  ]}
                >
                  {tab.label}
                </ThemedText>
                {selected ? (
                  <View style={[styles.activeDot, { backgroundColor: colors.tint }]} />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function PagerPage({
  index,
  activeIdxSV,
  dragX,
  width,
  children,
}: {
  index: number;
  activeIdxSV: SharedValue<number>;
  dragX: SharedValue<number>;
  width: number;
  children: React.ReactNode;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const active = activeIdxSV.get();
    let delta = index - active;
    if (delta > 2) delta -= TAB_COUNT;
    if (delta < -2) delta += TAB_COUNT;
    return {
      transform: [{ translateX: delta * width + dragX.get() }],
    };
  });

  return (
    <Animated.View style={[styles.page, animatedStyle]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  pager: {
    flex: 1,
    overflow: "hidden",
  },
  page: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  dockWrapper: {
    position: "absolute",
    left: Spacing.three,
    right: Spacing.three,
    alignItems: "center",
  },
  dock: {
    width: "100%",
    maxWidth: 460,
    height: DOCK_HEIGHT,
    padding: DOCK_PADDING,
    borderRadius: Radius.full,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 20,
    elevation: 10,
  },
  pillClip: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: Radius.full,
    overflow: "hidden",
  },
  activePill: {
    position: "absolute",
    borderRadius: Radius.full,
  },
  tabItem: {
    flex: 1,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  tabPressed: {
    opacity: 0.7,
  },
  tabLabel: {
    fontSize: 11,
    lineHeight: 13,
  },
  tabLabelSelected: {
    fontWeight: "700",
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 999,
    marginTop: 1,
  },
});
