-- 일시정지 방지 (keep-alive)
--
-- Supabase 무료 요금제는 7일 동안 데이터베이스 활동이 거의 없으면 프로젝트를 일시정지한다.
-- 외부로 공개 키(apikey)나 프로젝트 주소를 코드에 하드코딩하지 않고,
-- pg_cron 으로 데이터베이스 내부에서 주기적으로 점검 쿼리를 실행한다.

create extension if not exists pg_cron with schema pg_catalog;

create table if not exists public.keep_alive (
  id smallint primary key default 1 check (id = 1),
  pinged_at timestamptz not null default now()
);

insert into public.keep_alive (id) values (1) on conflict (id) do nothing;

-- 외부(anon, authenticated)에서는 이 테이블에 접근할 필요가 없으므로 권한을 모두 거둔다.
alter table public.keep_alive enable row level security;
revoke all on public.keep_alive from anon, authenticated;

-- 6시간마다(0시·6시·12시·18시 17분, UTC 기준) 내부 행의 시각을 갱신한다.
select cron.schedule(
  'keep-alive-ping',
  '17 */6 * * *',
  $$
  update public.keep_alive set pinged_at = now() where id = 1;
  $$
);

-- 끄고 싶을 때:  select cron.unschedule('keep-alive-ping');
