-- Let an auth user be deleted.
-- Run this in the Supabase SQL editor.
--
-- `profiles` and `user_progress` come from sql/progress_tracking.sql (Phase 2,
-- 2026-04-14), written before the `on delete cascade` convention that every
-- later table follows. Their foreign keys to auth.users default to NO ACTION,
-- so deleting a user leaves those rows orphaned and Postgres refuses the whole
-- delete — surfacing in the dashboard as the unhelpful
-- "Database error deleting user".
--
-- Every other table referencing auth.users already cascades:
--   exercise_attempts, lesson_stage_state, user_streak, review_schedule,
--   app_developers, user_culture_rewards, user_xp_events, user_level_rewards,
--   level_challenge_state, lesson_reward_claims, api_quota
-- and corrections.submitted_by is `on delete set null`, which is deliberate —
-- an approved correction outlives the account that submitted it.
--
-- Deleting a learner therefore removes their profile and progress and keeps
-- their contributed corrections, unattributed. That is the intended shape.
--
-- Idempotent, and does not assume the constraint names: it finds every FK to
-- auth.users on these two tables whose delete action is not already CASCADE,
-- and recreates it under the same name.

do $$
declare
  fk record;
begin
  for fk in
    select conname,
           conrelid::regclass as tbl
    from pg_constraint
    where contype = 'f'
      and confrelid = 'auth.users'::regclass
      and conrelid in ('public.profiles'::regclass,
                       'public.user_progress'::regclass)
      and confdeltype <> 'c'          -- 'c' = cascade, 'a' = no action
  loop
    execute format('alter table %s drop constraint %I', fk.tbl, fk.conname);
    execute format(
      'alter table %s add constraint %I foreign key (user_id) '
      'references auth.users(id) on delete cascade',
      fk.tbl, fk.conname);
    raise notice 'recreated %.% with on delete cascade', fk.tbl, fk.conname;
  end loop;
end $$;

-- Verify: both rows should report confdeltype = 'c'.
select conrelid::regclass as table_name,
       conname            as constraint_name,
       confdeltype        as on_delete   -- 'c' = cascade
from pg_constraint
where contype = 'f'
  and confrelid = 'auth.users'::regclass
  and conrelid in ('public.profiles'::regclass,
                   'public.user_progress'::regclass);
