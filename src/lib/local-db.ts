import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Tables } from './database.types';
import type { City } from './weather';

export const DEV_USER_ID = 'dev-local-user';

const DB_PREFIX = 'meoreoseo:local-db:';

type TableName =
  | 'todos'
  | 'transactions'
  | 'events'
  | 'habits'
  | 'habit_logs'
  | 'notes'
  | 'tags'
  | 'routines'
  | 'routine_logs'
  | 'weather_city'
  | 'study_profiles'
  | 'study_subjects'
  | 'study_sessions';

const ALL_TABLES: readonly TableName[] = [
  'todos',
  'transactions',
  'events',
  'habits',
  'habit_logs',
  'notes',
  'tags',
  'routines',
  'routine_logs',
  'weather_city',
  'study_profiles',
  'study_subjects',
  'study_sessions',
];

const tableLocks = new Map<TableName, Promise<unknown>>();
const tableCache = new Map<TableName, unknown[]>();
let weatherCityCache: City | null | undefined;

function cmpAsc(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function cmpDesc(a: string, b: string): number {
  return b < a ? -1 : b > a ? 1 : 0;
}

function withTableLock<T>(table: TableName, task: () => Promise<T>): Promise<T> {
  const prev = tableLocks.get(table) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(task);
  tableLocks.set(table, next);
  next.finally(() => {
    if (tableLocks.get(table) === next) {
      tableLocks.delete(table);
    }
  });
  return next;
}

async function readTable<T>(table: TableName): Promise<T[]> {
  const cached = tableCache.get(table);
  if (cached !== undefined) return cached as T[];
  const raw = await AsyncStorage.getItem(`${DB_PREFIX}${table}`);
  if (!raw) {
    const empty: T[] = [];
    tableCache.set(table, empty);
    return empty;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    const rows = Array.isArray(parsed) ? (parsed as T[]) : [];
    tableCache.set(table, rows);
    return rows;
  } catch {
    const empty: T[] = [];
    tableCache.set(table, empty);
    return empty;
  }
}

async function writeTable<T>(table: TableName, rows: T[]): Promise<void> {
  tableCache.set(table, rows);
  await AsyncStorage.setItem(`${DB_PREFIX}${table}`, JSON.stringify(rows));
}

function generateId(): string {
  const randomUUID = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID;
  if (typeof randomUUID === 'function') {
    return randomUUID.call(globalThis.crypto);
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function clearLocalDb(): Promise<void> {
  weatherCityCache = null;
  await Promise.all(
    ALL_TABLES.map((table) =>
      withTableLock(table, async () => {
        tableCache.delete(table);
        await AsyncStorage.removeItem(`${DB_PREFIX}${table}`);
      }),
    ),
  );
}

// ───────────────────────── 할 일 (todos) ─────────────────────────

type TodoRow = Tables<'todos'>;

export function sortLocalTodos(items: TodoRow[]): TodoRow[] {
  return [...items].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.due_date !== b.due_date) {
      if (a.due_date === null) return 1;
      if (b.due_date === null) return -1;
      return cmpAsc(a.due_date, b.due_date);
    }
    return cmpDesc(a.created_at, b.created_at);
  });
}

export async function localListTodos(): Promise<TodoRow[]> {
  const rows = await readTable<TodoRow>('todos');
  return sortLocalTodos(rows);
}

export async function localSaveTodo(
  id: string | undefined,
  values: {
    title: string;
    notes: string | null;
    due_date: string | null;
    start_date: string | null;
    priority: number;
    repeat: string | null;
    repeat_start: string | null;
    tag_id: string | null;
  },
): Promise<void> {
  await withTableLock('todos', async () => {
    const rows = await readTable<TodoRow>('todos');
    if (id) {
      const next = rows.map((row) => (row.id === id ? { ...row, ...values } : row));
      await writeTable('todos', next);
      return;
    }
    const created: TodoRow = {
      id: generateId(),
      user_id: DEV_USER_ID,
      title: values.title,
      notes: values.notes,
      due_date: values.due_date,
      start_date: values.start_date,
      priority: values.priority,
      done: false,
      done_at: null,
      created_at: new Date().toISOString(),
      repeat: values.repeat,
      repeat_start: values.repeat_start,
      previous_id: null,
      tag_id: values.tag_id,
    };
    await writeTable('todos', [created, ...rows]);
  });
}

