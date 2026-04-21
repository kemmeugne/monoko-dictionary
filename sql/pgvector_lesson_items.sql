-- Run once in Supabase SQL Editor

-- 1. Enable pgvector extension
create extension if not exists vector;

-- 2. Add embedding column to lesson_items
alter table lesson_items
  add column if not exists embedding vector(384);

-- 3. Similarity search RPC
--    Filters by language_id (via lessons → courses), returns top matches.
create or replace function match_lesson_items(
  query_embedding vector(384),
  match_count     int,
  p_language_id   bigint
)
returns table (
  id              bigint,
  lesson_id       bigint,
  french          text,
  dialect         text,
  example_french  text,
  example_dialect text,
  audio_url       text,
  example_audio_url text,
  similarity      float
)
language sql stable
as $$
  select
    li.id,
    li.lesson_id,
    li.french,
    li.dialect,
    li.example_french,
    li.example_dialect,
    li.audio_url,
    li.example_audio_url,
    1 - (li.embedding <=> query_embedding) as similarity
  from lesson_items li
  join lessons     le on le.id = li.lesson_id
  join courses     co on co.id = le.course_id
  where co.language_id = p_language_id
    and li.embedding is not null
  order by li.embedding <=> query_embedding
  limit match_count;
$$;

-- 4. Optional: approximate nearest-neighbor index for speed
--    (only useful once you have thousands of rows; fine to skip for now)
-- create index if not exists lesson_items_embedding_idx
--   on lesson_items using ivfflat (embedding vector_cosine_ops)
--   with (lists = 20);
