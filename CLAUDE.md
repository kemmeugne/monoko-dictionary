# Monɔkɔ — Claude Code Context

## What this project is

Monɔkɔ is a multilingual dictionary and AI conversation app for African languages (Lingala, Yoruba). It combines a professor-verified dictionary, structured grammar courses, and an AI chat assistant backed by a pgvector RAG system on Supabase.

**Live app**: https://monoko-dictionary.vercel.app
**Admin panel**: https://monoko-dictionary.vercel.app/admin.html (password in Vercel env vars)

The frontend is a mobile-first responsive web app that will be wrapped with Capacitor and shipped to the App Store and Play Store. All UI work must follow the mobile-first rules below.

---
## Mobile-first design (Capacitor-bound)

This app will be wrapped with Capacitor and shipped to the App Store and Play Store. Every new feature must be designed mobile-first.

**Hard rules**
- Design at 375px width first, scale up with `@media (min-width: ...)`
- Interactive elements ≥44×44px (tap targets)
- No hover-only interactions
- `<input>` and `<textarea>` use `font-size: 16px` minimum (prevents iOS focus zoom)
- Use `100dvh` not `100vh` for full-height layouts
- Use `padding: env(safe-area-inset-top) ... env(safe-area-inset-bottom)` on full-screen views
- No `position: fixed` for primary UI (mobile Safari + virtual keyboard bugs)
- Bottom navigation, not top
- No horizontal scroll

**Test before merging**
- Chrome DevTools mobile emulation (iPhone SE, iPhone 14 Pro, Pixel 5)
- Actual iPhone via Vercel URL → Safari → Share → Add to Home Screen
- All audio playback (Lingala TTS, dictionary audio) confirmed working in iOS Safari WebView

**Avoid**
- Browser-only APIs without Capacitor equivalents (use feature detection)
- Heavy initial bundle — Capacitor WebView startup is slower than browser
- `localStorage` for anything critical — Capacitor has it but it can be cleared by the OS; use Supabase for persistence

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
| Vector search (dictionary) | Supabase pgvector (`examples.embedding`, `senses.embedding`) | `match_examples` / `match_senses` RPCs (2026-08-07) |
| Lingala TTS | HuggingFace Space `Kemz42/monoko-lingala-tts` (ESPnet2 VITS, DigitalUmuganda model, 71.6h Lingala) | called directly from browser |
| French TTS | Web Speech API (browser built-in, `SpeechSynthesisUtterance`) | `index.html` |

---

## Key files in this repo

