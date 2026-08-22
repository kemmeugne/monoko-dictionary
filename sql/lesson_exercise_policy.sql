-- Per-lesson exercise allow-list.
-- A missing row means every exercise type is allowed. Add a row only when a
-- lesson's teaching purpose makes otherwise-valid formats misleading.

create table if not exists lesson_exercise_policy (
  lesson_id    bigint primary key references lessons(id) on delete cascade,
  allow_types  text[] not null check (cardinality(allow_types) > 0),
  reason       text,
  updated_at   timestamptz not null default now()
);

alter table lesson_exercise_policy enable row level security;

drop policy if exists "lesson exercise policy public read" on lesson_exercise_policy;
create policy "lesson exercise policy public read" on lesson_exercise_policy
  for select using (true);

-- "Sons et alphabet" teaches sound recognition. Translation matching and
-- choose-the-audio can be solved from its labels rather than from knowledge.
insert into lesson_exercise_policy (lesson_id, allow_types, reason)
select 346, array['listen_type', 'speaking'], 'Sound-system lesson: listening and self-assessed speaking only.'
where exists (select 1 from lessons where id = 346)
on conflict (lesson_id) do update set
  allow_types = excluded.allow_types,
  reason = excluded.reason,
  updated_at = now();
