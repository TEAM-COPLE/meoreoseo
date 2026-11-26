-- 공부 타이머 (공부 시간 기록 + 스터디 그룹 + 전체 랭킹)
--
-- 1) study_profiles      : 공부할 때 쓰는 이름(닉네임), 한 줄 다짐, 하루 목표, 전체 랭킹 참여 여부
-- 2) study_subjects      : 과목 (국어, 수학 …). 색은 태그와 같은 색 이름을 쓴다.
-- 3) study_sessions      : 공부한 기록 한 조각 (시작~끝). 타이머를 멈출 때마다 한 줄씩 생긴다.
-- 4) study_live          : "지금 공부 중" 표시. 타이머를 켜면 생기고 멈추면 지워진다.
-- 5) study_groups        : 스터디 그룹. 초대 코드로 들어온다.
-- 6) study_group_members : 그룹에 누가 들어 있는지
--
-- 다른 사람의 기록은 표를 직접 읽을 수 없고, 아래 함수(study_group_board, study_ranking)로
-- "닉네임과 합계 시간"만 볼 수 있다.

create extension if not exists btree_gist with schema extensions;

-- ───────────────────────── 1) 프로필 ─────────────────────────
create table public.study_profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  nickname text not null
    check (char_length(nickname) between 2 and 12 and nickname = btrim(nickname)),
  status_message text not null default '' check (char_length(status_message) <= 40),
  daily_goal_minutes integer not null default 180 check (daily_goal_minutes between 10 and 1440),
  public_ranking boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- 닉네임은 대소문자 구분 없이 한 사람만 쓸 수 있다.
create unique index study_profiles_nickname_key on public.study_profiles (lower(nickname));

-- 수정할 때 주인과 만든 시각은 그대로 두고, 고친 시각만 새로 적는다.
create or replace function public.study_profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.user_id := old.user_id;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;
create trigger study_profiles_guard before update on public.study_profiles
  for each row execute function public.study_profiles_guard();

-- ───────────────────────── 2) 과목 ─────────────────────────
create table public.study_subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 20 and name = btrim(name)),
  color text not null default 'blue'
    check (color in ('red','orange','yellow','green','teal','blue','indigo','purple','pink','gray')),
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create index study_subjects_user_idx on public.study_subjects (user_id, sort);

-- ───────────────────────── 3) 공부 기록 ─────────────────────────
create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id uuid,
  -- 어느 날의 공부로 칠지 (사용자 휴대폰 기준 날짜)
  study_date date not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  seconds integer not null check (seconds between 1 and 43200),
  created_at timestamptz not null default now(),
  check (ended_at > started_at),
  -- 실제 걸린 시간보다 길게 적을 수 없다.
  check (seconds <= ceil(extract(epoch from (ended_at - started_at))) + 1),
  -- 과목은 내 과목만. 과목을 지우면 기록은 남고 과목만 비워진다.
  foreign key (subject_id, user_id) references public.study_subjects (id, user_id)
    on delete set null (subject_id),
  -- 같은 사람의 기록 시간이 서로 겹칠 수 없다 (두 기기로 동시에 재서 두 배로 쌓는 것 방지).
  constraint study_sessions_no_overlap
    exclude using gist (user_id with =, tstzrange(started_at, ended_at) with &&)
);
create index study_sessions_user_date_idx on public.study_sessions (user_id, study_date);
create index study_sessions_date_idx on public.study_sessions (study_date);

-- ───────────────────────── 4) 지금 공부 중 ─────────────────────────
create table public.study_live (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  subject_name text check (subject_name is null or char_length(subject_name) <= 20),
  started_at timestamptz not null,
  updated_at timestamptz not null default now()
);

-- ───────────────────────── 5·6) 스터디 그룹 ─────────────────────────
create table public.study_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 30 and name = btrim(name)),
  description text not null default '' check (char_length(description) <= 100),
  invite_code text not null unique check (invite_code ~ '^[A-Z0-9]{8}$'),
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.study_group_members (
  group_id uuid not null references public.study_groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index study_group_members_user_idx on public.study_group_members (user_id);

-- 내가 그 그룹에 들어 있는지 (보안 규칙 안에서 쓴다)
create or replace function public.is_study_group_member(p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.study_group_members m
    where m.group_id = p_group and m.user_id = (select auth.uid())
  );
$$;

-- ───────────────────────── 보안 규칙 ─────────────────────────
alter table public.study_profiles enable row level security;
alter table public.study_subjects enable row level security;
alter table public.study_sessions enable row level security;
alter table public.study_live enable row level security;
alter table public.study_groups enable row level security;
alter table public.study_group_members enable row level security;

create policy "본인 프로필" on public.study_profiles
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "본인 과목" on public.study_subjects
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "본인 기록 보기" on public.study_sessions
  for select to authenticated
  using ((select auth.uid()) = user_id);
-- 기록은 "방금 끝난 공부"만 넣을 수 있다. 지난 날짜에 몰래 시간을 채워 넣는 것을 막는다.
create policy "본인 기록 넣기" on public.study_sessions
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and ended_at <= now() + interval '2 minutes'
    and started_at >= now() - interval '13 hours'
    and study_date between (started_at at time zone 'UTC')::date - 1
                       and (started_at at time zone 'UTC')::date + 1
  );
