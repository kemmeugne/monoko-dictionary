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
- **AI Chat (Monoko)**: Conversational AI that translates, explains grammar, and holds dialogue — backed by a FAISS semantic search RAG
- **Correction system**: Users flag AI errors; admins approve corrections which flow back into the verified corpus
- **Admin panel**: Password-protected review interface with bulk-approve

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER (Browser)                               │
│              https://monoko-dictionary.vercel.app                    │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
              ┌─────────────▼─────────────┐
              │     VERCEL (Frontend)      │
              │   index.html  admin.html   │
              │   /api/admin-action.js     │  ← Serverless function
              └──────┬────────────┬────────┘
                     │            │
          ┌──────────▼──┐   ┌────▼──────────────────┐
          │  OPENAI     │   │      SUPABASE          │
          │  gpt-4o-mini│   │  (PostgreSQL DB)        │
          │  via Vercel │   │                         │
          │  /api/chat  │   │  Tables:                │
          │ LLM for chat│   │  • languages            │
          │  responses  │   │  • words                │
          └─────────────┘   │  • senses               │
                            │  • examples             │
                            │  • parallel_sentences   │
                            │  • corrections          │
                            │  • courses              │
                            │  • lessons              │
                            │  • lesson_items         │
                            └────────────────────────┘
                     │
          ┌──────────▼──────────────────────┐
          │     RAILWAY (Backend)            │
          │   rag_api.py  (FastAPI)          │
          │                                  │
          │  POST /api/context               │
          │    ↓                             │
          │  Language detection              │
          │    ↓                             │
          │  FAISS search (FR or LN index)   │
          │    ↓                             │
          │  Quality partitioning            │
          │    ↓                             │
          │  Returns formatted context       │
          └───────────────┬─────────────────┘
                          │ indexes downloaded at startup
          ┌───────────────▼─────────────────┐
          │    CLOUDFLARE R2 (Storage)       │
          │  faiss_index_fr.bin  (99 MB)     │
          │  faiss_index_ln.bin  (99 MB)     │
          │  documents.pkl       (19 MB)     │
          └──────────────────────────────────┘
```

### Request flow for a chat message

```
1. User types message in index.html chat
2. index.html calls Railway POST /api/context  →  FAISS retrieves top-30 semantically similar FR↔LN pairs (with language_id)
3. index.html calls Vercel POST /api/chat  →  OpenAI gpt-4o-mini with corpus-first system prompt + context
4. Response displayed in chat
5. (Optional) User clicks "Corriger" → correction saved to Supabase corrections table
6. Admin approves correction in admin.html → pair inserted into parallel_sentences as verified
```

**Note**: Supabase `lesson_items` keyword search was removed from the chat pipeline (March 2026). All context comes from FAISS only; `top_k` increased 20 → 30 to compensate.

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

**Current data**: 2,008 FLORES-200 gold pairs + approved corrections

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
| `status` | TEXT | `"pending"`, `"approved"`, `"rejected"` |
| `created_at` | TIMESTAMPTZ | Auto |

**Flow**: `pending` → admin review → `approved` (auto-inserts into `parallel_sentences`) or `rejected`

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
| `item_order` | INT | Display order |

---

### Entity relationships

```
languages
  └── words (language_id)
        └── senses (word_id)
              └── examples (sense_id)
  └── parallel_sentences (language_id)
  └── corrections (language_id)
  └── courses (language_id)
        └── lessons (course_id)
              └── lesson_items (lesson_id)
```

---

### SQL migrations needed

```sql
-- Run these once in Supabase SQL Editor if not already present

ALTER TABLE corrections ADD COLUMN IF NOT EXISTS correct_french TEXT;
ALTER TABLE corrections ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

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

When a user sends a message in the chat, context is retrieved via two parallel paths and merged before calling Claude.

