-- Run once in Supabase SQL Editor
-- Slice 4 of the exercise engine: what a session leaves behind.
--
-- Two tables, because two questions are asked at different rates. "Did this
-- learner get this item right, and when?" is asked once per question answered
-- and is the substrate for SM-2, the 80% bar and streaks. "Is Élargir unlocked
-- for this lesson?" is asked on every lesson screen and must not require
-- aggregating an ever-growing attempt log. The second is a materialisation of
-- the first, kept deliberately.

-- ── exercise_attempts ────────────────────────────────────────────────────────
-- One row per question answered.
create table if not exists exercise_attempts (
  id           bigserial primary key,
  user_id      uuid   not null references auth.users(id) on delete cascade,
  pool_item_id bigint not null references lesson_pool(id) on delete cascade,
  lesson_id    bigint not null references lessons(id) on delete cascade,

  -- Which pool the question was drawn from. The 80% gate is computed over
  -- 'pratiquer' alone: Élargir is endless and replayable, so mixing it in would
  -- let the bar be reached without ever mastering what the lesson taught.
  stage        text   not null check (stage in ('pratiquer','elargir')),

  -- match_pairs | choose_audio | word_order | fill_blank | listen_type | speaking
  -- Unconstrained on purpose: Slice 6 adds four more and a check constraint
  -- would turn each into a migration.
  format       text   not null,

  -- FIRST-TRY correctness. The 80% bar is computed from this column, and
  -- storing retries here would let the bar be farmed by brute-forcing the
  -- retry — a wrong answer followed by a right one would read as a pass.
  -- Retries are their own rows; distinguish them by answered_at order.
  -- For objective formats this is actual correctness. For `speaking`, which is
  -- record-and-compare rather than speech recognition, it stores the learner's
  -- self-rating (`true` = ça va, `false` = à retravailler). Any score or mastery
  -- query must therefore exclude format = 'speaking'.
  correct      boolean not null,

  answered_at  timestamptz not null default now()
);

-- The two queries this table exists to answer — "this user's attempts on this
-- lesson, newest first" (the 80% bar, the mastery counter) — are the same shape.
create index if not exists exercise_attempts_user_lesson
  on exercise_attempts (user_id, lesson_id, answered_at desc);

-- SM-2 scheduling asks the other question: everything this user has ever done
-- with THIS item, across lessons.
create index if not exists exercise_attempts_user_item
  on exercise_attempts (user_id, pool_item_id, answered_at desc);

-- ── lesson_stage_state ───────────────────────────────────────────────────────
-- One row per (user, lesson): the stage state the UI reads on every render.
create table if not exists lesson_stage_state (
  user_id           uuid   not null references auth.users(id) on delete cascade,
  lesson_id         bigint not null references lessons(id) on delete cascade,
  language_id       bigint not null references languages(id),

  -- Set once Pratiquer is passed at 80% first-try; never cleared by a later
  -- worse session. Unlocking is a one-way door — taking Élargir away from
  -- someone who has already earned it punishes them for practising.
  pratiquer_passed  boolean     not null default false,
  pratiquer_best    int         not null default 0,   -- % first-try, best session
  elargir_best      int         not null default 0,   -- % first-try, best session
  elargir_xp        int         not null default 0,   -- drives the topic level

  -- Completed sessions only. Quitting after two questions is not a play, and
  -- counting it would make the briefing's "parties" tile dishonest.
  -- Added to production by hand and backfilled into this file 2026-08-18; see
  -- sql/progression.sql §1, which brings an already-applied database in line.
  pratiquer_runs    int         not null default 0,
  elargir_runs      int         not null default 0,

  updated_at        timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Learners may read their own state. Session writes go through the trusted
-- record_learning_session RPC so scores and XP cannot be supplied directly.
alter table exercise_attempts  enable row level security;
alter table lesson_stage_state enable row level security;

drop policy if exists "Users manage their own attempts" on exercise_attempts;
drop policy if exists "Users read their own attempts" on exercise_attempts;
create policy "Users read their own attempts" on exercise_attempts
  for select using (auth.uid() = user_id);

drop policy if exists "Users manage their own stage state" on lesson_stage_state;
drop policy if exists "Users read their own stage state" on lesson_stage_state;
create policy "Users read their own stage state" on lesson_stage_state
  for select using (auth.uid() = user_id);
