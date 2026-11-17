import { useMutation, useQuery } from '@tanstack/react-query';

import { activeUserId, requireUserId, useAuth } from '@/lib/auth';
import type { Tables } from '@/lib/database.types';
import { todayISO } from '@/lib/dates';
import { check, queryClient, useInvalidatingMutation } from '@/lib/query';
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
const TOGGLE_DEBOUNCE_MS = 550;

function currentScope(): string | null {
  return activeUserId();
}

function sortTodos(items: Todo[]): Todo[] {
  return [...items].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.due_date !== b.due_date) {
      if (a.due_date === null) return 1;
      if (b.due_date === null) return -1;
      return a.due_date.localeCompare(b.due_date);
    }
    return b.created_at.localeCompare(a.created_at);
  });
}

function updateTodosCache(scope: string, updater: (items: Todo[]) => Todo[]): void {
  const key = [...KEY, scope];
  if (queryClient.getQueryData<Todo[]>(key) === undefined) return;
  queryClient.setQueryData<Todo[]>(key, (old) => (old ? sortTodos(updater(old)) : old));
}

/** 내 할 일 전체. 진행 중인 것이 먼저, 마감일이 빠른 것이 먼저 온다. */
export function useTodos(enabled = true) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  return useQuery({
    queryKey: [...KEY, userId],
    enabled: enabled && userId !== null,
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
    requireUserId();
    if (values.repeat && !values.due_date) throw new Error('반복하려면 마감일을 정해 주세요.');
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

type TodoToggleResult = {
  todo: Todo;
  createdNext: Todo | null;
  deletedNextIds: string[];
};

type PendingTodoToggle = {
  scope: string;
  todoId: string;
  confirmedTodo: Todo;
  desiredDone: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  waiters: { resolve: () => void; reject: (err: unknown) => void }[];
  onRollback?: (confirmed: Todo) => void;
  onCommitted?: (result: TodoToggleResult) => void;
};

const pendingTodoToggles = new Map<string, PendingTodoToggle>();
const todoChains = new Map<string, Promise<void>>();
const confirmedTodoMap = new Map<string, Todo>();
const optimisticTodoMap = new Map<string, Todo>();

async function commitTodoDone(
  todo: Todo,
  done: boolean,
  scope: string,
): Promise<TodoToggleResult> {
  requireUserId();
  const doneAt = done ? new Date().toISOString() : null;
  const { error } = await supabase
    .from('todos')
    .update({ done, done_at: doneAt })
    .eq('id', todo.id);
  check(error);

  const updated: Todo = { ...todo, done, done_at: doneAt };
  let createdNext: Todo | null = null;
  let deletedNextIds: string[] = [];

  if (done && isRepeat(todo.repeat) && todo.due_date) {
    // 여러 번 눌러도 다음 할 일이 두 개 생기지 않게 먼저 확인한다.
    const existing = await supabase
      .from('todos')
      .select('id')
      .eq('previous_id', todo.id)
      .eq('done', false)
      .limit(1);
    check(existing.error);
    if ((existing.data ?? []).length === 0) {
      const anchor = todo.repeat_start ?? todo.due_date;
      const { data: inserted, error: insertError } = await supabase
        .from('todos')
        .insert({
          title: todo.title,
          notes: todo.notes,
          priority: todo.priority,
          due_date: nextTodoDate(anchor, todo.repeat, todo.due_date, todayISO()),
          repeat: todo.repeat,
          repeat_start: anchor,
          previous_id: todo.id,
        })
        .select('*')
        .single();
      check(insertError);
      if (inserted) {
        createdNext = inserted;
        updateTodosCache(scope, (items) =>
          items.some((item) => item.id === inserted.id) ? items : [inserted, ...items],
        );
      }
    }
  } else if (!done) {
    const { data: deleted, error: deleteError } = await supabase
      .from('todos')
      .delete()
      .eq('previous_id', todo.id)
      .eq('done', false)
      .select('id');
    check(deleteError);
    deletedNextIds = (deleted ?? []).map((row) => row.id);
    if (deletedNextIds.length > 0) {
      const removedSet = new Set(deletedNextIds);
      updateTodosCache(scope, (items) => items.filter((item) => !removedSet.has(item.id)));
    }
  }

  return { todo: updated, createdNext, deletedNextIds };
}

function flushTodoEntry(key: string): Promise<void> {
  const entry = pendingTodoToggles.get(key);
  if (!entry) return todoChains.get(key) ?? Promise.resolve();
  pendingTodoToggles.delete(key);
  if (entry.timer) {
    clearTimeout(entry.timer);
    entry.timer = null;
  }

  const prevChain = todoChains.get(key) ?? Promise.resolve();
  const nextChain = prevChain
    .catch(() => {})
    .then(async () => {
      if (currentScope() !== entry.scope) {
        for (const waiter of entry.waiters) waiter.resolve();
        return;
      }
      const confirmed = confirmedTodoMap.get(key) ?? entry.confirmedTodo;
      if (entry.desiredDone === confirmed.done) {
        for (const waiter of entry.waiters) waiter.resolve();
        return;
      }
      try {
        const result = await commitTodoDone(confirmed, entry.desiredDone, entry.scope);
        confirmedTodoMap.set(key, result.todo);
        if (!pendingTodoToggles.has(key)) {
          optimisticTodoMap.set(key, result.todo);
        }
        entry.onCommitted?.(result);
        for (const waiter of entry.waiters) waiter.resolve();
      } catch (err) {
        if (!pendingTodoToggles.has(key)) {
          optimisticTodoMap.set(key, confirmed);
          updateTodosCache(entry.scope, (items) =>
            items.map((item) => (item.id === confirmed.id ? confirmed : item)),
          );
          entry.onRollback?.(confirmed);
        }
        for (const waiter of entry.waiters) waiter.reject(err);
      }
    })
    .finally(() => {
      if (todoChains.get(key) === nextChain && !pendingTodoToggles.has(key)) {
        todoChains.delete(key);
        confirmedTodoMap.delete(key);
        optimisticTodoMap.delete(key);
      }
    });

  todoChains.set(key, nextChain);
  return nextChain;
}

/**
 * 할 일의 완료 표시를 켜거나 끈다. 앱 화면과 홈 화면 위젯이 함께 쓴다.
 * - 짧은 시간에 여러 번 켜고 끄면 마지막 상태만 DB에 반영하고, 원래 상태로 돌아왔다면 DB 요청을 건너뛴다.
 * - 반복 할 일을 완료하면 다음 마감일로 새 할 일을 만든다.
 * - 완료를 취소하면 그때 자동으로 만든 할 일(아직 안 끝낸 것)을 지운다.
 */
export function toggleTodoCoalesced(
  todo: Todo,
  options?: {
    delayMs?: number;
    onRollback?: (confirmed: Todo) => void;
    onCommitted?: (result: TodoToggleResult) => void;
  },
): Promise<void> {
  if (isWaitingRepeat(todo, todayISO())) return Promise.resolve();

  const scope = currentScope();
  if (!scope) return Promise.reject(new Error('로그인이 필요합니다.'));
  const key = `${scope}:${todo.id}`;
  const delayMs = options?.delayMs ?? TOGGLE_DEBOUNCE_MS;

  const existing = pendingTodoToggles.get(key);
  let nextDone: boolean;

  if (existing) {
    if (existing.timer) clearTimeout(existing.timer);
    for (const waiter of existing.waiters.splice(0)) {
      waiter.resolve();
    }
    nextDone = !existing.desiredDone;
    existing.desiredDone = nextDone;
    if (options?.onRollback) existing.onRollback = options.onRollback;
    if (options?.onCommitted) existing.onCommitted = options.onCommitted;
  } else {
    const cached = queryClient
      .getQueryData<Todo[]>([...KEY, scope])
      ?.find((item) => item.id === todo.id);
    const baseTodo = optimisticTodoMap.get(key) ?? cached ?? todo;
    const confirmed = confirmedTodoMap.get(key) ?? baseTodo;
    confirmedTodoMap.set(key, confirmed);
    nextDone = !baseTodo.done;
    pendingTodoToggles.set(key, {
      scope,
      todoId: todo.id,
      confirmedTodo: confirmed,
      desiredDone: nextDone,
      timer: null,
      waiters: [],
      onRollback: options?.onRollback,
      onCommitted: options?.onCommitted,
    });
  }

  const optimisticTodo: Todo = {
    ...(optimisticTodoMap.get(key) ?? todo),
    done: nextDone,
    done_at: nextDone ? new Date().toISOString() : null,
  };
  optimisticTodoMap.set(key, optimisticTodo);
  updateTodosCache(scope, (items) =>
    items.map((item) =>
      item.id === todo.id
        ? { ...item, done: nextDone, done_at: optimisticTodo.done_at }
        : item,
    ),
  );

  const entry = pendingTodoToggles.get(key)!;
  return new Promise<void>((resolve, reject) => {
    entry.waiters.push({ resolve, reject });
    entry.timer = setTimeout(() => {
      flushTodoEntry(key).catch(() => {});
    }, delayMs);
  });
}

/** 현재 대기 중이거나 진행 중인 할 일의 낙관적 상태를 돌려준다(없으면 undefined). */
export function getKnownTodo(todoId: string): Todo | undefined {
  const scope = currentScope();
  if (!scope) return undefined;
  const key = `${scope}:${todoId}`;
  return (
    optimisticTodoMap.get(key) ??
    confirmedTodoMap.get(key) ??
    queryClient.getQueryData<Todo[]>([...KEY, scope])?.find((item) => item.id === todoId)
  );
}

/** 대기 중인 모든 할 일 토글을 즉시 DB에 반영한다(앱 백그라운드 전환 시 유실 방지). */
export async function flushPendingTodoToggles(): Promise<void> {
  const keys = [...pendingTodoToggles.keys()];
  if (keys.length === 0 && todoChains.size === 0) return;
  await Promise.allSettled([
    ...keys.map((key) => flushTodoEntry(key)),
    ...todoChains.values(),
  ]);
}

/** 즉시 DB에 완료 상태를 토글한다. */
export async function toggleTodo(todo: Todo): Promise<void> {
  if (isWaitingRepeat(todo, todayISO())) return;
  const scope = requireUserId();
  await commitTodoDone(todo, !todo.done, scope);
}

/** 완료 표시를 켜거나 끈다. */
export function useToggleTodo() {
  return useMutation({
    mutationKey: KEY,
    mutationFn: (todo: Todo) => toggleTodoCoalesced(todo),
  });
}

export function useDeleteTodo() {
  return useInvalidatingMutation(KEY, async (id: string) => {
    requireUserId();
    const { error } = await supabase.from('todos').delete().eq('id', id);
    check(error);
  });
}

export function useDeleteTodos() {
  return useInvalidatingMutation(KEY, async (ids: string[]) => {
    if (ids.length === 0) return;
    requireUserId();
    const { error } = await supabase.from('todos').delete().in('id', ids);
    check(error);
  });
}