```
index.html                        — entire frontend (React, ~3200 lines). Module 1.1 has a
                                    special tile view (AlphabetPanel); it reads every tile from
                                    lesson_items, so DB fixes reach the screen. It used to render
                                    from a hardcoded ALPHABET_DATA table that had drifted from the
                                    audio — do not reintroduce hardcoded lesson content.
admin.html                        — admin panel: per-card approve/reject, pagination top+bottom, page X/Y counter, professor_modified tracking
api/admin-action.js               — Vercel serverless function (secure Supabase writes)
api/chat.js                       — Vercel serverless function (SSE-streaming gpt-4o-mini proxy; logs t_rag_ms + t_llm_ms to chat_events)
api/rag-context.js                — Vercel serverless function (pgvector search over parallel_sentences + the dictionary (examples/senses), 3 RPCs in parallel; accepts optional min_similarity)
api/lesson-context.js             — Vercel serverless function (pgvector semantic search over lesson_items)
api/mms-tts.js                    — Vercel serverless function (warm-up GET ping for HF Space; POST proxies audio but unused — client calls Space directly)
api/cron/keep-tts-warm.js         — Vercel cron handler (GET ping to MMS_SPACE_URL; requires Vercel Pro for sub-hourly schedule)
api/_rate-limit.js                — shared per-IP rate limiter + CORS helper, used by every api/*.js endpoint (in-memory sliding window)
tests/                            — Vitest unit tests for every api/*.js file (see tests/README.md); test Supabase harness docs live here
sql/test_schema.sql               — idempotent schema for the test Supabase project (harness sprint; see HARNESS_SPRINT.md)
scripts/sync_test_schema.js       — applies sql/test_schema.sql to the test project via psql (refuses to run against any non-test project ref)
scripts/seed_test_data.js         — wipes + reseeds the test project with representative data + test user (refuses to run against any non-test project ref)
HARNESS_SPRINT.md                 — spec + status for the verification harness (unit tests, test Supabase, Playwright, lints, CI) — Sessions 1–2 done, 3–5 pending
tts_space/app.py                  — HuggingFace Space: ESPnet2 VITS Lingala TTS (Gradio 6.x, served at kemz42-monoko-lingala-tts.hf.space)
tts_space/requirements.txt        — Space deps: git+espnet, huggingface_hub, numpy, soundfile, nltk
tts_space/README.md               — Space metadata: sdk=gradio 6.13.0, python=3.10, app_file=app.py
sql/pgvector_parallel_sentences.sql — SQL migration: add embedding col + match_parallel_sentences RPC
sql/pgvector_dictionary.sql       — SQL migration: embedding cols on senses+examples + match_examples/match_senses RPCs (applied 2026-08-07)
sql/lesson_pool.sql               — SQL migration: lesson_pool, the exercise engine's material (applied 2026-08-10)
sql/exercise_progress.sql         — SQL migration: exercise_attempts + lesson_stage_state, what a session leaves behind (applied 2026-08-17)
populate_lesson_pool.py           — assembles lesson_pool from the three tiers; idempotent upsert on (source_table, source_id)
EXERCISE_ENGINE_PLAN.md           — CURRENT WORK. Exercise engine plan: decisions, measured data, build slices. Supersedes the Phase 3 "exam system" sections of ROADMAP/PHASE3_LAUNCH_PLAN/MONOKO_CURRICULUM
sql/progress_tracking.sql         — SQL migration: profiles + user_progress tables with RLS (added 2026-04-14)
monoko_auto_test.py               — automated quality tester: generates sentences, evaluates Lingala, inserts corrections
benchmark_monoko_models.py        — model benchmark: chrF scoring across OpenAI models (gpt-4o-mini chosen)
liste_200_phrases.docx            — 200 phrase types across 19 themes used by monoko_auto_test.py
route_corpus_to_lessons.py        — first-pass routing: nearest lesson_item by cosine. Measured at only 77% precision, FLAT across similarity bands -> superseded by the two scripts below, kept because it produces the candidate pool
llm_route_judge.py                — stage 1: LLM votes yes/no on cosine's guess (gpt-4.1-mini + `strict` prompt; 96% precision, 82% recall). --compare scores prompt variants against the human labels; --run does the full pass
reassign_discarded.py             — stage 2: shows the model all 50 lessons and asks WHICH one a rejected sentence belongs to. Recovered 1,786 of 3,334 rejects at 90% precision
classify_word_difficulty.py       — rates all 2,311 dictionary headwords 1-6; topic is the wrong axis for a single word, level is the right one
make_routing_qa_tool.py           — builds routing_qa_tool.html: 100 routed items stratified by similarity, for measuring routing precision
analyse_routing_qa.py             — reads the QA verdicts, reports precision per similarity band + per source, recommends a threshold
TECHNICAL_DOCS.md                 — full system documentation

Cours/MONOKO_CURRICULUM.md        — universal CEFR-aligned curriculum (6 levels, 29 modules) for all languages
Cours/lingala_curriculum_migration.sql — migration script: restructures old 4 courses into 6-level CEFR curriculum
generate_audio_collection_html.py — generates one HTML recording app per module for Lingala items missing audio
populate_stub_modules.py          — populates stub modules with suggested French content, then re-runs HTML generator
audio_collection_html/            — generated HTML recording apps (one per module), sent to professor for audio recording
generate_course_templates.py      — generates generic HTML recording apps for all 29 modules for any new language
ingest_professor_zips.py          — ZIP -> R2 -> Supabase ingest for returned recording apps; stages plan/upload/apply, --only <modules>, modes append/replace_all/new_lesson/upsert (2026-08-04)
make_variant_split_tool.py        — builds variant_split_tool.html: waveform review UI for rows holding several Lingala variants in one cell
apply_variant_split.py            — applies the tool's decisions: cuts clips, course keeps variant 1, alternatives -> parallel_sentences
translate_examples_to_parallel_sentences.py — translates professor example sentences (Lingala) to French via GPT and inserts into parallel_sentences; supports --dry-run and --from-log to insert directly from existing JSON log
sql/corrections_reviewed_at.sql   — migration: adds reviewed_at to corrections + pace monitoring queries
sql/chat_events_latency.sql       — migration: adds t_rag_ms + t_llm_ms integer columns to chat_events (applied 2026-04-30)
```

---

## Database tables (Supabase)

- `languages` — Lingala (id=1), Yoruba (id=2)
- `words` → `senses` → `examples` — dictionary hierarchy
- `senses.audio_url/audio_key/audio_source_cell` — Lingala word audio links (added 2026-03-15)
- `examples.audio_url/audio_key/audio_source_cell` — Lingala example audio links (added 2026-03-15)
- `parallel_sentences` — FR↔dialect sentence pairs for RAG; `embedding vector(384)` added 2026-03-31.
  **Actual size 3,481 rows** (counted 2026-08-07): 2,009 `flores200`/gold + 1,263
  `correction`/verified + 209 `course_variant`/verified. An earlier version of this
  file claimed ~7k ("5,227 verified Monoko + 2,008 FLORES") — the FLORES half was
  right, the rest was not.
- `senses.embedding` / `examples.embedding` — `vector(384)`, added **2026-08-07**
  (`sql/pgvector_dictionary.sql`), 2,686 + 2,686 rows backfilled. Before this the
  dictionary was **not in the RAG index at all** — see the RAG section below
