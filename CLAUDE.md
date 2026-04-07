# Monɔkɔ — Claude Code Context

## What this project is

Monɔkɔ is a multilingual dictionary and AI conversation app for African languages (Lingala, Yoruba). It combines a professor-verified dictionary, structured grammar courses, and an AI chat assistant backed by a pgvector RAG system on Supabase.

**Live app**: https://monoko-dictionary.vercel.app
**Admin panel**: https://monoko-dictionary.vercel.app/admin.html (password in Vercel env vars)

---

## Stack

| Layer | Technology | Where |
|---|---|---|
| Frontend | Single-file React (Babel standalone, no build step) | Vercel |
| Database | Supabase (PostgreSQL + pgvector) | `haioiccujncsehadipzb.supabase.co` |
| LLM | OpenAI `gpt-4o-mini` | via Vercel serverless `/api/chat.js` |
| Admin writes | Vercel serverless function | `api/admin-action.js` |
| Chat proxy | Vercel serverless function | `api/chat.js` |
| RAG context | Vercel serverless function | `api/rag-context.js` |
| Lesson context | Vercel serverless function | `api/lesson-context.js` |
| Vector search (corpus) | Supabase pgvector (`parallel_sentences.embedding`) | `match_parallel_sentences` RPC |
| Vector search (courses) | Supabase pgvector (`lesson_items.embedding`) | `match_lesson_items` RPC |

---

## Key files in this repo

```
index.html                        — entire frontend (React, ~1700 lines)
admin.html                        — admin panel: per-card approve/reject, pagination top+bottom, page X/Y counter, professor_modified tracking
api/admin-action.js               — Vercel serverless function (secure Supabase writes)
api/chat.js                       — Vercel serverless function (proxies chat to OpenAI gpt-4o-mini)
api/rag-context.js                — Vercel serverless function (pgvector semantic search over parallel_sentences)
api/lesson-context.js             — Vercel serverless function (pgvector semantic search over lesson_items)
sql/pgvector_parallel_sentences.sql — SQL migration: add embedding col + match_parallel_sentences RPC
monoko_auto_test.py               — automated quality tester: generates sentences, evaluates Lingala, inserts corrections
benchmark_monoko_models.py        — model benchmark: chrF scoring across OpenAI models (gpt-4o-mini chosen)
liste_200_phrases.docx            — 200 phrase types across 19 themes used by monoko_auto_test.py
TECHNICAL_DOCS.md                 — full system documentation

Cours/MONOKO_CURRICULUM.md        — universal CEFR-aligned curriculum (6 levels, 29 modules) for all languages
Cours/lingala_curriculum_migration.sql — migration script: restructures old 4 courses into 6-level CEFR curriculum
generate_audio_collection_html.py — generates one HTML recording app per module for items missing audio
populate_stub_modules.py          — populates stub modules with suggested French content, then re-runs HTML generator
audio_collection_html/            — generated HTML recording apps (one per module), sent to professor for audio recording
```

---

## Database tables (Supabase)

- `languages` — Lingala (id=1), Yoruba (id=2)
- `words` → `senses` → `examples` — dictionary hierarchy
- `senses.audio_url/audio_key/audio_source_cell` — Lingala word audio links (added 2026-03-15)
- `examples.audio_url/audio_key/audio_source_cell` — Lingala example audio links (added 2026-03-15)
- `parallel_sentences` — FR↔dialect sentence pairs for RAG (FLORES + approved corrections); `embedding vector(384)` added 2026-03-31
- `corrections` — user-submitted AI corrections (pending → approved); `professor_modified boolean` tracks whether the professor edited the correction before approving
- `chat_events` — tester-tracked chat activity (`tester_name`, `session_id`, query/response, timestamps)
- `courses` → `lessons` → `lesson_items` — structured grammar courses
- `lesson_items.audio_url/audio_key/audio_source_cell` — Lingala course line audio links (added 2026-03-16)
- `lesson_items.example_audio_url/example_audio_key/example_audio_source_cell` — Lingala course example audio links (added 2026-03-16)
- `lesson_items.embedding vector(384)` — OpenAI text-embedding-3-small embeddings for pgvector search (added 2026-03-21, 1,740 rows embedded on old structure; new structure needs re-embedding via `embed_lesson_items.py`)

