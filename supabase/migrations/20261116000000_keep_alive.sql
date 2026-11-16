-- 일시정지 방지 (keep-alive)
--
-- Supabase 무료 요금제는 7일 동안 데이터베이스 요청이 거의 없으면 프로젝트를 일시정지한다.
-- 그래서 데이터베이스가 6시간마다 자기 자신의 API 로 작은 읽기 요청을 한 번씩 보내게 한다.
-- 앱을 며칠 안 써도 "하루에 몇 번의 요청"이 계속 생긴다.

-- 1. 필요한 확장 기능
--    pg_cron: 정해진 시각마다 SQL 을 실행한다.  pg_net: SQL 에서 인터넷 요청을 보낸다.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- 2. 요청이 읽어 갈 아주 작은 표. 행은 항상 하나뿐이고 사용자 데이터는 들어 있지 않다.
create table if not exists public.keep_alive (
  id smallint primary key default 1 check (id = 1),
  note text not null default 'ping'
);

insert into public.keep_alive (id) values (1) on conflict (id) do nothing;

-- 로그인하지 않아도 읽을 수만 있게 한다. 쓰기는 누구에게도 허용하지 않는다.
alter table public.keep_alive enable row level security;

drop policy if exists "keep_alive 읽기" on public.keep_alive;
create policy "keep_alive 읽기" on public.keep_alive
  for select to anon, authenticated
  using (true);

revoke all on public.keep_alive from anon, authenticated;
grant select on public.keep_alive to anon, authenticated;

-- 3. 6시간마다(0시·6시·12시·18시 17분, UTC 기준) 위 표를 API 로 읽는다.
--    apikey 는 앱에도 들어 있는 공개용 키다. 키를 새로 발급하면 여기도 바꿔야 한다.
select cron.schedule(
  'keep-alive-ping',
  '17 */6 * * *',
  $$
  select net.http_get(
    url := 'https://bwbnhpiphwrpesipuipu.supabase.co/rest/v1/keep_alive?select=id',
    headers := jsonb_build_object('apikey', 'sb_publishable_58PcLUKQq1fiQT8neml21w_QUy3wYZ0')
  );
  $$
);

-- 끄고 싶을 때:  select cron.unschedule('keep-alive-ping');
