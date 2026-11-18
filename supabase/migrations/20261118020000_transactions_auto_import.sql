-- 가계부 자동 입력 (결제 알림 · 엑셀 가져오기)
--
--   source       기록 경로: 'manual'(직접 입력) / 'notification'(결제 알림) / 'import'(엑셀·CSV 가져오기)
--   occurred_at  결제한 시각 (알 수 있을 때만). 알림과 엑셀에서 같은 결제를 찾아 중복을 지우는 데 쓴다.
--   external_id  자동 입력 한 건을 구별하는 이름. 같은 알림이나 같은 엑셀 줄이 두 번 들어오지 않게 한다.

alter table public.transactions drop constraint transactions_source_check;
alter table public.transactions
  add constraint transactions_source_check check (source in ('manual', 'notification', 'import'));

alter table public.transactions
  add column occurred_at timestamptz,
  add column external_id text check (external_id is null or char_length(external_id) <= 200),
  -- 비어 있는 값(null)끼리는 겹쳐도 되므로 직접 입력한 내역에는 영향이 없다.
  add constraint transactions_user_external_key unique (user_id, external_id);