---

## RAG pipeline (how chat works)

1. User clicks chat → if no `nom du testeur` is stored locally, frontend forces a tester setup step
2. User message → two parallel context fetches:
   - `POST /api/rag-context` on Vercel → OpenAI embedding → pgvector `match_parallel_sentences` RPC → top-30 verified corpus pairs
   - `POST /api/lesson-context` on Vercel → OpenAI embedding → pgvector `match_lesson_items` RPC → top-8 course rows
3. Both contexts merged → `POST /api/chat` (Vercel serverless) → OpenAI `gpt-4o-mini` with strict corpus-first system prompt
4. Response shown with quality indicators: ✓ verified / ~ suggestion (assembled from verified elements)
5. If `SUPABASE_SERVICE_KEY` is configured on Vercel, `/api/chat` logs tester activity into `chat_events`

**pgvector corpus index**: `parallel_sentences.embedding` — ~7k rows (5,227 verified Monoko + 2,008 gold FLORES) embedded with `text-embedding-3-small` (384 dim), queried via `match_parallel_sentences` RPC

**pgvector course index**: 1,740 `lesson_items` rows embedded with `text-embedding-3-small` (384 dim), queried via `match_lesson_items` RPC filtered by `language_id`

---

## Correction flow

```
User flags AI error → corrections table (status: pending, with optional `tester_name` + `session_id`)
→ Professor reviews at /admin.html
  → Professor edits correct_french, correct_lingala, example_sentence directly in the card if needed
→ Approve → inserts into parallel_sentences (quality: verified) + status: approved + professor_modified: true/false
→ Reject → status: rejected (used when a sentence has no valid Lingala translation)
```

**Monitoring query** — % of corrections the professor had to fix:
```sql
SELECT
  COUNT(*) FILTER (WHERE professor_modified = true) AS edited,
  COUNT(*) AS total,
  CASE WHEN COUNT(*) = 0 THEN NULL
       ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE professor_modified = true) / COUNT(*), 1)
  END AS pct_edited
FROM corrections WHERE status = 'approved';
```

---

## Environment variables

**Vercel**:
- `SUPABASE_SERVICE_KEY` — service role key for admin writes, `/api/rag-context.js`, and `/api/lesson-context.js` RPC calls
- `ADMIN_PASSWORD` — password for admin.html
- `OPENAI_API_KEY` — OpenAI API key for `/api/chat.js`, `/api/rag-context.js`, and `/api/lesson-context.js`

**Cloudflare R2 audio details**:
- Bucket: `audios`
- Public base URL: `https://pub-78d23bf07fce46b3adc19df91148ffb8.r2.dev`
- Object layout:
  - `Lingala/senses/<letter>/<file>.mp3`
  - `Lingala/examples/<letter>/<file>.mp3`

---

## Important conventions

