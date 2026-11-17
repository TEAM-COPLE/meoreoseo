import { useQuery } from '@tanstack/react-query';

import { hasActiveSession, useAuth } from '@/lib/auth';
import type { Tables } from '@/lib/database.types';
import { todayISO } from '@/lib/dates';
import {
  deleteLocalTodo,
  listLocalTodos,
  saveLocalTodo,
  toggleLocalTodo,
} from '@/lib/local-store';
import { check, useInvalidatingMutation } from '@/lib/query';
import { isRepeat, isWaitingRepeat, nextTodoDate } from '@/lib/repeat';
import { supabase } from '@/lib/supabase';

export type Todo = Tables<'todos'>;

export type TodoInput = {
  /** 있으면 수정, 없으면 새로 추가 */
  id?: string;
  title: string;
  notes: string | null;
  due_date: string | null;
  priority: number;
  /** 반복 방법 (반복 안 하면 null). 반복하려면 마감일이 있어야 한다. */
  repeat: string | null;
  /** 반복의 기준 날짜. 반복을 새로 정하거나 마감일을 바꾸면 마감일과 같게 한다. */
  repeat_start: string | null;
};

const KEY = ['todos'];

/** 내 할 일 전체. 진행 중인 것이 먼저, 마감일이 빠른 것이 먼저 온다. */
export function useTodos() {
  const { session } = useAuth();
  const scope = session?.user.id ?? 'local';

  return useQuery({
    queryKey: [...KEY, scope],
    queryFn: async () => {
      if (!session) {
        return listLocalTodos();
      }
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
    if (values.repeat && !values.due_date) throw new Error('반복하려면 마감일을 정해 주세요.');
    if (!hasActiveSession()) {
      await saveLocalTodo({ id, ...values });
      return;
    }
    const row = {
      ...values,
      repeat: isRepeat(values.repeat) ? values.repeat : null,
      repeat_start: values.repeat ? (values.repeat_start ?? values.due_date) : null,
    };
    const { error } = id
      ? await supabase.from('todos').update(row).eq('id', id)
      : await supabase.from('todos').insert(row);
    check(error);
  });
}

/**
 * 할 일의 완료 표시를 켜거나 끈다. 앱 화면과 홈 화면 위젯이 함께 쓴다.
 * - 반복 할 일을 완료하면 다음 마감일로 새 할 일을 만든다.
 * - 완료를 취소하면 그때 자동으로 만든 할 일(아직 안 끝낸 것)을 지운다.
 */
export async function toggleTodo(todo: Todo): Promise<void> {
  // 아직 차례가 오지 않은 반복 할 일은 체크하지 않는다(화면·위젯 모두).
  if (isWaitingRepeat(todo, todayISO())) return;
  if (!hasActiveSession()) {
    await toggleLocalTodo(todo);
    return;
  }

  const done = !todo.done;
  const { error } = await supabase
    .from('todos')
    .update({ done, done_at: done ? new Date().toISOString() : null })
    .eq('id', todo.id);
  check(error);

  if (done && isRepeat(todo.repeat) && todo.due_date) {
    // 여러 번 눌러도 다음 할 일이 두 개 생기지 않게 먼저 확인한다.
    const existing = await supabase
      .from('todos')
      .select('id')
      .eq('previous_id', todo.id)
      .eq('done', false)
      .limit(1);
    check(existing.error);
    if ((existing.data ?? []).length > 0) return;

    const anchor = todo.repeat_start ?? todo.due_date;
    const { error: insertError } = await supabase.from('todos').insert({
      title: todo.title,
      notes: todo.notes,
      priority: todo.priority,
      due_date: nextTodoDate(anchor, todo.repeat, todo.due_date, todayISO()),
      repeat: todo.repeat,
      repeat_start: anchor,
      previous_id: todo.id,
    });
    check(insertError);
  } else if (!done) {
    const { error: deleteError } = await supabase
      .from('todos')
      .delete()
      .eq('previous_id', todo.id)
      .eq('done', false);
    check(deleteError);
  }
}

/** 완료 표시를 켜거나 끈다. */
export function useToggleTodo() {
  return useInvalidatingMutation(KEY, toggleTodo);
}

export function useDeleteTodo() {
  return useInvalidatingMutation(KEY, async (id: string) => {
    if (!hasActiveSession()) {
      await deleteLocalTodo(id);
      return;
    }
    const { error } = await supabase.from('todos').delete().eq('id', id);
    check(error);
  });
}
