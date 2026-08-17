-- Run once in the Supabase SQL Editor.
-- Adds "how many times have I played this?" to the per-lesson stage state.
--
-- WHY COLUMNS AND NOT A COUNT OVER exercise_attempts
-- Attempts are per QUESTION, not per session, and they carry no session id — a
-- count over them would answer "how many questions have I answered", and
-- reconstructing sessions from answered_at gaps is guesswork. The lesson screen
-- reads this on every render, so it is a counter, incremented once when a
-- session completes.
--
-- Only COMPLETED sessions count. Abandoning after two questions is not a play,
-- and counting it would make the number feel dishonest to the person who sees
-- it — the same reason lesson_stage_state ignores abandoned sessions entirely.

alter table lesson_stage_state
  add column if not exists pratiquer_runs int not null default 0,
  add column if not exists elargir_runs   int not null default 0;

-- ── Verify ───────────────────────────────────────────────────────────────────
-- select column_name, data_type, column_default
--   from information_schema.columns
--  where table_name = 'lesson_stage_state'
--  order by ordinal_position;

-- ── Rollback ─────────────────────────────────────────────────────────────────
-- alter table lesson_stage_state
--   drop column if exists pratiquer_runs,
--   drop column if exists elargir_runs;
