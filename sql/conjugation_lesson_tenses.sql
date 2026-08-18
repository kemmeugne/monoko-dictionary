-- Run once in the Supabase SQL Editor. Follows sql/conjugation_tables.sql.
--
-- A lesson shows the tenses it teaches, not the whole paradigm. "Conjugaison -
-- présent et passé" has no business displaying the futur, and a learner who
-- meets five tenses on a lesson about two has been handed a reference table
-- rather than a lesson.
--
-- An array rather than a row per tense: the unit the page renders is one verb's
-- block, and splitting it across rows would fan the query out for no gain.
-- NULL means "every tense", which is the sensible default for a lesson that is
-- about conjugation in general.

alter table lesson_conjugation_tables
  add column if not exists tenses text[];

comment on column lesson_conjugation_tables.tenses is
  'Tense keys to display, in conjugation_forms.tense. NULL = all of them.';

-- ── Verify ───────────────────────────────────────────────────────────────────
-- select l.title, c.verb, c.tenses
--   from lesson_conjugation_tables c join lessons l on l.id = c.lesson_id
--  order by l.id;

-- ── Rollback ─────────────────────────────────────────────────────────────────
-- alter table lesson_conjugation_tables drop column if exists tenses;