```
User message
     │
     ├─── Path A: FAISS Semantic Search (Railway)
     │         │
     │         ├─ Language detection (FR/EN → FR index | other → LN index)
     │         ├─ Embed query with paraphrase-multilingual-MiniLM-L12-v2
     │         ├─ Search FAISS (pool_size=300 candidates)
     │         ├─ Partition: verified/gold first, NLLB auto second
     │         ├─ Re-rank NLLB by: sim_score + 0.5 × vocab_score
     │         └─ Return top-20 FR↔LN pairs
     │
     └─── Path B: Supabase Keyword Search (direct from browser)
               │
               ├─ Extract keywords (stopword filtering)
               ├─ Search lesson_items.french ilike *kw*
               ├─ Search lesson_items.dialect ilike *kw*
               ├─ Search lessons.title ilike *kw* → pull all items
               └─ Return matching grammar/course entries
     │
     ▼
Merge both contexts into one string
     │
     ▼
Claude Haiku (claude-haiku-4-5-20251001)
  System prompt: Monoko persona + language rules + corpus
  Max tokens: 512
  Last 6 messages of conversation history
     │
     ▼
AI response displayed with ✓ / ~ / ≈ quality indicators
```

---

### Dual-path language detection

```python
# From step3_build_rag.py — MonokoRAG._detect_language()
_FR_LANGS = {"fr", "en"}

def _detect_language(self, text):
    lang = detect(text)  # langdetect
    return "fr" if lang in _FR_LANGS else "ln"
```

**Key insight**: Lingala has no langdetect model — it gets classified as Swahili, Indonesian, Tagalog, etc. Treating "anything not French/English" as Lingala works reliably in practice.

| Query language | Index used | Rationale |
|---|---|---|
| French / English | `faiss_index_fr.bin` | Looking up translations → search by French meaning |
| Lingala / other | `faiss_index_ln.bin` | Conversation/grammar → search by Lingala content |

---

### Quality partitioning & NLLB re-ranking

```python
# Constants
_HIGH_QUALITY = {"verified", "gold"}
_POOL_SIZE    = 300   # candidates fetched from FAISS
_VOCAB_BLEND  = 0.5   # NLLB blending factor

# For each FAISS result:
if quality in _HIGH_QUALITY:
    high_quality.append(doc)       # sorted by sim_score DESC
else:
    doc["_nllb_rank"] = sim_score + 0.5 * vocab_score
    auto.append(doc)               # sorted by _nllb_rank DESC

# Final result: verified/gold first, NLLB fills remaining slots
return (high_quality + auto[:remaining])[:top_k]
```

`vocab_score` = fraction of Lingala tokens in the sentence that appear in the verified Monoko dictionary. A sentence with more known Lingala words ranks higher among auto-quality results.

---

### FAISS index technical details

| Parameter | Value |
|---|---|
| Model | `paraphrase-multilingual-MiniLM-L12-v2` |
| Embedding dimensions | 384 |
| Index type | `IndexFlatIP` (inner product = cosine on normalized vectors) |
| Total vectors | 67,687 per index |
| Index file size | ~99 MB each |
| Documents file | 19 MB (pickled list) |

---

### Knowledge base composition

| Source | Count | Quality | How it enters FAISS |
|---|---|---|---|
| Monoko dictionary (words) | 5,227 | verified | Always included (Tier 1) |
| FLORES-200 | 2,008 | gold | Always included (Tier 2) |
| NLLB HC (ngram_score > -6.0) | ~60,452 | auto | Tier 3 |
| **Total** | **~67,687** | | |

---

## 5. Data Sources

### Overview

| Source | Raw pairs | After cleaning | Quality |
|---|---|---|---|
| NLLB (Meta) | 673,786 | ~60,452 | auto |
| FLORES-200 | 2,008 | 2,008 | gold |
| Monoko dictionary | 5,227 | 5,227 | verified |
| **Total in FAISS** | | **~67,687** | |

---

### NLLB (No Language Left Behind — Meta AI)

**What it is**: Web-mined parallel sentences automatically aligned by Meta's multilingual model.

**Download**: Via OPUS API through `opustools`
```bash
python step1_download_data.py  # downloads to monoko_data/raw/nllb/
```
Output: `nllb_ln.txt` (Lingala) + `nllb_fr.txt` (French) — one sentence per line, aligned by position.