export async function localUpdateTodoDone(
  id: string,
  done: boolean,
  doneAt: string | null,
): Promise<void> {
  await withTableLock('todos', async () => {
    const rows = await readTable<TodoRow>('todos');
    const next = rows.map((row) => (row.id === id ? { ...row, done, done_at: doneAt } : row));
    await writeTable('todos', next);
  });
}

export async function localFindPendingNextTodo(previousId: string): Promise<TodoRow | null> {
  const rows = await readTable<TodoRow>('todos');
  return rows.find((row) => row.previous_id === previousId && !row.done) ?? null;
}

export async function localInsertRepeatedTodo(values: {
  title: string;
  notes: string | null;
  priority: number;
  due_date: string | null;
  start_date: string | null;
  repeat: string | null;
  repeat_start: string | null;
  previous_id: string;
  tag_id: string | null;
}): Promise<TodoRow> {
  return withTableLock('todos', async () => {
    const rows = await readTable<TodoRow>('todos');
    const created: TodoRow = {
      id: generateId(),
      user_id: DEV_USER_ID,
      title: values.title,
      notes: values.notes,
      due_date: values.due_date,
      start_date: values.start_date,
      priority: values.priority,
      done: false,
      done_at: null,
      created_at: new Date().toISOString(),
      repeat: values.repeat,
      repeat_start: values.repeat_start,
      previous_id: values.previous_id,
      tag_id: values.tag_id,
    };
    await writeTable('todos', [created, ...rows]);
    return created;
  });
}

export async function localDeletePendingNextTodos(previousId: string): Promise<string[]> {
  return withTableLock('todos', async () => {
    const rows = await readTable<TodoRow>('todos');
    const removedIds: string[] = [];
    const kept = rows.filter((row) => {
      if (row.previous_id === previousId && !row.done) {
        removedIds.push(row.id);
        return false;
      }
      return true;
    });
    if (removedIds.length > 0) {
      await writeTable('todos', kept);
    }
    return removedIds;
  });
}

export async function localDeleteTodo(id: string): Promise<void> {
  await withTableLock('todos', async () => {
    const rows = await readTable<TodoRow>('todos');
    await writeTable('todos', rows.filter((row) => row.id !== id));
  });
}

export async function localDeleteTodos(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const target = new Set(ids);
  await withTableLock('todos', async () => {
    const rows = await readTable<TodoRow>('todos');
    await writeTable('todos', rows.filter((row) => !target.has(row.id)));
  });
}

// ───────────────────────── 가계부 (transactions) ─────────────────────────

type TransactionRow = Tables<'transactions'>;

export async function localListTransactions(start: string, end: string): Promise<TransactionRow[]> {
  const rows = await readTable<TransactionRow>('transactions');
  return rows
    .filter((row) => row.occurred_on >= start && row.occurred_on <= end)
    .sort((a, b) => {
      if (a.occurred_on !== b.occurred_on) return cmpDesc(a.occurred_on, b.occurred_on);
      return cmpDesc(a.created_at, b.created_at);
    });
}

