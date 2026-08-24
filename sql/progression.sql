-- Slice 7 — progression and retention.
-- Run once in the Supabase SQL Editor. Follows sql/exercise_progress.sql.
--
-- Adds the three things a practice loop needs to become a habit: a streak, a
-- spaced-repetition schedule, and the play counters the briefing already reads.
-- Idempotent throughout — safe to re-run.


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Drift repair: pratiquer_runs / elargir_runs
-- ─────────────────────────────────────────────────────────────────────────────
-- These two columns were added to PRODUCTION by hand and never written back
-- into sql/exercise_progress.sql, so the file and the live database disagreed:
-- handleSessionEnd has been writing both since Slice 5, and the briefing reads
-- them for its "parties" tile. On production this is a no-op. It matters for
-- any environment rebuilt from the sql/ files -- monoko-test, or a fresh
-- project -- where the upsert would otherwise fail on an unknown column and
-- take pratiquer_passed, the best scores and the XP down with it, since
-- PostgREST rejects the whole row.
--
-- The create-table in sql/exercise_progress.sql has been corrected too; this
-- block is what brings an already-applied database in line with it.
alter table lesson_stage_state add column if not exists pratiquer_runs int not null default 0;
alter table lesson_stage_state add column if not exists elargir_runs   int not null default 0;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Streak
-- ─────────────────────────────────────────────────────────────────────────────
-- ONE ROW PER USER, NOT PER LANGUAGE, AND NOT PER LESSON.
-- A streak answers "did you show up today", which is a fact about the person
-- rather than about any lesson they happened to open. Keying it by language
-- would break the streak of a learner who practises Lingala on Monday and
-- Yoruba on Tuesday -- punishing exactly the behaviour the app wants.
--
-- THE DAY IS THE LEARNER'S LOCAL DAY, SUPPLIED BY THE CLIENT.
-- `last_day` is a date, never a timestamp, and it is never defaulted to
-- now()::date -- Postgres would evaluate that in UTC. A learner in Montreal
-- finishing a session at 20:00 EST is already "tomorrow" in UTC, so a
-- server-side day boundary would either award two days for one evening or
-- break a streak that the learner kept. The client sends its own local
-- YYYY-MM-DD and the arithmetic is done against that.
create table if not exists user_streak (
  user_id        uuid primary key references auth.users(id) on delete cascade,

  current_streak int  not null default 0,
  longest_streak int  not null default 0,   -- never decreases; the trophy, not the counter
  last_day       date,                      -- learner-local day of the last COMPLETED session

  updated_at     timestamptz not null default now()
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Spaced repetition (SM-2)
-- ─────────────────────────────────────────────────────────────────────────────
-- BOTH STAGES (revised 2026-08-20). Spaced repetition needs a finite item set
-- with per-item state, and both stages are finite ONCE YOU COUNT PER LESSON,
-- which is the only unit a learner meets: median 25 native items for Pratiquer,
-- median 80 routed items for Elargir. The "4,788 rows" figure that first ruled
-- Elargir out is the whole corpus across 49 lessons, which nobody ever sees.
--
-- NO `stage` COLUMN, DELIBERATELY. A pool item belongs to exactly one tier, so
-- (user_id, pool_item_id) already says which stage a schedule row belongs to.
-- The separation is enforced where the session is built: `items` is filtered by
-- tier before `due` is consulted, so a Pratiquer item cannot leak into an
-- Elargir session however overdue it is.
--
-- This is scheduler state, which exercise_attempts deliberately is not:
-- attempts are an append-only event log (one row per question, first-try only),
-- and squeezing ease/interval into it would mean recomputing the whole history
-- on every session start.
create table if not exists review_schedule (
  user_id       uuid   not null references auth.users(id) on delete cascade,
  pool_item_id  bigint not null references lesson_pool(id) on delete cascade,
  lesson_id     bigint not null references lessons(id) on delete cascade,

  -- SM-2's easiness factor. 2.5 is the canonical start; 1.3 the canonical
  -- floor, below which an item would come back so often it crowds out
  -- everything else.
  ease          real   not null default 2.5,
  interval_days int    not null default 0,
  reps          int    not null default 0,   -- consecutive correct; reset to 0 on a miss

  -- Learner-local day again, for the same reason as user_streak.last_day.
  due_on        date   not null,

  updated_at    timestamptz not null default now(),
  primary key (user_id, pool_item_id)
);

-- The session-start question is "what does this learner owe on this lesson
-- today", so the index carries lesson and due date together.
create index if not exists review_schedule_user_lesson_due
  on review_schedule (user_id, lesson_id, due_on);


-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────────
-- Learners may read their own state. Completed sessions update these tables
-- through record_learning_session, which validates and derives the result.
alter table user_streak     enable row level security;
alter table review_schedule enable row level security;

drop policy if exists "Users manage their own streak" on user_streak;
drop policy if exists "Users read their own streak" on user_streak;
create policy "Users read their own streak" on user_streak
  for select using (auth.uid() = user_id);

drop policy if exists "Users manage their own review schedule" on review_schedule;
drop policy if exists "Users read their own review schedule" on review_schedule;
create policy "Users read their own review schedule" on review_schedule
  for select using (auth.uid() = user_id);


-- ── Verify ───────────────────────────────────────────────────────────────────
-- select column_name from information_schema.columns
--  where table_name = 'lesson_stage_state' order by ordinal_position;
--   -- pratiquer_runs and elargir_runs present
-- select count(*) from user_streak;
-- select count(*) from review_schedule;

-- ── Rollback ─────────────────────────────────────────────────────────────────
-- drop table if exists review_schedule;
-- drop table if exists user_streak;
-- -- the runs columns are NOT dropped on rollback: handleSessionEnd writes them
-- -- and has since Slice 5, so removing them breaks the stage-state upsert.