create policy "본인 기록 지우기" on public.study_sessions
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "본인 공부 중 표시" on public.study_live
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "내 그룹 보기" on public.study_groups
  for select to authenticated
  using (public.is_study_group_member(id));
create policy "방장만 그룹 고치기" on public.study_groups
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy "방장만 그룹 지우기" on public.study_groups
  for delete to authenticated
  using ((select auth.uid()) = owner_id);

create policy "같은 그룹 사람 보기" on public.study_group_members
  for select to authenticated
  using (public.is_study_group_member(group_id));

-- 그룹 이름·설명만 고칠 수 있다 (초대 코드·방장은 함수로만 바뀐다).
create or replace function public.study_groups_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.id := old.id;
  new.invite_code := old.invite_code;
  new.owner_id := old.owner_id;
  new.created_at := old.created_at;
  return new;
end;
$$;
create trigger study_groups_guard before update on public.study_groups
  for each row execute function public.study_groups_guard();

create trigger study_subjects_preserve_immutable before update on public.study_subjects
  for each row execute function public.preserve_immutable_fields();

revoke all on public.study_profiles, public.study_subjects, public.study_sessions,
  public.study_live, public.study_groups, public.study_group_members from anon;
grant select, insert, update, delete on public.study_profiles, public.study_subjects,
  public.study_live to authenticated;
grant select, insert, delete on public.study_sessions to authenticated;
grant select, update (name, description), delete on public.study_groups to authenticated;
grant select on public.study_group_members to authenticated;

-- ───────────────────────── 함수: 그룹 만들기·들어가기·나가기 ─────────────────────────

/** 헷갈리는 글자(0, O, 1, I)를 뺀 8글자 초대 코드 */
create or replace function public.study_new_invite_code()
returns text
language plpgsql
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..8 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.study_groups g where g.invite_code = code);
  end loop;
  return code;
end;
$$;

create or replace function public.create_study_group(p_name text, p_description text default '')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  new_id uuid;
begin
  if me is null then raise exception '로그인이 필요합니다.'; end if;
  if not exists (select 1 from public.study_profiles p where p.user_id = me) then
    raise exception '먼저 공부 프로필(닉네임)을 만들어 주세요.';
  end if;
  if (select count(*) from public.study_group_members m where m.user_id = me) >= 20 then
    raise exception '그룹은 20개까지 들어갈 수 있어요.';
  end if;
  insert into public.study_groups (name, description, invite_code, owner_id)
  values (btrim(p_name), coalesce(btrim(p_description), ''), public.study_new_invite_code(), me)
  returning id into new_id;
  insert into public.study_group_members (group_id, user_id) values (new_id, me);
  return new_id;
end;
$$;

