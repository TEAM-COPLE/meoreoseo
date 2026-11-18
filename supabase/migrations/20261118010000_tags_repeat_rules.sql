-- 색상 태그 · 다양한 반복 · 시작일만 있는 할 일
--
-- 1) 시작일과 마감일은 각각 따로 비워 둘 수 있다. 둘 다 있으면 시작일이 마감일보다 늦을 수 없다.
-- 2) 반복 방법에 새 형식을 더한다. 예전 값(daily, weekdays, weekly, monthly, yearly)은 그대로 쓴다.
--      every:<간격>:day                 N일마다
--      every:<간격>:week[:요일들]       N주마다 (요일: 0=일 … 6=토, 예: every:1:week:1,3,5 = 매주 월·수·금)
--      every:<간격>:month[:last|nth]    N개월마다 (같은 날짜 / 마지막 날 / 몇째 주 무슨 요일)
--      every:<간격>:year                N년마다
-- 3) 태그: 이름과 색을 가진 꼬리표. 할 일과 일정에 하나씩 붙여 색으로 구분한다.
--    태그를 지우면 붙어 있던 할 일·일정은 태그만 사라지고 그대로 남는다.

-- ───────────────────────── 1) 시작일 ─────────────────────────
alter table public.todos drop constraint todos_start_before_due;
alter table public.todos
  add constraint todos_start_before_due check (
    start_date is null or due_date is null or start_date <= due_date
  );

-- ───────────────────────── 2) 반복 방법 ─────────────────────────
alter table public.todos drop constraint todos_repeat_check;
alter table public.todos
  add constraint todos_repeat_check check (
    repeat ~ '^(daily|weekdays|weekly|monthly|yearly)$'
    or repeat ~ '^every:[1-9][0-9]?:(day|year|week(:[0-6](,[0-6]){0,6})?|month(:(last|nth))?)$'
  );

alter table public.events drop constraint events_repeat_check;
alter table public.events
  add constraint events_repeat_check check (
    repeat ~ '^(daily|weekdays|weekly|monthly|yearly)$'
    or repeat ~ '^every:[1-9][0-9]?:(day|year|week(:[0-6](,[0-6]){0,6})?|month(:(last|nth))?)$'
  );

-- ───────────────────────── 3) 태그 ─────────────────────────
create table public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  -- 앱에 정해 둔 색 이름 중 하나
  color text not null check (
    color in ('red', 'orange', 'yellow', 'green', 'teal', 'blue', 'indigo', 'purple', 'pink', 'gray')
  ),
  created_at timestamptz not null default now(),
  -- 할 일·일정이 "내 태그"만 가리키도록 (id, 주인) 짝으로 연결한다.
  unique (id, user_id)
);
create index tags_user_idx on public.tags (user_id, created_at);

alter table public.tags enable row level security;
create policy "본인 태그만" on public.tags
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.tags from anon;
grant select, insert, update, delete on public.tags to authenticated;

create trigger tags_preserve_immutable before update on public.tags
  for each row execute function public.preserve_immutable_fields();

alter table public.todos
  add column tag_id uuid,
  add constraint todos_tag_fkey foreign key (tag_id, user_id)
    references public.tags (id, user_id) on delete set null (tag_id);
create index todos_tag_idx on public.todos (tag_id) where tag_id is not null;

alter table public.events
  add column tag_id uuid,
  add constraint events_tag_fkey foreign key (tag_id, user_id)
    references public.tags (id, user_id) on delete set null (tag_id);
create index events_tag_idx on public.events (tag_id) where tag_id is not null;
