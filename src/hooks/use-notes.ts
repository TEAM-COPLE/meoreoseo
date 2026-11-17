import { useQuery } from '@tanstack/react-query';

import { requireUserId, useAuth } from '@/lib/auth';
import type { Tables } from '@/lib/database.types';
import { check, useInvalidatingMutation } from '@/lib/query';
import { supabase } from '@/lib/supabase';

export type Note = Tables<'notes'>;

const KEY = ['notes'];

/** 내 메모 전체. 고정한 메모가 먼저, 그다음은 최근에 고친 순서다. */
export function useNotes() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  return useQuery({
    queryKey: [...KEY, userId],
    enabled: userId !== null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .order('pinned', { ascending: false })
        .order('updated_at', { ascending: false });
      check(error);
      return data ?? [];
    },
  });
}

/**
 * 메모 하나. 메모장을 열 때 쓴다.
 * 다른 기기에서 고친 내용을 덮어쓰지 않도록, 열 때마다 새로 받아온다(gcTime: 0).
 * 메모가 없으면 null 을 돌려준다.
 */
export function useNote(id: string | null) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  return useQuery({
    queryKey: ['note', userId, id],
    enabled: id !== null && userId !== null,
    gcTime: 0,
    staleTime: Infinity,
    queryFn: async () => {
      if (id === null) return null;
      const { data, error } = await supabase.from('notes').select('*').eq('id', id).maybeSingle();
      check(error);
      return data;
    },
  });
}

/** 고른 메모 여러 개를 한꺼번에 지운다. */
export function useDeleteNotes() {
  return useInvalidatingMutation(KEY, async (ids: string[]) => {
    if (ids.length === 0) return;
    requireUserId();
    const { error } = await supabase.from('notes').delete().in('id', ids);
    check(error);
  });
}