- `corrections` — user-submitted AI corrections (pending → approved); `professor_modified boolean` tracks whether the professor edited the correction before approving; `reviewed_at timestamptz` set on approve/reject for session pace tracking (added 2026-04-18)
- `chat_events` — tester-tracked chat activity (`tester_name`, `session_id`, query/response, timestamps, `t_rag_ms`, `t_llm_ms` added 2026-04-30)
- `courses` → `lessons` → `lesson_items` — structured grammar courses
- `lesson_items.audio_url/audio_key/audio_source_cell` — Lingala course line audio links (added 2026-03-16)
- `lesson_items.example_audio_url/example_audio_key/example_audio_source_cell` — Lingala course example audio links (added 2026-03-16)
- `lesson_items.embedding vector(384)` — OpenAI text-embedding-3-small embeddings for pgvector search (added 2026-03-21, 1,740 rows embedded on old structure; new structure needs re-embedding via `embed_lesson_items.py`)
- `profiles` — one row per auth user: `display_name`, `preferred_language_id` (added 2026-04-14)
- `user_progress` — lesson completion tracking: `user_id`, `lesson_id`, `language_id`, `completed_at`, `exam_score` (null until Phase 3); RLS ensures users only access their own rows (added 2026-04-14)

---

## RAG pipeline (how chat works)

1. User clicks chat → if no `nom du testeur` is stored locally, frontend forces a tester setup step
2. User message → two parallel context fetches:
   - `POST /api/rag-context` on Vercel → OpenAI embedding → **three RPCs in parallel server-side**:
     `match_parallel_sentences` (top-30 corpus) + `match_examples` (top-12 dictionary
     sentences) + `match_senses` (top-6 dictionary words). Corpus is required; the two
     dictionary calls run through `allSettled` and degrade to corpus-only on failure.
   - `POST /api/lesson-context` on Vercel → OpenAI embedding → pgvector `match_lesson_items` RPC → top-8 course rows
3. Both contexts merged → `POST /api/chat` (Vercel serverless) → OpenAI `gpt-4o-mini` streaming SSE. Client consumes `data: {"delta":"..."}` chunks with `getReader()`, updating the message placeholder on each token.
4. Response shown with quality indicators: ✓ verified / ~ suggestion (assembled from verified elements)
5. If `SUPABASE_SERVICE_KEY` is configured on Vercel, `/api/chat` logs tester activity into `chat_events` (including `t_rag_ms` passed from client and `t_llm_ms` measured server-side)

**pgvector corpus index**: `parallel_sentences.embedding` — 3,481 rows, `text-embedding-3-small` (384 dim), via `match_parallel_sentences`

**pgvector course index**: `lesson_items.embedding` — 1,347 Lingala rows, via `match_lesson_items` filtered by `language_id`

**pgvector dictionary index** (added 2026-08-07): `examples.embedding` (2,686) +
`senses.embedding` (2,686), via `match_examples` / `match_senses`, both joined
through `words` for `language_id`.

**Why this mattered.** Only the corpus and `lesson_items` ever had embedding
columns, so retrieval reached **5,238 of the ~10,066** verified FR↔LN pairs the app
owns. The 2,686 professor-recorded dictionary example sentences and 2,686 headword
pairs were unreachable — and since the system prompt permits best-guess
translations when a word is absent from the corpus (changed 2026-04-02), the model
answered those from its own Lingala knowledge while the verified pair sat in a
table it could not see. Silent, and worst on exactly the vocabulary questions the
dictionary exists to answer.

**Dictionary filtering is a relative cutoff, not an absolute floor.** Dictionary
entries are short strings and short strings embed into a narrow band that shifts
per query: on *"comment dit-on une cuillère"* the right answer scores 0.67 while
cochon, grillon and palabre still score 0.48–0.52. `topCluster()` in
`api/rag-context.js` keeps only hits within 0.06 of the best score — which returns
just `Cuillère → Lutu` for a precise lookup and still returns all 12 family
sentences for *"parle-moi de la famille"*. Do not replace it with a fixed threshold.

---

## Correction flow

```
User flags AI error → corrections table (status: pending, with optional `tester_name` + `session_id`)
→ Professor reviews at /admin.html
  → Professor edits correct_french, correct_lingala, example_sentence directly in the card if needed
→ Approve → inserts into parallel_sentences (quality: verified) + status: approved + professor_modified: true/false + reviewed_at: now()
→ Reject → status: rejected + reviewed_at: now()
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

**Monitoring query** — professor review pace (see `sql/corrections_reviewed_at.sql` for full queries):
```sql
SELECT
  DATE(reviewed_at) AS day,
  COUNT(*) AS reviewed,
  ROUND(EXTRACT(EPOCH FROM (MAX(reviewed_at) - MIN(reviewed_at))) / NULLIF(COUNT(*) - 1, 0)) AS avg_seconds_between
FROM corrections
WHERE reviewed_at IS NOT NULL
GROUP BY day ORDER BY day DESC;
```

---

## Environment variables

**Vercel**:
- `SUPABASE_SERVICE_KEY` — service role key for admin writes, `/api/rag-context.js`, and `/api/lesson-context.js` RPC calls
- `ADMIN_PASSWORD` — password for admin.html
- `OPENAI_API_KEY` — OpenAI API key for `/api/chat.js`, `/api/rag-context.js`, and `/api/lesson-context.js`
- `MMS_SPACE_URL` — base URL of the HuggingFace Space, e.g. `https://kemz42-monoko-lingala-tts.hf.space` (used only by warm-up ping in `api/mms-tts.js`; client calls Space directly)

