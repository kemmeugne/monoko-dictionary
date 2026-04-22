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
| Lingala TTS | HuggingFace Space `Kemz42/monoko-lingala-tts` (ESPnet2 VITS, DigitalUmuganda model, 71.6h Lingala) | called directly from browser |
| French TTS | Web Speech API (browser built-in, `SpeechSynthesisUtterance`) | `index.html` |

---

## Key files in this repo

```
index.html                        — entire frontend (React, ~1850 lines)
admin.html                        — admin panel: per-card approve/reject, pagination top+bottom, page X/Y counter, professor_modified tracking
api/admin-action.js               — Vercel serverless function (secure Supabase writes)
api/chat.js                       — Vercel serverless function (proxies chat to OpenAI gpt-4o-mini)
api/rag-context.js                — Vercel serverless function (pgvector semantic search over parallel_sentences)
api/lesson-context.js             — Vercel serverless function (pgvector semantic search over lesson_items)
api/mms-tts.js                    — Vercel serverless function (warm-up GET ping for HF Space; POST proxies audio but unused — client calls Space directly)
tts_space/app.py                  — HuggingFace Space: ESPnet2 VITS Lingala TTS (Gradio 6.x, served at kemz42-monoko-lingala-tts.hf.space)
tts_space/requirements.txt        — Space deps: git+espnet, huggingface_hub, numpy, soundfile, nltk
tts_space/README.md               — Space metadata: sdk=gradio 6.13.0, python=3.10, app_file=app.py
sql/pgvector_parallel_sentences.sql — SQL migration: add embedding col + match_parallel_sentences RPC
sql/progress_tracking.sql         — SQL migration: profiles + user_progress tables with RLS (added 2026-04-14)
monoko_auto_test.py               — automated quality tester: generates sentences, evaluates Lingala, inserts corrections
benchmark_monoko_models.py        — model benchmark: chrF scoring across OpenAI models (gpt-4o-mini chosen)
liste_200_phrases.docx            — 200 phrase types across 19 themes used by monoko_auto_test.py
TECHNICAL_DOCS.md                 — full system documentation

Cours/MONOKO_CURRICULUM.md        — universal CEFR-aligned curriculum (6 levels, 29 modules) for all languages
Cours/lingala_curriculum_migration.sql — migration script: restructures old 4 courses into 6-level CEFR curriculum
generate_audio_collection_html.py — generates one HTML recording app per module for Lingala items missing audio
populate_stub_modules.py          — populates stub modules with suggested French content, then re-runs HTML generator
audio_collection_html/            — generated HTML recording apps (one per module), sent to professor for audio recording
generate_course_templates.py      — generates generic HTML recording apps for all 29 modules for any new language
translate_examples_to_parallel_sentences.py — translates professor example sentences (Lingala) to French via GPT and inserts into parallel_sentences; supports --dry-run and --from-log to insert directly from existing JSON log
sql/corrections_reviewed_at.sql   — migration: adds reviewed_at to corrections + pace monitoring queries
```

---

## Database tables (Supabase)

- `languages` — Lingala (id=1), Yoruba (id=2)
- `words` → `senses` → `examples` — dictionary hierarchy
- `senses.audio_url/audio_key/audio_source_cell` — Lingala word audio links (added 2026-03-15)
- `examples.audio_url/audio_key/audio_source_cell` — Lingala example audio links (added 2026-03-15)
- `parallel_sentences` — FR↔dialect sentence pairs for RAG (FLORES + approved corrections); `embedding vector(384)` added 2026-03-31
- `corrections` — user-submitted AI corrections (pending → approved); `professor_modified boolean` tracks whether the professor edited the correction before approving; `reviewed_at timestamptz` set on approve/reject for session pace tracking (added 2026-04-18)
- `chat_events` — tester-tracked chat activity (`tester_name`, `session_id`, query/response, timestamps)
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

## Deploy

```bash
# Frontend + API (Vercel auto-deploys on push)
git add index.html admin.html api/
git commit -m "your message"
git push
```

## Full docs

See `TECHNICAL_DOCS.md` for complete architecture, schema, RAG pipeline details, and a step-by-step guide to adding a new language.
