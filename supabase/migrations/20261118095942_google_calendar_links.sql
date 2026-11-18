-- 구글 캘린더 여러 개 맞추기
--
-- 1) google_calendar_links: 사용자가 고른 구글 캘린더들 (멀어서 캘린더 + 기본 캘린더 등)
--    캘린더마다 "어디까지 받았는지(sync_token)"를 따로 기억한다.
-- 2) events.google_calendar_id: 그 일정이 어느 구글 캘린더에 있는지
--    events.google_readonly  : 남이 만든 회의 초대처럼 구글에서만 고칠 수 있는 일정
-- 3) 앱(로그인한 사용자)은 google_readonly 일정을 고치거나 지울 수 없다.

alter table public.google_calendar_connections
  add column scopes text not null default '';

create table public.google_calendar_links (
  user_id uuid not null references auth.users (id) on delete cascade,
  calendar_id text not null check (char_length(calendar_id) <= 1024),
  name text,
  color text,
  access_role text,
  is_app boolean not null default false,
  is_primary boolean not null default false,
  sync_token text,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, calendar_id)
);
alter table public.google_calendar_links enable row level security;
revoke all on public.google_calendar_links from anon, authenticated;

alter table public.events
  add column google_calendar_id text check (google_calendar_id is null or char_length(google_calendar_id) <= 1024),
  add column google_readonly boolean not null default false;

alter table public.google_calendar_deletions
  add column google_calendar_id text check (google_calendar_id is null or char_length(google_calendar_id) <= 1024);

-- 지금까지 연결된 일정은 모두 멀어서 캘린더에 있었다.
update public.events e
   set google_calendar_id = c.calendar_id
  from public.google_calendar_connections c
 where c.user_id = e.user_id and e.google_event_id is not null;

insert into public.google_calendar_links (user_id, calendar_id, name, is_app, sync_token)
select user_id, calendar_id, coalesce(calendar_name, '멀어서'), true, sync_token
  from public.google_calendar_connections
 where calendar_id is not null
on conflict do nothing;

-- 구글 일정 id 는 캘린더마다 따로라서 (캘린더, id) 짝으로 겹치지 않게 한다.
drop index public.events_google_event_idx;
create unique index events_google_event_idx
  on public.events (user_id, google_calendar_id, google_event_id)
  where google_event_id is not null;

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
    new.google_calendar_id := null;
    new.google_original := null;
    new.google_readonly := false;
    new.local_version := 0;
  else
    if old.google_readonly then
      raise exception '구글 캘린더에서만 고칠 수 있는 일정입니다.' using errcode = '42501';
    end if;
    new.google_event_id := old.google_event_id;
    new.google_calendar_id := old.google_calendar_id;
    new.google_original := old.google_original;
    new.google_readonly := old.google_readonly;
    new.local_version := old.local_version + 1;
  end if;
  new.google_dirty := true;
  return new;
end;
$$;

-- 지우기 전에 확인한다 (구글에서만 고칠 수 있는 일정은 앱에서 못 지운다).
create or replace function public.events_google_before_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' and old.google_readonly then
    raise exception '구글 캘린더에서만 지울 수 있는 일정입니다.' using errcode = '42501';
  end if;
  return old;
end;
$$;

create trigger events_google_before_delete before delete on public.events
  for each row execute function public.events_google_before_delete();

create or replace function public.events_google_deleted()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' and old.google_event_id is not null then
    insert into public.google_calendar_deletions (user_id, google_event_id, google_calendar_id)
    values (old.user_id, old.google_event_id, old.google_calendar_id);
  end if;
  return old;
end;
$$;
