-- Run once in Supabase SQL Editor
-- Creates `lesson_pool`: the material the exercise engine draws on.
--
-- WHY A SEPARATE TABLE AND NOT A VIEW
-- The pool is assembled from four tables (lesson_items, parallel_sentences,
-- examples, senses) and two LLM passes whose verdicts live in artifacts, not in
-- the database. A view could not express "the model approved this placement" or
-- "the model moved this row to a different lesson". The pool is also read on
-- every exercise, so a flat, indexed table beats a four-way join.
--
-- WHY THE TEXT IS DENORMALISED
-- The client fetches one lesson's pool in a single query instead of joining four
-- source tables, and the copied text freezes exactly what an exercise may show.
-- `source_table` + `source_id` keep the provenance, so a row can always be
-- traced back and re-synced deliberately rather than drifting silently.

create table if not exists lesson_pool (
  id            bigserial primary key,
  language_id   bigint  not null references languages(id),
  lesson_id     bigint  not null references lessons(id) on delete cascade,

  -- provenance: which table this came from, and its id there
  source_table  text    not null check (source_table in
                          ('lesson_items','parallel_sentences','examples','senses')),
  source_id     bigint  not null,

  french        text    not null,
  lingala       text    not null,
  audio_url     text,

  -- How the row earned its place, and therefore how much to trust it:
  --   native     — the professor wrote it into this lesson. 100% by construction.
  --   approved   — cosine proposed the lesson, an LLM confirmed it.  ~96%.
  --   reassigned — cosine was wrong; an LLM chose this lesson from all 50. ~90%.
  -- Kept per row so the engine can prefer native content where a lesson has
  -- enough of it, rather than treating all material as equally reliable.
  tier          text    not null check (tier in ('native','approved','reassigned')),

  token_count   smallint not null,

  -- Property of the SOURCE, not of the string. The dictionary is written without
  -- tone marks and the course with them, so "Mbote" from the course is correctly
  -- spelled while "Mbula" from the dictionary is missing a tone. Testing a string
  -- for accents would misclassify every legitimately toneless word.
  -- The engine must never mix the two inside one exercise.
  orthography   text    not null check (orthography in ('toned','untoned')),

  -- level        = the level of the lesson this row sits in
  -- difficulty   = 1-6 for single words (topic is the wrong axis for a word),
  --                null for sentences, whose length already grades them
  -- effective_level = max(level, difficulty). Difficulty only ever RESTRICTS:
  --                topical routing still enriches a lesson, but a hard word
  --                cannot leak down into an easy one.
  level            smallint not null check (level between 1 and 6),
  difficulty       smallint check (difficulty between 1 and 6),
  effective_level  smallint not null check (effective_level between 1 and 6),

  created_at    timestamptz not null default now(),

  -- One pool row per source row: makes the populate script safely re-runnable
  -- and stops a re-import from silently doubling a lesson's material.
  unique (source_table, source_id)
);

create index if not exists lesson_pool_lesson_idx on lesson_pool (lesson_id);
create index if not exists lesson_pool_level_idx  on lesson_pool (language_id, effective_level);
-- Exercise selection filters on shape (has audio / long enough) far more often
-- than on anything else, so index the columns the generator actually queries.
create index if not exists lesson_pool_shape_idx  on lesson_pool (lesson_id, token_count)
  where audio_url is not null;

-- Public read, same as the rest of the course content: the app reads this with
-- the anon key. Writes go through the service key only (no insert/update policy).
alter table lesson_pool enable row level security;

drop policy if exists "lesson_pool public read" on lesson_pool;
create policy "lesson_pool public read" on lesson_pool
  for select using (true);