- `index.html` uses the **anon key** (public, read-only by default) for Supabase reads and correction inserts
- All Supabase **writes** from the browser go through `/api/admin-action.js` (service key never in client code)
- All **LLM calls** go through `/api/chat.js` (OpenAI key never in client code; no user-entered API key)
- Chat now requires a `nom du testeur` before the user can enter the Monoko chat screen
- `tester_name` is stored in `localStorage`; `session_id` is generated locally and reused for that browser session
- `admin.html` password is verified **server-side** only — no password logic in client code, no secrets in `admin.html`
- Lingala dictionary audio is now linked through `senses.audio_url` and `examples.audio_url`
- Lingala course audio is now linked directly through `lesson_items.audio_url` and `lesson_items.example_audio_url`
- `index.html` `WordDetail` renders audio buttons only when an audio URL exists
- The LLM system prompt allows best-guess translations when words are absent from the corpus (changed 2026-04-02) — the model uses its own Lingala knowledge to fill gaps rather than refusing
- `monoko_auto_test.py` inserts corrections with `tester_name='auto_test_script'` — use this to filter/delete auto-generated corrections in Supabase if needed
- **Vercel env vars**: `SUPABASE_SERVICE_KEY` must be set on the correct Vercel project (monoko, not anthony's project) and for the Production environment
- **New Supabase API key** (legacy keys disabled 2026-04-02): `sb_secret_*** (see Vercel env vars or ask Anthony)` — update this in Vercel env vars

## Lingala curriculum restructure (2026-04-06)

The old 4-course flat structure (courses id=22,23,24,25) was migrated to a CEFR-aligned 6-level curriculum.

**New structure:**
- 6 courses (levels A1→B2+), 29 modules, ~948 lesson_items
- Migration script: `Cours/lingala_curriculum_migration.sql`
- Old courses (22,23,24,25) still exist — **delete only after verifying new structure in app and re-embedding**

**Audio preservation:**
- Step 4 in migration SQL copies audio from old items to new items by `french + dialect` match
- Step 4b copies audio from `senses` and `examples` tables for new dictionary-sourced items
- Audio coverage after migration: ~89% overall (some modules 100%, stubs 0%)

**Post-migration completed (2026-04-07):**
1. ✅ `embed_lesson_items.py` run — new lesson_items embedded
2. ✅ Chat verified working with new course content
3. ✅ Old courses deleted: `DELETE FROM courses WHERE id IN (22, 23, 24, 25);`
4. ✅ Vercel `SUPABASE_SERVICE_KEY` updated to new key `sb_secret_*** (see Vercel env vars or ask Anthony)`

**Audio collection for missing items (2026-04-07):**
- Generated 23 HTML recording apps in `audio_collection_html/` — one per module with missing audio
- Stub modules (8 modules with placeholder content) were populated with suggested French content via `populate_stub_modules.py`
- Proverbes et expressions idiomatiques (4.3) left entirely to the professor
- Workflow: professor opens HTML in browser → fills in Lingala (where empty) → records audio → exports ZIP → sends back
- After receiving ZIPs: upload audio to R2, update `lesson_items.audio_url` in Supabase

**Module audio coverage (verified post-migration):**

| Module | Items | With audio |
|--------|-------|-----------|
| Pronoms et possessifs | 12 | 12 (100%) |
| Famille | 14 | 14 (100%) |
| Maison et objets | 36 | 36 (100%) |
| Travail et métiers | 25 | 25 (100%) |
| Marché et argent | 11 | 11 (100%) |
| Ville et lieux | 29 | 29 (100%) |
| Chiffres/jours | 92 | 90 (98%) |
| Nature et animaux | 75 | 73 (97%) |
| Cuisine | 66 | 65 (98%) |
| Salutations | 41 | 36 (88%) |
| Construction 2 | 237 | 209 (88%) |
| Présentation | 33 | 27 (82%) |
| Manger et boire | 24 | 18 (75%) |
| Corps et santé | 50 | 38 (76%) |
| Construction 1 | 62 | 52 (84%) |
| Déplacements | 23 | 18 (78%) |
| Conjugaison passé | 18 | 11 (61%) |
| Sentiments | 30 | 20 (67%) |
| Débats et opinions | 22 | 13 (59%) |
| Langue dans le monde | 6 | 2 (33%) |
| Stubs (8 modules) | 3-20 | 0 (professor needed) |

---

## Lingala audio status

Completed on `2026-03-15`.

- `5,265` local audio files parsed from the final Lingala workbook/audio package
- `5,209` exact matches found against live Lingala DB rows
- `5,209` R2 audio objects uploaded under `audios/Lingala/...`
- `2,616` `senses` rows linked with `audio_url`
- `2,593` `examples` rows linked with `audio_url`
- `56` files remain unmatched
- `6` files point to blank workbook cells

Artifacts and scripts:
- `lingala_audio_manifest.py`
- `upload_lingala_audio_to_r2.py`
- `LINGALA_AUDIO_WORKFLOW.md`
- `artifacts/lingala_audio/`

Course audio completed on `2026-03-16`.

- `1,251` Lingala course audio files matched to live course lesson rows
- `830` `lesson_items` rows updated with direct course audio columns
- course audio now lives in Supabase on `lesson_items`
- the temporary static `course_audio_map.json` fallback was removed from the frontend

Artifacts and scripts:
- `course_audio_mapper.py`
- `apply_course_audio_to_lesson_items.py`

## Deploy

```bash
# Frontend + API (Vercel auto-deploys on push)
git add index.html admin.html api/
git commit -m "your message"
git push
```

## Full docs

See `TECHNICAL_DOCS.md` for complete architecture, schema, RAG pipeline details, and a step-by-step guide to adding a new language.
