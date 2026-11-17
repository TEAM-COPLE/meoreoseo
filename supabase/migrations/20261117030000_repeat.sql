-- 반복 할 일·반복 일정
--
-- 할 일: 반복하는 할 일을 완료하면 앱이 다음 할 일을 새로 만든다.
--   repeat       반복 방법 (없으면 반복 안 함)
--   repeat_start 반복의 기준 날짜. "매월 31일"이 짧은 달에 30일·28일로 당겨져도 다음 달엔 다시 31일이 되게 한다.
--   previous_id  이 할 일을 만든 이전 할 일. 완료를 취소하면 이 값으로 자동으로 만든 다음 할 일을 찾아 지운다.
--
-- 일정: 한 줄만 저장하고, 달력에 보여줄 때 반복되는 날짜마다 펼친다.
--   repeat       반복 방법 (없으면 반복 안 함)
--   repeat_until 반복이 끝나는 날 (없으면 계속 반복)

alter table public.todos
  add column repeat text
    check (repeat in ('daily', 'weekdays', 'weekly', 'monthly', 'yearly')),
  add column repeat_start date,
  add column previous_id uuid,
  -- 반복하려면 마감일이 있어야 한다(언제 다시 할지 계산할 기준).
  add constraint todos_repeat_needs_due check (repeat is null or due_date is not null);

create index todos_previous_idx on public.todos (previous_id) where previous_id is not null;

alter table public.events
  add column repeat text
    check (repeat in ('daily', 'weekdays', 'weekly', 'monthly', 'yearly')),
  add column repeat_until date,
  add constraint events_repeat_until_order check (repeat_until is null or repeat_until >= event_date);

-- 반복 일정은 시작 날짜와 상관없이 매달 불러오므로 따로 찾기 쉽게 해 둔다.
create index events_user_repeat_idx on public.events (user_id, event_date) where repeat is not null;