export async function localSaveTransaction(
  id: string | undefined,
  values: {
    kind: string;
    amount: number;
    category: string;
    memo: string | null;
    occurred_on: string;
  },
): Promise<void> {
  await withTableLock('transactions', async () => {
    const rows = await readTable<TransactionRow>('transactions');
    if (id) {
      const next = rows.map((row) => (row.id === id ? { ...row, ...values } : row));
      await writeTable('transactions', next);
      return;
    }
    const created: TransactionRow = {
      id: generateId(),
      user_id: DEV_USER_ID,
      kind: values.kind,
      amount: values.amount,
      category: values.category,
      memo: values.memo,
      occurred_on: values.occurred_on,
      source: 'manual',
      created_at: new Date().toISOString(),
      occurred_at: null,
      external_id: null,
    };
    await writeTable('transactions', [created, ...rows]);
  });
}

export async function localDeleteTransaction(id: string): Promise<void> {
  await withTableLock('transactions', async () => {
    const rows = await readTable<TransactionRow>('transactions');
    await writeTable('transactions', rows.filter((row) => row.id !== id));
  });
}

export async function localDeleteTransactions(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const target = new Set(ids);
  await withTableLock('transactions', async () => {
    const rows = await readTable<TransactionRow>('transactions');
    await writeTable('transactions', rows.filter((row) => !target.has(row.id)));
  });
}

export async function localUpsertAutoTransactions(
  entries: {
    kind: string;
    amount: number;
    category: string;
    memo: string | null;
    occurred_on: string;
    occurred_at: string | null;
    source: string;
    external_id: string | null;
  }[],
): Promise<void> {
  if (entries.length === 0) return;
  await withTableLock('transactions', async () => {
    const rows = await readTable<TransactionRow>('transactions');
    const existingIds = new Set(
      rows.map((row) => row.external_id).filter((ext): ext is string => ext !== null),
    );
    const now = new Date().toISOString();
    const toInsert: TransactionRow[] = [];
    for (const entry of entries) {
      if (entry.external_id && existingIds.has(entry.external_id)) continue;
      if (entry.external_id) existingIds.add(entry.external_id);
      toInsert.push({
        id: generateId(),
        user_id: DEV_USER_ID,
        kind: entry.kind,
        amount: entry.amount,
        category: entry.category,
        memo: entry.memo,
        occurred_on: entry.occurred_on,
        source: entry.source,
        created_at: now,
        occurred_at: entry.occurred_at,
        external_id: entry.external_id,
      });
    }
    if (toInsert.length > 0) {
      await writeTable('transactions', [...toInsert, ...rows]);
    }
  });
}

// ───────────────────────── 일정 (events) ─────────────────────────

type EventRow = Tables<'events'>;

export async function localListEvents(start: string, end: string): Promise<EventRow[]> {
  const rows = await readTable<EventRow>('events');
  return rows.filter((row) => {
    if (row.event_date > end) return false;
    if (row.event_date >= start) return true;
    return row.repeat !== null && (row.repeat_until === null || row.repeat_until >= start);
  });
}

export async function localSaveEvent(
  id: string | undefined,
  values: {
    title: string;
    event_date: string;
    start_time: string | null;
    end_time: string | null;
    memo: string | null;
    repeat: string | null;
    repeat_until: string | null;
    tag_id: string | null;
  },
): Promise<void> {
  await withTableLock('events', async () => {
    const rows = await readTable<EventRow>('events');
    if (id) {
      const next = rows.map((row) => (row.id === id ? { ...row, ...values } : row));
      await writeTable('events', next);
      return;
    }
    const created: EventRow = {
      id: generateId(),
      user_id: DEV_USER_ID,
      title: values.title,
      event_date: values.event_date,
      start_time: values.start_time,
      end_time: values.end_time,
      memo: values.memo,
      created_at: new Date().toISOString(),
      repeat: values.repeat,
      repeat_until: values.repeat_until,
      tag_id: values.tag_id,
      excluded_dates: [],
      google_event_id: null,
      google_calendar_id: null,
      google_readonly: false,
      google_dirty: false,
      local_version: 1,
      google_original: null,
    };
    await writeTable('events', [...rows, created]);
  });
}

