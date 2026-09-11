-- Correct the second present-tense example in lesson 3.3.
-- Run once in the Supabase SQL Editor. The identifying guards keep this
-- correction scoped to the professor-authored row it was reviewed against.

begin;

update lesson_items
set dialect = 'Olobaka mbángú mingi !',
    embedding = null
where id = 8570
  and lesson_id = 358
  and french = 'Tu parles trop vite !'
  and dialect = 'Alobaka mbángú mingi !';

update lesson_pool
set lingala = 'Olobaka mbángú mingi !'
where source_table = 'lesson_items'
  and source_id = 8570
  and lesson_id = 358
  and french = 'Tu parles trop vite !';

commit;

-- Verify:
-- select id, french, dialect from lesson_items where id = 8570;
-- select id, french, lingala from lesson_pool
--  where source_table = 'lesson_items' and source_id = 8570;
