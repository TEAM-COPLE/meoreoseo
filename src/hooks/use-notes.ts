import { useQuery } from '@tanstack/react-query';

import { isDevMode, requireUserId, useAuth } from '@/lib/auth';
import type { Tables } from '@/lib/database.types';
import { localDeleteNotes, localGetNote, localListNotes } from '@/lib/local-db';
import { check, useInvalidatingMutation } from '@/lib/query';
import { supabase } from '@/lib/supabase';

export type Note = Tables<'notes'>;

const KEY = ['notes'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 내 메모 전체. 고정한 메모가 먼저, 그다음은 최근에 고친 순서다. */
export function useNotes() {
  const { userId } = useAuth();

  return useQuery({
    queryKey: [...KEY, userId],
    enabled: userId !== null,
    queryFn: async () => {
      if (isDevMode()) return localListNotes();
      const uid = requireUserId();
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('user_id', uid)
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
  const { userId } = useAuth();

  return useQuery({
    queryKey: ['note', userId, id],
    enabled: id !== null && userId !== null,
    gcTime: 0,
    staleTime: Infinity,
    queryFn: async () => {
      if (id === null) return null;
      if (isDevMode()) return localGetNote(id);
      if (!UUID_RE.test(id)) return null;
      const uid = requireUserId();
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('id', id)
        .eq('user_id', uid)
        .maybeSingle();
      check(error);
      return data;
    },
  });
}

/** 고른 메모 여러 개를 한꺼번에 지운다. */
export function useDeleteNotes() {
  return useInvalidatingMutation(KEY, async (ids: string[]) => {
    if (ids.length === 0) return;
    const uid = requireUserId();
    if (isDevMode()) {
      await localDeleteNotes(ids);
      return;
    }
    const { error } = await supabase.from('notes').delete().in('id', ids).eq('user_id', uid);
    check(error);
  });
}
