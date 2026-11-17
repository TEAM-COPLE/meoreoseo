import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Tables } from './database.types';
import { supabase } from './supabase';

type TodoRow = Tables<'todos'>;
type EventRow = Tables<'events'>;
type HabitRow = Tables<'habits'>;
type HabitLogRow = Tables<'habit_logs'>;
type NoteRow = Tables<'notes'>;
type TransactionRow = Tables<'transactions'>;

const KEYS = {
  todos: 'meoreoseo:local:todos',
  events: 'meoreoseo:local:events',
  habits: 'meoreoseo:local:habits',
  habit_logs: 'meoreoseo:local:habit_logs',
  notes: 'meoreoseo:local:notes',
  transactions: 'meoreoseo:local:transactions',
} as const;

const LOCAL_USER_ID = 'local';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 반복되는 디스크 읽기(AsyncStorage.getItem)와 JSON.parse 비용을 없애는 메모리 캐시 */
const memoryCache = new Map<string, unknown[]>();

/** 동시 쓰기(Race Condition)로 인한 데이터 유실을 막는 직렬화 잠금(Mutex) */
let lockQueue: Promise<void> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = lockQueue.then(fn, fn);
  lockQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

export function isValidUuid(id: string): boolean {
  return UUID_RE.test(id);
}

/** 암호학적으로 안전한 난수 생성기(CSPRNG)를 우선 사용하여 RFC 4122 UUID v4 를 만든다. */
function createId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function isRecordWithId(value: unknown): value is { id: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof (value as { id: unknown }).id === 'string'
  );
}

async function readList<T extends { id: string }>(key: string): Promise<T[]> {
  const cached = memoryCache.get(key);
  if (cached) return [...(cached as T[])];
  try {
    const raw = await AsyncStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const valid = Array.isArray(parsed) ? (parsed.filter(isRecordWithId) as T[]) : [];
    memoryCache.set(key, valid);
    return [...valid];
  } catch {
    return [];
  }
}

async function writeList<T>(key: string, items: T[]): Promise<void> {
  memoryCache.set(key, [...items]);
  await AsyncStorage.setItem(key, JSON.stringify(items));
}

function deleteFromList<T extends { id: string }>(key: string, id: string): Promise<void> {
  return withLock(async () => {
    const items = await readList<T>(key);
    await writeList(
      key,
      items.filter((item) => item.id !== id),
    );
  });
}

function clampText(text: string | null, maxLength: number): string | null {
  return text === null ? null : text.slice(0, maxLength);
}

// ───────────────────────── 할 일 (todos) ─────────────────────────

export async function listLocalTodos(): Promise<TodoRow[]> {
  const items = await readList<TodoRow>(KEYS.todos);
  return items.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.due_date !== b.due_date) {
      if (a.due_date === null) return 1;
      if (b.due_date === null) return -1;
      return a.due_date.localeCompare(b.due_date);
    }
    return b.created_at.localeCompare(a.created_at);
  });
}

export async function saveLocalTodo(input: {
  id?: string;
  title: string;
  notes: string | null;
  due_date: string | null;
  priority: number;
}): Promise<void> {
  const title = input.title.trim().slice(0, 200);
  if (!title) throw new Error('제목을 입력해 주세요.');
  const notes = clampText(input.notes, 5000);
  const priority = Math.min(2, Math.max(0, Math.trunc(input.priority)));

  return withLock(async () => {
    const items = await readList<TodoRow>(KEYS.todos);
    if (input.id) {
      await writeList(
        KEYS.todos,
        items.map((item) =>
          item.id === input.id ? { ...item, title, notes, due_date: input.due_date, priority } : item,
        ),
      );
      return;
    }
    await writeList(KEYS.todos, [
      {
        id: createId(),
        user_id: LOCAL_USER_ID,
        title,
        notes,
        due_date: input.due_date,
        priority,
        done: false,
        done_at: null,
        created_at: new Date().toISOString(),
      },
      ...items,
    ]);
  });
}