export async function localDeleteEvent(id: string): Promise<void> {
  await withTableLock('events', async () => {
    const rows = await readTable<EventRow>('events');
    await writeTable('events', rows.filter((row) => row.id !== id));
  });
}

export async function localDeleteEvents(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const target = new Set(ids);
  await withTableLock('events', async () => {
    const rows = await readTable<EventRow>('events');
    await writeTable('events', rows.filter((row) => !target.has(row.id)));
  });
}

export async function localEndEventRepeat(id: string, until: string): Promise<void> {
  await withTableLock('events', async () => {
    const rows = await readTable<EventRow>('events');
    const next = rows.map((row) => (row.id === id ? { ...row, repeat_until: until } : row));
    await writeTable('events', next);
  });
}

// ───────────────────────── 습관 (habits, habit_logs) ─────────────────────────

type HabitRow = Tables<'habits'>;
type HabitLogRow = Tables<'habit_logs'>;

export async function localListHabits(): Promise<HabitRow[]> {
  const rows = await readTable<HabitRow>('habits');
  return rows
    .filter((row) => !row.archived)
    .sort((a, b) => cmpAsc(a.created_at, b.created_at));
}

export async function localSaveHabit(id: string | undefined, name: string): Promise<void> {
  await withTableLock('habits', async () => {
    const rows = await readTable<HabitRow>('habits');
    if (id) {
      await writeTable(
        'habits',
        rows.map((row) => (row.id === id ? { ...row, name } : row)),
      );
      return;
    }
    const created: HabitRow = {
      id: generateId(),
      user_id: DEV_USER_ID,
      name,
      archived: false,
      created_at: new Date().toISOString(),
    };
    await writeTable('habits', [...rows, created]);
  });
}

export async function localDeleteHabit(id: string): Promise<void> {
  await withTableLock('habits', async () => {
    const rows = await readTable<HabitRow>('habits');
    await writeTable('habits', rows.filter((row) => row.id !== id));
  });
  await withTableLock('habit_logs', async () => {
    const logs = await readTable<HabitLogRow>('habit_logs');
    await writeTable('habit_logs', logs.filter((log) => log.habit_id !== id));
  });
}

export async function localDeleteHabits(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const target = new Set(ids);
  await withTableLock('habits', async () => {
    const rows = await readTable<HabitRow>('habits');
    await writeTable('habits', rows.filter((row) => !target.has(row.id)));
  });
  await withTableLock('habit_logs', async () => {
    const logs = await readTable<HabitLogRow>('habit_logs');
    await writeTable('habit_logs', logs.filter((log) => !target.has(log.habit_id)));
  });
}

export async function localListHabitLogs(
  sinceDate: string,
): Promise<Pick<HabitLogRow, 'habit_id' | 'log_date'>[]> {
  const logs = await readTable<HabitLogRow>('habit_logs');
  return logs
    .filter((log) => log.log_date >= sinceDate)
    .map(({ habit_id, log_date }) => ({ habit_id, log_date }));
}

export async function localSetHabitLogDone(
  habitId: string,
  logDate: string,
  done: boolean,
): Promise<void> {
  await withTableLock('habit_logs', async () => {
    const logs = await readTable<HabitLogRow>('habit_logs');
    if (done) {
      const exists = logs.some((log) => log.habit_id === habitId && log.log_date === logDate);
      if (exists) return;
      const created: HabitLogRow = {
        id: generateId(),
        user_id: DEV_USER_ID,
        habit_id: habitId,
        log_date: logDate,
        created_at: new Date().toISOString(),
      };
      await writeTable('habit_logs', [...logs, created]);
    } else {
      await writeTable(
        'habit_logs',
        logs.filter((log) => !(log.habit_id === habitId && log.log_date === logDate)),
      );
    }
  });
}

// ───────────────────────── 하루 루틴 (routines) ─────────────────────────
// 로그인 없이 써 보는 "개발 모드"에서 루틴을 휴대폰 안에 저장한다.

