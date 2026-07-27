-- ============================================================================
-- Monoko test-project schema (HARNESS_SPRINT.md Session 1)
--
-- Applies the full schema to a fresh Supabase project (e.g. monoko-test) so
-- Vitest/Playwright can run against real structure instead of production.
--
-- Provenance:
--   - Base tables (languages, words, senses, examples, parallel_sentences,
--     corrections, chat_events, courses, lessons, lesson_items) have no
--     CREATE TABLE script in this repo (created via the Supabase dashboard
--     directly on production). Reconstructed here from the documented
--     column-by-column schema in TECHNICAL_DOCS.md Section 3, using each
--     table's CURRENT final column set (not a historical migration replay --
--     irrelevant for a fresh project).
--   - profiles / user_progress: copied verbatim from sql/progress_tracking.sql
--   - pgvector columns + RPC functions: from sql/pgvector_lesson_items.sql and
--     sql/pgvector_parallel_sentences.sql (folded into the base CREATE TABLEs
--     below instead of a separate ALTER, since this is a fresh project)
--   - RLS + policies: from sql/enable_rls.sql
--   - reviewed_at / t_rag_ms / t_llm_ms: from sql/corrections_reviewed_at.sql
--     and sql/chat_events_latency.sql (folded into base CREATE TABLEs)
--   - trigram indexes: from the "legacy one-off migrations" block in
--     TECHNICAL_DOCS.md Section 3
--
-- Idempotent: safe to re-run. Every statement uses IF NOT EXISTS,
-- CREATE OR REPLACE, or DROP POLICY IF EXISTS + CREATE POLICY.
--
-- Hard safety rule: this file is applied by scripts/sync_test_schema.js,
-- which refuses to run against anything but the test project. Never run
-- this file directly against production with `apply-supabase`-style tooling.
-- ============================================================================

-- ── Extensions ────────────────────────────────────────────────────────────
create extension if not exists vector;
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ── Dictionary hierarchy ─────────────────────────────────────────────────

create table if not exists languages (
  id     bigserial primary key,
  name   text,
  code   text,
  status text
);

create table if not exists words (
  id           bigserial primary key,
  language_id  bigint references languages(id),
  french_word  text,
  letter       text
);

create table if not exists senses (
  id                bigserial primary key,
  word_id           bigint references words(id),
  sense_number      int,
  dialect_word      text,
  audio_url         text,
  audio_key         text,
  audio_source_cell text
);

create table if not exists examples (
  id                bigserial primary key,
  sense_id          bigint references senses(id),
  sentence_dialect  text,
  sentence_french   text,
  audio_url         text,
  audio_key         text,
  audio_source_cell text
);

-- ── RAG corpus ───────────────────────────────────────────────────────────

create table if not exists parallel_sentences (
  id           bigserial primary key,
  language_id  bigint references languages(id),
  french_text  text,
  lingala_text text,
  source       text,
  quality      text,
  created_at   timestamptz default now(),
  embedding    vector(384)
);

-- ── Corrections + chat activity ─────────────────────────────────────────

create table if not exists corrections (
  id                  bigserial primary key,
  language_id         bigint references languages(id),
  user_query          text,
  ai_response         text,
  correction_type     text,
  correct_lingala     text,
  correct_french      text,
  example_sentence    text,
  tester_name         text,
  session_id          text,
  status              text default 'pending',
  professor_modified  boolean default false,
  reviewed_at         timestamptz,
  created_at          timestamptz default now()
);

create table if not exists chat_events (
  id                  bigserial primary key,
  created_at          timestamptz not null default now(),
  tester_name         text,
  session_id          text,
  language_id         bigint references languages(id),
  user_query          text,
  assistant_response  text,
  message_count       int,
  t_rag_ms            integer,
  t_llm_ms            integer
);

-- ── Courses ──────────────────────────────────────────────────────────────

create table if not exists courses (
  id            bigserial primary key,
  language_id   bigint references languages(id),
  title         text,
  icon          text,
  course_order  int
);