export async function toggleLocalTodo(todo: TodoRow): Promise<void> {
  return withLock(async () => {
    const items = await readList<TodoRow>(KEYS.todos);
    const done = !todo.done;
    const done_at = done ? new Date().toISOString() : null;
    await writeList(
      KEYS.todos,
      items.map((item) => (item.id === todo.id ? { ...item, done, done_at } : item)),
    );
  });
}

export const deleteLocalTodo = (id: string) => deleteFromList<TodoRow>(KEYS.todos, id);

// ───────────────────────── 일정 (events) ─────────────────────────

export async function listLocalEvents(start: string, end: string): Promise<EventRow[]> {
  const items = await readList<EventRow>(KEYS.events);
  return items
    .filter((item) => item.event_date >= start && item.event_date <= end)
    .sort((a, b) => {
      if (a.event_date !== b.event_date) return a.event_date.localeCompare(b.event_date);
      if (a.start_time === b.start_time) return 0;
      if (a.start_time === null) return -1;
      if (b.start_time === null) return 1;
      return a.start_time.localeCompare(b.start_time);
    });
}

export async function saveLocalEvent(input: {
  id?: string;
  title: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  memo: string | null;
}): Promise<void> {
  const title = input.title.trim().slice(0, 200);
  if (!title) throw new Error('제목을 입력해 주세요.');
  const memo = clampText(input.memo, 5000);

  return withLock(async () => {
    const items = await readList<EventRow>(KEYS.events);
    if (input.id) {
      await writeList(
        KEYS.events,
        items.map((item) =>
          item.id === input.id
            ? {
                ...item,
                title,
                event_date: input.event_date,
                start_time: input.start_time,
                end_time: input.end_time,
                memo,
              }
            : item,
        ),
      );
      return;
    }
    await writeList(KEYS.events, [
      ...items,
      {
        id: createId(),
        user_id: LOCAL_USER_ID,
        title,
        event_date: input.event_date,
        start_time: input.start_time,
        end_time: input.end_time,
        memo,
        created_at: new Date().toISOString(),
      },
    ]);
  });
}

export const deleteLocalEvent = (id: string) => deleteFromList<EventRow>(KEYS.events, id);

// ───────────────────────── 습관 (habits, habit_logs) ─────────────────────────

export async function listLocalHabits(): Promise<HabitRow[]> {
  const items = await readList<HabitRow>(KEYS.habits);
  return items
    .filter((item) => !item.archived)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function saveLocalHabit(input: { id?: string; name: string }): Promise<void> {
  const name = input.name.trim().slice(0, 100);
  if (!name) throw new Error('습관 이름을 입력해 주세요.');

  return withLock(async () => {
    const items = await readList<HabitRow>(KEYS.habits);
    if (input.id) {
      await writeList(
        KEYS.habits,
        items.map((item) => (item.id === input.id ? { ...item, name } : item)),
      );
      return;
    }
    await writeList(KEYS.habits, [
      ...items,
      {
        id: createId(),
        user_id: LOCAL_USER_ID,
        name,
        archived: false,
        created_at: new Date().toISOString(),
      },
    ]);
  });
}

export async function deleteLocalHabit(id: string): Promise<void> {
  return withLock(async () => {
    const [habits, logs] = await Promise.all([
      readList<HabitRow>(KEYS.habits),
      readList<HabitLogRow>(KEYS.habit_logs),
    ]);
    await Promise.all([
      writeList(
        KEYS.habits,
        habits.filter((item) => item.id !== id),
      ),
      writeList(
        KEYS.habit_logs,
        logs.filter((log) => log.habit_id !== id),
      ),
    ]);
  });
}

export async function listLocalHabitLogs(
  sinceDate: string,
): Promise<Pick<HabitLogRow, 'habit_id' | 'log_date'>[]> {
  const logs = await readList<HabitLogRow>(KEYS.habit_logs);
  return logs
    .filter((log) => log.log_date >= sinceDate)
    .map(({ habit_id, log_date }) => ({ habit_id, log_date }));
}

export async function toggleLocalHabitLog(input: {
  habitId: string;
  date: string;
  done: boolean;
}): Promise<void> {
  return withLock(async () => {
    const logs = await readList<HabitLogRow>(KEYS.habit_logs);
    if (input.done) {
      await writeList(
        KEYS.habit_logs,
        logs.filter((log) => !(log.habit_id === input.habitId && log.log_date === input.date)),
      );
      return;
    }
    if (logs.some((log) => log.habit_id === input.habitId && log.log_date === input.date)) {
      return;
    }
    await writeList(KEYS.habit_logs, [
      ...logs,
      {
        id: createId(),
        user_id: LOCAL_USER_ID,
        habit_id: input.habitId,
        log_date: input.date,
        created_at: new Date().toISOString(),
      },
    ]);
  });
}

// ───────────────────────── 메모 (notes) ─────────────────────────

export async function listLocalNotes(): Promise<NoteRow[]> {
  const items = await readList<NoteRow>(KEYS.notes);
  return items.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updated_at.localeCompare(a.updated_at);
  });
}