**Cloudflare R2 audio details**:
- Bucket: `audios`
- Public base URL: `https://pub-78d23bf07fce46b3adc19df91148ffb8.r2.dev`
- Object layout:
  - `Lingala/senses/<letter>/<file>.mp3`
  - `Lingala/examples/<letter>/<file>.mp3`

---

## Test harness (added 2026-07-09)

A second Supabase project, `monoko-test` (ref `bdejouumyzovfirqxmdr`), exists
solely for automated testing. **No script in this repo ever touches
production** — `scripts/sync_test_schema.js` and `scripts/seed_test_data.js`
both hard-refuse to run unless pointed at that exact test project ref.

- Credentials live in `.env.test` (gitignored) — copy `.env.test.example`
  and fill in real values, or ask for them.
- `npm test` — Vitest unit tests for every `api/*.js` file (110 tests, no
  network calls, fully mocked). See `tests/README.md`.
- `npm run db:sync-test-schema` / `npm run db:seed-test` — set up or reset
  the test project's schema and data. Both are safe to re-run any time.
- Full spec and session-by-session status: `HARNESS_SPRINT.md`. This runs
  before Phase 3 feature work and is a hard prerequisite for Phase 3.5
  (Stripe, quotas, rate limiting) per `PHASE3_LAUNCH_PLAN.md`.

---

## Authentication (added 2026-04-10)

Supabase Auth v2 is integrated into `index.html`. Dictionary is fully public; courses and chat require a logged-in account.

**How it works:**
- Supabase JS SDK loaded via CDN: `@supabase/supabase-js@2`
- `supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)` initialized at app load
- Auth state managed via `onAuthStateChange` listener — `currentUser` React state always reflects live session
- `testerName` auto-populated from `user_metadata.display_name` or `email` on login (no manual tester setup needed)
- `requireAuth(returnTo)` redirects to auth view with a return destination ("courses" or "chat")
- After login/signup, user is sent back to their intended destination

**Auth view (`view === "auth"`):**
- Login / signup toggle
- Email + password fields
- Display name field (signup only)
- Error display
- On success: redirects to `authReturnTo` or home

**Gated screens:**
- Courses (`view === "courses"`) — requires login
- Chat (`view === "chat"`) — requires login
- Dictionary, search, browse — fully public

**Chat header:**
- "Session testeur / Modifier" card replaced with logged-in user name + "Déconnexion" button

**Future auth work needed:**
- Role field for professor/admin access (replaces shared admin password)

---

## Important conventions

- `index.html` uses the **anon key** (public, read-only by default) for Supabase reads and correction inserts
- Admin **writes** (approve/reject corrections) go through `/api/admin-action.js` (service key never in client code)
- **User progress writes** (`user_progress` inserts/upserts) go directly through `supabaseClient` with the authenticated user's session token — RLS enforces that users can only write their own rows
- All **LLM calls** go through `/api/chat.js` (OpenAI key never in client code; no user-entered API key)
- Dictionary is public; courses + chat require Supabase Auth login
- `testerName` is now auto-populated from the authenticated user — manual tester setup flow is bypassed for logged-in users
- `session_id` is still generated locally and reused for that browser session
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
  *(now **50 lessons / 1,346 items** — the July 2026 restructure split mega-lessons
  into focused ones, so a curriculum module no longer maps 1:1 to a DB lesson;
  `MONOKO_CURRICULUM.md` describes 31 modules)*
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

## Generic course template system (2026-04-10)

`generate_course_templates.py` produces a complete set of HTML recording apps for any new language, based on the 6-level CEFR curriculum.

**How it works:**
- Queries all Lingala `lesson_items` to get the French curriculum content (1,076 items across 29 modules)
- Strips all dialect translations → empty fields for the professor to fill in
- Sets `db_id = null` (language-agnostic; linked to Supabase after upload)
- Generates one HTML file per module following the same recording app format

**Output:** `../professor_tools/templates/general/` (relative to repo root — updated 2026-04-14, was previously a hardcoded absolute path)

**Usage:**
```bash
# Generic template (language shown as "[Langue]")
SUPABASE_SERVICE_KEY=sb_secret_... python3 generate_course_templates.py

# Language-specific (replaces [Langue] with the language name)
SUPABASE_SERVICE_KEY=sb_secret_... python3 generate_course_templates.py --language Yoruba

# Custom output directory
SUPABASE_SERVICE_KEY=sb_secret_... python3 generate_course_templates.py --language Yoruba --output /path/to/output
```

**Output files (29 total):** `Monoko_[langue]_1.1_sons_et_alphabet.html` … `Monoko_[langue]_6.4_la_langue_dans_le_monde.html`

**Differences vs `generate_audio_collection_html.py`:**
| | `generate_audio_collection_html.py` | `generate_course_templates.py` |
|---|---|---|
| Purpose | Lingala items **missing audio** | All items, **any language** |
| Dialect fields | Pre-filled from DB | Empty (professor writes) |
| `db_id` | Real Supabase ID | `null` |
| Output | `audio_collection_html/` | `../professor_tools/templates/general/` |
| Language | Always Lingala | Configurable via `--language` |

**Modules under curriculum target** (thin Lingala content, professor should expand):
- 4.1 Marché et argent — 11 items (target: 30-40)
- 3.3/3.4 Conjugaison — 18 items each (target: 40-60)
- 4.3 Proverbes — 3 items (requires native speaker input)
- 6.4 Langue dans le monde — 6 items (target: 20-30)

