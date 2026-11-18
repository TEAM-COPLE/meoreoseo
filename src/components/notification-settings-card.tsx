import { useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { Radius, Spacing } from '@/constants/theme';
import {
  useNotificationSettings,
  useSaveNotificationSettings,
} from '@/hooks/use-notification-settings';
import { useTheme } from '@/hooks/use-theme';
import { notificationsSupported, requestNotificationPermission } from '@/lib/notifications';
import { type NotificationSettings } from '@/lib/reminders';

type EditingTarget = 'briefing' | 'todos' | 'events' | 'habits' | null;

const MINUTE_OPTIONS = [0, 10, 15, 20, 30, 40, 45, 50] as const;
const LEAD_OPTIONS = [
  { value: 0, label: '정각' },
  { value: 5, label: '5분 전' },
  { value: 10, label: '10분 전' },
  { value: 15, label: '15분 전' },
  { value: 30, label: '30분 전' },
  { value: 60, label: '1시간 전' },
] as const;

/** (7, 30) → '오전 7:30', (21, 0) → '오후 9:00' */
function timeLabel(hour: number, minute: number): string {
  const period = hour < 12 ? '오전' : '오후';
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const mm = String(minute).padStart(2, '0');
  return `${period} ${h12}:${mm}`;
}

function leadLabel(minutes: number): string {
  if (minutes === 0) return '시작 정각';
  if (minutes === 60) return '시작 1시간 전';
  return `시작 ${minutes}분 전`;
}

/** 계정 화면에 놓이는 알림 설정 상자. 실제 예약은 notification-sync.tsx 가 한다. */
export function NotificationSettingsCard() {
  const settings = useNotificationSettings().data;
  const save = useSaveNotificationSettings();
  // 알림을 켜려 했지만 휴대폰에서 권한을 거절한 경우 true
  const [denied, setDenied] = useState(false);
  const [editing, setEditing] = useState<EditingTarget>(null);

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
        description="아침 브리핑, 할 일, 일정, 습관을 원하는 시각에 알려줍니다."
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
            label="아침 브리핑"
            description={`매일 ${timeLabel(settings.briefingHour, settings.briefingMinute)} 날씨·할 일·일정을 한 번에 요약`}
            value={settings.briefing}
            onChange={(briefing) => update({ briefing })}
            timeText={timeLabel(settings.briefingHour, settings.briefingMinute)}
            onEditTime={() => setEditing('briefing')}
          />
          <Row
            label="할 일"
            description={`마감일 ${timeLabel(settings.todoHour, settings.todoMinute)}`}
            value={settings.todos}
            onChange={(todos) => update({ todos })}
            timeText={timeLabel(settings.todoHour, settings.todoMinute)}
            onEditTime={() => setEditing('todos')}
          />
          <Row
            label="일정"
            description={`${leadLabel(settings.eventLeadMinutes)} (하루 종일 일정은 ${timeLabel(settings.allDayEventHour, settings.allDayEventMinute)})`}
            value={settings.events}
            onChange={(events) => update({ events })}
            timeText={`${settings.eventLeadMinutes === 0 ? '정각' : `${settings.eventLeadMinutes}분 전`} · 종일 ${timeLabel(settings.allDayEventHour, settings.allDayEventMinute)}`}
            onEditTime={() => setEditing('events')}
          />
          <Row
            label="습관"
            description={`매일 ${timeLabel(settings.habitHour, settings.habitMinute)} (그날 다 체크했으면 알리지 않음)`}
            value={settings.habits}
            onChange={(habits) => update({ habits })}
            timeText={timeLabel(settings.habitHour, settings.habitMinute)}
            onEditTime={() => setEditing('habits')}
          />
          <ThemedText type="small" themeColor="textSecondary">
            휴대폰이 절전 중이면 알림이 몇 분 늦게 올 수 있습니다.
          </ThemedText>
        </>
      ) : null}

      {/* 오류 알림은 위의 "알림 받기"와 따로 켜고 끈다. 끄면 알림만 안 뜨고 기록은 계속 남는다. */}
      <Row
        label="오류 알림"
        description="앱에서 오류가 나면 바로 알려줍니다. 같은 오류는 5분에 한 번만 알립니다."
        value={settings.errors}
        onChange={(errors) => update({ errors })}
      />

      {editing ? (
        <NotificationTimeModal
          target={editing}
          settings={settings}
          onSave={(changes) => {
            update(changes);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Card>
  );
}

function Row({
  label,
  description,
  value,
  onChange,
  timeText,
  onEditTime,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
  timeText?: string;
  onEditTime?: () => void;
}) {
  const theme = useTheme();

  return (
    <View style={styles.rowWrap}>
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
      {value && timeText && onEditTime ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} 시간 변경`}
          onPress={onEditTime}
          style={({ pressed }) => [
            styles.timeChip,
            {
              backgroundColor: theme.tintSoft,
              borderColor: theme.border,
              opacity: pressed ? 0.75 : 1,
            },
          ]}>
          <ThemedText type="smallBold" themeColor="tint">
            {timeText} · 시간 변경 ›
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const TARGET_TITLES: Record<Exclude<EditingTarget, null>, string> = {
  briefing: '아침 브리핑 알림 시각',
  todos: '할 일 알림 시각',
  events: '일정 알림 설정',
  habits: '습관 알림 시각',
};

function NotificationTimeModal({
  target,
  settings,
  onSave,
  onClose,
}: {
  target: Exclude<EditingTarget, null>;
  settings: NotificationSettings;
  onSave: (changes: Partial<NotificationSettings>) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const initialHour =
    target === 'briefing'
      ? settings.briefingHour
      : target === 'todos'
        ? settings.todoHour
        : target === 'habits'
          ? settings.habitHour
          : settings.allDayEventHour;
  const initialMinute =
    target === 'briefing'
      ? settings.briefingMinute
      : target === 'todos'
        ? settings.todoMinute
        : target === 'habits'
          ? settings.habitMinute
          : settings.allDayEventMinute;

  const [hour, setHour] = useState(initialHour);
  const [minute, setMinute] = useState(initialMinute);
  const [leadMinutes, setLeadMinutes] = useState(settings.eventLeadMinutes);

  function stepHour(delta: number) {
    setHour((prev) => (prev + delta + 24) % 24);
  }

  function handleSave() {
    if (target === 'briefing') {
      onSave({ briefingHour: hour, briefingMinute: minute });
    } else if (target === 'todos') {
      onSave({ todoHour: hour, todoMinute: minute });
    } else if (target === 'habits') {
      onSave({ habitHour: hour, habitMinute: minute });
    } else {
      onSave({
        eventLeadMinutes: leadMinutes,
        allDayEventHour: hour,
        allDayEventMinute: minute,
      });
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={styles.modalBackdrop}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.modalCard,
            { backgroundColor: theme.backgroundElement, borderColor: theme.border },
          ]}>
          <ThemedText type="default" style={styles.modalTitle}>
            {TARGET_TITLES[target]}
          </ThemedText>

          {target === 'events' ? (
            <Segmented
              label="시간 지정 일정 알림"
              options={LEAD_OPTIONS}
              value={leadMinutes}
              onChange={setLeadMinutes}
            />
          ) : null}

          <View style={styles.pickerSection}>
            <ThemedText type="small" themeColor="textSecondary">
              {target === 'events' ? '하루 종일 일정 알림 시각' : '알림 시각'}
            </ThemedText>
            <View
              style={[
                styles.hourStepper,
                { backgroundColor: theme.background, borderColor: theme.border },
              ]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="1시간 이전"
                onPress={() => stepHour(-1)}
                style={[styles.stepBtn, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText type="default">-</ThemedText>
              </Pressable>
              <ThemedText type="default" style={styles.timeReadout}>
                {timeLabel(hour, minute)}
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="1시간 이후"
                onPress={() => stepHour(1)}
                style={[styles.stepBtn, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText type="default">+</ThemedText>
              </Pressable>
            </View>
          </View>

          <View style={styles.pickerSection}>
            <ThemedText type="small" themeColor="textSecondary">
              분 선택
            </ThemedText>
            <View style={styles.minuteGrid}>
              {MINUTE_OPTIONS.map((m) => {
                const selected = minute === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => setMinute(m)}
                    style={[
                      styles.minuteChip,
                      {
                        backgroundColor: selected ? theme.tint : theme.background,
                        borderColor: selected ? theme.tint : theme.border,
                      },
                    ]}>
                    <ThemedText
                      type="small"
                      style={{ color: selected ? theme.onTint : theme.text }}>
                      {String(m).padStart(2, '0')}분
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.modalActions}>
            <Button label="취소" variant="secondary" size="small" onPress={onClose} />
            <Button label="저장" size="small" onPress={handleSave} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  title: {
    fontWeight: 700,
  },
  rowWrap: {
    gap: Spacing.two,
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
  timeChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three - 4,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  denied: {
    alignItems: 'flex-start',
    gap: Spacing.two,
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
    maxWidth: 380,
    borderRadius: Radius.large,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  modalTitle: {
    fontWeight: 700,
    fontSize: 18,
  },
  pickerSection: {
    gap: Spacing.two,
  },
  hourStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: Radius.medium,
    borderWidth: 1,
    padding: Spacing.two,
  },
  stepBtn: {
    width: 38,
    height: 38,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeReadout: {
    fontWeight: 700,
    fontSize: 17,
  },
  minuteGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  minuteChip: {
    paddingHorizontal: Spacing.three - 4,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
  },
});
