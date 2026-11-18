import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { useColorScheme } from '@/hooks/use-theme';
import { isDevMode, requireUserId, useAuth } from '@/lib/auth';
import type { Tables } from '@/lib/database.types';
import { localDeleteTag, localListTags, localSaveTag } from '@/lib/local-db';
import { check } from '@/lib/query';
import { supabase } from '@/lib/supabase';
import { MAX_TAG_NAME, tagColorValue, type TagColor } from '@/lib/tags';

export type Tag = Tables<'tags'>;

export type TagInput = {
  /** 있으면 수정, 없으면 새로 추가 */
  id?: string;
  name: string;
  color: TagColor;
};

const KEY = ['tags'];

/** 내 태그 전체 (만든 순서대로) */
export function useTags() {
  const { userId } = useAuth();

  return useQuery({
    queryKey: [...KEY, userId],
    enabled: userId !== null,
    queryFn: async () => {
      if (isDevMode()) return localListTags();
      const { data, error } = await supabase
        .from('tags')
        .select('*')
        .order('created_at', { ascending: true });
      check(error);
      return data ?? [];
    },
  });
}

/** 태그 id 로 태그를 바로 찾을 수 있는 표 */
export function useTagMap(): ReadonlyMap<string, Tag> {
  const tags = useTags();
  return useMemo(() => new Map((tags.data ?? []).map((tag) => [tag.id, tag])), [tags.data]);
}

/**
 * 할 일·일정에 붙은 태그의 실제 색을 돌려주는 함수를 만든다.
 * 태그가 없거나 지워진 태그면 null.
 */
export function useTagColorOf(): (tagId: string | null | undefined) => string | null {
  const tagMap = useTagMap();
  const scheme = useColorScheme();
  return useCallback(
    (tagId: string | null | undefined) => {
      const tag = tagId ? tagMap.get(tagId) : undefined;
      return tag ? tagColorValue(tag.color, scheme) : null;
    },
    [tagMap, scheme],
  );
}

/** 태그를 추가하거나 고친다. 새로 만든(또는 고친) 태그를 돌려준다. */
export function useSaveTag() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: KEY,
    mutationFn: async ({ id, name, color }: TagInput): Promise<Tag> => {
      requireUserId();
      const trimmed = name.trim();
      if (!trimmed) throw new Error('태그 이름을 입력해 주세요.');
      if (trimmed.length > MAX_TAG_NAME) throw new Error(`태그 이름은 ${MAX_TAG_NAME}자까지 쓸 수 있어요.`);
      const row = { name: trimmed, color };
      if (isDevMode()) {
        return localSaveTag(id, trimmed, color);
      }
      const { data, error } = id
        ? await supabase.from('tags').update(row).eq('id', id).select('*').single()
        : await supabase.from('tags').insert(row).select('*').single();
      check(error);
      if (!data) throw new Error('태그를 저장하지 못했습니다.');
      return data;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: KEY }),
  });
}

/** 태그를 지운다. 붙어 있던 할 일·일정은 남고 태그만 빠진다. */
export function useDeleteTag() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: KEY,
    mutationFn: async (id: string) => {
      requireUserId();
      if (isDevMode()) {
        await localDeleteTag(id);
        return;
      }
      const { error } = await supabase.from('tags').delete().eq('id', id);
      check(error);
    },
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: KEY }),
        client.invalidateQueries({ queryKey: ['todos'] }),
        client.invalidateQueries({ queryKey: ['events'] }),
      ]),
  });
}
