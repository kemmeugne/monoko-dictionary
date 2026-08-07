-- Run once in Supabase SQL Editor
-- Adds pgvector semantic search to the DICTIONARY (senses + examples).
--
-- Why: until now only parallel_sentences and lesson_items had embedding
-- columns, so the two RAG endpoints (match_parallel_sentences,
-- match_lesson_items) could reach ~5,238 of the ~10,066 verified FR↔LN pairs
-- the app owns. The 2,686 professor-recorded dictionary example sentences and
-- the 2,686 headword↔word pairs were never retrievable by the chat — the model
-- answered from its own Lingala knowledge instead of the verified data.
--
-- senses/examples are joined to words for language_id, which is why the RPCs
-- below join rather than filtering a local column.

-- 1. Enable pgvector extension (no-op if already enabled)
create extension if not exists vector;

-- 2. Add embedding columns
alter table examples add column if not exists embedding vector(384);
alter table senses   add column if not exists embedding vector(384);

-- 3. Similarity search over dictionary EXAMPLE SENTENCES
--    The richest source: full sentences, French + Lingala, most with audio.
create or replace function match_examples(
  query_embedding vector(384),
  match_count     int,
  p_language_id   bigint
)
returns table (
  id               bigint,
  sentence_french  text,
  sentence_dialect text,
  audio_url        text,
  french_word      text,
  dialect_word     text,
  similarity       float
)
language sql stable
as $$
  select
    e.id,
    e.sentence_french,
    e.sentence_dialect,
    e.audio_url,
    w.french_word,
    s.dialect_word,
    1 - (e.embedding <=> query_embedding) as similarity
  from examples e
  join senses s on s.id = e.sense_id
  join words  w on w.id = s.word_id
  where w.language_id = p_language_id
    and e.embedding is not null
  order by e.embedding <=> query_embedding
  limit match_count;
$$;

-- 4. Similarity search over dictionary HEADWORDS
--    Word-level pairs: weaker for chat context, but they carry the audio the
--    vocabulary lessons need and they answer "how do you say X".
create or replace function match_senses(
  query_embedding vector(384),
  match_count     int,
  p_language_id   bigint
)
returns table (
  id           bigint,
  french_word  text,
  dialect_word text,
  audio_url    text,
  similarity   float
)
language sql stable
as $$
  select
    s.id,
    w.french_word,
    s.dialect_word,
    s.audio_url,
    1 - (s.embedding <=> query_embedding) as similarity
  from senses s
  join words w on w.id = s.word_id
  where w.language_id = p_language_id
    and s.embedding is not null
  order by s.embedding <=> query_embedding
  limit match_count;
$$;

-- 5. Optional ANN indexes (enable once all rows are embedded)
-- create index if not exists examples_embedding_idx
--   on examples using ivfflat (embedding vector_cosine_ops) with (lists = 40);
-- create index if not exists senses_embedding_idx
--   on senses using ivfflat (embedding vector_cosine_ops) with (lists = 40);
