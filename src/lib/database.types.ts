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
  /** 그 일정이 들어 있는 구글 캘린더의 id (서버만 바꾼다) */
  google_calendar_id: string | null;
  /** 남이 만든 회의 초대처럼 구글에서만 고칠 수 있는 일정인지 (서버만 바꾼다) */
  google_readonly: boolean;
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

/** 하루 루틴 한 항목. 예: 06:10 샤워 */
type RoutineRow = {
  id: string;
  user_id: string;
  title: string;
  /** 하는 시각 'HH:MM:SS' */
  time_of_day: string;
  /** 하는 요일들 (0=일 … 6=토) */
  weekdays: number[];
  /** 'normal'(보통) 또는 'briefing'(아침 브리핑: 알림에 할 일·일정·날씨 요약을 담는다) */
  kind: string;
  /** 그 시각에 휴대폰 알림을 보낼지 */
  notify: boolean;
  created_at: string;
};

/** 루틴을 완료한 날짜 기록 */
type RoutineLogRow = {
  id: string;
  user_id: string;
  routine_id: string;
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

type StudyProfileRow = {
  user_id: string;
  /** 공부 화면에서 다른 사람에게 보이는 이름 (2~12자) */
  nickname: string;
  /** 한 줄 다짐 (40자까지) */
  status_message: string;
  /** 하루 목표 공부 시간(분) */
  daily_goal_minutes: number;
  /** 전체 랭킹에 참여하는지 */
  public_ranking: boolean;
  created_at: string;
  updated_at: string;
};

type StudySubjectRow = {
  id: string;
  user_id: string;
  name: string;
  /** 태그와 같은 색 이름 (lib/tags.ts 의 TAG_COLORS) */
  color: string;
  sort: number;
  created_at: string;
};

type StudySessionRow = {
  id: string;
  user_id: string;
  subject_id: string | null;
  /** 어느 날의 공부로 칠지 'YYYY-MM-DD' */
  study_date: string;
  started_at: string;
  ended_at: string;
  seconds: number;
  created_at: string;
};

type StudyLiveRow = {
  user_id: string;
  subject_name: string | null;
  started_at: string;
  updated_at: string;
};

type StudyGroupRow = {
  id: string;
  name: string;
  description: string;
  invite_code: string;
  owner_id: string;
  created_at: string;
};

type StudyGroupMemberRow = {
  group_id: string;
  user_id: string;
  joined_at: string;
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
        | 'google_calendar_id'
        | 'google_readonly'
        | 'google_dirty'
        | 'local_version'
        | 'google_original'
      >;
      tags: Table<TagRow, 'id' | 'user_id' | 'created_at'>;
      habits: Table<HabitRow, 'id' | 'user_id' | 'archived' | 'created_at'>;
      habit_logs: Table<HabitLogRow, 'id' | 'user_id' | 'created_at'>;
      routines: Table<
        RoutineRow,
        'id' | 'user_id' | 'weekdays' | 'kind' | 'notify' | 'created_at'
      >;
      routine_logs: Table<RoutineLogRow, 'id' | 'user_id' | 'created_at'>;
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
      study_profiles: Table<
        StudyProfileRow,
        | 'user_id'
        | 'status_message'
        | 'daily_goal_minutes'
        | 'public_ranking'
        | 'created_at'
        | 'updated_at'
      >;
      study_subjects: Table<StudySubjectRow, 'id' | 'user_id' | 'color' | 'sort' | 'created_at'>;
      study_sessions: Table<StudySessionRow, 'id' | 'user_id' | 'subject_id' | 'created_at'>;
      study_live: Table<StudyLiveRow, 'user_id' | 'subject_name' | 'updated_at'>;
      study_groups: Table<StudyGroupRow, 'id' | 'description' | 'created_at'>;
      study_group_members: Table<StudyGroupMemberRow, 'joined_at'>;
    };
    Views: { [_ in never]: never };
    Functions: {
      create_study_group: { Args: { p_name: string; p_description?: string }; Returns: string };
      join_study_group: { Args: { p_code: string }; Returns: string };
      leave_study_group: { Args: { p_group: string }; Returns: undefined };
      kick_study_group_member: { Args: { p_group: string; p_user: string }; Returns: undefined };
      study_group_board: {
        Args: { p_group: string; p_from: string; p_to: string };
        Returns: {
          user_id: string;
          nickname: string;
          status_message: string;
          total_seconds: number;
          live_started_at: string | null;
          live_subject: string | null;
          is_me: boolean;
          is_owner: boolean;
        }[];
      };
      study_ranking: {
        Args: { p_from: string; p_to: string; p_limit?: number };
        Returns: {
          rank: number;
          nickname: string;
          status_message: string;
          total_seconds: number;
          live_started_at: string | null;
          is_me: boolean;
        }[];
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

/** 테이블 한 행의 타입. 예: Tables<'todos'> */
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
