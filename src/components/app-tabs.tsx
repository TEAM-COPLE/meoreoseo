import { NativeTabs } from 'expo-router/native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

/** 휴대폰용 아래쪽 탭 막대. name 은 src/app/(tabs) 안의 파일 이름과 같아야 한다. */
export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundSelected}
      labelStyle={{ selected: { color: colors.text } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>할 일</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="checklist" md="checklist" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="calendar">
        <NativeTabs.Trigger.Label>일정</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="calendar" md="calendar_month" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="habits">
        <NativeTabs.Trigger.Label>습관</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="repeat" md="repeat" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="notes">
        <NativeTabs.Trigger.Label>메모</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="note.text" md="sticky_note_2" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="money">
        <NativeTabs.Trigger.Label>가계부</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="wonsign.circle" md="account_balance_wallet" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
