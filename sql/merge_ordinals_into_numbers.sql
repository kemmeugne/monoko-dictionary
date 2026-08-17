-- Run once in the Supabase SQL Editor.
-- Merges L375 "Les nombres ordinaux" (3 items) into L350 "Les nombres" (55).
--
-- WHY
-- Three items is not a lesson. It is the only lesson in the curriculum that
-- cannot build a practice session: 80% of a 3-question session means 3/3, a
-- strictly harder gate than any other lesson, and neither word-order (needs 3+
-- tokens) nor fill-the-blank (needs a 4+ character word) can use rows that read
-- "1er → Ya liboso". Ordinals are the same topic as cardinals and belong in the
-- same lesson; splitting them was an artefact of the July 2026 restructure, not
-- a teaching decision.
--
-- ORDER MATTERS. lesson_items, lesson_pool, exercise_attempts, user_progress and
-- lesson_stage_state all reference lessons(id) ON DELETE CASCADE, so the delete
-- at step 5 would silently take everything with it. Move first, delete last.
--
-- ROLLBACK: see the bottom of this file.

begin;

-- 1. The three ordinal rows join the numbers lesson at the end of it.
--    L350's highest item_order is 55, and L375's are 1..3, so +55 lands them at
--    56..58 with no collision. Rows are UPDATED in place, never
--    delete-and-reinsert: their ids are referenced by lesson_pool.source_id and
--    their audio_url points at objects already on R2.
update lesson_items
   set lesson_id  = 350,
       item_order = item_order + 55
 where lesson_id = 375;

-- 2. The pool rows follow. Both lessons sit in course 36 (niveau 1), so `level`
--    and `effective_level` are already 1 and need no recomputation.
update lesson_pool
   set lesson_id = 350
 where lesson_id = 375;

-- 3. Attempts KEEP their evidence. The pool items they point at have just moved
--    to L350, so the answers are now answers about L350 — dropping them would
--    quietly reset a learner's "x/y maîtrisés" counter.
update exercise_attempts
   set lesson_id = 350
 where lesson_id = 375;

-- 4. Stage state and completion do NOT transfer. Passing a 3-item lesson is not
--    passing a 58-item one, and carrying the flag over would hand out Élargir on
--    L350 for work never done. The learner re-passes L350, which is correct.
--    (Both tables are per-user with RLS; this runs as the service role, so it
--    reaches every user's rows, which a client-side query could not.)
delete from lesson_stage_state where lesson_id = 375;
delete from user_progress      where lesson_id = 375;

-- 5. The now-empty lesson goes.
delete from lessons where id = 375;

-- 6. Close the gap it leaves in the ordering (8,9,10 -> 7,8,9).
update lessons
   set lesson_order = lesson_order - 1
 where course_id = 36
   and lesson_order > 7;

commit;

-- ── Verify (expect: 58 items, 122 pool rows, zero orphans) ───────────────────
-- select count(*) from lesson_items where lesson_id = 350;                -- 58
-- select count(*) from lesson_pool  where lesson_id = 350;                -- 122
-- select count(*) from lesson_items where lesson_id = 375;                --  0
-- select id, title, lesson_order from lessons
--  where course_id = 36 order by lesson_order;                            -- 1..9, no gap
-- select item_order, french, dialect from lesson_items
--  where lesson_id = 350 order by item_order desc limit 3;                -- the 3 ordinals

-- ── After applying ───────────────────────────────────────────────────────────
-- `populate_lesson_pool.py` reads lesson ids from artifacts/professor_ingest/*,
-- which still say 375. It now carries LESSON_MERGES = {375: 350} to remap them.
-- Without that remap a re-populate would look up a lesson that no longer exists,
-- find no level for it, and SILENTLY DROP those 11 rows.

-- ── Rollback ─────────────────────────────────────────────────────────────────
-- The 3 items are recoverable (item_order 56..58 in L350), but the deleted
-- lessons row and any deleted progress are not. Take a backup of these before
-- running if that matters:
--   select * from lessons      where id = 375;
--   select * from user_progress      where lesson_id = 375;
--   select * from lesson_stage_state where lesson_id = 375;
--
-- To reverse the content move:
--   begin;
--   update lessons set lesson_order = lesson_order + 1
--    where course_id = 36 and lesson_order >= 7;
--   insert into lessons (id, course_id, title, lesson_order)
--        values (375, 36, 'Les nombres ordinaux', 7);
--   update lesson_items set lesson_id = 375, item_order = item_order - 55
--    where lesson_id = 350 and item_order > 55;
--   update lesson_pool      set lesson_id = 375 where source_id in (
--     select id from lesson_items where lesson_id = 375);
--   commit;
