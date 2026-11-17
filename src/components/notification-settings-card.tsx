import { useState } from 'react';
import { Linking, StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import {
  useNotificationSettings,
  useSaveNotificationSettings,
} from '@/hooks/use-notification-settings';
import { useTheme } from '@/hooks/use-theme';
import { notificationsSupported, requestNotificationPermission } from '@/lib/notifications';
import {
  EVENT_LEAD_MINUTES,
  HABIT_HOUR,
  MORNING_HOUR,
  type NotificationSettings,
} from '@/lib/reminders';

/** 9 → '오전 9시', 21 → '오후 9시' */
function hourLabel(hour: number): string {
  if (hour === 0) return '오전 12시';
  if (hour === 12) return '오후 12시';
  return hour < 12 ? `오전 ${hour}시` : `오후 ${hour - 12}시`;
}

/** 계정 화면에 놓이는 알림 설정 상자. 실제 예약은 notification-sync.tsx 가 한다. */
export function NotificationSettingsCard() {
  const settings = useNotificationSettings().data;
  const save = useSaveNotificationSettings();
  // 알림을 켜려 했지만 휴대폰에서 권한을 거절한 경우 true
  const [denied, setDenied] = useState(false);

  if (!notificationsSupported) {
    return (
      <Card>
        <ThemedText type="default" style={styles.title}>
          알림
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          알림은 휴대폰 앱에서만 받을 수 있습니다.
        </ThemedText>
      </Card>
    );
  }

  if (!settings) return null;

  function update(changes: Partial<NotificationSettings>) {
    if (settings) save.mutate({ ...settings, ...changes });
  }

  async function setEnabled(enabled: boolean) {
    if (!enabled) {
      setDenied(false);
      update({ enabled: false });
      return;
    }
    // 켤 때는 먼저 휴대폰에 알림 권한을 물어본다. 거절하면 켜지 않는다.
    const allowed = await requestNotificationPermission().catch(() => false);
    setDenied(!allowed);
    if (allowed) update({ enabled: true });
  }

  return (
    <Card>
      <ThemedText type="default" style={styles.title}>
        알림
      </ThemedText>

      <Row
        label="알림 받기"
        description="할 일, 일정, 습관을 정해진 시각에 알려줍니다."
        value={settings.enabled}
        onChange={setEnabled}
      />

      {denied ? (
        <View style={styles.denied}>
          <ThemedText type="small" themeColor="danger">
            휴대폰에서 알림이 꺼져 있습니다. 설정에서 알림을 허용한 뒤 다시 켜 주세요.
          </ThemedText>
          <Button
            label="휴대폰 설정 열기"
            variant="secondary"
            size="small"
            onPress={() => Linking.openSettings()}
          />
        </View>
      ) : null}

      {settings.enabled ? (
        <>
          <Row
            label="할 일"
            description={`마감일 ${hourLabel(MORNING_HOUR)}`}
            value={settings.todos}
            onChange={(todos) => update({ todos })}
          />
          <Row
            label="일정"
            description={`시작 ${EVENT_LEAD_MINUTES}분 전 (하루 종일 일정은 ${hourLabel(MORNING_HOUR)})`}
            value={settings.events}
            onChange={(events) => update({ events })}
          />
          <Row
            label="습관"
            description={`매일 ${hourLabel(HABIT_HOUR)} (그날 다 체크했으면 알리지 않음)`}
            value={settings.habits}
            onChange={(habits) => update({ habits })}
          />
          <ThemedText type="small" themeColor="textSecondary">
            휴대폰이 절전 중이면 알림이 몇 분 늦게 올 수 있습니다.
          </ThemedText>
        </>
      ) : null}
    </Card>
  );
}

function Row({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const theme = useTheme();

  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <ThemedText type="default">{label}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {description}
        </ThemedText>
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: theme.tint, false: theme.border }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontWeight: 700,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  rowText: {
    flex: 1,
    gap: Spacing.half,
  },
  denied: {
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
});
