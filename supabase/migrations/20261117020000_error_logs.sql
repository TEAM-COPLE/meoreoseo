-- 앱 오류 기록
--
-- 휴대폰·웹에서 오류가 나면 내용을 여기에 남긴다. 개발자가 원인을 찾을 때 읽는다.
-- 앱(사용자)은 자기 오류를 "쓰기"만 할 수 있고, 읽기·고치기·지우기는 못 한다.
-- 개발자는 Supabase 대시보드(또는 SQL)에서 읽는다.
-- 로그인하지 않은 사용자(기기 저장 모드)의 오류는 저장하지 않는다. 아무나 쓰레기 기록을 넣지 못하게 하기 위해서다.

create table public.error_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- 어디서 난 오류인지 (예: weather, todos, app)
  source text not null check (char_length(source) between 1 and 50),
  -- 오류 문장 (예: Network request failed)
  message text not null check (char_length(message) between 1 and 1000),
  -- 오류가 난 코드 위치 등 자세한 내용
  detail text check (detail is null or char_length(detail) <= 4000),
  -- android, ios, web
  platform text not null check (platform in ('android', 'ios', 'web', 'other')),
  -- 앱 버전 (예: 1.0.0)
  app_version text check (app_version is null or char_length(app_version) <= 50)
);
create index error_logs_created_idx on public.error_logs (created_at desc);

alter table public.error_logs enable row level security;

create policy "본인 오류 기록 남기기" on public.error_logs
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

revoke all on public.error_logs from anon, authenticated;
grant insert on public.error_logs to authenticated;
