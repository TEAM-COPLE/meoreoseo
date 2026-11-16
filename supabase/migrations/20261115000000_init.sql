-- 멀어서(meoreoseo) 초기 데이터베이스 구조
--
-- 원칙
-- 1. 모든 테이블에 user_id가 있고, 기본값은 "지금 로그인한 사용자"(auth.uid())다.
-- 2. 모든 테이블에 Row Level Security(RLS)를 켠다.
--    → 로그인한 사용자는 user_id가 자기 것인 행만 읽고 쓸 수 있다.
-- 3. 로그인하지 않은 사용자(anon)는 아무 테이블에도 접근할 수 없다.

-- ───────────────────────── 할 일 ─────────────────────────
create table public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  notes text,
  due_date date,
  -- 0: 보통, 1: 중요, 2: 매우 중요
  priority smallint not null default 0 check (priority between 0 and 2),
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index todos_user_idx on public.todos (user_id, done, due_date);

-- ───────────────────────── 일정 ─────────────────────────
create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  event_date date not null,
  start_time time,
  end_time time,
  memo text,
  created_at timestamptz not null default now()
);
create index events_user_date_idx on public.events (user_id, event_date);

-- ───────────────────────── 습관 ─────────────────────────
create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index habits_user_idx on public.habits (user_id, archived);

-- 습관을 실천한 날짜 기록. 같은 습관은 하루에 한 번만 기록된다.
create table public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  habit_id uuid not null references public.habits (id) on delete cascade,
  log_date date not null,
  created_at timestamptz not null default now(),
  unique (habit_id, log_date)
);
create index habit_logs_user_date_idx on public.habit_logs (user_id, log_date);

-- ───────────────────────── 메모 ─────────────────────────
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '',
  body text not null default '',
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notes_user_idx on public.notes (user_id, pinned, updated_at desc);

-- ───────────────────────── 가계부 ─────────────────────────
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('expense', 'income')),
  -- 원 단위 정수
  amount bigint not null check (amount > 0),
  category text not null check (char_length(category) between 1 and 50),
  memo text,
  occurred_on date not null default current_date,
  -- 기록 경로. 지금은 직접 입력('manual')만 있고,
  -- 나중에 결제 알림 자동 인식('notification')을 추가할 자리다.
  source text not null default 'manual' check (source in ('manual', 'notification')),
  created_at timestamptz not null default now()
);
create index transactions_user_date_idx on public.transactions (user_id, occurred_on);

-- ───────────────────────── 접근 규칙 ─────────────────────────
alter table public.todos enable row level security;
alter table public.events enable row level security;
alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;
alter table public.notes enable row level security;
alter table public.transactions enable row level security;

create policy "본인 할 일만" on public.todos
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "본인 일정만" on public.events
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "본인 습관만" on public.habits
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 습관 기록은 "내 기록"이면서 "내 습관"에 대한 것이어야 한다.
create policy "본인 습관 기록만" on public.habit_logs
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.habits h
      where h.id = habit_id and h.user_id = (select auth.uid())
    )
  );

create policy "본인 메모만" on public.notes
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "본인 가계부만" on public.transactions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 로그인한 사용자에게만 테이블 권한을 주고, 비로그인 사용자의 권한은 거둔다.
revoke all on public.todos, public.events, public.habits,
  public.habit_logs, public.notes, public.transactions from anon;

grant select, insert, update, delete on public.todos, public.events, public.habits,
  public.habit_logs, public.notes, public.transactions to authenticated;