**Raw count**: 673,786 pairs

**Cleaning pipeline** (2 stages):

**Stage 1 — `clean_nllb.py`** (language detection + vocabulary overlap)
```
Input:  673,786 pairs
Filter 1: langdetect rejects Lingala side if detected as fr or en
Filter 2: vocab_score < 0.05 rejected
          (vocab_score = fraction of tokens matching verified Monoko dictionary)
Output: 542,860 pairs  →  nllb_clean.jsonl
Stats:  nllb_clean_stats.json
```

**Stage 2 — `score_nllb_ngram.py`** (character n-gram perplexity scoring)
```
Input:  542,860 pairs from Stage 1
Method: Build character 3-gram language model from verified Lingala text
        Score each sentence by log-perplexity against the model
        Threshold: ngram_score > -7.16 (5th percentile of calibration corpus)
Output: 344,570 pairs  →  nllb_ngram_filtered.jsonl
Stats:  nllb_ngram_stats.json
```

**Stage 3 — FAISS threshold** (in `step3_build_rag.py`)
```
Input:  344,570 pairs from Stage 2
Filter: ngram_score > -6.0 (stricter threshold for the actual index)
Output: ~60,452 pairs included in FAISS
```

**Final keep rate**: 60,452 / 673,786 = **~9%** of raw NLLB retained

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

**Format in FAISS**:
- Words: `"Mot: {french} → Lingala: {lingala}"` (type: `"word"`)
- Sentences: `"Français: {fr}\nLingala: {ln}"` (type: `"sentence"`)

**Upload from Excel**: `upload_to_supabase.py`
- Reads structured `.xlsx` files
- Excel layout: Row per French word, columns grouped in sets of 3 (dialect word, dialect sentence, French sentence)
- Uploads to `words` → `senses` → `examples` hierarchy

---

### WAXAL (Google)

**What it is**: Lingala speech transcriptions (audio + text). Monolingual — no French translation.

**Status**: Downloaded but not yet integrated into FAISS (no FR counterpart). Intended for future STT fine-tuning.

---

### Evaluation results

From `eval_results.json` / `eval_report.txt`:

The RAG was evaluated on a set of test queries. Key metrics tracked:
- Retrieval precision (relevant pairs in top-k)
- Similarity score distribution
- Routing accuracy (FR queries → FR index, LN queries → LN index)

**Test results (from `--test` mode)**:
- French queries: similarity scores ~0.65–0.85
- Lingala queries: similarity scores ~0.80–0.90 (LN index significantly outperforms routing through FR index for Lingala input)

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
| `courses` | Course list |
| `course_detail` | Lesson list within a course |
| `lesson_detail` | Lesson items table (FR ↔ dialect) |
| `chat` | AI chat with Monoko |

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

Called before every chat API request. Returns a context string injected into the system prompt.

**FAISS (Railway)**:
```javascript
POST https://[railway-url]/api/context
Body: { query: userMsg, top_k: 30, language_id: langId }
Returns: { context: "...", query_lang: "fr"|"ln", result_count: N }
```
Falls back to `"(Service de recherche indisponible)"` if Railway is unavailable.

**Note**: Supabase `lesson_items` keyword search was removed (March 2026) — FAISS is now the sole context source.

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

Strict corpus-first rules (updated March 2026):
```
Tu es Monoko, un assistant IA dédié à la langue {langName}.
RÈGLE SUJET: Tu ne parles QUE de la langue {langName}.
1. Le corpus ci-dessous est ta SEULE source de vérité.
   Utilise UNIQUEMENT les mots et structures qui apparaissent dans le corpus.
2. Indique ✓ UNIQUEMENT pour des mots/phrases copiés directement depuis le corpus.
3. Tu peux assembler des éléments vérifiés → indique ~ pour ces assemblages.
4. Si un mot clé est absent du corpus, dis-le clairement — ne propose JAMAIS une traduction inventée.
5. Réponses courtes, naturelles et chaleureuses.
```

