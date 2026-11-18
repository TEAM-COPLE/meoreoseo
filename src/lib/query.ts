import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  MutationCache,
  QueryCache,
  QueryClient,
  useMutation,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';

import { reportError } from './error-report';

/** 데이터 요청의 첫 번째 이름(예: 'todos', 'weather')을 오류가 난 곳으로 쓴다. */
function sourceOf(key: QueryKey | undefined): string {
  const first = key?.[0];
  return typeof first === 'string' ? first : 'unknown';
}

/** 서버에서 받아온 데이터를 기억해 두는 저장소(캐시). */
export const queryClient = new QueryClient({
  defaultOptions: {
    // 개인 데이터 위주이므로 탭 이동 시 2분간 캐시를 재사용해 불필요한 재요청을 줄인다.
    queries: { staleTime: 2 * 60 * 1000, gcTime: 10 * 60 * 1000, retry: 1 },
  },
  // 불러오기·저장에 실패하면 (재시도까지 실패한 뒤) 오류 알림을 띄우고 기록한다.
  queryCache: new QueryCache({
    onError: (error, query) => reportError(sourceOf(query.queryKey), error),
  }),
  mutationCache: new MutationCache({
    onError: (error, _vars, _context, mutation) =>
      reportError(sourceOf(mutation.options.mutationKey), error),
  }),
});

const CACHE_PREFIX = 'meoreoseo:query-cache:';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PERSISTABLE_ROOTS = new Set([
  'todos',
  'events',
  'habits',
  'habit-logs',
  'transactions',
  'notes',
  'note',
  'weather-city',
  'weather',
]);

type SerializedEntry = {
  queryKey: QueryKey;
  data: unknown;
  dataUpdatedAt: number;
};

let activeCacheUserId: string | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let unsubscribeCache: (() => void) | null = null;
let warmCacheLoaded = false;

function serializeData(key: QueryKey, data: unknown): unknown {
  if (key[0] === 'habit-logs' && data instanceof Map) {
    return {
      __type: 'habitLogsMap',
      entries: [...data.entries()].map(([k, set]) => [k, [...(set as Set<string>)]]),
    };
  }
  return data;
}

function deserializeData(data: unknown): unknown {
  if (
    data &&
    typeof data === 'object' &&
    '__type' in data &&
    'entries' in data &&
    (data as { __type?: unknown }).__type === 'habitLogsMap' &&
    Array.isArray((data as { entries?: unknown }).entries)
  ) {
    const entries = (data as unknown as { entries: [string, string[]][] }).entries;
    return new Map(entries.map(([k, list]) => [k, new Set(list)]));
  }
  return data;
}

function schedulePersist(userId: string) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    if (activeCacheUserId !== userId) return;
    const now = Date.now();
    const entries: SerializedEntry[] = [];
    for (const query of queryClient.getQueryCache().getAll()) {
      if (query.state.status !== 'success' || query.state.data === undefined) continue;
      if (!PERSISTABLE_ROOTS.has(sourceOf(query.queryKey))) continue;
      if (now - query.state.dataUpdatedAt > CACHE_TTL_MS) continue;
      entries.push({
        queryKey: query.queryKey,
        data: serializeData(query.queryKey, query.state.data),
        dataUpdatedAt: query.state.dataUpdatedAt,
      });
    }
    AsyncStorage.setItem(`${CACHE_PREFIX}${userId}`, JSON.stringify(entries)).catch(() => {});
  }, 800);
}

/**
 * 기기 저장소(AsyncStorage)에 보관된 이전 데이터를 React Query 캐시에 복원한다.
 * 재실행 시 이전 화면을 즉시 보여주고, 백그라운드에서 최신 DB로 자동 갱신(stale-while-revalidate)한다.
 */
export async function startQueryPersistence(userId: string): Promise<void> {
  if (activeCacheUserId === userId) return;
  stopQueryPersistence();
  activeCacheUserId = userId;
  warmCacheLoaded = false;

  try {
    const raw = await AsyncStorage.getItem(`${CACHE_PREFIX}${userId}`);
    if (activeCacheUserId !== userId) return;
    if (raw) {
      const entries = JSON.parse(raw) as SerializedEntry[];
      const now = Date.now();
      let restored = 0;
      for (const entry of entries) {
        if (now - entry.dataUpdatedAt > CACHE_TTL_MS) continue;
        // updatedAt 을 0 으로 두어 화면에는 즉시 표시하되 백그라운드 재요청(stale)이 바로 돌게 한다.
        queryClient.setQueryData(entry.queryKey, deserializeData(entry.data), {
          updatedAt: 0,
        });
        restored += 1;
      }
      warmCacheLoaded = restored > 0;
    }
  } catch {
    // 저장된 캐시 파싱에 실패해도 앱 동작에는 영향이 없도록 무시한다.
  }

  unsubscribeCache = queryClient.getQueryCache().subscribe((event) => {
    if (event.type === 'updated' || event.type === 'removed') {
      schedulePersist(userId);
    }
  });
}

export function stopQueryPersistence() {
  activeCacheUserId = null;
  warmCacheLoaded = false;
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (unsubscribeCache) {
    unsubscribeCache();
    unsubscribeCache = null;
  }
}

export function hasWarmQueryCache(): boolean {
  return warmCacheLoaded;
}

/** Supabase 가 돌려준 오류가 있으면 예외로 바꾼다. */
export function check(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

/**
 * 데이터를 바꾸는 요청(추가·수정·삭제)을 만든다.
 * 성공하면 `key` 로 시작하는 목록을 서버에서 다시 받아와 화면을 새로 고친다.
 */
export function useInvalidatingMutation<TVars>(
  key: QueryKey,
  mutationFn: (vars: TVars) => Promise<void>,
) {
  const client = useQueryClient();
  return useMutation({
    // 저장에 실패했을 때 오류 알림에 "어디서" 났는지 보여주려고 이름을 붙인다.
    mutationKey: key,
    mutationFn,
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });
}
