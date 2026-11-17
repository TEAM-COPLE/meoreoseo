import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';

import type { Reminder } from './reminders';

/**
 * 휴대폰 알림 (Android).
 *
 * 서버에서 보내는 알림이 아니라, 휴대폰이 스스로 정해진 시각에 띄우는 "예약 알림"이다.
 * 그래서 인터넷이 없어도 울리고, 앱을 한 번은 열어야 새 할 일·일정이 예약에 반영된다.
 *
 * 웹에서는 이 파일 대신 notifications.web.ts 가 쓰인다(아무 일도 하지 않는다).
 */

/** 이 기기에서 알림을 쓸 수 있는지. 웹에서는 false 다. */
export const notificationsSupported = true;

/** Android 는 알림을 "채널"(종류)로 묶는다. 사용자가 휴대폰 설정에서 채널별로 끌 수 있다. */
const CHANNEL_ID = 'reminders';

// 앱을 보고 있는 중에 알림 시각이 되어도 알림을 띄운다(기본값은 띄우지 않음).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * 알림 권한을 요청한다. 이미 허용했다면 묻지 않는다.
 * @returns 허용되었으면 true
 */
export async function requestNotificationPermission(): Promise<boolean> {
  // Android 13 이상은 채널이 먼저 있어야 권한을 묻는 창이 뜬다.
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: '할 일·일정·습관 알림',
    importance: AndroidImportance.HIGH,
  });

  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

/** 지금 알림 권한이 허용되어 있는지 확인만 한다(묻지 않는다). */
export async function hasNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  return current.granted;
}

/** 예약해 둔 알림을 모두 지운다. 알림을 끄거나 로그아웃할 때 쓴다. */
export async function cancelAllReminders(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * 예약 알림을 `reminders` 와 똑같이 맞춘다.
 * 바뀐 것만 찾아 고치는 대신, 전부 지우고 다시 예약한다(개수가 적어서 이 편이 단순하고 안전하다).
 * @returns 예약한 알림의 개수
 */
export async function replaceReminders(reminders: Reminder[]): Promise<number> {
  await Notifications.cancelAllScheduledNotificationsAsync();

  for (const reminder of reminders) {
    await Notifications.scheduleNotificationAsync({
      content: { title: reminder.title, body: reminder.body },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: reminder.at,
        channelId: CHANNEL_ID,
      },
    });
  }
  return reminders.length;
}
