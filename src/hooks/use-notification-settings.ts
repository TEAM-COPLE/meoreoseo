import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  loadNotificationSettings,
  NOTIFICATION_SETTINGS_STORAGE_KEY,
} from '@/lib/notification-settings';
import type { NotificationSettings } from '@/lib/reminders';

const KEY = ['notification-settings'];

/**
 * 이 휴대폰에 저장된 알림 설정.
 * 서버가 아니라 휴대폰 안(AsyncStorage)에 둔다. 알림은 휴대폰마다 따로 켜고 끄는 것이기 때문이다.
 */
export function useNotificationSettings() {
  return useQuery({
    queryKey: KEY,
    queryFn: loadNotificationSettings,
    // 휴대폰 안의 값이라 저절로 바뀌지 않는다. 다시 읽을 필요가 없다.
    staleTime: Infinity,
  });
}

/** 알림 설정을 저장하고, 이 설정을 보고 있는 모든 화면에 바로 반영한다. */
export function useSaveNotificationSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (settings: NotificationSettings) => {
      await AsyncStorage.setItem(NOTIFICATION_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
      return settings;
    },
    onSuccess: (settings) => client.setQueryData(KEY, settings),
  });
}
