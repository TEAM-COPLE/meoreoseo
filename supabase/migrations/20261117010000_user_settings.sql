-- 사용자 설정 (한 사람당 한 줄)
--
-- 지금은 오늘 화면의 날씨 지역만 저장한다.
-- 로그인한 계정에 저장되므로 휴대폰·웹 어디서 로그인해도 같은 지역의 날씨를 본다.
-- 앞으로 계정에 따라다녀야 하는 설정이 생기면 이 표에 칸을 추가한다.

create table public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,

  -- 날씨 지역. 넷 중 하나라도 비어 있으면 기본 지역(서울)을 쓴다.
  -- 지역 구분용 이름 (예: 'osm:relation123', 기본 지역은 'seoul')
  weather_place_id text check (weather_place_id is null or char_length(weather_place_id) <= 100),
  -- 화면에 보이는 이름 (예: 해운대구)
  weather_name text check (weather_name is null or char_length(weather_name) between 1 and 100),
  -- 같은 이름을 구분하는 상세 주소 (예: 부산광역시, 대한민국)
  weather_detail text check (weather_detail is null or char_length(weather_detail) <= 200),
  weather_latitude double precision check (weather_latitude is null or weather_latitude between -90 and 90),
  weather_longitude double precision check (weather_longitude is null or weather_longitude between -180 and 180),

  updated_at timestamptz not null default now()
);

-- ───────────────────────── 접근 규칙 ─────────────────────────
-- 자기 설정만 읽고, 만들고, 고칠 수 있다. 지우기는 계정을 지울 때 자동으로 된다.
alter table public.user_settings enable row level security;

create policy "본인 설정 읽기" on public.user_settings
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "본인 설정 만들기" on public.user_settings
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "본인 설정 고치기" on public.user_settings
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.user_settings from anon;
grant select, insert, update on public.user_settings to authenticated;
