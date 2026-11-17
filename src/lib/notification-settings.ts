import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_SETTINGS, type NotificationSettings } from './reminders';

/** 휴대폰 안에 알림 설정을 저장할 때 쓰는 이름 */
export const NOTIFICATION_SETTINGS_STORAGE_KEY = 'notification-settings';

/**
 * 이 휴대폰에 저장된 알림 설정을 읽는다. 없거나 읽지 못하면 기본값을 쓴다.
 * 화면에서는 hooks/use-notification-settings.ts 로 읽고, 화면 밖(오류 알림 등)에서는 이 함수를 쓴다.
 */
export async function loadNotificationSettings(): Promise<NotificationSettings> {
  try {
    const saved = await AsyncStorage.getItem(NOTIFICATION_SETTINGS_STORAGE_KEY);
    // 나중에 설정 항목이 늘어도 예전에 저장한 값과 합쳐지도록 기본값 위에 덮어쓴다.
    return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}
