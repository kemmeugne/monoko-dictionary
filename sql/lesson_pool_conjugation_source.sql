-- Run once in the Supabase SQL Editor. Follows sql/conjugation_tables.sql.
--
-- Lets conjugation forms become exercise material.
--
-- WHY
-- A paradigm is the best match-pairs material in the whole course. Six forms of
-- one tense share an orthography, a shape and a topic by construction -- "tu
-- aimais / Olingaki" beside "nous aimions / To lingaki" -- which is exactly the
-- homogeneity the match-pairs bucket rules spend so much effort trying to find
-- in ordinary sentences. The engine draws from lesson_pool, and lesson_pool's
-- source_table CHECK predates conjugation_forms, so the forms cannot enter.

alter table lesson_pool drop constraint if exists lesson_pool_source_table_check;
alter table lesson_pool add  constraint lesson_pool_source_table_check
  check (source_table in
    ('lesson_items','parallel_sentences','examples','senses','conjugation_forms'));

-- ── Verify ───────────────────────────────────────────────────────────────────
-- select source_table, count(*) from lesson_pool group by source_table;
--   -- conjugation_forms appears once populate_conjugation_forms.py is re-run

-- ── Rollback ─────────────────────────────────────────────────────────────────
-- delete from lesson_pool where source_table = 'conjugation_forms';
-- alter table lesson_pool drop constraint if exists lesson_pool_source_table_check;
-- alter table lesson_pool add  constraint lesson_pool_source_table_check
--   check (source_table in ('lesson_items','parallel_sentences','examples','senses'));