Re-run the script after adding content to Lingala to pick up new items automatically.

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

## User progress tracking (added 2026-04-14)

Phase 2 of the product roadmap. Users can now track their advancement through the CEFR curriculum.

**Database** (`sql/progress_tracking.sql`):
- `profiles (user_id PK, display_name, preferred_language_id, created_at)` — one row per auth user
- `user_progress (id, user_id, lesson_id, language_id, completed_at, exam_score)` — one row per completed lesson per user; `UNIQUE(user_id, lesson_id)` prevents duplicates
- Both tables have RLS enabled: users can only read/write their own rows
- `exam_score` is `null` for now — populated in Phase 3 when the exam system ships

**Frontend mechanics:**
- `loadUserProgress(userId, languageId)` — called automatically via `useEffect` whenever the logged-in user or active language changes; populates `userProgress` state (a `Set` of completed lesson IDs)
- `markLessonComplete()` — called when user taps "J'ai terminé ce module"; upserts a row into `user_progress` via `supabaseClient` (uses the authenticated session, not the anon key)
- `resumeLesson()` — called from the "Continuer" home card; navigates directly to the last opened lesson using `courseId`+`lessonId` stored in `localStorage`
- Last opened lesson is persisted to `localStorage` key `monoko_last_lesson` every time a lesson is opened

**What's visible in the UI:**
- **Home screen**: Dark green "Continuer ▶" card shows the last visited lesson (logged-in users only, same language)
- **Level list**: Each level card shows `X/Y` completed modules + a mini progress bar (purple → green when level complete)
- **Module list**: Completed lesson rows show a green `✓` instead of the step number
- **Lesson bottom**: "✓ J'ai terminé ce module" button for logged-in users; turns into green "Module terminé" confirmation once pressed
- No level locking yet — deferred to Phase 3 with the exam system

---

## Live Translation + Lingala TTS (added 2026-04-22)

The "Traduction en direct" view streams microphone input through speech recognition, translates segments via the AI chat pipeline, and plays back Lingala audio using a custom HuggingFace Space.

### Architecture

```
Microphone → Web Speech API (STT, browser built-in)
          → segment translation via /api/chat.js (OpenAI gpt-4o-mini)
          → Lingala audio: lingalaTTS() → HuggingFace Space (ESPnet2 VITS)
          → French audio: Web Speech API SpeechSynthesisUtterance (browser built-in)
```

### HuggingFace Space

- **Space**: `Kemz42/monoko-lingala-tts` → `https://kemz42-monoko-lingala-tts.hf.space`
- **Model**: `DigitalUmuganda/lingala_vits_tts` (ESPnet2 VITS, trained on 71.6h real Lingala speech)
- **Source**: `tts_space/app.py` in this repo — edit there, then copy to Space UI (Files tab → Edit → Commit)
- **SDK**: Gradio 6.13.0, Python 3.10

### How `lingalaTTS()` works (index.html)

The client calls the Space **directly** (not via Vercel) because ESPnet2 CPU inference takes 20-40s, far beyond Vercel's 10s free-plan timeout.

1. `POST https://kemz42-monoko-lingala-tts.hf.space/gradio_api/call/synthesise` → returns `{ event_id }`
2. `GET .../gradio_api/call/synthesise/{event_id}` → SSE stream, read with `getReader()` (never `.text()` — Gradio 6.x keeps the connection open)
3. Wait for `event: complete` in the stream (Gradio 6.x; older versions send `process_completed`)
4. Parse the `data:` line that follows — it's a JSON array `[{"path": "...", "url": "https://..."}]`
5. Use the `url` field directly (already absolute) or prepend `/gradio_api/file=` if only a path

### Mobile mic persistence (`liveStreamRef` pattern)

`liveStreamRef = useRef(null)` holds the `MediaStream` for the entire `LiveTranslationView` lifetime. Both `startLingalaSTT` and `startFrenchSTT` reuse it — `getUserMedia` is only called when `liveStreamRef.current` is null or has ended tracks. Tracks are only stopped in the component's unmount `useEffect`. `stopAmplitudeLoop()` does **not** stop any tracks. This prevents iOS/Android from re-prompting on every stop/restart cycle.

### Chat Lingala TTS (`chatAudioCache` pattern)

`const chatAudioCache = {}` at module level caches synthesised Lingala audio URLs keyed by fragment text. `extractLingalaFragments(text)` regex-parses Lingala from assistant responses (after `→`, in backticks, in quotes). `playChatLingala(msgIdx)` calls `lingalaTTS` sequentially on all fragments, using the cache to skip already-synthesised text. The 🔊 button on assistant messages triggers this; only visible when fragments are found and `!chatLoading`.

### Key gotchas (hard-won)

