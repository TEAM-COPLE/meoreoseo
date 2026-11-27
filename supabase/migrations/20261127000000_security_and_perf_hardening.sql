-- 보안 및 성능 강화 마이그레이션
-- 1) 스터디 그룹 초대 코드 생성 시 암호학적 난수(gen_random_bytes) 사용
-- 2) 그룹 가입·생성 시 동시 요청(TOCTOU)으로 인원/개수 제한을 초과하지 않도록 행 잠금(FOR UPDATE) 추가
-- 3) 스터디 그룹 보드(study_group_board)의 멤버별 상관 서브쿼리(N+1)를 단일 집계 조인으로 최적화

create or replace function public.study_new_invite_code()
returns text
language plpgsql
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  raw_bytes bytea;
  code text;
begin
  loop
    raw_bytes := extensions.gen_random_bytes(8);
    code := '';
    for i in 0..7 loop
      code := code || substr(alphabet, 1 + (get_byte(raw_bytes, i) % 32), 1);
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
  -- 동시 요청 시 그룹 20개 제한 우회를 막기 위해 프로필 행을 잠근다.
  perform 1 from public.study_profiles p where p.user_id = me for update;
  if not found then
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
  perform 1 from public.study_profiles p where p.user_id = me for update;
  if not found then
    raise exception '먼저 공부 프로필(닉네임)을 만들어 주세요.';
  end if;
  -- 정원(50명) 검사와 멤버 추가 사이의 경쟁 상태(TOCTOU)를 막기 위해 그룹 행을 잠근다.
  select g.id into target
  from public.study_groups g
  where g.invite_code = upper(btrim(p_code))
  for update;
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
    with members as (
      select m.user_id, m.group_id
      from public.study_group_members m
      where m.group_id = p_group
    ),
    member_totals as (
      select s.user_id, sum(s.seconds)::bigint as total
      from public.study_sessions s
      join members m on m.user_id = s.user_id
      where s.study_date between p_from and p_to
      group by s.user_id
    )
    select
      m.user_id,
      coalesce(p.nickname, '이름 없음'),
      coalesce(p.status_message, ''),
      coalesce(mt.total, 0)::bigint,
      l.started_at,
      l.subject_name,
      m.user_id = (select auth.uid()),
      m.user_id = g.owner_id
    from members m
    join public.study_groups g on g.id = m.group_id
    left join public.study_profiles p on p.user_id = m.user_id
    left join member_totals mt on mt.user_id = m.user_id
    left join public.study_live l
      on l.user_id = m.user_id and l.started_at > now() - interval '12 hours';
end;
$$;