Quality indicators:
- ✓ = copied verbatim from corpus
- ~ = assembled from verified corpus elements
- ≈ indicator **removed** — model must not guess

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
3. Submitted to `POST /rest/v1/corrections` with `status: "pending"`
4. Admin reviews in `admin.html`

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
- Per-correction card showing: user query, AI response, corrected FR↔LN pair
- Individual approve/reject buttons
- **Bulk approve**: approves all pending corrections with complete pairs in one operation
- Pagination (10 per page)

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

### `rag_api.py` — FastAPI on Railway

**Base URL**: `https://[your-railway-url].up.railway.app`

---

#### `GET /health`

Liveness check.

**Response**:
```json
{
  "status": "ok",
  "vectors": 67687
}
```
Returns `"index_not_loaded"` if startup failed.

---

#### `POST /api/context`

Main RAG endpoint. Takes a user query, returns semantically relevant context.

**Request**:
```json
{
  "query": "comment dit-on bonjour ?",
  "top_k": 20
}
```

**Response**:
```json
{
  "context": "=== VOCABULAIRE VÉRIFIÉ ===\n• bonjour → Mbote [vérifié par professeur]\n\n=== PHRASES PARALLÈLES ===\nFR: Bonjour tout le monde\nLN: Mbote na bino nyonso [vérifié par professeur]\n",
  "query_lang": "fr",
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
  "messages": [{ "role": "user", "content": "Comment dit-on bonjour ?" }]
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

### Upload scripts (in `dictionary-normalizer/`)

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

### Backend — Railway

**Repo**: separate `monoko-rag-api` GitHub repo

**Files**:
```
monoko-rag-api/
├── rag_api.py
├── step3_build_rag.py
├── requirements.txt
├── Procfile                   ← web: uvicorn rag_api:app --host 0.0.0.0 --port $PORT
└── monoko_data/rag_index/     ← LFS-tracked or auto-downloaded from R2
```

**Environment variables** (set in Railway dashboard):
| Variable | Description |
|---|---|
| `R2_PUBLIC_URL` | Cloudflare R2 public bucket URL e.g. `https://pub-xxx.r2.dev` |

**FAISS index files** (stored in Cloudflare R2):
- `faiss_index_fr.bin` (99 MB)
- `faiss_index_ln.bin` (99 MB)
- `documents.pkl` (19 MB)

On startup, `rag_api.py` detects if files are missing or are Git LFS pointer files, and downloads from R2 automatically.

**Deploy process**:
```bash
# In monoko-rag-api repo
git add rag_api.py step3_build_rag.py
git commit -m "update"
git push
# Railway auto-deploys on push
```

---

### Cloudflare R2 (index file storage)

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
| **Audio** | Voice pipeline (step4) not yet integrated into the web app |

### Recommended next steps

**Short term**
- [ ] Add pgvector to Supabase for semantic search of lesson_items (currently keyword-only)
- [ ] Per-language FAISS indexes to support Yoruba and future languages without collision
- [ ] Improve language detection for Yoruba vs Lingala disambiguation
- [ ] Upload NLLB-filtered Yoruba data to parallel_sentences

**Medium term**
- [ ] Integrate voice input/output (step4) into index.html using ElevenLabs
- [ ] Add approved corrections back into the FAISS index (currently only in Supabase)
- [ ] Build a pipeline to retrain FAISS weekly as corrections accumulate
- [ ] Add Supabase Auth for proper user accounts and correction attribution

**Long term**
- [ ] Fine-tune Whisper on WAXAL Lingala data for better STT
- [ ] Train a custom Lingala TTS voice using BibleTTS recordings
- [ ] Fine-tune an open-source LLM (LLaMA/Mistral) on the parallel corpus
- [ ] Add more languages: Wolof, Kikongo, Bamileke, Hausa
- [ ] Publish the cleaned parallel corpus under CC-BY-4.0
- [ ] License the full dataset to Google, Meta, or Microsoft

---

*Documentation last updated: 2026-03-15*
*Stack: React · Supabase · FastAPI · FAISS · sentence-transformers · OpenAI gpt-4o-mini · Vercel · Railway · Cloudflare R2*
