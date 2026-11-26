import { Image } from 'expo-image';
import { Link, usePathname } from 'expo-router';
import {
  TabList,
  TabSlot,
  TabTrigger,
  Tabs,
  type TabListProps,
  type TabTriggerSlotProps,
} from 'expo-router/ui';
import { Pressable, StyleSheet, useWindowDimensions, View, type PressableProps } from 'react-native';

import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useColorScheme, useTheme } from '@/hooks/use-theme';

import { ThemedText } from './themed-text';

/** 웹용 위쪽 메뉴. 휴대폰 탭 막대와 같은 여섯 화면으로 이동한다. */
export default function AppTabs() {
  return (
    <Tabs style={styles.root}>
      <TabList asChild>
        <TabBar>
          <TabTrigger name="today" href="/" asChild>
            <TabButton>오늘</TabButton>
          </TabTrigger>
          <TabTrigger name="todos" href="/todos" asChild>
            <TabButton>할 일</TabButton>
          </TabTrigger>
          <TabTrigger name="calendar" href="/calendar" asChild>
            <TabButton>일정</TabButton>
          </TabTrigger>
          <TabTrigger name="study" href="/study" asChild>
            <TabButton>공부</TabButton>
          </TabTrigger>
          <TabTrigger name="notes" href="/notes" asChild>
            <TabButton>메모</TabButton>
          </TabTrigger>
          <TabTrigger name="money" href="/money" asChild>
            <TabButton>가계부</TabButton>
          </TabTrigger>
        </TabBar>
      </TabList>
      <TabSlot style={styles.slot} />
    </Tabs>
  );
}

function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  return (
    <Pressable
      // TabTrigger 가 넘겨주는 속성(누르면 이동 등)을 그대로 버튼에 전달한다.
      {...(props as PressableProps)}
      style={({ pressed }) => [
        styles.tabButton,
        {
          backgroundColor: isFocused ? (isDark ? '#1E1E24' : theme.tintSoft) : 'transparent',
          borderColor: isFocused && isDark ? '#2C2C34' : 'transparent',
          borderWidth: 1,
        },
        pressed && styles.pressed,
      ]}>
      <ThemedText
        type={isFocused ? 'smallBold' : 'small'}
        themeColor={isFocused ? (isDark ? 'text' : 'tint') : 'textSecondary'}>
        {children}
      </ThemedText>
    </Pressable>
  );
}

function TabBar(props: TabListProps) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const barMaxWidth = pathname === '/' && width >= 960 ? 1080 : MaxContentWidth;

  return (
    <View
      {...props}
      style={[
        styles.bar,
        {
          backgroundColor: scheme === 'dark' ? '#0A0A0C' : theme.backgroundElement,
          borderBottomColor: theme.border,
        },
      ]}>
      <View style={[styles.barInner, { maxWidth: barMaxWidth }]}>
        <HomeLogo />
        <View style={styles.tabs}>{props.children}</View>
      </View>
    </View>
  );
}

/** 멀어서 로고. 누르면 첫 화면(오늘)으로 간다. */
function HomeLogo() {
  // Link 가 버튼의 모양(style)을 덮어쓰지 않도록, 자리 잡기는 바깥 View 가 맡는다.
  return (
    <View style={styles.brand}>
      <Link href="/" asChild>
        <Pressable accessibilityRole="link" accessibilityLabel="멀어서 홈으로" style={styles.logoButton}>
          <Image
            source={require('@/assets/images/logo-mark.png')}
            style={styles.logo}
            contentFit="contain"
          />
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  slot: {
    flex: 1,
  },
  bar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  barInner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.three,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: Spacing.three,
    rowGap: Spacing.one,
  },
  // 로고 버튼은 왼쪽 끝, 메뉴는 오른쪽 끝에 둔다.
  brand: {
    marginRight: 'auto',
  },
  logoButton: {
    borderRadius: Radius.small,
    overflow: 'hidden',
  },
  logo: {
    width: 36,
    height: 36,
  },
  tabs: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  tabButton: {
    minHeight: 36,
    paddingHorizontal: Spacing.three - 4,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
