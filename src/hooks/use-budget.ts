import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { useAuth } from '@/lib/auth';

const KEY_PREFIX = 'meoreoseo:monthly-budget:';
const QUERY_KEY = ['monthly-budget'] as const;

function storageKey(userId: string | null) {
  return `${KEY_PREFIX}${userId ?? 'anon'}`;
}

/**
 * 이번 달 목표 예산을 기기에 저장하고 불러오는 훅.
 * 설정하지 않았으면 null 을 돌려준다.
 * React Query 캐시를 공유해 가계부 탭에서 예산을 바꾸면 오늘 화면과 위젯에도 즉시 반영된다.
 */
export function useMonthlyBudget() {
  const { userId } = useAuth();
  const client = useQueryClient();

  const query = useQuery({
    queryKey: [...QUERY_KEY, userId],
    enabled: userId !== null,
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async (): Promise<number | null> => {
      if (!userId) return null;
      try {
        const raw = await AsyncStorage.getItem(storageKey(userId));
        if (!raw) return null;
        const parsed = Number(raw);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      } catch {
        return null;
      }
    },
  });

  const setBudget = useCallback(
    (next: number | null) => {
      const key = storageKey(userId);
      const cacheKey = [...QUERY_KEY, userId];
      if (next === null || !Number.isFinite(next) || next <= 0) {
        client.setQueryData<number | null>(cacheKey, null);
        AsyncStorage.removeItem(key).catch(() => {});
        return;
      }
      const rounded = Math.round(next);
      client.setQueryData<number | null>(cacheKey, rounded);
      AsyncStorage.setItem(key, String(rounded)).catch(() => {});
    },
    [client, userId],
  );

  return { budget: query.data ?? null, setBudget };
}
