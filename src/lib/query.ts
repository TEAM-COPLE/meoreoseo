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
    queries: { staleTime: 30_000, retry: 1 },
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