create or replace function public.join_study_group(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  target uuid;
begin
  if me is null then raise exception '로그인이 필요합니다.'; end if;
  if not exists (select 1 from public.study_profiles p where p.user_id = me) then
    raise exception '먼저 공부 프로필(닉네임)을 만들어 주세요.';
  end if;
  select g.id into target from public.study_groups g where g.invite_code = upper(btrim(p_code));
  if target is null then raise exception '초대 코드가 맞지 않아요.'; end if;
  if exists (select 1 from public.study_group_members m where m.group_id = target and m.user_id = me) then
    return target;
  end if;
  if (select count(*) from public.study_group_members m where m.user_id = me) >= 20 then
    raise exception '그룹은 20개까지 들어갈 수 있어요.';
  end if;
  if (select count(*) from public.study_group_members m where m.group_id = target) >= 50 then
    raise exception '이 그룹은 인원(50명)이 가득 찼어요.';
  end if;
  insert into public.study_group_members (group_id, user_id) values (target, me);
  return target;
end;
$$;

-- 그룹에서 나간다. 방장이 나가면 가장 먼저 들어온 사람이 방장이 되고, 아무도 없으면 그룹이 사라진다.
create or replace function public.leave_study_group(p_group uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  next_owner uuid;
begin
  if me is null then raise exception '로그인이 필요합니다.'; end if;
  delete from public.study_group_members m where m.group_id = p_group and m.user_id = me;
  if exists (select 1 from public.study_groups g where g.id = p_group and g.owner_id = me) then
    select m.user_id into next_owner from public.study_group_members m
      where m.group_id = p_group order by m.joined_at limit 1;
    if next_owner is null then
      delete from public.study_groups g where g.id = p_group;
    else
      update public.study_groups g set owner_id = next_owner where g.id = p_group;
    end if;
  end if;
end;
$$;

-- 방장이 다른 사람을 그룹에서 내보낸다.
create or replace function public.kick_study_group_member(p_group uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.study_groups g where g.id = p_group and g.owner_id = (select auth.uid())
  ) then
    raise exception '방장만 내보낼 수 있어요.';
  end if;
  if p_user = (select auth.uid()) then raise exception '자기 자신은 내보낼 수 없어요.'; end if;
  delete from public.study_group_members m where m.group_id = p_group and m.user_id = p_user;
end;
$$;

-- ───────────────────────── 함수: 비교 화면 ─────────────────────────

-- 그룹 사람들의 기간 합계 공부 시간과 "지금 공부 중" 여부. 그룹에 들어 있는 사람만 볼 수 있다.
create or replace function public.study_group_board(p_group uuid, p_from date, p_to date)
returns table (
  user_id uuid,
  nickname text,
  status_message text,
  total_seconds bigint,
  live_started_at timestamptz,
  live_subject text,
  is_me boolean,
  is_owner boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_study_group_member(p_group) then
    raise exception '이 그룹에 들어 있지 않아요.';
  end if;
  if p_to < p_from or p_to - p_from > 31 then
    raise exception '기간이 올바르지 않아요.';
  end if;
  return query
    select
      m.user_id,
      coalesce(p.nickname, '이름 없음'),
      coalesce(p.status_message, ''),
      coalesce((
        select sum(s.seconds) from public.study_sessions s
        where s.user_id = m.user_id and s.study_date between p_from and p_to
      ), 0)::bigint,
      l.started_at,
      l.subject_name,
      m.user_id = (select auth.uid()),
      m.user_id = g.owner_id
    from public.study_group_members m
    join public.study_groups g on g.id = m.group_id
    left join public.study_profiles p on p.user_id = m.user_id
    left join public.study_live l
      on l.user_id = m.user_id and l.started_at > now() - interval '12 hours'
    where m.group_id = p_group;
end;
$$;

-- 전체 랭킹: 랭킹 참여를 켠 사람 중 상위 p_limit 명 + 나 (참여 중일 때).
create or replace function public.study_ranking(p_from date, p_to date, p_limit integer default 100)
returns table (
  rank bigint,
  nickname text,
  status_message text,
  total_seconds bigint,
  live_started_at timestamptz,
  is_me boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_to < p_from or p_to - p_from > 31 then
    raise exception '기간이 올바르지 않아요.';
  end if;
  return query
    with totals as (
      select s.user_id, sum(s.seconds)::bigint as total
      from public.study_sessions s
      join public.study_profiles p on p.user_id = s.user_id and p.public_ranking
      where s.study_date between p_from and p_to
      group by s.user_id
    ),
    ranked as (
      select t.user_id, t.total,
        rank() over (order by t.total desc) as r
      from totals t
    )
    select r.r, p.nickname, p.status_message, r.total, l.started_at,
      r.user_id = (select auth.uid())
    from ranked r
    join public.study_profiles p on p.user_id = r.user_id
    left join public.study_live l
      on l.user_id = r.user_id and l.started_at > now() - interval '12 hours'
    where r.r <= least(greatest(p_limit, 1), 200) or r.user_id = (select auth.uid())
    order by r.r, p.nickname;
end;
$$;

-- 함수는 로그인한 사람만 부를 수 있다.
revoke all on function public.is_study_group_member(uuid) from public, anon;
revoke all on function public.study_new_invite_code() from public, anon, authenticated;
revoke all on function public.create_study_group(text, text) from public, anon;
revoke all on function public.join_study_group(text) from public, anon;
revoke all on function public.leave_study_group(uuid) from public, anon;
revoke all on function public.kick_study_group_member(uuid, uuid) from public, anon;
revoke all on function public.study_group_board(uuid, date, date) from public, anon;
revoke all on function public.study_ranking(date, date, integer) from public, anon;
grant execute on function public.is_study_group_member(uuid) to authenticated;
grant execute on function public.create_study_group(text, text) to authenticated;
grant execute on function public.join_study_group(text) to authenticated;
grant execute on function public.leave_study_group(uuid) to authenticated;
grant execute on function public.kick_study_group_member(uuid, uuid) to authenticated;
grant execute on function public.study_group_board(uuid, date, date) to authenticated;
grant execute on function public.study_ranking(date, date, integer) to authenticated;
