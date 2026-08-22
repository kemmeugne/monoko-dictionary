# Monɔkɔ — Technical Documentation

> **The world's first conversational AI for African languages, starting with Lingala.**

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [System Architecture](#2-system-architecture)
3. [Database Schema](#3-database-schema)
4. [RAG Pipeline](#4-rag-pipeline)
5. [Data Sources](#5-data-sources)
6. [Frontend](#6-frontend)
7. [Backend API](#7-backend-api)
8. [Scripts Reference](#8-scripts-reference)
9. [Deployment](#9-deployment)
10. [Adding a New Language](#10-adding-a-new-language)
11. [Known Limitations & Next Steps](#11-known-limitations--next-steps)

---

## 1. Project Overview

**Monɔkɔ** is a multilingual dictionary and AI conversation app for African languages. It combines a professor-verified dictionary, structured grammar courses, and an AI chat assistant powered by a custom RAG (Retrieval-Augmented Generation) system built on 60,000+ curated French–Lingala sentence pairs.

### Current languages
| Language | Speakers | Region |
|---|---|---|
| Lingala | ~45 million | DRC, Congo, CAR, Angola |
| Yoruba | ~47 million | Nigeria, Benin, Togo |

### Core features
- **Dictionary**: French ↔ dialect word lookup with multiple senses and example sentences
- **Courses**: Structured grammar lessons (conjugation, pronouns, useful phrases, vocabulary by theme)
- **AI Chat (Monoko)**: Conversational AI that translates, explains grammar, and holds dialogue — backed by a pgvector RAG on Supabase
- **Correction system**: Users flag AI errors; admins approve corrections which flow back into the verified corpus
- **Admin panel**: Password-protected review interface with per-card approve/reject and pagination
- **Automated quality testing**: `monoko_auto_test.py` generates test sentences, evaluates Monoko's Lingala output, and auto-inserts failures as pending corrections

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER (Browser)                               │
│              https://monoko-dictionary.vercel.app                    │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
              ┌─────────────▼──────────────────────────┐
              │            VERCEL                        │
              │   index.html  admin.html                 │
              │   /api/chat.js          ← LLM proxy      │
              │   /api/rag-context.js   ← RAG corpus     │
              │   /api/lesson-context.js← course search  │
              │   /api/admin-action.js  ← admin writes   │
              └──────┬─────────────────────┬────────────┘
                     │                     │
          ┌──────────▼──┐   ┌─────────────▼──────────────┐
          │  OPENAI     │   │      SUPABASE               │
          │  gpt-4o-mini│   │  (PostgreSQL + pgvector)    │
          │  embeddings │   │                             │
          └─────────────┘   │  Tables:                    │
                            │  • languages                │
                            │  • words / senses / examples│
                            │    (senses.embedding,       │
                            │     examples.embedding)     │
                            │  • parallel_sentences       │
                            │    (embedding vector(384))  │
                            │  • corrections              │
                            │  • courses / lessons        │
                            │  • lesson_items             │
                            │    (embedding vector(384))  │
                            └─────────────────────────────┘
```

### Request flow for a chat message

```
1. User types message in index.html chat
2. If no tester name exists locally, index.html forces a `nom du testeur` step before chat opens
3. index.html fires two parallel context fetches:
   a. Vercel POST /api/rag-context  →  OpenAI embed → 3 RPCs in parallel:
      match_parallel_sentences (30 corpus) + match_examples (12 dict sentences) + match_senses (6 dict words)
   b. Vercel POST /api/lesson-context → OpenAI embed → pgvector match_lesson_items → top-8 course rows
4. Both contexts merged → Vercel POST /api/chat → OpenAI gpt-4o-mini with corpus-first system prompt + context + tester metadata
5. Response displayed in chat
6. (Optional) User clicks "Corriger" → correction saved to Supabase corrections table with tester metadata
7. Admin approves correction in admin.html → pair inserted into parallel_sentences as verified
```

**Migration note (2026-03-31)**: Railway/FAISS backend was decommissioned. All vector search now runs on Supabase pgvector. NLLB auto-quality data was dropped — the corpus is verified/gold pairs only (3,481 rows, counted 2026-08-07; an earlier "~7k" figure double-counted the dictionary, which lives in `senses`/`examples`).

---

## 3. Database Schema

### Supabase project
- **URL**: `https://haioiccujncsehadipzb.supabase.co`
- **Region**: Default (Supabase-managed)

---

### `languages`
Defines each supported language.

| Column | Type | Description |
|---|---|---|
| `id` | BIGSERIAL PK | Auto-increment ID |
| `name` | TEXT | e.g. `"Lingala"`, `"Yoruba"` |
| `code` | TEXT | 3-letter code e.g. `"lin"`, `"yor"` |
| `status` | TEXT | `"active"` or `"inactive"` |

**Known IDs**: Lingala = 1, Yoruba = 2

---

### `words`
One row per French headword per language.

| Column | Type | Description |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `language_id` | BIGINT FK → languages | |
| `french_word` | TEXT | The French entry word |
| `letter` | TEXT | First letter (for A–Z browsing) |

---

### `senses`
Each word can have multiple senses (translations).

| Column | Type | Description |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `word_id` | BIGINT FK → words | |
| `sense_number` | INT | Order (1, 2, 3…) |
| `dialect_word` | TEXT | Translation in the dialect |
| `audio_url` | TEXT | Public audio URL for the dialect word |
| `audio_key` | TEXT | Cloudflare R2 object key |
| `audio_source_cell` | TEXT | Original Excel source cell, e.g. `"B.C13"` |

---

### `examples`
Example sentences per sense.

| Column | Type | Description |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `sense_id` | BIGINT FK → senses | |
| `sentence_dialect` | TEXT | Example in dialect |
| `sentence_french` | TEXT | French translation of example |
| `audio_url` | TEXT | Public audio URL for the dialect sentence |
| `audio_key` | TEXT | Cloudflare R2 object key |
| `audio_source_cell` | TEXT | Original Excel source cell, e.g. `"B.D12"` |

---

### `parallel_sentences`
The RAG corpus — all parallel FR↔dialect sentence pairs.

| Column | Type | Description |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `language_id` | BIGINT FK → languages | |
| `french_text` | TEXT | French sentence |
| `lingala_text` | TEXT | Dialect sentence |
| `source` | TEXT | `"flores200"`, `"correction"`, `"nllb"` |
| `quality` | TEXT | `"gold"`, `"verified"`, `"auto"` |
| `created_at` | TIMESTAMPTZ | Auto |

**Current data (2026-08-07)**: 3,481 rows — 2,009 FLORES-200 gold + 1,263 approved corrections + 209 course variants. The dictionary is *not* in this table; it lives in `senses`/`examples` and has its own embeddings since 2026-08-07.

---

### `corrections`
User-submitted AI corrections awaiting admin review.

| Column | Type | Description |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `language_id` | BIGINT FK → languages | |
| `user_query` | TEXT | Original user message |
| `ai_response` | TEXT | The AI response being corrected |
| `correction_type` | TEXT | `"incorrect"`, `"partial"`, `"missing"` |
| `correct_lingala` | TEXT | Corrected dialect text (required) |
| `correct_french` | TEXT | Corresponding French text (required) |
| `example_sentence` | TEXT | Optional example |
| `tester_name` | TEXT | Tester/professor name entered before chat |
| `session_id` | TEXT | Browser session identifier used for activity tracking |
| `status` | TEXT | `"pending"`, `"approved"`, `"rejected"` |
| `professor_modified` | BOOLEAN | `true` if the professor edited the correction before approving |
| `reviewed_at` | TIMESTAMPTZ | Set by `admin-action.js` on approve or reject — used for pace tracking (added 2026-04-18) |
| `created_at` | TIMESTAMPTZ | Auto |

**Flow**: `pending` → admin review → professor edits if needed → `approved` (auto-inserts into `parallel_sentences`) + `reviewed_at` stamped

**Monitoring** — % of corrections the professor had to fix:
```sql
SELECT
  COUNT(*) FILTER (WHERE professor_modified = true) AS edited,
  COUNT(*) AS total,
  CASE WHEN COUNT(*) = 0 THEN NULL
       ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE professor_modified = true) / COUNT(*), 1)
  END AS pct_edited
FROM corrections WHERE status = 'approved';
```

**Monitoring** — professor review pace per day (full queries in `sql/corrections_reviewed_at.sql`):
```sql
SELECT
  DATE(reviewed_at) AS day,
  COUNT(*) AS reviewed,
  ROUND(EXTRACT(EPOCH FROM (MAX(reviewed_at) - MIN(reviewed_at))) / NULLIF(COUNT(*) - 1, 0)) AS avg_seconds_between
FROM corrections
WHERE reviewed_at IS NOT NULL
GROUP BY day ORDER BY day DESC;
```

### `chat_events`
Tester-tracked Monoko chat activity written server-side by `/api/chat`.

| Column | Type | Description |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `created_at` | TIMESTAMPTZ | Auto |
| `tester_name` | TEXT | Tester/professor name |
| `session_id` | TEXT | Browser session identifier |
| `language_id` | BIGINT FK → languages | |
| `user_query` | TEXT | User message sent to chat |
| `assistant_response` | TEXT | Model response returned to the user |
| `message_count` | INT | Number of conversation messages sent to `/api/chat` |

---

### `courses`
Top-level course container per language.

| Column | Type | Description |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `language_id` | BIGINT FK → languages | |
| `title` | TEXT | e.g. `"Construction phrasique"` |
| `icon` | TEXT | Emoji |
| `course_order` | INT | Display order |

---

### `lessons`
Sections within a course.

| Column | Type | Description |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `course_id` | BIGINT FK → courses | |
| `title` | TEXT | e.g. `"Les pronoms personnels"` |
| `lesson_order` | INT | Display order |

---

### `lesson_items`
Individual vocabulary/grammar pairs within a lesson.

| Column | Type | Description |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `lesson_id` | BIGINT FK → lessons | |
| `french` | TEXT | French word or phrase |
| `dialect` | TEXT | Dialect equivalent |
| `example_french` | TEXT | Example sentence FR (optional) |
| `example_dialect` | TEXT | Example sentence dialect (optional) |
| `audio_url` | TEXT | Public audio URL for the lesson item dialect line |
| `audio_key` | TEXT | Cloudflare R2 object key for the lesson item line |
| `audio_source_cell` | TEXT | Original workbook source cell for the lesson item line |
| `example_audio_url` | TEXT | Public audio URL for the example dialect sentence |
| `example_audio_key` | TEXT | Cloudflare R2 object key for the example dialect sentence |
| `example_audio_source_cell` | TEXT | Original workbook source cell for the example dialect sentence |
| `item_order` | INT | Display order |

---

### `profiles`
One row per authenticated user.

| Column | Type | Description |
|---|---|---|
| `user_id` | UUID PK → auth.users | |
| `display_name` | TEXT | User's chosen display name |
| `preferred_language_id` | INT FK → languages | Written when the learner picks a language, and read on load to resume them there (2026-08-22). Until then only `saveLearnerProfile` set it, so it was a side effect of editing a pseudonym and nothing read it back |
| `public_pseudonym` | TEXT | Optional unique name shown in rankings |
| `country_code` | TEXT | Learner-selected ranking country |
| `leaderboard_opt_in` | BOOLEAN | False by default; no ranking exposure without consent |
| `created_at` | TIMESTAMPTZ | Auto |

RLS: users can only read/write their own row.

---

### `user_progress`
One row per (user, lesson) pair. Tracks which modules a user has completed.

| Column | Type | Description |
|---|---|---|
| `id` | UUID PK | `gen_random_uuid()` |
| `user_id` | UUID FK → auth.users | |
| `lesson_id` | INT FK → lessons | ON DELETE CASCADE |
| `language_id` | INT FK → languages | Denormalized for efficient per-language queries |
| `completed_at` | TIMESTAMPTZ | When the learner passed Pratiquer at 80% first-try |
| `exam_score` | NUMERIC | Always NULL — exams were dropped 2026-08-07, column kept rather than migrated away |

Unique constraint: `(user_id, lesson_id)` — one completion row per lesson per user.
Index: `(user_id, language_id)` for fast per-user progress queries.
RLS: users can only read/write their own rows.

---

### `lesson_pool`
The exercise engine's material — **6,196 rows across all 50 lessons**, assembled
from four source tables plus two LLM routing passes (`sql/lesson_pool.sql`,
rebuilt by `populate_lesson_pool.py`). A table rather than a view because a view
cannot express "a model approved this placement". See `EXERCISE_ENGINE_PLAN.md`
Slice 1 for the column-by-column reasoning.

| Column | Type | Description |
|---|---|---|
| `id` | BIGSERIAL PK | What `exercise_attempts.pool_item_id` points at |
| `language_id` / `lesson_id` | BIGINT FK | |
| `source_table` / `source_id` | TEXT / BIGINT | Provenance: `lesson_items`, `parallel_sentences`, `examples` or `senses` |
| `french` / `lingala` / `audio_url` | TEXT | Denormalized so one query feeds a whole session |
| `tier` | TEXT | `native` (professor wrote it here, 100%) · `approved` (LLM confirmed, 96%) · `reassigned` (LLM re-placed, 90%) |
| `token_count` | SMALLINT | Lingala side |
| `orthography` | TEXT | `toned` / `untoned` — a property of the SOURCE, never sniffed from the string |
| `level` / `difficulty` / `effective_level` | SMALLINT | `effective_level = max(level, difficulty)`; difficulty only ever restricts |

Unique `(source_table, source_id)` makes the populate script re-runnable.
RLS: **public read** (the app reads it with the anon key), writes service-key only.

---

### `exercise_attempts`
One row per question answered (`sql/exercise_progress.sql`, applied 2026-08-17).
The substrate for the 80% gate, the mastery counter, and SM-2 in Slice 7.

| Column | Type | Description |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `user_id` | UUID FK → auth.users | ON DELETE CASCADE |
| `pool_item_id` | BIGINT FK → lesson_pool | ON DELETE CASCADE |
| `lesson_id` | BIGINT FK → lessons | |
| `stage` | TEXT | `pratiquer` \| `elargir` (CHECK) |
| `format` | TEXT | `match_pairs`, `choose_audio`, … — deliberately unconstrained so Slice 6 adds types without a migration |
| `correct` | BOOLEAN | **FIRST-TRY only.** Retry screens write nothing at all — counting them would let the gate be farmed by failing and then clearing the retry |
| `answered_at` | TIMESTAMPTZ | |

Indexes: `(user_id, lesson_id, answered_at DESC)` for the gate and counter;
`(user_id, pool_item_id, answered_at DESC)` for SM-2's per-item history.
Written in **one batched insert at session end**, not per question. An abandoned
session still flushes; only a completed one may move the gate.

---

### `lesson_stage_state`
One row per (user, lesson) — the stage state the lesson screen reads on render.
A materialisation of `exercise_attempts`, kept because "is Élargir unlocked?" is
asked on every render and must not aggregate an ever-growing attempt log.

| Column | Type | Description |
|---|---|---|
| `user_id` / `lesson_id` | UUID / BIGINT | Composite PK |
| `language_id` | BIGINT FK → languages | |
| `pratiquer_passed` | BOOLEAN | **One-way door** — never cleared by a later weaker session |
| `pratiquer_best` / `elargir_best` | INT | % first-try, best session |
| `pratiquer_xp` / `elargir_xp` | INT | Persisted XP by lesson stage |
| `elargir_xp` | INT | Drives the topic level |
| `pratiquer_runs` / `elargir_runs` | INT | Completed sessions only. **Existed in production from Slice 5 but in no `sql/` file until 2026-08-18** — the app wrote them and the briefing read them while every migration file said they did not exist. Only a rebuilt environment would have noticed, and it would have failed the whole upsert on an unknown column, taking `pratiquer_passed` and the scores with it. |
| `updated_at` | TIMESTAMPTZ | |

RLS on both tables mirrors `user_progress`: own rows only, read and write. They
are written from the client with the user's session token, so the policy is the
only thing between one learner's progress and another's.

---

### `user_streak`  (added 2026-08-18, `sql/progression.sql`)
One row per **user** — not per language and not per lesson. A streak answers
"did you show up today", which is a fact about the person; keying it by language
would break the streak of a learner doing Lingala on Monday and Yoruba on
Tuesday, punishing exactly the behaviour the app wants.

| Column | Type | Description |
|---|---|---|
| `user_id` | UUID PK FK → auth.users | |
| `current_streak` | INT | Consecutive days |
| `longest_streak` | INT | Never decreases — the trophy, not the counter |
| `last_day` | DATE | **Learner-local day, supplied by the client** |
| `updated_at` | TIMESTAMPTZ | |

`last_day` is a `date` and is never defaulted to `now()::date`, which Postgres
evaluates in **UTC**. A learner in Montreal finishing at 20:00 EST is already
tomorrow in UTC, so a server-side day boundary would award two streak days for
one evening and then break a streak they had kept. The client sends its own
`YYYY-MM-DD` and all arithmetic is done against that.

Screens render `streakDisplay(row, today)`, not the stored `current_streak`, so
a streak that has already lapsed reads as 0 immediately rather than showing a
stale number until the learner's next session.

---

### `review_schedule`  (added 2026-08-18, `sql/progression.sql`)
SM-2 scheduler state, one row per (user, pool item). **Both stages** since
2026-08-20. Spaced repetition needs a finite item set with per-item state, and
both stages are finite **per lesson** — median 25 native items, median 80 routed.
The 4,788-row figure that first excluded Élargir counts the whole corpus across
49 lessons, which no learner ever meets.

There is **no `stage` column, deliberately**: a pool item belongs to exactly one
tier, so `(user_id, pool_item_id)` already identifies the stage. The separation
is enforced where the session is built — `items` is filtered by tier before
`due` is consulted, so a Pratiquer item cannot leak into an Élargir session
however overdue it is.

| Column | Type | Description |
|---|---|---|
| `user_id` / `pool_item_id` | UUID / BIGINT | Composite PK |
| `lesson_id` | BIGINT FK → lessons | |
| `ease` | REAL | SM-2 easiness. Starts 2.5, floor 1.3, **ceiling 3.0 (ours, not SM-2's)** |
| `interval_days` | INT | 0 = due today, i.e. returns next session |
| `reps` | INT | Consecutive correct; reset to 0 on a miss |
| `due_on` | DATE | Learner-local day, as `user_streak.last_day` |
| `updated_at` | TIMESTAMPTZ | |

Index `(user_id, lesson_id, due_on)` — the session-start question is "what does
this learner owe on this lesson today".

This is deliberately **not** folded into `exercise_attempts`. That table is an
append-only event log (one row per question, first-try only); putting ease and
interval in it would mean recomputing every item's whole history on every
session start.

Classic SM-2 grades recall 0–5, but an exercise screen knows only right or
wrong, so the quality signal is one bit and the ease adjustment is modest:
**+0.1 on a hit, −0.2 on a miss**. The 3.0 ceiling exists because a binary
signal cannot justify the runaway intervals an uncapped ease produces. A miss
sets `interval_days = 0`; the ladder (1 → 6 → ×ease) floors at 1 day so that
`0 × ease` cannot strand a lapsed item as due-forever.

Verified end to end by `npm run verify:progression` against monoko-test.

---

### Learner community and level milestones  (added 2026-08-22)

`sql/community_experience.sql` supports the redesigned persistent learner
shell without deriving durable rewards from presentation state:

| Table | Purpose |
|---|---|
| `user_xp_events` | Seven-day ranking ledger; country/world API returns pseudonyms only |
| `user_level_rewards` | Fixed 500 XP and named medal, unique per learner and course |
| `level_challenge_state` | Best score, one-way pass, runs and XP for the optional level-wide Grand défi |
| `lesson_reward_claims` | One-time ordinary lesson gift claims, including any linked culture unlock |

Level completion is still derived from every lesson having a `user_progress`
row. RLS checks that condition before a level reward or Grand défi state can
be written. Database triggers create the fixed 500-XP completion event and the
one-time 300-XP enriched-level event, so replaying cannot duplicate either.
Ordinary challenge-session XP remains cumulative and the best score never
decreases.

`sql/trail_rewards.sql` keeps reward eligibility and XP issuance on the server.
`claim_lesson_reward` derives an ordinary gift from completed lesson progress;
`claim_level_reward` derives the completed course boundary and awards its named
medal plus 500 XP exactly once. Both RPCs require an authenticated learner and
remain idempotent under retries. Final lesson nodes therefore open the medal
ceremony rather than also creating an ordinary gift.

`sql/developer_course_tools.sql` authorizes developer accounts separately from
normal learners. Its presets rebuild that developer's real progress, XP and
prior claims atomically, but leave the selected level boundary unclaimed so the
production ceremony and reward flow can be tested repeatedly.

`sql/culture_capsules.sql` keeps capsule copy, source, review status and image
URL editable independently of the frontend. The initial seed deliberately
selects 16 of 49 lessons; gifts without a relevant cultural connection remain
plain XP rather than forcing filler content.

---

### `conjugation_forms`  (added 2026-08-18)
One verb's paradigm stored as a **grid**, not as lesson rows.

| Column | Type | Description |
|---|---|---|
| `id` | BIGSERIAL | PK |
| `language_id` | BIGINT FK → languages | |
| `verb` / `verb_fr` | TEXT | Infinitive and its gloss — `ko linga` / `aimer` |
| `tense` / `person` | TEXT | `present`, `imparfait`, `futur`, `present_prog`, `passe_prog` × `je tu il nous vous ils` |
| `tense_label` / `tense_order` / `person_order` | TEXT / SMALLINT / SMALLINT | Display order, so the client never hardcodes a sort |
| `french` | TEXT | **Generated** from (tense, person) — the source workbook's French has typos and mislabels the passé progressif |
| `lingala` | TEXT | **Copied verbatim** from the professor |
| `audio_url` | TEXT | NULL where he never recorded the form |
| `source_cell` | TEXT | Provenance: `2.C259` = column C, row 259 |

**Unique on `(language_id, verb, tense, person)`.** That constraint has to be
**named in the upsert** — the table also has a bigserial PK, and PostgREST will
not guess which one an upsert means; without the name it answers **409**.

30 rows today: *ko linga*, 5 tenses × 6 persons, **24 with audio** (the présent
column was never recorded, so those six render with no play button).

Why a grid: a paradigm is addressed by (verb, tense, person) and is unreadable
flattened. The original migration read the workbook **row-wise** when it is a
matrix (rows 259–264 = persons, columns B–F = tenses), and lost the whole table.

---

### `lesson_conjugation_tables`  (added 2026-08-18)
Pins a paradigm to a lesson, so one table can head several lessons without being
stored several times.

| Column | Type | Description |
|---|---|---|
| `lesson_id` / `verb` | BIGINT FK → lessons (ON DELETE CASCADE) / TEXT | **Composite PK** — name it in the upsert, same 409 as above |
| `language_id` | BIGINT FK → languages | |
| `tenses` | TEXT[] | Which tenses this lesson displays. **NULL means all** |
| `sort_order` | INT | |

`tenses` is an array on the link row rather than a row per tense because the unit
the page renders is one verb's block; splitting it fans the query out for
nothing. Current rows: **L358** four tenses (24 forms), **L359** `futur` (6
forms). **L393 futur proche has no row at all** — this paradigm has no futur
proche column, and showing it the futur simple would teach the wrong tense.

The frontend loader `select`s `*` rather than naming `tenses`: naming a column a
database has not migrated yet returns **400**, and a 400 there takes the whole
table off the lesson page. Undefined `tenses` reads as "all", which is the
pre-migration behaviour.

These rows also drive what gets **mirrored into `lesson_pool`** as exercise
material, so a lesson is never drilled on a tense it does not teach.
`sql/lesson_pool_conjugation_source.sql` widens `lesson_pool`'s `source_table`
CHECK to admit `conjugation_forms` — **applied 2026-08-18**. The pool now holds
**30 conjugation rows** (24 on L358, 6 on L359, all `tier = native`).

---

### Entity relationships

```
auth.users
  └── profiles (user_id)
  └── user_progress (user_id)
        └── lessons (lesson_id)
  └── exercise_attempts (user_id)
        └── lesson_pool (pool_item_id)
        └── lessons (lesson_id)
  └── lesson_stage_state (user_id)
        └── lessons (lesson_id)

languages
  └── words (language_id)
        └── senses (word_id)
              └── examples (sense_id)
  └── parallel_sentences (language_id)
  └── corrections (language_id)
  └── courses (language_id)
        └── lessons (course_id)
              └── lesson_items (lesson_id)
  └── user_progress (language_id)
  └── lesson_pool (language_id, lesson_id)   ← assembled FROM lesson_items,
                                                parallel_sentences, examples, senses,
                                                and (pending migration) conjugation_forms
  └── conjugation_forms (language_id)
        └── lesson_conjugation_tables (lesson_id, verb)  ← also decides which
                                                            forms enter lesson_pool
```

---

### SQL migrations

**`sql/progress_tracking.sql`** (2026-04-14) — `profiles` + `user_progress` tables with RLS. Run once in Supabase SQL editor. Idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`).

**`sql/conjugation_tables.sql`** (applied 2026-08-18) — `conjugation_forms` + `lesson_conjugation_tables`.

**`sql/conjugation_lesson_tenses.sql`** (applied 2026-08-18) — adds `lesson_conjugation_tables.tenses text[]`.

**`sql/lesson_pool_conjugation_source.sql`** (applied 2026-08-18) — widens `lesson_pool.source_table`'s CHECK to admit `conjugation_forms`. Before it ran, `populate_conjugation_forms.py` could not write pool rows at all; the insert failed the CHECK.

The full list of migration files, with what each one is for, lives in `CLAUDE.md` under "Key files in this repo".

**Legacy one-off migrations** (run directly in Supabase SQL editor, not tracked as files):

```sql
-- Run these once in Supabase SQL Editor if not already present

ALTER TABLE corrections ADD COLUMN IF NOT EXISTS correct_french TEXT;
ALTER TABLE corrections ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE corrections ADD COLUMN IF NOT EXISTS tester_name TEXT;
ALTER TABLE corrections ADD COLUMN IF NOT EXISTS session_id TEXT;

CREATE TABLE IF NOT EXISTS chat_events (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tester_name TEXT,
  session_id TEXT,
  language_id BIGINT REFERENCES languages(id),
  user_query TEXT,
  assistant_response TEXT,
  message_count INT
);

ALTER TABLE lesson_items
  ADD COLUMN IF NOT EXISTS audio_url TEXT,
  ADD COLUMN IF NOT EXISTS audio_key TEXT,
  ADD COLUMN IF NOT EXISTS audio_source_cell TEXT,
  ADD COLUMN IF NOT EXISTS example_audio_url TEXT,
  ADD COLUMN IF NOT EXISTS example_audio_key TEXT,
  ADD COLUMN IF NOT EXISTS example_audio_source_cell TEXT;

-- Optional: trigram index for faster ilike searches on parallel_sentences
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_parallel_sentences_french_trgm
  ON parallel_sentences USING gin (french_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_parallel_sentences_lingala_trgm
  ON parallel_sentences USING gin (lingala_text gin_trgm_ops);
```

---

## 4. RAG Pipeline

### Overview

When a user sends a message in the chat, context is retrieved via two parallel paths and merged before calling the LLM. Both paths run on Vercel + Supabase — no external backend required.

Path A searches **three** sources since 2026-08-07 — the corpus plus the two
dictionary indexes — but still as a single client round trip: the three RPCs are
issued in parallel server-side, so retrieval costs the slowest one, not the sum.

```
User message
     │
     ├─── Path A: pgvector Corpus + Dictionary Search (Vercel → Supabase)
     │         │
     │         ├─ POST /api/rag-context
     │         ├─ Embed query with OpenAI text-embedding-3-small (384 dim)
     │         ├─ Promise.allSettled, in parallel:
     │         │    ├─ match_parallel_sentences  → top-30 corpus pairs
     │         │    ├─ match_examples            → top-12 dictionary sentences
     │         │    └─ match_senses              → top-6  dictionary words
     │         ├─ Corpus is required; the two dictionary calls are additive —
     │         │  a failure there degrades to corpus-only, never a 500
     │         ├─ Filter by similarity >= 0.3 (senses >= 0.45)
     │         ├─ Dictionary hits also pass a RELATIVE cutoff: keep only those
     │         │  within 0.06 of the best score. Short strings embed into a
     │         │  narrow band that shifts per query — on "comment dit-on une
     │         │  cuillère" the answer scores 0.67 while cochon/grillon/palabre
     │         │  still score 0.48-0.52, so no absolute floor separates them.
     │         ├─ Sort: verified/gold first
     │         └─ Return corpus pairs + labelled dictionary sections
     │
     └─── Path B: pgvector Course Search (Vercel → Supabase)
               │
               ├─ POST /api/lesson-context
               ├─ Embed query with OpenAI text-embedding-3-small (384 dim)
               ├─ Call match_lesson_items RPC (filtered by language_id)
               ├─ Expand: fetch full lesson rows for matches above similarity 0.4
               └─ Return top-8 course lesson_items rows
     │
     ▼
Merge both contexts into one string (Promise.allSettled — either can fail silently)
     │
     ▼
OpenAI gpt-4o-mini
  System prompt: Monoko persona + language rules + corpus
  Max tokens: 512
  Last 6 messages of conversation history
     │
     ▼
AI response displayed with ✓ / ~ / ≈ quality indicators
```

Course lesson audio comes directly from Supabase on `lesson_items.audio_url` and `lesson_items.example_audio_url`.

**Migration note (2026-03-31)**: Railway/FAISS backend was decommissioned. NLLB auto-quality data was dropped. All vector search now runs on Supabase pgvector against verified/gold pairs only.

---

### Knowledge base composition

*Counted 2026-08-07. The "Monoko dictionary → parallel_sentences | 5,227" row that
stood here was wrong: the dictionary was never bulk-copied into the corpus. It
lives in `senses`/`examples` and only got its own embeddings on 2026-08-07.*

| Source | Count | Quality | Table |
|---|---|---|---|
| FLORES-200 | 2,009 | gold | `parallel_sentences` |
| Approved user corrections | 1,263 | verified | `parallel_sentences` |
| Course variants | 209 | verified | `parallel_sentences` |
| Course lesson items | 1,347 | verified | `lesson_items` |
| Dictionary example sentences | 2,686 | verified | `examples` |
| Dictionary headwords | 2,686 | verified | `senses` |
| **Unique FR↔LN pairs (deduped)** | **10,072** | | |

---

## 5. Data Sources

### Overview

| Source | Count | Quality | Table |
|---|---|---|---|
| FLORES-200 | 2,009 | gold | `parallel_sentences` |
| Approved user corrections | 1,263 | verified | `parallel_sentences` |
| Course variants | 209 | verified | `parallel_sentences` |
| **Total in `parallel_sentences`** | **3,481** | | |

The dictionary (`senses` + `examples`) is a separate 5,372-row store, searchable
since 2026-08-07. See "Knowledge base composition" above for the full picture.

**Note**: NLLB (Meta) auto-quality data (~60k pairs) was evaluated and dropped in March 2026 — it introduced more noise than signal for this use case.

---

### FLORES-200 (Meta AI)

**What it is**: Human-translated benchmark dataset covering 200+ languages. Gold standard quality.

**Download**: Via `datasets` library
```bash
python step1_download_data.py  # downloads flores dev/devtest splits
```

**Upload to Supabase**: `upload_flores_to_supabase.py`
- Reads `flores_fr.txt` + `flores_ln.txt`
- Uploads 2,008 pairs to `parallel_sentences` with `quality="gold"`

---

### Monoko Dictionary (Professor-verified)

**What it is**: The Monoko app's own dictionary, entered by professors and native speakers.

**Source**: Supabase tables: `words` → `senses` → `examples`

**Upload from Excel**: `upload_to_supabase.py`
- Reads structured `.xlsx` files
- Excel layout: Row per French word, columns grouped in sets of 3 (dialect word, dialect sentence, French sentence)
- Uploads to `words` → `senses` → `examples` hierarchy

> **Corrected 2026-08-07.** This section previously claimed *"the dictionary pairs
> are also mirrored into `parallel_sentences` so they are searchable by the RAG
> pipeline."* **That was never true**, and the claim is probably why the gap went
> unnoticed for so long. Only 390 dictionary pairs ever reached an indexed table
> (promoted into `lesson_items` during the curriculum migration); the other 4,828
> were unreachable by the chat until `senses` and `examples` were given their own
> embedding columns on 2026-08-07 (`sql/pgvector_dictionary.sql`).

---

## 6. Frontend

### `index.html`

Single-file React app served statically from Vercel. No build step — uses Babel standalone for JSX transpilation in the browser.

**Dependencies** (CDN):
- React 18.2 + ReactDOM
- Babel standalone 7.23.9
- Leaflet.js 1.9.4 (map)
- Google Fonts (Playfair Display, DM Sans, Source Serif 4, DM Mono)

---

### Views / routing

State-based routing with a `view` variable:

| View | Description |
|---|---|
| `lang_select` | Home — map + language cards |
| `home` | Language home — search, word of day, stats |
| `search` | Search results |
| `browse` | A–Z letter browser |
| `detail` | Word detail with senses and examples |
| `courses` | Course list (with per-level progress bars) |
| `course_detail` | Lesson list within a course (with completion checkmarks) |
| `lesson` | Lesson items table (FR ↔ dialect), Pratiquer / Élargir CTAs, "J'ai terminé" |
| `lesson` + `sessionExercises` | Full-screen practice session (see below) — same `view`, different render branch |
| `chat` | AI chat with Monoko |
| `auth` | Login / signup form |

---

### The exercise engine (added 2026-08-10 → 2026-08-18)

The practice loop lives in the same `<script type="text/babel">` block as the
rest of the frontend. **`EXERCISE_ENGINE_PLAN.md` is the authority**; this is the
map.

A lesson is three stages over two **disjoint** pools drawn from `lesson_pool`:

| Stage | Material | Shape |
|---|---|---|
| Apprendre | the lesson table | the teach beat |
| **Pratiquer** | `tier = native` — what the professor wrote | finite, **80% first-try to pass**, unlocks Élargir |
| **Élargir** | `tier IN (approved, reassigned)` — routed corpus | endless, replayable, carries a ⚑ Signaler flag |

**A session is 20 questions, not 15 screens** — a match-pairs screen contributes
5, every other type 1. `buildSession(items, level, count, history)` takes a
**pool**, never a `lesson_id`, so the future topic hub, play button and placement
session are the same function with a different pool.

| Piece | What it does |
|---|---|
| `tokenize` / `characters` / `fold` / `sameWord` | The one definition of a word, a letter, and "same word ignoring accents". Do **not** count words with `lesson_pool.token_count` — it came from a naive whitespace split and disagrees on 947 rows |
| `usableRow` | Blocks the dictionary's `/` and `?` placeholders, which `.trim()` lets through |
| `selectionOrder` | Draw order: unseen across sessions → unused this session → better tier → longest ago → random |
| `makeLedger` | Caps an item at 3 formats per session; cross-format reuse is what fills a thin lesson |
| `EXERCISE_SCREENS` | Type → component. A new type is one entry plus a builder |
| `ClipPlayer` | Shared play button + waveform (drawn, not measured — R2 sends no CORS, so Web Audio would output silence) |
| `afterClip` | Holds the screen until the clip finishes. **Never hand over on a bare timer** |
| `programmeOf` / `PROGRAMME_LABELS` / `plural` | The briefing's *Au programme* list, counted off the **built** queue with `questionCount()` — never off the budget constants. Labels live in the engine so the unit tests and the audit can both assert every emittable type has one |

All six exercise types are built: `match_pairs`, `choose_audio`, `word_order`,
`fill_blank`, `listen_type`, and `speaking`. Speaking is record-and-compare with
at most three prompts per session: the recording remains a local Blob, the
professor and learner play back-to-back, and the self-rating is persisted for
history but excluded from the 80% gate and objective mastery.

Two rules that look inconsistent and are not: **fill-the-blank folds accents**
(17.7% of its answers need a character no iPhone French keyboard can produce, and
it shows the accented spelling afterwards), while **listen-and-type compares
exactly** (it *is* the spelling, and tiles mean the learner can only build what
is offered).

Writes land in `exercise_attempts` (one row per question, **first-try only**,
batched at session end) and `lesson_stage_state` (the gate the lesson screen
reads). Verified by `npm test` and `node scripts/audit_exercise_types.mjs`.

---

### The lesson page (what `example_french` means)  (2026-08-18)

`lesson_items.example_french` carries **two different things**, and telling them
apart is a heuristic, not a column:

1. the **example sentence** for that row — the normal case, and what every
   current lesson holds;
2. in a few pre-July lessons, a **section label** like "Présent", repeated across
   the rows it heads.

The original rule was "any value repeated ⇒ labels", which is far too eager: two
pronouns sharing one example sentence flipped an entire lesson into grouped mode
and rendered its 29 example sentences as headings. A label is now required to be
**short (≤24 characters), free of terminal punctuation, and shared by ≥2 rows**.
Under that rule **no current lesson is grouped** — the heuristic was written for
a lesson shape the July restructure removed, and since then had only produced
false positives.

Separately, **every niveau-1 lesson takes an earlier branch** — the "Phrases —
Série 1 / Série 2" split table — which rendered French and dialect only and had
no example row at all, so the grouping fix could not reach it. It now renders the
same example row (French italic left, Lingala + play button right, on a dashed
divider) that the default table has. The branch keys off `course_order === 1`
rather than the lesson's shape, so it also catches vocabulary lessons where
"Série 1 / Série 2" is an arbitrary cut down a word list — left alone as
cosmetic, since changing it moves every niveau-1 lesson.

Between the two fixes, **181 example sentences across 9 lessons became visible**,
179 of them with audio the professor had already recorded. Nothing was added.

**Conjugation tables** render above the lesson's own rows, as **tense tabs**
(thirty cells do not fit a 375px column), from `lesson_conjugation_tables` +
`conjugation_forms`. The loader `select`s `*`, catches its own failure and
renders nothing, so a database missing the migration leaves the page unaffected.

---

### Search logic

**Text search** (in `home` view):
1. Searches `words.french_word ilike *query*` (French side)
2. Searches `senses.dialect_word ilike *query*` (dialect side)
3. Merges and deduplicates results

**Browse** (A–Z):
- Handles accented letters: `A` also matches `À`, `Â`; `E` matches `É`, `Ê`, `È`, etc.
- Loads up to 500 words per letter

---

### Chat interface (`searchContext` function)

Called before every chat API request. Fires two parallel context fetches and merges both into the system prompt.

**Path A — corpus search** (`POST /api/rag-context`):
- Embeds the query with OpenAI `text-embedding-3-small` (384 dim)
- Calls `match_parallel_sentences` RPC (filtered by `language_id`)
- Returns top-30 verified FR↔dialect pairs

**Path B — course content search** (`POST /api/lesson-context`):
- Same embedding approach
- Calls `match_lesson_items` RPC
- Returns top-8 course lesson rows

Both use `Promise.allSettled` — either can fail silently without breaking chat.

**Note (2026-03-31)**: Railway/FAISS backend was decommissioned. All vector search now runs on Supabase pgvector.

**Context format passed to the LLM**:
```
=== VOCABULAIRE VÉRIFIÉ ===
• abandonner → Kosundola [vérifié par professeur]

=== PHRASES PARALLÈLES ===
FR: Il est à l'école depuis le matin.
LN: Aza na kelasi banda tongo. [vérifié par professeur]
```

---

### LLM system prompt

Corpus-first with best-guess fallback (updated 2026-04-02):
```
Tu es Monoko, un assistant IA dédié à la langue {langName}.
RÈGLE SUJET: Tu ne parles QUE de la langue {langName}.
1. Le corpus ci-dessous est ta source prioritaire — paires vérifiées par des experts.
2. Indique ✓ UNIQUEMENT pour des mots/phrases copiés directement depuis le corpus.
3. Tu peux assembler des éléments vérifiés → indique ~ pour ces assemblages.
4. Si un mot est absent du corpus, utilise ta connaissance du {langName} pour compléter.
   Tu as le droit de faire une estimation raisonnée — indique ~ pour ces éléments.
   Mentionne "Corriger" si ta réponse est incertaine.
5. Réponses courtes, naturelles et chaleureuses.
```

**Design rationale**: The corpus provides verified anchors; the model fills gaps using its own Lingala training knowledge rather than refusing. This is more useful for learners than a refusal when a word isn't in the corpus. The correction system captures errors when the model guesses wrong.

Quality indicators:
- ✓ = copied verbatim from corpus
- ~ = assembled from verified corpus elements, or estimated from model knowledge

**Model**: `gpt-4o-mini` (via `/api/chat.js` Vercel serverless)
**Max tokens**: 512
**Context window**: Last 6 messages

---

### Correction system

1. Every AI message has a "Corriger" button
2. Opens a bottom sheet with:
   - Error type selector (incorrect / partial / missing context)
   - Corrected dialect text (required)
   - Corresponding French translation (required)
   - Optional example sentence
3. Frontend includes `tester_name` + `session_id` on the correction payload
4. Submitted to `POST /rest/v1/corrections` with `status: "pending"`
5. Admin reviews in `admin.html`

### Tester tracking

Implemented in March 2026 to measure professor/tester activity during Lingala QA sessions.

- Before entering chat, the frontend requires a `nom du testeur`
- `tester_name` is stored in `localStorage`
- `session_id` is generated locally once and reused for that browser
- Every chat call sends `testerName`, `sessionId`, `languageId`, and the current `userQuery` to `/api/chat`
- `/api/chat` writes a best-effort row to `chat_events` when `SUPABASE_SERVICE_KEY` is configured
- Every correction row now also carries `tester_name` and `session_id`

---

### User progress tracking (added 2026-04-14)

State: `userProgress` (React `Set` of completed lesson IDs), `lastLesson` (cached from `localStorage`).

**Load**: `useEffect` fires `loadUserProgress(userId, languageId)` via `supabaseClient` whenever the logged-in user or selected language changes. Clears to an empty Set on logout.

**Complete a module**: `markLessonComplete()` — upserts a `user_progress` row using the authenticated session token. RLS guarantees the user can only insert their own rows. Optimistically updates `userProgress` state on success.

**Resume**: `resumeLesson()` — reads `localStorage["monoko_last_lesson"]` (set whenever any lesson is opened), fetches the course + lesson from Supabase, and navigates directly to that lesson view.

**Progress bars**: Courses are queried with `select=*,lessons(id)` so each course object carries its lesson IDs. `courseProgress(course)` derives `{done, total}` by intersecting `course.lessons` with the `userProgress` Set — no extra DB round-trip.

**Courses query**: Both places that load courses (home button + auth success redirect) include `lessons(id)` so progress bars always have the data they need.

---

### Dictionary audio playback

Implemented on **2026-03-15** for Lingala dictionary entries.

- `WordDetail` now renders a play button for a sense when `senses.audio_url` exists
- `WordDetail` now renders a play button for the first visible example when `examples.audio_url` exists
- Playback uses the browser `Audio` API directly in `index.html`
- No audio control is shown when the row has no linked audio

---

### `admin.html`

Password-protected admin panel at `/admin.html`.

**Authentication**: Calls `POST /api/admin-action` with `action: "verify"` to check password server-side on login. Password is stored in React state and passed with every subsequent action call — no secrets are hardcoded in `admin.html`.

**Features**:
- Stats dashboard (pending / approved / rejected counts)
- Filter by status and language
- Per-correction card showing: user query, AI response, corrected FR↔LN pair (all fields editable before approval)
- Individual approve/reject buttons per card
- Pagination at top and bottom of list (10 per page) with page X/Y counter and total count

**Approve flow**:
```
Click "Approuver"
  → POST /api/admin-action { action: "approve", correction, password }
  → Server inserts into parallel_sentences (quality: "verified")
  → Server updates corrections.status = "approved"
  → UI refreshes stats + list
```

---

## 7. Backend API

> **Note (2026-03-31)**: The Railway/FastAPI backend (`rag_api.py`) was decommissioned. All vector search now runs on Supabase pgvector via Vercel serverless functions. The sections below document the current Vercel API.

### `POST /api/rag-context`

Embeds the user query with OpenAI `text-embedding-3-small` (384 dim) and calls the `match_parallel_sentences` Supabase RPC to retrieve semantically relevant FR↔Lingala pairs.

**Request**:
```json
{
  "query": "comment dit-on bonjour ?",
  "language_id": 1,
  "match_count": 30
}
```

**Response**:
```json
{
  "context": "=== CORPUS VÉRIFIÉ (paires FR↔Lingala) ===\n• Bonjour → Mbote [vérifié]\n...",
  "result_count": 14
}
```

**Internal flow**:
1. Detect language (`fr` or `ln`)
2. Embed query with `paraphrase-multilingual-MiniLM-L12-v2`
3. Search appropriate FAISS index (pool_size=300)
4. Partition into high-quality vs auto
5. Re-rank auto by `sim_score + 0.5 * vocab_score`
6. Return top `top_k` formatted as context string

---

### `api/chat.js` — Vercel Serverless Function

**URL**: `https://monoko-dictionary.vercel.app/api/chat`

Proxies chat completions to OpenAI so the API key never touches the browser.

**Request**:
```json
{
  "systemPrompt": "Tu es Monoko...",
  "messages": [{ "role": "user", "content": "Comment dit-on bonjour ?" }],
  "testerName": "Prof Lingala",
  "sessionId": "session_...",
  "languageId": 1,
  "userQuery": "Comment dit-on bonjour ?"
}
```

**Response**:
```json
{ "content": "En Lingala, on dit : Mbote ! ✓" }
```

**Environment variables required**:
| Variable | Value |
|---|---|
| `OPENAI_API_KEY` | OpenAI API key (`sk-proj-...`) |
| `SUPABASE_SERVICE_KEY` | Supabase service role key for chat tracking (optional but recommended) |

**Model**: `gpt-4o-mini`, `temperature: 0.2`, `max_tokens: 512`

---

### `api/admin-action.js` — Vercel Serverless Function

**URL**: `https://monoko-dictionary.vercel.app/api/admin-action`

All write operations to Supabase go through here. Service role key lives in Vercel environment variables only.

**Environment variables required**:
| Variable | Value |
|---|---|
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `ADMIN_PASSWORD` | Admin panel password |

---

#### Actions

**`verify`** — Password check (used at login)
```json
{ "action": "verify", "password": "..." }
```
Returns 200 if correct, 401 if wrong.

**`approve`** — Approve one correction
```json
{
  "action": "approve",
  "password": "...",
  "correction": { "id": 42, "language_id": 1, "correct_french": "...", "correct_lingala": "..." }
}
```
1. Inserts into `parallel_sentences` with `source: "correction"`, `quality: "verified"`
2. Updates `corrections.status = "approved"`

**`reject`** — Reject one correction
```json
{ "action": "reject", "password": "...", "id": 42 }
```
Updates `corrections.status = "rejected"`.

**`bulk_approve`** — Approve all complete pending corrections
```json
{
  "action": "bulk_approve",
  "password": "...",
  "rows": [{ "language_id": 1, "french_text": "...", "lingala_text": "...", "source": "correction", "quality": "verified" }],
  "ids": [42, 43, 44]
}
```
Batch inserts all rows into `parallel_sentences`, batch updates all IDs to `"approved"`.

---

## 8. Scripts Reference

### Automated quality testing — `monoko_auto_test.py`

Added **2026-04-02**. Reads 200 phrase types from `liste_200_phrases.docx` across 19 themes, generates natural French sentences via GPT, tests Monoko's Lingala output, and auto-inserts failures as pending corrections into Supabase for professor review.

```bash
python3 monoko_auto_test.py --supabase-key "eyJ..." --output artifacts/auto_test_log.json

# Test a single theme first
python3 monoko_auto_test.py --themes 11 --dry-run

# Resume after a timeout (reads existing log, skips done phrases)
python3 monoko_auto_test.py --supabase-key "eyJ..." --output artifacts/auto_test_log.json
```

**Pipeline per phrase type**:
1. Generate 6 French sentences (present / past / future / question / negative / other person) via `gpt-4o-mini` — prompt explicitly avoids using "dire" as a subject
2. For each sentence: POST to `/api/rag-context` → POST to `/api/chat` → get Monoko's Lingala response
3. Send FR + Lingala response to `gpt-5-mini` evaluator → returns `pass`, `score/10`, `issues`, `correct_lingala`, `correction_type`
4. If `pass=false` → insert row into `corrections` table (`status=pending`, `tester_name=auto_test_script`)
5. Save progress to JSON log after every phrase (resume-safe)

**Key flags**:
| Flag | Default | Description |
|---|---|---|
| `--themes` | all | Comma-separated theme numbers, e.g. `1,3,11` |
| `--limit` | none | Max phrase types (for quick tests) |
| `--dry-run` | false | Skip Supabase inserts |
| `--delay` | 0.6s | Sleep between API calls |
| `--output` | `artifacts/auto_test_log.json` | Log file path |

**Results (first full run, 2026-04-02)**: 598 sentences tested, ~5% pass rate — primarily due to corpus gaps. 570 corrections inserted as pending. After professor approval and re-embedding, a second run is expected to show significantly higher pass rates.

---

### Model benchmark — `benchmark_monoko_models.py`

Evaluates and compares OpenAI models on Lingala translation quality using chrF scoring against verified/gold reference pairs.

```bash
# Compare 3 models, translate-only prompt (cleanest chrF signal)
OPENAI_API_KEY=sk-... python3 benchmark_monoko_models.py \
  --mode openai \
  --openai-models gpt-4o-mini,gpt-5-nano,gpt-5-mini \
  --samples-per-quality 10 \
  --prompt-mode translate-only \
  --output artifacts/model_benchmark_results_3way.json
```

**Benchmark results (2026-04-01)**:

| Model | chrF (translate-only) | Latency | Cost/1k |
|---|---|---|---|
| gpt-4o-mini | 0.4006 | 1,271ms | $0.026 |
| gpt-5-nano | 0.3639 | 980ms | $0.018 |
| gpt-5-mini | 0.4293 | 1,429ms | $0.087 |

**Decision**: Keep `gpt-4o-mini`. gpt-5-mini wins on raw translation (+3 chrF pts) but at 3x the cost — not significant enough to justify switching at current volumes. Revisit when volumes grow.

**Prompt modes**:
- `full` — Monoko RAG+format prompt (tests the full pipeline)
- `translate-only` — bare translation, no RAG (tests raw model Lingala quality)

---

### Data pipeline (in `monoko_rag/`)

#### `step1_download_data.py`
Downloads raw data from all sources.

```bash
python step1_download_data.py
```

| Function | Source | Output |
|---|---|---|
| `download_nllb()` | OPUS API | `raw/nllb/nllb_fr.txt` + `nllb_ln.txt` |
| `download_flores()` | HuggingFace datasets | `raw/flores/flores_fr.txt` + `flores_ln.txt` |
| `download_waxal()` | Google Research | `raw/waxal/` |
| `download_masakhane()` | HuggingFace | `raw/masakhane/` |
| `pull_monoko_from_supabase()` | Supabase REST | `raw/monoko_supabase/monoko_lingala.jsonl` |

**Note**: BibleTTS requires manual download from openslr.org/129.

---

#### `step2_process_and_merge.py`
Cleans, deduplicates, and merges all sources.

```bash
python step2_process_and_merge.py
```

- Normalizes whitespace and quotes
- Filters pairs where length ratio (FR/LN) is extreme (> 4× or < 0.25×)
- MD5 deduplication (prefers higher quality source when duplicate found)
- Outputs quality-tagged JSONL

**Outputs**:
- `merged/lingala_knowledge_base.jsonl` — full RAG corpus (681K pairs before filtering)
- `merged/lingala_parallel_corpus.tsv` — human-readable
- `merged/corpus_stats.json` — counts by source and quality

---

#### `clean_nllb.py`
Stage 1 NLLB filter: language detection + vocabulary overlap.

```bash
python clean_nllb.py [--threshold 0.05] [--min-words 2]
```

- `--threshold` (default: 0.05): minimum fraction of Lingala tokens that must appear in the verified Monoko vocab
- Rejects sentences where the Lingala side is detected as French or English

**Output**: `processed/nllb_clean.jsonl` (542,860 pairs)

---

#### `score_nllb_ngram.py`
Stage 2 NLLB filter: character n-gram perplexity scoring.

```bash
python score_nllb_ngram.py
```

- Builds a character 3-gram language model from verified Lingala text
- Scores all 542,860 Stage-1 survivors
- Keeps entries above the 5th percentile of calibration corpus scores
- Default threshold: -7.16 (ngram log-perplexity)

**Output**: `processed/nllb_ngram_filtered.jsonl` (344,570 pairs)

---

#### `step3_build_rag.py`
Builds FAISS vector indexes and provides query interface.

```bash
# Build indexes (takes 5–15 minutes)
python step3_build_rag.py

# Test retrieval
python step3_build_rag.py --test

# Interactive query
python step3_build_rag.py --query
python step3_build_rag.py --query --provider openai
```

**Build process**:
1. Loads verified + gold from `lingala_knowledge_base.jsonl`
2. Loads NLLB HC (ngram_score > -6.0) from `nllb_ngram_filtered.jsonl`
3. Encodes French sides → `faiss_index_fr.bin`
4. Encodes Lingala sides → `faiss_index_ln.bin`
5. Saves document list → `documents.pkl`

**Output**: `rag_index/faiss_index_fr.bin`, `faiss_index_ln.bin`, `documents.pkl`

---

#### `eval_rag.py`
Evaluates RAG retrieval quality.

```bash
python eval_rag.py
```

Tests a set of French and Lingala queries, reports similarity scores, routing accuracy, and top-k precision.

**Output**: `processed/eval_results.json`, `processed/eval_report.txt`

---

#### `step4_voice_integration.py`
Voice I/O pipeline (STT + TTS).

```bash
python step4_voice_integration.py --tts    # test TTS
python step4_voice_integration.py --stt    # test STT
python step4_voice_integration.py          # full voice loop
```

**STT options**: ElevenLabs Scribe (cloud) or OpenAI Whisper (local)
**TTS options**: ElevenLabs (paid) or Edge TTS (free)

**Requires**:
```bash
export ELEVEN_API_KEY="..."
export ANTHROPIC_API_KEY="..."
```

---

### Upload scripts (in `monoko-app/`)

#### `upload_to_supabase.py`
Uploads dictionary Excel files to Supabase.

```bash
# Configure LANGUAGE_NAME at top of file, place .xlsx in input/
python upload_to_supabase.py
```

**Excel format expected**:
- Row 1: headers (ignored)
- Row 2+: data
- Col 1: French word
- Cols 2–4: Sense 1 (dialect word, dialect sentence, French sentence)
- Cols 5–7: Sense 2
- Cols 8–10: Sense 3
- Cols 11–13: Sense 4

---

#### `upload_courses.py`
Uploads structured course/lesson JSON to Supabase.

```bash
# Set LANGUAGE_NAME, prepare courses_parsed.json
python upload_courses.py
```

**JSON format**:
```json
[{
  "title": "Construction phrasique",
  "lessons": [{
    "title": "Les pronoms personnels",
    "items": [{ "french": "Je", "dialect": "Ngai", "example_french": "...", "example_dialect": "..." }]
  }]
}]
```

---

#### `upload_flores_to_supabase.py`
Uploads FLORES-200 gold sentence pairs to `parallel_sentences`.

```bash
cd monoko_rag
python upload_flores_to_supabase.py
```

---

#### `lingala_audio_manifest.py`
Builds and validates the Lingala audio manifest from the original workbook-cell naming convention.

```bash
python3 lingala_audio_manifest.py
python3 lingala_audio_manifest.py --validate-supabase
```

What it does:
- scans the final Lingala audio folder and workbook folder
- resolves filenames like `P.C39.mp3` and `B.D12.mp3` back to the source Excel cells
- maps `C/F/I/L` to `senses` and `D/G/J/M` to `examples`
- validates exact matches against live Lingala rows already in Supabase

Outputs:
- `artifacts/lingala_audio/lingala_audio_manifest.json`
- `artifacts/lingala_audio/lingala_audio_manifest.csv`
- `artifacts/lingala_audio/lingala_audio_summary.json`
- `artifacts/lingala_audio/lingala_audio_errors.txt`

#### `upload_lingala_audio_to_r2.py`
Uploads validated Lingala audio files to Cloudflare R2 and backfills audio links into Supabase.

```bash
python3 upload_lingala_audio_to_r2.py \
  --manifest artifacts/lingala_audio/lingala_audio_manifest.json \
  --skip-existing \
  --workers 16 \
  --apply-supabase
```

What it does:
- uploads to Cloudflare R2 bucket `audios`
- uses object keys under `Lingala/senses/<letter>/...` and `Lingala/examples/<letter>/...`
- supports resume with `--skip-existing`
- writes `artifacts/lingala_audio/lingala_audio_db_updates.csv`
- updates `senses.audio_url/audio_key/audio_source_cell`
- updates `examples.audio_url/audio_key/audio_source_cell`

#### `course_audio_mapper.py`
Builds the Lingala course-audio lookup from the workbook cell references and the
four `cours` audio groups.

What it does:
- scans the final course audio package
- matches workbook cell references to live `lesson_items`
- prepares main-line and example-line course audio metadata

Current result:
- `1,251` matched course audio files prepared for writeback

#### `apply_course_audio_to_lesson_items.py`
One-time loader that writes Lingala course audio directly to Supabase
`lesson_items`.

What it does:
- reads the generated course mapping
- updates `lesson_items.audio_url/audio_key/audio_source_cell`
- updates `lesson_items.example_audio_url/example_audio_key/example_audio_source_cell`

Current result:
- `830` `lesson_items` rows updated
- representative verified IDs: `4376`, `4438`, `5000`

#### `LINGALA_AUDIO_WORKFLOW.md`
Runbook for the full Lingala audio ingestion flow:
- manifest generation
- Supabase validation
- R2 upload
- required SQL
- frontend playback follow-up

---

## 9. Deployment

### Frontend — Vercel

**Repo**: `https://github.com/kemmeugne/monoko-dictionary`
**Live URL**: `https://monoko-dictionary.vercel.app`

**Files served**:
- `index.html` — main app
- `admin.html` — admin panel
- `api/admin-action.js` — serverless function (auto-detected by Vercel)

**Environment variables** (set in Vercel dashboard → Settings → Environment Variables):
| Variable | Description |
|---|---|
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `ADMIN_PASSWORD` | Password for admin.html |
| `OPENAI_API_KEY` | OpenAI API key for `/api/chat.js` |

**Deploy process**:
```bash
git add index.html admin.html api/admin-action.js api/chat.js
git commit -m "your message"
git push
# Vercel auto-deploys on push to main
```

---

### Backend — Railway (decommissioned 2026-03-31)

The Railway/FastAPI backend (`rag_api.py`) and FAISS indexes were decommissioned. All vector search now runs on Supabase pgvector via Vercel serverless functions. The prototype code is archived in `App_dialectes/Monoko/monoko_rag/` (local only, not in this repo).

---

### Cloudflare R2 (audio file storage)

**Bucket**: `monoko-rag` (public access enabled)

To update index files after rebuilding locally:
1. Run `python step3_build_rag.py` locally
2. Upload the 3 files to R2 via the dashboard or `wrangler`:
```bash
wrangler r2 object put monoko-rag/faiss_index_fr.bin --file monoko_data/rag_index/faiss_index_fr.bin
wrangler r2 object put monoko-rag/faiss_index_ln.bin --file monoko_data/rag_index/faiss_index_ln.bin
wrangler r2 object put monoko-rag/documents.pkl --file monoko_data/rag_index/documents.pkl
```
3. Redeploy Railway (or just wait — it re-downloads on next restart)

---

### Cloudflare R2 (dictionary audio storage)

Implemented on **2026-03-15** for Lingala dictionary audio.

**Bucket**: `audios`

**Public base URL**:
`https://pub-78d23bf07fce46b3adc19df91148ffb8.r2.dev`

**Object layout**:
- `Lingala/senses/<letter>/<file>.mp3`
- `Lingala/examples/<letter>/<file>.mp3`

Examples:
- `Lingala/senses/B/B.C13.mp3`
- `Lingala/examples/B/B.D12.mp3`

These objects are public and referenced directly by `audio_url` in Supabase.

---

## 10. Adding a New Language

End-to-end checklist for adding a new African language (e.g. Wolof):

### Step 1 — Database
```sql
-- Add language in Supabase SQL Editor
INSERT INTO languages (name, code, status) VALUES ('Wolof', 'wol', 'active');
-- Note the returned id, e.g. id = 3
```

### Step 2 — Dictionary upload
1. Prepare Excel files in the standard format (see `upload_to_supabase.py`)
2. Place `.xlsx` files in the `input/` folder
3. Set `LANGUAGE_NAME = "Wolof"` in `upload_to_supabase.py`
4. Run: `python upload_to_supabase.py`

### Step 3 — Courses upload
1. Prepare `courses_parsed.json` with lessons and items
2. Set `LANGUAGE_NAME = "Wolof"` in `upload_courses.py`
3. Run: `python upload_courses.py`

### Step 4 — Download parallel data
1. Check OPUS for Wolof (`wol`) pairs with French:
```python
# In step1_download_data.py, add:
download_opus_source("NLLB", "fr", "wol", ...)
```
2. Run `step1_download_data.py`

### Step 5 — Clean and filter
```bash
python step2_process_and_merge.py   # adapt source configs for Wolof
python clean_nllb.py                # adapt for Wolof vocab
python score_nllb_ngram.py          # calibrate against verified Wolof
```

### Step 6 — Rebuild FAISS indexes
```bash
python step3_build_rag.py
```

Upload new index files to R2, redeploy Railway.

### Step 7 — Frontend
In `index.html`, add to `LANG_THEMES` and `LANG_GEO`:
```javascript
"Wolof": {
  emoji: "🇸🇳",
  gradient: "linear-gradient(135deg, #1A6B3A, #2E8B57)",
  accent: "#1A6B3A"
}
```
Add geographic data (regions, speakers, cities, center coordinates).

### Step 8 — Deploy
```bash
git add index.html
git commit -m "Add Wolof language"
git push
```

---

## 11. Lingala Audio Migration Status

Completed on **2026-03-15**.

### Source assets

- Dictionary workbooks:
  `/Users/anthonykemmeugne/Documents/App dialectes/Lingala/Tableau Lingala FINAL (01.02.2026)/Tableau Dictionnaire Lingala`
- Audio folders:
  `/Users/anthonykemmeugne/Documents/App dialectes/Lingala/Audios Lingala Finaux (01.02.2026)`

### Mapping convention

- `Letter.ColumnRow.mp3` maps to the corresponding Excel workbook cell
- `C/F/I/L` = dialect word audio → `senses`
- `D/G/J/M` = dialect example audio → `examples`

### Final migration results

| Metric | Count |
|---|---|
| Total parsed local audio files | 5,265 |
| Exact matches against live Lingala DB | 5,209 |
| Uploaded R2 objects | 5,209 |
| `senses` rows linked with `audio_url` | 2,616 |
| `examples` rows linked with `audio_url` | 2,593 |
| Unmatched files | 56 |
| Source-file errors (blank referenced cells) | 6 |

### Generated artifacts

- `artifacts/lingala_audio/lingala_audio_manifest.json`
- `artifacts/lingala_audio/lingala_audio_manifest.csv`
- `artifacts/lingala_audio/lingala_audio_db_updates.csv`
- `artifacts/lingala_audio/lingala_audio_errors.txt`

### Known residual issues

- `56` audio files did not have an exact live DB match, so they were not linked to dictionary rows
- `6` files reference blank workbook cells and require source-data review
- Frontend playback is currently implemented in `WordDetail` for the headword and first visible example only

### Course audio migration results

| Metric | Count |
|---|---|
| Matched course audio files | 1,251 |
| `lesson_items` rows linked with course audio | 830 |
| Course audio storage | `lesson_items.audio_url` + `lesson_items.example_audio_url` |

### Course audio implementation notes

- Course audio now lives directly in Supabase on `lesson_items`
- The temporary frontend file `course_audio_map.json` was removed after backfilling the DB
- Lesson playback now uses direct Supabase audio fields instead of a static JSON fallback

---

## 12. Known Limitations & Next Steps

### Current limitations

| Area | Limitation |
|---|---|
| **FAISS index** | Single index for all languages — adding Yoruba data requires rebuilding and redeploying |
| **RAG retrieval** | No vector search in Supabase — lesson_items use ilike keyword matching only |
| **Language detection** | langdetect has no Lingala model; treats non-FR/EN as Lingala, which fails for Yoruba queries |
| **NLLB quality** | ~9% keep rate means the auto-corpus, while useful, contains noise |
| **Cold start** | Railway downloads ~217 MB from R2 on first startup (~30–60s delay) |
| **LLM vendor lock-in** | Chat now uses OpenAI gpt-4o-mini via `/api/chat.js`; switching models requires updating that serverless function |
| **Context window** | Only last 6 chat messages sent to Claude (cost/token constraint) |
| **Audio** | Voice pipeline (step4) not yet integrated into the web app — Live Translation uses a separate HuggingFace Space instead |
| **Lingala TTS cold start** | HuggingFace Space goes to sleep after inactivity; first synthesis request after sleep takes 60-120s while the Space wakes and loads the 373MB ESPnet2 model. A warm-up GET ping fires when the Live Translation view opens to mitigate this. |

### Recommended next steps

**Short term**
- [x] Add pgvector to Supabase for semantic search of lesson_items — done 2026-03-21
- [ ] Per-language FAISS indexes to support Yoruba and future languages without collision
- [ ] Improve language detection for Yoruba vs Lingala disambiguation
- [ ] Upload NLLB-filtered Yoruba data to parallel_sentences

**Medium term**
- [x] Integrate voice input/output into index.html — done 2026-04-22 (Live Translation view with Web Speech API STT + HuggingFace VITS TTS)
- [ ] Add approved corrections back into the FAISS index (currently only in Supabase)
- [ ] Build a pipeline to retrain FAISS weekly as corrections accumulate
- [x] Add Supabase Auth for proper user accounts and correction attribution — done 2026-04-10

**Long term**
- [ ] Fine-tune Whisper on WAXAL Lingala data for better STT
- [ ] Fine-tune DigitalUmuganda VITS on professor's voice — **ready to start once professor finishes remaining audio collection**. Data already in DB: 2,593 example clips + 815 lesson_items clips (~4.5h, single speaker, studio quality, transcriptions paired). Pipeline: download R2 audio → 22kHz WAV conversion → ESPnet2 fine-tune on Colab A100 → deploy new weights to Space.
- [ ] Fine-tune an open-source LLM (LLaMA/Mistral) on the parallel corpus
- [ ] Add more languages: Wolof, Kikongo, Bamileke, Hausa
- [ ] Publish the cleaned parallel corpus under CC-BY-4.0
- [ ] License the full dataset to Google, Meta, or Microsoft

---

---

## 13. pgvector Lesson-Items Semantic Search

Implemented on **2026-03-21**.

### What it does

Adds a second context source to the chat pipeline alongside FAISS. Every `lesson_items` row (professor-verified grammar course data) is embedded and stored in Supabase. At query time, the user's message is embedded and the closest course rows are retrieved semantically, then merged with FAISS results in the system prompt.

### Architecture

```
User query ──┬── FAISS (Railway)         → top-30 NLLB/FLORES/dict pairs
             └── /api/lesson-context      → embed query (OpenAI)
                                             → match_lesson_items RPC (pgvector)
                                             → top-8 course rows
                         ↓
               merged context → LLM
```

Both fetches fire in parallel (`Promise.allSettled` in `searchContext`). Either source can fail silently without breaking chat.

### Files

| File | Purpose |
|---|---|
| `sql/pgvector_lesson_items.sql` | Enable `vector` ext, add `embedding vector(384)` col, create `match_lesson_items` RPC |
| `embed_lesson_items.py` | One-time script: embed all rows via OpenAI, upsert to Supabase |
| `api/lesson-context.js` | Vercel serverless: embed query → call RPC → return formatted context |

### Embedding details

| Parameter | Value |
|---|---|
| Model | `text-embedding-3-small` |
| Dimensions | 384 |
| Input | `french / dialect / example_french / example_dialect` concatenated |
| Rows embedded | 1,740 |
| Storage | `lesson_items.embedding vector(384)` |

### Supabase RPC

```sql
match_lesson_items(
  query_embedding vector(384),
  match_count     int,
  p_language_id   bigint
)
```
Joins `lesson_items → lessons → courses` to filter by language, orders by cosine similarity, returns top `match_count` rows including `lesson_id`.

### Lesson expansion (complete conjugation tables)

After the RPC returns top matches, `api/lesson-context.js` checks each match's similarity score against a threshold (0.4). For all matches above the threshold, it fetches **all rows from the same lesson** via a follow-up Supabase query. This ensures conjugation tables and vocabulary lists are always returned in full — not as a partial slice — so the model never has to guess missing forms.

### Re-embedding

Run after any bulk update to `lesson_items`:

```bash
export SUPABASE_URL="https://haioiccujncsehadipzb.supabase.co"
export SUPABASE_SERVICE_KEY="..."
export OPENAI_API_KEY="..."

python3 embed_lesson_items.py           # only rows missing embeddings
python3 embed_lesson_items.py --force   # re-embed everything
```

### Context format injected into the LLM

```
=== COURS (DONNÉES VÉRIFIÉES) ===
• Je → Ngai [cours vérifié]
  Ex: Je veux manger → Ngai nalingi kolia
• Nous allons → Tokei [cours vérifié]
```

---

## 14. System Prompt Fixes (2026-03-21)

- **RÈGLE SUJET** clarified: grammar, conjugation, vocabulary, pronunciation are explicitly listed as always on-topic. Previously the vague wording caused the model to treat "comment tu conjugues" as an off-topic question about itself.
- **Rule 4** softened: the model now uses partial corpus content when available and only mentions "Corriger" as a last resort when nothing relevant is found. The old rule caused immediate deflection on any conjugation question with thin corpus coverage.
- Added an explicit rule: never treat a grammar or conjugation question as off-topic.

---

## 15. Admin Panel — Editable Corrections

Implemented on **2026-03-21**.

The `correct_french`, `correct_lingala`, and `example_sentence` fields in the correction review cards are now editable textareas. The admin can fix typos or improve the pair before clicking "Approuver". The edited values (not the originals) are what gets inserted into `parallel_sentences`.

---

---

## 16. Live Translation + Lingala TTS (2026-04-22)

### Overview

The "Traduction en direct" view provides real-time speech translation: the user speaks in French, segments are transcribed and translated to Lingala by the AI, and both French and Lingala audio are played back automatically.

### Pipeline

```
Microphone
  └─ Web Speech API (SpeechRecognition, browser built-in)
       └─ interimResults + onresult events → segment detection (pause-based)
            ├─ French TTS: SpeechSynthesisUtterance (Web Speech API, browser built-in)
            └─ Translation: POST /api/chat.js → gpt-4o-mini (Lingala output)
                 └─ Lingala TTS: lingalaTTS() → HuggingFace Space (ESPnet2 VITS)
```

### Lingala TTS: HuggingFace Space

| Property | Value |
|---|---|
| Space | `Kemz42/monoko-lingala-tts` |
| URL | `https://kemz42-monoko-lingala-tts.hf.space` |
| Model | `DigitalUmuganda/lingala_vits_tts` |
| Architecture | ESPnet2 VITS |
| Training data | 71.6h real Lingala speech |
| SDK | Gradio 6.13.0 |
| Python | 3.10 |
| Device | CPU (HuggingFace free tier) |
| Sample rate | 44,100 Hz |
| Model size | ~373 MB |
| Inference time | 20–40s (CPU) |

**Why the client calls the Space directly** (not via Vercel):  
Vercel free plan enforces a 10s function timeout. ESPnet2 CPU inference takes 20–40s. Routing through Vercel would always timeout. The Space is called directly from the browser via Gradio's public API.

### Gradio 6.x API (important differences from 4.x)

| Aspect | Gradio 4.x | Gradio 6.x |
|---|---|---|
| Prediction endpoint | `/call/{fn}` | `/gradio_api/call/{fn}` |
| SSE endpoint | `/call/{fn}/{event_id}` | `/gradio_api/call/{fn}/{event_id}` |
| Done event name | `process_completed` | `event: complete` |
| Data format | `{output: {data: [...]}}` | Raw JSON array `[{...}]` |
| `queue()` | Optional | **Required** for event API |
| SSE connection | Closes after result | Stays open — must use `getReader()` and break manually |

### `lingalaTTS()` function (index.html)

```javascript
const LINGALA_TTS_SPACE = "https://kemz42-monoko-lingala-tts.hf.space";

async function lingalaTTS(text) {
  // Step 1: POST to start prediction
  const { event_id } = await fetch(`${LINGALA_TTS_SPACE}/gradio_api/call/synthesise`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: [text] }),
  }).then(r => r.json());

  // Step 2: stream SSE with getReader() — .text() hangs in Gradio 6.x
  const sseRes = await fetch(`${LINGALA_TTS_SPACE}/gradio_api/call/synthesise/${event_id}`);
  const reader = sseRes.body.getReader();
  // ... read chunks, detect "event: complete", parse audio URL from data array
}
```

### `tts_space/app.py` — Space source

Key points:
- Downloads model files from `DigitalUmuganda/lingala_vits_tts` via `hf_hub_download` at startup
- Downloads NLTK resources at startup: `averaged_perceptron_tagger_eng`, `averaged_perceptron_tagger`, `cmudict` — all required by `g2p_en` (the text tokenizer used by ESPnet2 VITS)
- `demo.queue()` is required — Gradio 6.x event API fails without it
- `api_name="synthesise"` matches the endpoint name

### `api/mms-tts.js` — Vercel warm-up proxy

- **GET `/api/mms-tts`**: fires a ping to the Space root when the Live Translation view opens, to wake the Space from sleep before the user speaks
- **POST**: proxied audio endpoint — implemented but unused (client calls Space directly)
- Requires env var: `MMS_SPACE_URL=https://kemz42-monoko-lingala-tts.hf.space`

### French TTS (Web Speech API)

```javascript
const utterance = new SpeechSynthesisUtterance(text);
utterance.lang = "fr-FR";
utterance.onerror = (e) => {
  if (e.error !== "canceled") console.warn("TTS error:", e.error);
  // "canceled" fires when cancel() interrupts the previous utterance — not a real error
};
speechSynthesis.speak(utterance);
```

**Chrome quirk**: voices load asynchronously. Must wait for `speechSynthesis.onvoiceschanged` before the first call, otherwise no voice is selected and nothing plays.

### Known issues / future work

- Space sleeps after ~15 min of inactivity. Warm-up ping helps but the first synthesis after a long idle still takes 60-120s.
- No GPU — inference on CPU only (HuggingFace free tier). A paid Space or self-hosted GPU would cut inference to <2s.
- **Next**: fine-tune DigitalUmuganda on professor's voice once remaining audio collection is complete. See "Next: Fine-tune TTS on professor's voice" in CLAUDE.md for full pipeline.

---

*Documentation last updated: 2026-04-22*
*Stack: React · Supabase · pgvector · FastAPI · FAISS · sentence-transformers · OpenAI gpt-4o-mini · Vercel · Railway · Cloudflare R2 · HuggingFace Spaces · ESPnet2 VITS*