| Issue | Root cause | Fix |
|---|---|---|
| `facebook/mms-tts-lin` 404 | Lingala is in MMS ASR only, not TTS | Use DigitalUmuganda VITS instead |
| ESPnet2 not on PyPI | `espnet` on PyPI is a stub; `espnet2` doesn't exist as a package | `git+https://github.com/espnet/espnet.git` in requirements.txt |
| `allow_flagging="never"` error | Parameter removed in Gradio 6.x | Remove from `gr.Interface()` |
| Space 404 on `/call/synthesise` | Gradio 6.x moved to `/gradio_api/call/` prefix | Use `/gradio_api/call/synthesise` |
| `{"error": null}` from Space | `demo.queue()` missing — required by Gradio 6.x event API | Add `demo.queue()` before launch |
| SSE `.text()` hangs forever | Gradio 6.x keeps SSE connection open indefinitely | Stream with `getReader()`, break on `event: complete` |
| `averaged_perceptron_tagger_eng` LookupError | Newer NLTK renamed the resource; `g2p_en` (used by ESPnet2 VITS) needs it | Add `nltk.download('averaged_perceptron_tagger_eng')` in `app.py` startup |
| SSE parser misses audio | Was checking for `process_completed` but Gradio 6.x sends `event: complete`; data is a raw JSON array, not `{output:{data:[]}}` | Check for both markers; parse array directly |
| French TTS silent | Chrome loads voices async | Listen to `voiceschanged` event before calling `speechSynthesis.speak()` |
| French TTS `cancel()` fires error | `cancel()` on new utterance triggers `onerror` on the previous one | Filter `e.error !== "canceled"` in the error handler |

### Updating the Space

The Space is a separate git repo on HuggingFace. Fastest update path:
1. Edit `tts_space/app.py` locally
2. Go to `https://huggingface.co/spaces/Kemz42/monoko-lingala-tts` → Files → `app.py` → Edit
3. Paste the updated content → Commit changes → Space rebuilds automatically (~2-3 min)

---

## Professor ZIP ingest + variant policy (2026-08-04)

All 39 returned recording ZIPs were ingested (they had been sitting unused —
no tooling existed for the recording-app export format). Lingala course content
is now **1,346 items across 50 lessons, 100% audio, no missing translations**.
(`Cours/MONOKO_CURRICULUM.md` describes **31 modules**; the July restructure split
several into multiple lessons, so modules and lessons are not 1:1.)

**Pipeline:** `ingest_professor_zips.py plan | upload | apply` — re-runnable,
rollback JSON before every write, artifacts in `artifacts/professor_ingest/`.

**Non-obvious rules — read before touching course audio again:**
- Recording apps export **WebM/Opus, which iOS Safari cannot decode**. Always
  transcode to MP3 before upload or the audio is silent on every iPhone.
- New course audio goes to `Lingala/lesson_items/<module>/`. The existing
  `Lingala/lesson_items/course_1..4/` is March workbook audio under the **deleted**
  22/23/24/25 course numbering with workbook-cell filenames (`2.C259.mp3`) —
  do not reuse those prefixes, they mean something else.
- **Always pass `--only <modules>` when re-running after a delivery is applied**,
  or every other module's content inserts a second time.
- A re-delivery (`upsert` mode) matches on French inside the target lesson and
  stamps object keys with the export date — reusing the key would overwrite the
  old object at a URL the DB still points to, and serve a stale cached copy.
- `embed_lesson_items.py` embeds only rows **missing** a vector by default; use
  `--force` after any text edit. `match_lesson_items` takes `p_language_id`.

**Variant policy:** when the professor gives several ways to say one thing, the
**course shows one**; the rest go to `parallel_sentences` with
`source='course_variant'`, so RAG knows them without cluttering the lesson.
202 alternatives live there now. Review via `make_variant_split_tool.py` →
`apply_variant_split.py`; see `ROADMAP.md` Phase 1 for the cut heuristics and the
slash trap (an unspaced `Bokoki/okoki` means he read every combination, and no
confidence score detects it).

## Current work: the exercise engine

**Read `EXERCISE_ENGINE_PLAN.md`.** That file holds the settled decisions, the
measured data, and the build slices. Short version:

- The course is content-complete but is still a **table with play buttons**. The
  practice loop is the gap between here and a sellable product.
- **Exams were dropped 2026-08-07** for continuous Duolingo-style points. All
  levels open; the paywall (1.1 + 1.2 free) is the only gate.
- **Corpus→lesson routing (2026-08-07)** took the course from 1,347 items to
  **5,923** across all 50 lessons, using the existing embeddings at cosine ≥ 0.55.
  Artifact: `artifacts/professor_ingest/corpus_routing.json`.
- **The dictionary has zero tone marks; the course has 31%.** Of 678 words in both,
  75 are never spelled the same. Rule: untoned and toned content must never appear
  in the same exercise.
- **Slice 0 is done (2026-08-10).** Cosine routing measured 77% precision and
  flat across similarity bands, so it was replaced by an LLM judge (96%) plus a
  reassignment pass for what the judge rejects (90%). Pool: **6,196 items** —
  1,347 native + 3,063 judge-approved + 1,786 reassigned, 4.6x the original.
- **Slice 1 is done (2026-08-10).** `lesson_pool` holds **6,196 rows** across all
  50 lessons (median 107), each tagged `tier` (native/approved/reassigned =
  100%/96%/90% precision), `orthography`, `token_count` and `effective_level`.
  Re-runnable via `populate_lesson_pool.py`; anon-key read verified.
