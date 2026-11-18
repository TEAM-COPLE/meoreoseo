-- 할 일의 시작일
--
--   start_date  할 일을 시작하는 날. 시작일 ~ 마감일 기간이 일정(달력)에도 보인다.
--               비어 있으면 마감일 하루짜리 할 일이다.
--               시작일을 쓰려면 마감일이 있어야 하고, 시작일은 마감일보다 늦을 수 없다.

alter table public.todos
  add column start_date date,
  add constraint todos_start_before_due check (
    start_date is null or (due_date is not null and start_date <= due_date)
  );
