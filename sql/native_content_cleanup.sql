-- Curate professor-native material for the exercise pool without changing the
-- source lesson pages. Re-runnable and intentionally limited to lesson_items.
--
-- Four repeated pronoun headwords carry distinct, professor-recorded examples;
-- Pratiquer uses those examples. Ten duplicate, metadata, or multi-answer rows
-- stay visible in their lessons but are withheld from exercises until corrected.

begin;

do $$
begin
  if (
    select count(*)
    from lesson_items
    where id in (7746, 7751, 7754, 7755)
  ) <> 4 then
    raise exception 'Native-content cleanup stopped: a replacement source row is missing';
  end if;

  if exists (
    select 1
    from lesson_items
    where id in (7746, 7751, 7754, 7755)
      and (nullif(trim(example_french), '') is null
        or nullif(trim(example_dialect), '') is null)
  ) then
    raise exception 'Native-content cleanup stopped: a replacement example is blank';
  end if;
end $$;

update lesson_pool as pool
set french = trim(item.example_french),
    lingala = trim(item.example_dialect),
    audio_url = item.example_audio_url,
    token_count = cardinality(
      regexp_split_to_array(trim(item.example_dialect), E'\\s+')
    )
from lesson_items as item
where pool.source_table = 'lesson_items'
  and pool.source_id = item.id
  and item.id in (7746, 7751, 7754, 7755);

-- Parentheses marked optional notation in the source, not spoken content.
update lesson_pool
set lingala = 'Oyo',
    token_count = 1
where source_table = 'lesson_items'
  and source_id = 7775;

-- Each retained recording begins with the singular form. Narrow the French
-- prompt to that same form so the listening and translation answers agree.
update lesson_pool
set french = case source_id
  when 8641 then 'Parle ! (tu)'
  when 8662 then 'Ne parle pas ! (tu)'
  when 8663 then 'Ne finis pas ! (tu)'
  when 8664 then 'Ne vends pas ! (tu)'
end
where source_table = 'lesson_items'
  and source_id in (8641, 8662, 8663, 8664);

-- The source rows are not deleted. Only their ambiguous exercise-pool copies
-- are removed. Any pool-scoped attempts for these unusable prompts cascade.
delete from lesson_pool
where source_table = 'lesson_items'
  and source_id in (
    7093,              -- exact duplicate: A bientot
    7747, 7770,        -- duplicate pronoun material
    8384,              -- six argot expressions bundled into one recording
    8642, 8643,        -- one French prompt with two Lingala answers
    8688, 8689, 8690,  -- recording metadata, not translation pairs
    8692               -- several proverbs and variants bundled into one row
  );

commit;

-- Expected immediately after this migration: 0 excluded rows, 4 example rows,
-- 5 text overrides. The totals are informational so this stays future-proof.
select
  count(*) filter (
    where source_table = 'lesson_items'
      and source_id in (7093, 7747, 7770, 8384, 8642, 8643, 8688, 8689, 8690, 8692)
  ) as excluded_rows_remaining,
  count(*) filter (
    where source_table = 'lesson_items'
      and source_id in (7746, 7751, 7754, 7755)
  ) as example_rows_present,
  count(*) filter (
    where source_table = 'lesson_items'
      and source_id in (7775, 8641, 8662, 8663, 8664)
  ) as normalized_rows_present,
  count(*) filter (where tier = 'native') as native_rows_total
from lesson_pool;