- **Slices 2 and 3 are done (2026-08-10).** Session shell + match-pairs
  (`212ba5e`), choose-the-audio (`599ae7b`), audio prefetch (`eb55200`).

### The stage model (settled 2026-08-10) — read §2 of the plan

A lesson is **three stages over two disjoint pools**:

| Stage | Material | Shape |
|---|---|---|
| Apprendre | the lesson page (exists) | the teach beat |
| **Pratiquer** | `tier = native` (100% precision) | finite, **80% to pass**, unlocks Élargir |
| **Élargir** | `approved` + `reassigned` | endless, replayable for best score |

Non-obvious rules that fall out of it:

- **A session is 20 questions, not 15 screens.** A match-pairs screen counts as
  5. Screens are unequal in time; questions are not, and question-counting makes
  variable screen sizes free.
- **Thin lessons repeat the item, not the session.** The same item may be tested
  in up to 3 *different formats*. 47/50 lessons then fill a full session from
  native content alone.
- **Routing error is not linguistic error.** Everything in `lesson_pool` is
  professor-verified; the 96%/90% tiers measure *lesson placement*, not Lingala
  correctness. A miss serves a correct off-topic sentence (~1.2 per session) —
  which is what makes endless Élargir acceptable.
- **`buildSession` takes a pool, never a `lesson_id`.** The topic hub, play
  button and placement session are all just different pools.
- **Free tier caps sessions per day (~3), never mistakes.** Limiting time keeps
  errors safe; hearts were rejected for the opposite reason.
- **Every format is universal except match-pairs**, which needs 5 items sharing
  orthography + shape band and excludes 12/50 lessons.
- **All six exercise types ship together in Slice 6.** Listen-and-type uses
  **character tiles, never a keyboard** — the pool needs 42 letters and 16 of them
  (`ɛ ɔ` and the toned vowels) cannot be typed on an iPhone French keyboard at all.
  Speaking is **record-and-compare** (no STT, so no WER dependency) and is excluded
  from the Pratiquer 80% gate because self-assessment cannot be scored.

- **Slice 4 is done (2026-08-17).** A session is now a budget of **20 questions**,
  not 15 screens: `questionCount()` prices a screen (match-pairs costs
  `pairs.length`, everything else 1), pair screens are **3–5**, XP is 10 a
  question, and `buildSession(items, level, count)` takes a **pool** — never a
  `lesson_id`. A per-session ledger keyed by **(item, format)** lets a thin lesson
  reuse an item in a different format, capped at 3 formats per item.
  `sql/exercise_progress.sql` adds `exercise_attempts` + `lesson_stage_state`.

- **Slice 5 is done (2026-08-17).** `startSession(stage)` filters the pool by
  tier — `native` for Pratiquer, `approved`+`reassigned` for Élargir — which
  fixes practice serving corpus rows the lesson never taught. Two buttons on the
  lesson screen, Élargir locked behind `pratiquer_passed`, 80% first-try to pass,
  `18/25 maîtrisés` counter, and a ⚑ Signaler flag on Élargir items that files
  into `corrections` with `correction_type = 'routing'`.
  `sql/exercise_progress.sql` **is applied**.

- **The tokenizer is done (2026-08-17)**, the first piece of Slice 6:
  `tokenize` / `tokenCount` / `characters` / `fold` / `sameWord` / `usableRow` at
  the top of the babel block, with 25 tests in `tests/tokenizer.test.js` (which
  slices the block out of `index.html` and evaluates it — the first `npm test`
  coverage of engine code, 144 tests total).

**Next action is Slice 6's exercise types** — tap-words, fill-the-blank,
listen-and-type on character tiles, and record-and-compare speaking. Each is one
entry in `EXERCISE_SCREENS` plus a builder. `EXERCISE_ENGINE_PLAN.md` **§4c is
the executable task list**. Read it before touching engine code.

**Tokenizer rules that other code must not re-invent:**
- **Never count words with `lesson_pool.token_count`** — it came from a bare
  whitespace split, and French puts a space before `?`, so `"Olingi kofanda ?"`
  reads as 3 there and is 2 real words. 947 of 6,196 rows disagree. Use
  `tokenCount()`; the column is a coarse index only.
- **`fold()`/`sameWord()` are for fill-the-blank only.** They ignore accents and
  map `ɛ→e`, `ɔ→o` (distinct letters, not accents — Unicode decomposition misses
  them) because 17.7% of blank-words are untypeable on an iPhone French keyboard.
  Listen-and-type must NOT use them: it tests transcription.
- **`usableRow()` before showing any row.** The dictionary writes `/` or `?` for
  a missing translation and 9 such rows are in the pool; `.trim()` lets them
  through because `"/"` is not empty.
- **Build listen-and-type tiles from tokens, not the raw string** — a "2-token"
  row with a gloss needs 35 tiles from the raw string, 22 max from tokens.

**Non-obvious rules the attempt log depends on:**
- `exercise_attempts.correct` is **first-try only**. Retry screens carry
  `retry: true` and record nothing — counting them would let the 80% gate be
  farmed by failing and then clearing the retry.
- Attempts batch into one insert at session end; an **abandoned** session still
  flushes (the mastery counter reads items ever answered right) but never moves
  the gate. Only a completed session can pass.
