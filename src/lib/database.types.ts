/**
 * Supabase 데이터베이스의 테이블 모양을 TypeScript 타입으로 옮긴 파일.
 * supabase/migrations 의 구조를 바꾸면 이 파일도 다시 만들어야 한다.
 * (Supabase CLI: `npx supabase gen types typescript --project-id <프로젝트 ID>`)
 */

type Table<Row, Optional extends keyof Row> = {
  Row: Row;
  Insert: Omit<Row, Optional> & Partial<Pick<Row, Optional>>;
  Update: Partial<Row>;
  Relationships: [];
};

type TodoRow = {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  due_date: string | null;
  /** 시작일. 시작일 ~ 마감일 기간이 달력에 보인다 (없으면 마감일 하루) */
  start_date: string | null;
  priority: number;
  done: boolean;
  done_at: string | null;
  created_at: string;
  /** 반복 방법: 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly' (반복 안 하면 null) */
  repeat: string | null;
  /** 반복의 기준 날짜 */
  repeat_start: string | null;
  /** 이 할 일을 자동으로 만든 이전 할 일의 id */
  previous_id: string | null;
  /** 붙인 태그의 id (없으면 null) */
  tag_id: string | null;
};

type EventRow = {
  id: string;
  user_id: string;
  title: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  memo: string | null;
  created_at: string;
  /** 반복 방법 (반복 안 하면 null) */
  repeat: string | null;
  /** 반복이 끝나는 날 (없으면 계속) */
  repeat_until: string | null;
  /** 붙인 태그의 id (없으면 null) */
  tag_id: string | null;
  /** 반복 중 빠진 날짜들 (구글 캘린더에서 그날만 지운 경우 등) */
  excluded_dates: string[];
  /** 구글 캘린더 쪽 같은 일정의 id (서버만 바꾼다) */
  google_event_id: string | null;
  /** 아직 구글에 보내지 않은 변경이 있는지 (서버만 바꾼다) */
  google_dirty: boolean;
  /** 앱에서 고칠 때마다 1씩 늘어나는 번호 (서버만 바꾼다) */
  local_version: number;
  /** 구글에서 받은 원래 모양 중 멀어서가 담지 못하는 정보 (서버만 바꾼다) */
  google_original: unknown;
};

/** 할 일·일정에 붙이는 색상 태그 */
type TagRow = {
  id: string;
  user_id: string;
  name: string;
  /** 색 이름 (예: 'red', 'blue'). 실제 색은 src/lib/tags.ts 에 있다. */
  color: string;
  created_at: string;
};

type HabitRow = {
  id: string;
  user_id: string;
  name: string;
  archived: boolean;
  created_at: string;
};

type HabitLogRow = {
  id: string;
  user_id: string;
  habit_id: string;
  log_date: string;
  created_at: string;
};

type NoteRow = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
};

type TransactionRow = {
  id: string;
  user_id: string;
  kind: string;
  amount: number;
  category: string;
  memo: string | null;
  occurred_on: string;
  /** 기록 경로: 'manual'(직접) / 'notification'(결제 알림) / 'import'(엑셀 가져오기) */
  source: string;
  created_at: string;
  /** 결제한 시각 (알 수 있을 때만) */
  occurred_at: string | null;
  /** 자동 입력 한 건을 구별하는 이름 (같은 것이 두 번 들어오지 않게) */
  external_id: string | null;
};

type UserSettingsRow = {
  user_id: string;
  weather_place_id: string | null;
  weather_name: string | null;
  weather_detail: string | null;
  weather_latitude: number | null;
  weather_longitude: number | null;
  updated_at: string;
};

type ErrorLogRow = {
  id: string;
  user_id: string;
  created_at: string;
  source: string;
  message: string;
  detail: string | null;
  platform: string;
  app_version: string | null;
};

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.18';
  };
  public: {
    Tables: {
      todos: Table<
        TodoRow,
        | 'id'
        | 'user_id'
        | 'notes'
        | 'due_date'
        | 'start_date'
        | 'priority'
        | 'done'
        | 'done_at'
        | 'created_at'
        | 'repeat'
        | 'repeat_start'
        | 'previous_id'
        | 'tag_id'
      >;
      events: Table<
        EventRow,
        | 'id'
        | 'user_id'
        | 'start_time'
        | 'end_time'
        | 'memo'
        | 'created_at'
        | 'repeat'
        | 'repeat_until'
        | 'tag_id'
        | 'excluded_dates'
        | 'google_event_id'
        | 'google_dirty'
        | 'local_version'
        | 'google_original'
      >;
      tags: Table<TagRow, 'id' | 'user_id' | 'created_at'>;
      habits: Table<HabitRow, 'id' | 'user_id' | 'archived' | 'created_at'>;
      habit_logs: Table<HabitLogRow, 'id' | 'user_id' | 'created_at'>;
      notes: Table<
        NoteRow,
        'id' | 'user_id' | 'title' | 'body' | 'pinned' | 'created_at' | 'updated_at'
      >;
      transactions: Table<
        TransactionRow,
        | 'id'
        | 'user_id'
        | 'memo'
        | 'occurred_on'
        | 'source'
        | 'created_at'
        | 'occurred_at'
        | 'external_id'
      >;
      user_settings: Table<
        UserSettingsRow,
        | 'user_id'
        | 'weather_place_id'
        | 'weather_name'
        | 'weather_detail'
        | 'weather_latitude'
        | 'weather_longitude'
        | 'updated_at'
      >;
      error_logs: Table<
        ErrorLogRow,
        'id' | 'user_id' | 'created_at' | 'detail' | 'app_version'
      >;
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

/** 테이블 한 행의 타입. 예: Tables<'todos'> */
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