export async function getLocalNote(id: string): Promise<NoteRow | null> {
  const items = await readList<NoteRow>(KEYS.notes);
  return items.find((item) => item.id === id) ?? null;
}

export async function insertLocalNote(draft: {
  title: string;
  body: string;
  pinned: boolean;
}): Promise<NoteRow> {
  const title = draft.title.slice(0, 200);
  const body = draft.body.slice(0, 50000);

  return withLock(async () => {
    const items = await readList<NoteRow>(KEYS.notes);
    const now = new Date().toISOString();
    const created: NoteRow = {
      id: createId(),
      user_id: LOCAL_USER_ID,
      title,
      body,
      pinned: Boolean(draft.pinned),
      created_at: now,
      updated_at: now,
    };
    await writeList(KEYS.notes, [created, ...items]);
    return created;
  });
}

export async function updateLocalNote(
  id: string,
  draft: { title: string; body: string; pinned: boolean },
): Promise<boolean> {
  const title = draft.title.slice(0, 200);
  const body = draft.body.slice(0, 50000);

  return withLock(async () => {
    const items = await readList<NoteRow>(KEYS.notes);
    let found = false;
    const now = new Date().toISOString();
    const next = items.map((item) => {
      if (item.id !== id) return item;
      found = true;
      return { ...item, title, body, pinned: Boolean(draft.pinned), updated_at: now };
    });
    if (!found) return false;
    await writeList(KEYS.notes, next);
    return true;
  });
}

export const deleteLocalNote = (id: string) => deleteFromList<NoteRow>(KEYS.notes, id);

// ───────────────────────── 가계부 (transactions) ─────────────────────────

export async function listLocalTransactions(
  start: string,
  end: string,
): Promise<TransactionRow[]> {
  const items = await readList<TransactionRow>(KEYS.transactions);
  return items
    .filter((item) => item.occurred_on >= start && item.occurred_on <= end)
    .sort((a, b) =>
      a.occurred_on !== b.occurred_on
        ? b.occurred_on.localeCompare(a.occurred_on)
        : b.created_at.localeCompare(a.created_at),
    );
}

