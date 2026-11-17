import {
  TabList,
  TabSlot,
  TabTrigger,
  Tabs,
  type TabListProps,
  type TabTriggerSlotProps,
} from 'expo-router/ui';
import { Pressable, StyleSheet, View, type PressableProps } from 'react-native';

import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from './themed-text';

/** 웹용 위쪽 메뉴. 휴대폰 탭 막대와 같은 다섯 화면으로 이동한다. */
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

  return (
    <Pressable
      // TabTrigger 가 넘겨주는 속성(누르면 이동 등)을 그대로 버튼에 전달한다.
      {...(props as PressableProps)}
      style={({ pressed }) => [
        styles.tabButton,
        { backgroundColor: isFocused ? theme.backgroundSelected : 'transparent' },
        pressed && styles.pressed,
      ]}>
      <ThemedText
        type={isFocused ? 'smallBold' : 'small'}
        themeColor={isFocused ? 'text' : 'textSecondary'}>
        {children}
      </ThemedText>
    </Pressable>
  );
}

function TabBar(props: TabListProps) {
  const theme = useTheme();

  return (
    <View
      {...props}
      style={[styles.bar, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
      <View style={styles.barInner}>
        <ThemedText type="default" style={styles.brand}>
          멀어서
        </ThemedText>
        <View style={styles.tabs}>{props.children}</View>
      </View>
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
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  barInner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: Spacing.three,
    rowGap: Spacing.one,
  },
  brand: {
    fontWeight: 700,
    marginRight: 'auto',
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