create table if not exists lessons (
  id            bigserial primary key,
  course_id     bigint references courses(id),
  title         text,
  lesson_order  int
);

create table if not exists lesson_items (
  id                          bigserial primary key,
  lesson_id                   bigint references lessons(id),
  french                      text,
  dialect                     text,
  example_french              text,
  example_dialect             text,
  audio_url                   text,
  audio_key                   text,
  audio_source_cell           text,
  example_audio_url           text,
  example_audio_key           text,
  example_audio_source_cell   text,
  item_order                  int,
  embedding                   vector(384)
);

-- ── User progress (verbatim from sql/progress_tracking.sql) ────────────

create table if not exists profiles (
  user_id                uuid references auth.users primary key,
  display_name           text,
  preferred_language_id  int references languages(id),
  created_at             timestamptz default now()
);

alter table profiles enable row level security;

drop policy if exists "Users manage their own profile" on profiles;
create policy "Users manage their own profile"
  on profiles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists user_progress (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null,
  lesson_id     int references lessons(id) on delete cascade not null,
  language_id   int references languages(id) not null,
  completed_at  timestamptz default now(),
  exam_score    numeric,
  unique (user_id, lesson_id)
);

alter table user_progress enable row level security;

drop policy if exists "Users manage their own progress" on user_progress;
create policy "Users manage their own progress"
  on user_progress for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists user_progress_user_lang_idx
  on user_progress (user_id, language_id);

-- ── Trigram search indexes (from TECHNICAL_DOCS.md legacy migrations) ──

create index if not exists idx_parallel_sentences_french_trgm
  on parallel_sentences using gin (french_text gin_trgm_ops);
create index if not exists idx_parallel_sentences_lingala_trgm
  on parallel_sentences using gin (lingala_text gin_trgm_ops);

-- ── RPC functions (from sql/pgvector_*.sql) ─────────────────────────────

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

create or replace function match_lesson_items(
  query_embedding vector(384),
  match_count     int,
  p_language_id   bigint
)
returns table (
  id                 bigint,
  lesson_id          bigint,
  french             text,
  dialect            text,
  example_french     text,
  example_dialect    text,
  audio_url          text,
  example_audio_url  text,
  similarity         float
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

-- ── RLS (from sql/enable_rls.sql) ───────────────────────────────────────

-- 1. Dictionary tables — public read-only
alter table languages          enable row level security;
alter table words               enable row level security;
alter table senses              enable row level security;
alter table examples            enable row level security;
alter table parallel_sentences  enable row level security;

drop policy if exists "Public read" on languages;
create policy "Public read" on languages for select using (true);
drop policy if exists "Public read" on words;
create policy "Public read" on words for select using (true);
drop policy if exists "Public read" on senses;
create policy "Public read" on senses for select using (true);
drop policy if exists "Public read" on examples;
create policy "Public read" on examples for select using (true);
drop policy if exists "Public read" on parallel_sentences;
create policy "Public read" on parallel_sentences for select using (true);

-- 2. Course tables — public read-only
alter table courses       enable row level security;
alter table lessons       enable row level security;
alter table lesson_items  enable row level security;

drop policy if exists "Public read" on courses;
create policy "Public read" on courses for select using (true);
drop policy if exists "Public read" on lessons;
create policy "Public read" on lessons for select using (true);
drop policy if exists "Public read" on lesson_items;
create policy "Public read" on lesson_items for select using (true);

-- 3. Corrections — public insert + select; approve/reject via service key
alter table corrections enable row level security;

drop policy if exists "Public read" on corrections;
create policy "Public read" on corrections for select using (true);
drop policy if exists "Public insert" on corrections;
create policy "Public insert" on corrections for insert with check (true);

-- 4. Chat events — no public access (service key only, bypasses RLS)
alter table chat_events enable row level security;

-- 5. profiles / user_progress RLS already applied above, with their tables.