export async function saveLocalTransaction(input: {
  id?: string;
  kind: 'expense' | 'income';
  amount: number;
  category: string;
  memo: string | null;
  occurred_on: string;
}): Promise<void> {
  const amount = Math.trunc(input.amount);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 999_999_999_999) {
    throw new Error('올바른 금액을 입력해 주세요.');
  }
  const category = input.category.trim().slice(0, 50);
  if (!category) throw new Error('분류를 선택해 주세요.');
  const memo = clampText(input.memo, 500);

  return withLock(async () => {
    const items = await readList<TransactionRow>(KEYS.transactions);
    if (input.id) {
      await writeList(
        KEYS.transactions,
        items.map((item) =>
          item.id === input.id
            ? { ...item, kind: input.kind, amount, category, memo, occurred_on: input.occurred_on }
            : item,
        ),
      );
      return;
    }
    await writeList(KEYS.transactions, [
      {
        id: createId(),
        user_id: LOCAL_USER_ID,
        kind: input.kind,
        amount,
        category,
        memo,
        occurred_on: input.occurred_on,
        source: 'manual',
        created_at: new Date().toISOString(),
      },
      ...items,
    ]);
  });
}

export const deleteLocalTransaction = (id: string) =>
  deleteFromList<TransactionRow>(KEYS.transactions, id);

// ───────────────────────── 기기 데이터 → 계정 DB 동기화 ─────────────────────────

async function removeSyncedByIds<T extends { id: string }>(
  key: string,
  syncedIds: ReadonlySet<string>,
): Promise<void> {
  const current = await readList<T>(key);
  const remaining = current.filter((item) => !syncedIds.has(item.id));
  memoryCache.set(key, remaining);
  if (remaining.length === 0) {
    await AsyncStorage.removeItem(key);
  } else {
    await AsyncStorage.setItem(key, JSON.stringify(remaining));
  }
}

async function syncTableById<
  TName extends 'todos' | 'events' | 'notes' | 'transactions',
  TRow extends Tables<TName>,
>(table: TName, key: string, userId: string): Promise<void> {
  const items = await readList<TRow>(key);
  if (items.length === 0) return;
  const rows = items.map((item) => ({
    ...item,
    id: isValidUuid(item.id) ? item.id : createId(),
    user_id: userId,
  }));
  const { error } = await supabase.from(table).upsert(rows as never, { onConflict: 'id' });
  if (!error) {
    await removeSyncedByIds<TRow>(key, new Set(items.map((item) => item.id)));
  }
}

/**
 * 비로그인 상태에서 기기에 저장해 둔 데이터가 있으면,
 * 로그인한 계정의 Supabase 데이터베이스로 옮기고 성공한 항목만 기기에서 비운다.
 */
export async function syncLocalDataToSupabase(userId: string): Promise<void> {
  if (!isValidUuid(userId)) return;

  return withLock(async () => {
    await Promise.all([
      syncTableById('todos', KEYS.todos, userId),
      syncTableById('events', KEYS.events, userId),
      syncTableById('notes', KEYS.notes, userId),
      syncTableById('transactions', KEYS.transactions, userId),
    ]);

    const [habits, habitLogs] = await Promise.all([
      readList<HabitRow>(KEYS.habits),
      readList<HabitLogRow>(KEYS.habit_logs),
    ]);

    const habitIdMap = new Map<string, string>();
    if (habits.length > 0) {
      const rows = habits.map((item) => {
        const safeId = isValidUuid(item.id) ? item.id : createId();
        habitIdMap.set(item.id, safeId);
        return { ...item, id: safeId, user_id: userId };
      });
      const { error } = await supabase.from('habits').upsert(rows, { onConflict: 'id' });
      if (error) return;
      await removeSyncedByIds<HabitRow>(KEYS.habits, new Set(habits.map((item) => item.id)));
    }

    if (habitLogs.length > 0) {
      const logRows = habitLogs
        .map((log) => ({
          ...log,
          id: isValidUuid(log.id) ? log.id : createId(),
          habit_id: habitIdMap.get(log.habit_id) ?? log.habit_id,
          user_id: userId,
        }))
        .filter((log) => isValidUuid(log.habit_id));
      const { error } = await supabase
        .from('habit_logs')
        .upsert(logRows, { onConflict: 'habit_id,log_date' });
      if (!error) {
        await removeSyncedByIds<HabitLogRow>(
          KEYS.habit_logs,
          new Set(habitLogs.map((log) => log.id)),
        );
      }
    }
  });
}
