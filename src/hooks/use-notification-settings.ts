import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { DEFAULT_SETTINGS, type NotificationSettings } from '@/lib/reminders';

const KEY = ['notification-settings'];

/** 휴대폰 안에 설정을 저장할 때 쓰는 이름 */
const STORAGE_KEY = 'notification-settings';

async function loadSettings(): Promise<NotificationSettings> {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    // 나중에 설정 항목이 늘어도 예전에 저장한 값과 합쳐지도록 기본값 위에 덮어쓴다.
    return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * 이 휴대폰에 저장된 알림 설정.
 * 서버가 아니라 휴대폰 안(AsyncStorage)에 둔다. 알림은 휴대폰마다 따로 켜고 끄는 것이기 때문이다.
 */
export function useNotificationSettings() {
  return useQuery({
    queryKey: KEY,
    queryFn: loadSettings,
    // 휴대폰 안의 값이라 저절로 바뀌지 않는다. 다시 읽을 필요가 없다.
    staleTime: Infinity,
  });
}

/** 알림 설정을 저장하고, 이 설정을 보고 있는 모든 화면에 바로 반영한다. */
export function useSaveNotificationSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (settings: NotificationSettings) => {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      return settings;
    },
    onSuccess: (settings) => client.setQueryData(KEY, settings),
  });
}