type RoutineRow = Tables<'routines'>;
type RoutineLogRow = Tables<'routine_logs'>;
export type LocalRoutineValues = Pick<
  RoutineRow,
  'title' | 'time_of_day' | 'weekdays' | 'kind' | 'notify'
>;

export async function localListRoutines(): Promise<RoutineRow[]> {
  return readTable<RoutineRow>('routines');
}

export async function localSaveRoutines(
  items: { id?: string; values: LocalRoutineValues }[],
): Promise<void> {
  await withTableLock('routines', async () => {
    let rows = await readTable<RoutineRow>('routines');
    for (const { id, values } of items) {
      if (id) {
        rows = rows.map((row) => (row.id === id ? { ...row, ...values } : row));
      } else {
        rows = [
          ...rows,
          {
            ...values,
            id: generateId(),
            user_id: DEV_USER_ID,
            created_at: new Date().toISOString(),
          },
        ];
      }
    }
    await writeTable('routines', rows);
  });
}

export async function localDeleteRoutine(id: string): Promise<void> {
  await withTableLock('routines', async () => {
    const rows = await readTable<RoutineRow>('routines');
    await writeTable('routines', rows.filter((row) => row.id !== id));
  });
  await withTableLock('routine_logs', async () => {
    const logs = await readTable<RoutineLogRow>('routine_logs');
    await writeTable('routine_logs', logs.filter((log) => log.routine_id !== id));
  });
}

export async function localListRoutineLogs(
  sinceDate: string,
): Promise<Pick<RoutineLogRow, 'routine_id' | 'log_date'>[]> {
  const logs = await readTable<RoutineLogRow>('routine_logs');
  return logs
    .filter((log) => log.log_date >= sinceDate)
    .map(({ routine_id, log_date }) => ({ routine_id, log_date }));
}

export async function localSetRoutineLogDone(
  routineId: string,
  logDate: string,
  done: boolean,
): Promise<void> {
  await withTableLock('routine_logs', async () => {
    const logs = await readTable<RoutineLogRow>('routine_logs');
    const rest = logs.filter((log) => !(log.routine_id === routineId && log.log_date === logDate));
    if (!done) {
      await writeTable('routine_logs', rest);
      return;
    }
    await writeTable('routine_logs', [
      ...rest,
      {
        id: generateId(),
        user_id: DEV_USER_ID,
        routine_id: routineId,
        log_date: logDate,
        created_at: new Date().toISOString(),
      },
    ]);
  });
}

// ───────────────────────── 메모 (notes) ─────────────────────────

type NoteRow = Tables<'notes'>;

export async function localListNotes(): Promise<NoteRow[]> {
  const rows = await readTable<NoteRow>('notes');
  return [...rows].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return cmpDesc(a.updated_at, b.updated_at);
  });
}

export async function localGetNote(id: string): Promise<NoteRow | null> {
  const rows = await readTable<NoteRow>('notes');
  return rows.find((row) => row.id === id) ?? null;
}

export async function localSaveNote(
  id: string | null,
  draft: { title: string; body: string; pinned: boolean },
): Promise<NoteRow | null> {
  return withTableLock('notes', async () => {
    const rows = await readTable<NoteRow>('notes');
    const now = new Date().toISOString();
    if (id) {
      let updated: NoteRow | null = null;
      const next = rows.map((row) => {
        if (row.id !== id) return row;
        updated = { ...row, ...draft, updated_at: now };
        return updated;
      });
      if (!updated) return null;
      await writeTable('notes', next);
      return updated;
    }
    const created: NoteRow = {
      id: generateId(),
      user_id: DEV_USER_ID,
      title: draft.title,
      body: draft.body,
      pinned: draft.pinned,
      created_at: now,
      updated_at: now,
    };
    await writeTable('notes', [created, ...rows]);
    return created;
  });
}

