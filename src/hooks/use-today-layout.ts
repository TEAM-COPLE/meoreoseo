import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { useAuth } from '@/lib/auth';

export type TodaySectionId =
  | 'weather'
  | 'routines'
  | 'todos'
  | 'events'
  | 'study'
  | 'habits'
  | 'money';

export const DEFAULT_TODAY_ORDER: readonly TodaySectionId[] = [
  'weather',
  'routines',
  'todos',
  'events',
  'study',
  'habits',
  'money',
];

export const TODAY_SECTION_LABELS: Record<TodaySectionId, string> = {
  weather: '날씨',
  routines: '하루 루틴',
  todos: '할 일',
  events: '일정',
  study: '공부 타이머',
  habits: '습관',
  money: '이번 달 가계부',
};

type TodayLayoutState = {
  order: TodaySectionId[];
  hidden: TodaySectionId[];
  collapsed: TodaySectionId[];
};

const DEFAULT_STATE: TodayLayoutState = {
  order: [...DEFAULT_TODAY_ORDER],
  hidden: [],
  collapsed: [],
};

const KEY_PREFIX = 'meoreoseo:today-layout:';
const QUERY_KEY = ['today-layout'] as const;

function storageKey(userId: string | null) {
  return `${KEY_PREFIX}${userId ?? 'anon'}`;
}

function isSectionId(value: unknown): value is TodaySectionId {
  return (
    value === 'weather' ||
    value === 'routines' ||
    value === 'todos' ||
    value === 'events' ||
    value === 'study' ||
    value === 'habits' ||
    value === 'money'
  );
}

function normalizeState(raw: unknown): TodayLayoutState {
  if (!raw || typeof raw !== 'object') return DEFAULT_STATE;
  const obj = raw as Partial<TodayLayoutState>;
  const validOrder = Array.isArray(obj.order) ? obj.order.filter(isSectionId) : [];
  // 새로 생긴 상자(예: 하루 루틴)는 저장된 순서에 없으므로, 기본 순서에서의 자리에 끼워 넣는다.
  const mergedOrder = [...validOrder];
  DEFAULT_TODAY_ORDER.forEach((id, defaultIndex) => {
    if (!mergedOrder.includes(id)) {
      mergedOrder.splice(Math.min(defaultIndex, mergedOrder.length), 0, id);
    }
  });
  const hidden = Array.isArray(obj.hidden) ? obj.hidden.filter(isSectionId) : [];
  const collapsed = Array.isArray(obj.collapsed) ? obj.collapsed.filter(isSectionId) : [];
  return { order: mergedOrder, hidden, collapsed };
}

/**
 * 오늘 화면의 카드 순서·숨김·접힘 상태를 기기에 저장하는 훅.
 */
export function useTodayLayout() {
  const { userId } = useAuth();
  const client = useQueryClient();

  const query = useQuery({
    queryKey: [...QUERY_KEY, userId],
    enabled: userId !== null,
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async (): Promise<TodayLayoutState> => {
      if (!userId) return DEFAULT_STATE;
      try {
        const raw = await AsyncStorage.getItem(storageKey(userId));
        return raw ? normalizeState(JSON.parse(raw)) : DEFAULT_STATE;
      } catch {
        return DEFAULT_STATE;
      }
    },
  });

  const layout = query.data ?? DEFAULT_STATE;

  const update = useCallback(
    (updater: (prev: TodayLayoutState) => TodayLayoutState) => {
      const cacheKey = [...QUERY_KEY, userId];
      const current = client.getQueryData<TodayLayoutState>(cacheKey) ?? DEFAULT_STATE;
      const next = updater(current);
      client.setQueryData<TodayLayoutState>(cacheKey, next);
      AsyncStorage.setItem(storageKey(userId), JSON.stringify(next)).catch(() => {});
    },
    [client, userId],
  );

  const moveSection = useCallback(
    (id: TodaySectionId, direction: -1 | 1) => {
      update((prev) => {
        const idx = prev.order.indexOf(id);
        const nextIdx = idx + direction;
        if (idx < 0 || nextIdx < 0 || nextIdx >= prev.order.length) return prev;
        const nextOrder = [...prev.order];
        [nextOrder[idx], nextOrder[nextIdx]] = [nextOrder[nextIdx], nextOrder[idx]];
        return { ...prev, order: nextOrder };
      });
    },
    [update],
  );

  /** 끌어서 옮긴 결과처럼, 새 순서를 통째로 저장한다. */
  const setOrder = useCallback(
    (next: TodaySectionId[]) => {
      update((prev) => ({ ...prev, order: normalizeState({ ...prev, order: next }).order }));
    },
    [update],
  );

  const toggleHidden = useCallback(
    (id: TodaySectionId) => {
      update((prev) => ({
        ...prev,
        hidden: prev.hidden.includes(id)
          ? prev.hidden.filter((item) => item !== id)
          : [...prev.hidden, id],
      }));
    },
    [update],
  );

  const toggleCollapsed = useCallback(
    (id: TodaySectionId) => {
      update((prev) => ({
        ...prev,
        collapsed: prev.collapsed.includes(id)
          ? prev.collapsed.filter((item) => item !== id)
          : [...prev.collapsed, id],
      }));
    },
    [update],
  );

  const resetLayout = useCallback(() => {
    update(() => DEFAULT_STATE);
  }, [update]);

  return {
    order: layout.order,
    hidden: layout.hidden,
    collapsed: layout.collapsed,
    moveSection,
    setOrder,
    toggleHidden,
    toggleCollapsed,
    resetLayout,
  };
}