- `pratiquer_passed` is a **one-way door** — never cleared by a later weaker
  session.
- Every exercise item must carry `poolId` (`lesson_pool.id`). Without it an
  attempt cannot be written, and the item silently vanishes from the gate.
- **Thin lessons face a harsher gate**: 80% of a 3-question session is 3/3. Two
  lessons are in that state today (Nombres ordinaux, Comparatifs et superlatifs);
  Slice 6's extra formats are the planned fix.

**Audio prefetch gotcha:** R2 sends no `Access-Control-Allow-Origin` and 403s the
OPTIONS preflight, so `fetch()` cannot read audio clips from the browser — a blob
cache fails *silently* and streams on every tap. Prefetch uses
`<audio preload="auto">`, which is exempt from CORS. Setting `Cache-Control` +
CORS on the bucket would fix this at the source for dictionary audio too.

**Screen-boundary audio rule (fixed 2026-08-17).** There is **one** shared
`<audio>` element, so `playClip` stops whatever is already sounding. A screen
that autoplays on mount therefore cuts off the clip the previous screen was still
playing — that is what made the last match-pairs word come out as "Qu'est-ce que
vous entendez ?" instead of the professor's word. Two rules fell out of it, and
new exercise types in Slice 6 need both:

- **No exercise screen autoplays.** `ChooseAudioScreen` waits for its play
  button. Sound follows a tap, never a mount. This also sidesteps iOS entirely,
  where a fresh element cannot play without a gesture anyway.
- **Never hand over to the next screen on a fixed timer after starting a clip.**
  Use **`afterClip(clip, onDone)`**, which waits for `ended` with a
  duration-derived ceiling so an unloadable clip cannot strand the session.

Related rule: **a clip belongs to the match, not to the tap.** Playback tied to
the Lingala tap meant a pair closed from the French tile played nothing at all.

**Exercises play Lingala only — never French.** The French side of any exercise
is text. This is a product rule, not an accident of the data: French is the
prompt the learner already reads, and speaking it aloud would let a listening
question be answered without hearing the Lingala. Verified 2026-08-17 — all
4,668 clips reachable from `lesson_pool` sit under `Lingala/` on R2, and the
only French TTS in the app (`SpeechSynthesisUtterance`, `lang = "fr-FR"`) lives
in `LiveTranslationView` and must stay there. **Do not wire Web Speech into any
exercise screen** — the temptation lands in Slice 6 (listen-and-type, speaking).

## Deprioritised: fine-tune TTS on professor's voice

**Status**: unblocked 2026-08-04, **deprioritised 2026-08-07**. The professor's
voice already covers 100% of course items and ~2,600 dictionary examples; TTS only
speaks text he never recorded (chat replies, live translation). **STT fine-tuning
is now the more valuable of the two** — `api/elevenlabs-stt.js` documents 20–50%
WER on Lingala, which blocks the speaking exercise type. Measure real WER against
the 6,539 professor recordings before committing to either.

**Goal**: replace the current DigitalUmuganda speaker voice with the professor's voice, keeping the same Lingala phonetics. The Space, API, and frontend stay exactly as-is — only the model weights change.

**Why it will work:**
- Single speaker throughout (one professor, Borgeas studio)
- Already have ~3,400 sentence-level clips with transcriptions in DB:
  - `examples` with `audio_url`: 2,593 clips (~3.6h estimated)
  - `lesson_items` with `audio_url`: **1,346** clips (all of them, after the
    2026-08-04 ingest) — was 815
  - plus **203** single-utterance clips cut out of multi-variant recordings,
    listed with their transcripts in
    `artifacts/professor_ingest/variant_clips_for_tts.json`
  - Total: **~6h+** — comfortably above what fine-tuning a VITS checkpoint needs
- Transcriptions already paired in Supabase (`dialect` column) — no labelling needed
- Audio on Cloudflare R2 at `https://pub-78d23bf07fce46b3adc19df91148ffb8.r2.dev`

**Fine-tuning pipeline (to build once professor finishes):**

1. **Data prep script** (`prepare_tts_finetune.py` — to write):
   - Query Supabase for all `(audio_url, dialect)` pairs from `examples` + `lesson_items`
   - Download MP3s from R2
   - Convert to 22kHz mono WAV (ESPnet2 format)
   - Write `wav.scp` and `text` files in Kaldi/ESPnet2 format

2. **Fine-tune** on Google Colab A100 (free tier sufficient):
   - Start from `DigitalUmuganda/lingala_vits_tts` checkpoint
   - Run ESPnet2 VITS fine-tuning recipe
   - ~few hours on A100

3. **Deploy**: upload new `.pth` weights to `Kemz42/monoko-lingala-tts` Space, update `model_path` in `app.py`

**Trigger**: reached. The only outstanding professor item is one argot row flagged
for re-record (`artifacts/professor_ingest/rerecord.json`), which does not block
this work.

---

## Deploy

```bash
# Frontend + API (Vercel auto-deploys on push)
git add index.html admin.html api/
git commit -m "your message"
git push
```

## Full docs

See `TECHNICAL_DOCS.md` for complete architecture, schema, RAG pipeline details, and a step-by-step guide to adding a new language.