export async function localDeleteNote(id: string): Promise<void> {
  await withTableLock('notes', async () => {
    const rows = await readTable<NoteRow>('notes');
    await writeTable('notes', rows.filter((row) => row.id !== id));
  });
}

export async function localDeleteNotes(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const target = new Set(ids);
  await withTableLock('notes', async () => {
    const rows = await readTable<NoteRow>('notes');
    await writeTable('notes', rows.filter((row) => !target.has(row.id)));
  });
}

// ───────────────────────── 태그 (tags) ─────────────────────────

type TagRow = Tables<'tags'>;

export async function localListTags(): Promise<TagRow[]> {
  const rows = await readTable<TagRow>('tags');
  return [...rows].sort((a, b) => cmpAsc(a.created_at, b.created_at));
}

export async function localSaveTag(
  id: string | undefined,
  name: string,
  color: string,
): Promise<TagRow> {
  return withTableLock('tags', async () => {
    const rows = await readTable<TagRow>('tags');
    if (id) {
      let updated: TagRow | null = null;
      const next = rows.map((row) => {
        if (row.id !== id) return row;
        updated = { ...row, name, color };
        return updated;
      });
      if (!updated) throw new Error('태그를 찾지 못했습니다.');
      await writeTable('tags', next);
      return updated;
    }
    const created: TagRow = {
      id: generateId(),
      user_id: DEV_USER_ID,
      name,
      color,
      created_at: new Date().toISOString(),
    };
    await writeTable('tags', [...rows, created]);
    return created;
  });
}

export async function localDeleteTag(id: string): Promise<void> {
  await withTableLock('tags', async () => {
    const rows = await readTable<TagRow>('tags');
    await writeTable('tags', rows.filter((row) => row.id !== id));
  });
  await withTableLock('todos', async () => {
    const todos = await readTable<TodoRow>('todos');
    if (todos.some((t) => t.tag_id === id)) {
      await writeTable(
        'todos',
        todos.map((t) => (t.tag_id === id ? { ...t, tag_id: null } : t)),
      );
    }
  });
  await withTableLock('events', async () => {
    const events = await readTable<EventRow>('events');
    if (events.some((e) => e.tag_id === id)) {
      await writeTable(
        'events',
        events.map((e) => (e.tag_id === id ? { ...e, tag_id: null } : e)),
      );
    }
  });
}

// ───────────────────────── 날씨 지역 (weather_city) ─────────────────────────

export async function localGetWeatherCity(): Promise<City | null> {
  if (weatherCityCache !== undefined) return weatherCityCache;
  const raw = await AsyncStorage.getItem(`${DB_PREFIX}weather_city`);
  if (!raw) {
    weatherCityCache = null;
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<City>;
    if (
      parsed &&
      typeof parsed.id === 'string' &&
      typeof parsed.name === 'string' &&
      typeof parsed.latitude === 'number' &&
      typeof parsed.longitude === 'number'
    ) {
      weatherCityCache = parsed as City;
      return weatherCityCache;
    }
    weatherCityCache = null;
    return null;
  } catch {
    weatherCityCache = null;
    return null;
  }
}

export async function localSaveWeatherCity(city: City): Promise<void> {
  weatherCityCache = city;
  await AsyncStorage.setItem(`${DB_PREFIX}weather_city`, JSON.stringify(city));
}

// ───────────────────────── 공부 (study) ─────────────────────────

type StudyProfileRow = Tables<'study_profiles'>;
type StudySubjectRow = Tables<'study_subjects'>;
type StudySessionRow = Tables<'study_sessions'>;

export async function localGetStudyProfile(): Promise<StudyProfileRow | null> {
  const rows = await readTable<StudyProfileRow>('study_profiles');
  return rows[0] ?? null;
}

