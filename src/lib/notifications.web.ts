import type { Reminder } from './reminders';

/**
 * 웹용 알림. 웹사이트에서는 예약 알림을 지원하지 않으므로 모두 "아무 일도 하지 않는" 함수다.
 * 휴대폰에서는 이 파일 대신 notifications.ts 가 쓰인다. 두 파일의 함수 이름과 모양은 같아야 한다.
 */

export const notificationsSupported = false;

export async function requestNotificationPermission(): Promise<boolean> {
  return false;
}

export async function hasNotificationPermission(): Promise<boolean> {
  return false;
}

export async function cancelAllReminders(): Promise<void> {}

export async function replaceReminders(_reminders: Reminder[]): Promise<number> {
  return 0;
}
