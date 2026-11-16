import { useQuery } from '@tanstack/react-query';

import type { Tables } from '@/lib/database.types';
import { check, useInvalidatingMutation } from '@/lib/query';
import { supabase } from '@/lib/supabase';

export type Todo = Tables<'todos'>;

export type TodoInput = {
  /** 있으면 수정, 없으면 새로 추가 */
  id?: string;
  title: string;
  notes: string | null;
  due_date: string | null;
  priority: number;
};

const KEY = ['todos'];

/** 내 할 일 전체. 진행 중인 것이 먼저, 마감일이 빠른 것이 먼저 온다. */
export function useTodos() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('todos')
        .select('*')
        .order('done')
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });
      check(error);
      return data ?? [];
    },
  });
}

export function useSaveTodo() {
  return useInvalidatingMutation(KEY, async ({ id, ...values }: TodoInput) => {
    const { error } = id
      ? await supabase.from('todos').update(values).eq('id', id)
      : await supabase.from('todos').insert(values);
    check(error);
  });
}

/** 완료 표시를 켜거나 끈다. */
export function useToggleTodo() {
  return useInvalidatingMutation(KEY, async (todo: Todo) => {
    const done = !todo.done;
    const { error } = await supabase
      .from('todos')
      .update({ done, done_at: done ? new Date().toISOString() : null })
      .eq('id', todo.id);
    check(error);
  });
}

export function useDeleteTodo() {
  return useInvalidatingMutation(KEY, async (id: string) => {
    const { error } = await supabase.from('todos').delete().eq('id', id);
    check(error);
  });
}
