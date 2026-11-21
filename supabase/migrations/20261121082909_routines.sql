-- 하루 루틴
--
-- 1) routines: "몇 시에 무엇을 할지" 정해 둔 항목. 예: 06:00 아침 브리핑, 06:10 샤워, 07:00 운동
--    weekdays : 그 루틴을 하는 요일 (0=일 … 6=토). 하루 이상 골라야 한다.
--    kind     : 'normal'(보통 루틴) 또는 'briefing'(아침 브리핑. 알림에 오늘 할 일·일정·날씨를 담는다)
--    notify   : 그 시각에 휴대폰 알림을 보낼지
-- 2) routine_logs: 루틴을 완료한 날짜 기록. 같은 루틴은 하루에 한 번만 기록된다.

create table public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  time_of_day time not null,
  weekdays smallint[] not null default '{0,1,2,3,4,5,6}'
    check (cardinality(weekdays) between 1 and 7 and weekdays <@ '{0,1,2,3,4,5,6}'::smallint[]),
  kind text not null default 'normal' check (kind in ('normal', 'briefing')),
  notify boolean not null default true,
  created_at timestamptz not null default now()
);
create index routines_user_idx on public.routines (user_id, time_of_day);

create table public.routine_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  routine_id uuid not null references public.routines (id) on delete cascade,
  log_date date not null,
  created_at timestamptz not null default now(),
  unique (routine_id, log_date)
);
create index routine_logs_user_date_idx on public.routine_logs (user_id, log_date);
create index routine_logs_routine_idx on public.routine_logs (routine_id);

-- ───────────────────────── 본인 것만 보고 고치기 ─────────────────────────
alter table public.routines enable row level security;
alter table public.routine_logs enable row level security;

create policy "본인 루틴만" on public.routines
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 완료 기록은 본인 루틴에만 남길 수 있다.
create policy "본인 루틴 기록만" on public.routine_logs
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.routines r
      where r.id = routine_id and r.user_id = (select auth.uid())
    )
  );

revoke all on public.routines, public.routine_logs from anon;
grant select, insert, update, delete on public.routines, public.routine_logs to authenticated;

-- 수정할 때 id, 주인(user_id), 만든 시각(created_at)은 바꿀 수 없다.
create trigger routines_preserve_immutable before update on public.routines
  for each row execute function public.preserve_immutable_fields();
create trigger routine_logs_preserve_immutable before update on public.routine_logs
  for each row execute function public.preserve_immutable_fields();
