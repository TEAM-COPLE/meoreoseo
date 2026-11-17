-- 데이터 길이 제한과 바꿀 수 없는 칸 보호 (V1.1)
--
-- 이미 실행된 migration 파일(init, keep_alive)은 고쳐도 데이터베이스에 다시 적용되지 않는다.
-- 그래서 구조를 바꿀 때는 이렇게 새 파일을 추가한다.

-- ───────────────────────── 길이·값 제한 ─────────────────────────
-- 너무 긴 글이나 터무니없는 금액이 저장되지 않게 막는다.
alter table public.todos
  add constraint todos_notes_length check (notes is null or char_length(notes) <= 5000);

alter table public.events
  add constraint events_memo_length check (memo is null or char_length(memo) <= 5000),
  -- 끝나는 시각은 시작 시각이 있을 때만, 시작보다 늦게만 넣을 수 있다.
  add constraint events_time_order check (
    end_time is null or (start_time is not null and end_time > start_time)
  );

alter table public.notes
  add constraint notes_title_length check (char_length(title) <= 200),
  add constraint notes_body_length check (char_length(body) <= 50000);

alter table public.transactions
  add constraint transactions_amount_max check (amount <= 999999999999),
  add constraint transactions_memo_length check (memo is null or char_length(memo) <= 500);

-- ───────────────────────── 바꿀 수 없는 칸 보호 ─────────────────────────
-- 수정할 때 id, 주인(user_id), 만든 시각(created_at)은 원래 값을 그대로 유지한다.
-- 다른 사람 데이터로 옮기거나 기록을 조작하는 것을 막는다.
create or replace function public.preserve_immutable_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.id := old.id;
  new.user_id := old.user_id;
  new.created_at := old.created_at;
  return new;
end;
$$;

create trigger todos_preserve_immutable before update on public.todos
  for each row execute function public.preserve_immutable_fields();
create trigger events_preserve_immutable before update on public.events
  for each row execute function public.preserve_immutable_fields();
create trigger habits_preserve_immutable before update on public.habits
  for each row execute function public.preserve_immutable_fields();
create trigger habit_logs_preserve_immutable before update on public.habit_logs
  for each row execute function public.preserve_immutable_fields();
create trigger notes_preserve_immutable before update on public.notes
  for each row execute function public.preserve_immutable_fields();
create trigger transactions_preserve_immutable before update on public.transactions
  for each row execute function public.preserve_immutable_fields();