export async function localSaveStudyProfile(values: {
  nickname: string;
  status_message: string;
  daily_goal_minutes: number;
  public_ranking: boolean;
}): Promise<void> {
  await withTableLock('study_profiles', async () => {
    const existing = (await readTable<StudyProfileRow>('study_profiles'))[0];
    const now = new Date().toISOString();
    const next: StudyProfileRow = {
      user_id: DEV_USER_ID,
      nickname: values.nickname,
      status_message: values.status_message,
      daily_goal_minutes: values.daily_goal_minutes,
      public_ranking: values.public_ranking,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };
    await writeTable('study_profiles', [next]);
  });
}

export async function localListStudySubjects(): Promise<StudySubjectRow[]> {
  const rows = await readTable<StudySubjectRow>('study_subjects');
  return [...rows].sort((a, b) => a.sort - b.sort || cmpAsc(a.created_at, b.created_at));
}

export async function localSaveStudySubject(
  id: string | undefined,
  values: { name: string; color: string },
): Promise<void> {
  await withTableLock('study_subjects', async () => {
    const rows = await readTable<StudySubjectRow>('study_subjects');
    if (id) {
      await writeTable(
        'study_subjects',
        rows.map((row) => (row.id === id ? { ...row, ...values } : row)),
      );
      return;
    }
    const created: StudySubjectRow = {
      id: generateId(),
      user_id: DEV_USER_ID,
      name: values.name,
      color: values.color,
      sort: rows.length,
      created_at: new Date().toISOString(),
    };
    await writeTable('study_subjects', [...rows, created]);
  });
}

export async function localAddStudySubjects(
  list: { name: string; color: string }[],
): Promise<void> {
  await withTableLock('study_subjects', async () => {
    const rows = await readTable<StudySubjectRow>('study_subjects');
    const now = new Date().toISOString();
    const created: StudySubjectRow[] = list.map((values, index) => ({
      id: generateId(),
      user_id: DEV_USER_ID,
      name: values.name,
      color: values.color,
      sort: rows.length + index,
      created_at: now,
    }));
    await writeTable('study_subjects', [...rows, ...created]);
  });
}

export async function localDeleteStudySubject(id: string): Promise<void> {
  await withTableLock('study_subjects', async () => {
    const rows = await readTable<StudySubjectRow>('study_subjects');
    await writeTable('study_subjects', rows.filter((row) => row.id !== id));
  });
  await withTableLock('study_sessions', async () => {
    const sessions = await readTable<StudySessionRow>('study_sessions');
    if (sessions.some((s) => s.subject_id === id)) {
      await writeTable(
        'study_sessions',
        sessions.map((s) => (s.subject_id === id ? { ...s, subject_id: null } : s)),
      );
    }
  });
}

export async function localListStudySessions(
  from: string,
  to: string,
): Promise<StudySessionRow[]> {
  const rows = await readTable<StudySessionRow>('study_sessions');
  return rows
    .filter((row) => row.study_date >= from && row.study_date <= to)
    .sort((a, b) => cmpAsc(a.started_at, b.started_at));
}

export async function localAddStudySession(values: {
  subject_id: string | null;
  study_date: string;
  started_at: string;
  ended_at: string;
  seconds: number;
}): Promise<void> {
  await withTableLock('study_sessions', async () => {
    const rows = await readTable<StudySessionRow>('study_sessions');
    const created: StudySessionRow = {
      id: generateId(),
      user_id: DEV_USER_ID,
      subject_id: values.subject_id,
      study_date: values.study_date,
      started_at: values.started_at,
      ended_at: values.ended_at,
      seconds: values.seconds,
      created_at: new Date().toISOString(),
    };
    await writeTable('study_sessions', [...rows, created]);
  });
}

export async function localDeleteStudySession(id: string): Promise<void> {
  await withTableLock('study_sessions', async () => {
    const rows = await readTable<StudySessionRow>('study_sessions');
    await writeTable('study_sessions', rows.filter((row) => row.id !== id));
  });
}
