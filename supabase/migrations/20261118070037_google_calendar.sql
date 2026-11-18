-- 구글 캘린더 양방향 연동
--
-- 1) events 에 구글 연결 정보를 더한다.
--    excluded_dates : 반복 일정에서 빠진 날짜들 (구글에서 한 번만 지운 날 등)
--    google_event_id: 구글 쪽 같은 일정의 id
--    google_dirty   : 앱에서 바뀌어서 아직 구글에 보내지 않았는지
--    local_version  : 앱에서 고칠 때마다 1씩 늘어난다 (보내는 도중 또 고쳤는지 알아보려고)
--    google_original: 구글에서 받은 원래 모양 (멀어서가 다 표현 못 하는 부분을 지키려고)
-- 2) 앱(로그인한 사용자)이 고치면 트리거가 자동으로 "보내야 함" 표시를 한다.
--    구글 연결 정보는 앱이 직접 바꿀 수 없다. 서버 함수(service_role)만 바꾼다.
-- 3) 구글 토큰은 앱이 절대 읽을 수 없는 표에 (암호화해서) 둔다.
-- 4) 5분마다 서버 함수를 불러 구글과 맞춘다.
alter table public.events
  add column excluded_dates date[] not null default '{}'
    check (cardinality(excluded_dates) <= 500),
  add column google_event_id text check (google_event_id is null or char_length(google_event_id) <= 1024),
  add column google_dirty boolean not null default true,
  add column local_version integer not null default 0,
  add column google_original jsonb;

create unique index events_google_event_idx on public.events (user_id, google_event_id)
  where google_event_id is not null;
create index events_google_dirty_idx on public.events (user_id) where google_dirty;

create or replace function public.events_google_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.google_event_id := null;
    new.google_original := null;
    new.local_version := 0;
  else
    new.google_event_id := old.google_event_id;
    new.google_original := old.google_original;
    new.local_version := old.local_version + 1;
  end if;
  new.google_dirty := true;
  return new;
end;
$$;

create trigger events_google_guard before insert or update on public.events
  for each row execute function public.events_google_guard();

-- 앱에서 지운 일정 중 구글에도 있던 것 → 서버 함수가 구글에서도 지운다.
create table public.google_calendar_deletions (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  google_event_id text not null check (char_length(google_event_id) <= 1024),
  created_at timestamptz not null default now()
);
create index google_calendar_deletions_user_idx on public.google_calendar_deletions (user_id);

alter table public.google_calendar_deletions enable row level security;
create policy "본인 삭제 요청 적기" on public.google_calendar_deletions
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
revoke all on public.google_calendar_deletions from anon, authenticated;
grant insert on public.google_calendar_deletions to authenticated;

create or replace function public.events_google_deleted()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' and old.google_event_id is not null then
    insert into public.google_calendar_deletions (user_id, google_event_id)
    values (old.user_id, old.google_event_id);
  end if;
  return old;
end;
$$;

create trigger events_google_deleted after delete on public.events
  for each row execute function public.events_google_deleted();

-- 구글 연결 정보 (앱은 못 읽는다)
create table public.google_calendar_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  google_email text,
  refresh_token text not null,
  access_token text,
  access_token_expires_at timestamptz,
  calendar_id text,
  calendar_name text,
  time_zone text not null default 'Asia/Seoul',
  sync_token text,
  status text not null default 'ok' check (status in ('ok', 'reauth')),
  last_synced_at timestamptz,
  last_error text,
  sync_started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_calendar_connections enable row level security;
revoke all on public.google_calendar_connections from anon, authenticated;

-- 구글 로그인 도중 잠깐 쓰는 확인 값
create table public.google_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  return_to text not null,
  created_at timestamptz not null default now()
);
alter table public.google_oauth_states enable row level security;
revoke all on public.google_oauth_states from anon, authenticated;

-- 같은 사람의 동기화가 두 번 겹쳐 돌지 않게 2분짜리 자물쇠
create or replace function public.google_calendar_claim_sync(target uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  claimed boolean;
begin
  update public.google_calendar_connections
     set sync_started_at = now()
   where user_id = target
     and (sync_started_at is null or sync_started_at < now() - interval '2 minutes')
  returning true into claimed;
  return coalesce(claimed, false);
end;
$$;
revoke all on function public.google_calendar_claim_sync(uuid) from public, anon, authenticated;
grant execute on function public.google_calendar_claim_sync(uuid) to service_role;

-- 서버 안에서만 쓰는 비밀 값 (예약 작업이 서버 함수를 부를 때 쓰는 암호)
create table public.app_secrets (
  name text primary key,
  value text not null
);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;

insert into public.app_secrets (name, value)
values ('google_calendar_cron', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (name) do nothing;

select cron.schedule(
  'google-calendar-sync',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://bwbnhpiphwrpesipuipu.supabase.co/functions/v1/google-calendar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from public.app_secrets where name = 'google_calendar_cron')
    ),
    body := '{"action":"cron"}'::jsonb,
    timeout_milliseconds := 120000
  )
  where exists (select 1 from public.google_calendar_connections where status = 'ok');
  $$
);
