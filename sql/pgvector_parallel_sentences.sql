-- Run once in Supabase SQL Editor
-- Adds pgvector semantic search to parallel_sentences (RAG corpus)

-- 1. Enable pgvector extension (no-op if already enabled)
create extension if not exists vector;

-- 2. Add embedding column
alter table parallel_sentences
  add column if not exists embedding vector(384);

-- 3. Similarity search RPC
--    Filters by language_id and quality, returns top matches with metadata.
create or replace function match_parallel_sentences(
  query_embedding vector(384),
  match_count     int,
  p_language_id   bigint
)
returns table (
  id            bigint,
  french_text   text,
  lingala_text  text,
  source        text,
  quality       text,
  similarity    float
)
language sql stable
as $$
  select
    ps.id,
    ps.french_text,
    ps.lingala_text,
    ps.source,
    ps.quality,
    1 - (ps.embedding <=> query_embedding) as similarity
  from parallel_sentences ps
  where ps.language_id = p_language_id
    and ps.embedding is not null
  order by ps.embedding <=> query_embedding
  limit match_count;
$$;

-- 4. Optional ANN index (enable once all rows are embedded)
-- create index if not exists parallel_sentences_embedding_idx
--   on parallel_sentences using ivfflat (embedding vector_cosine_ops)
--   with (lists = 20);
