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
  priority: number;
  done: boolean;
  done_at: string | null;
  created_at: string;
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
  source: string;
  created_at: string;
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
        'id' | 'user_id' | 'notes' | 'due_date' | 'priority' | 'done' | 'done_at' | 'created_at'
      >;
      events: Table<
        EventRow,
        'id' | 'user_id' | 'start_time' | 'end_time' | 'memo' | 'created_at'
      >;
      habits: Table<HabitRow, 'id' | 'user_id' | 'archived' | 'created_at'>;
      habit_logs: Table<HabitLogRow, 'id' | 'user_id' | 'created_at'>;
      notes: Table<
        NoteRow,
        'id' | 'user_id' | 'title' | 'body' | 'pinned' | 'created_at' | 'updated_at'
      >;
      transactions: Table<
        TransactionRow,
        'id' | 'user_id' | 'memo' | 'occurred_on' | 'source' | 'created_at'
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
