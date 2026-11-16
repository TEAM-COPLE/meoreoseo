import { QueryClient, useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';

/** 서버에서 받아온 데이터를 기억해 두는 저장소(캐시). */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
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
    mutationFn,
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });
}
