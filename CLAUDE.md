# Monɔkɔ — Claude Code Context

## What this project is

Monɔkɔ is a multilingual dictionary and AI conversation app for African languages (Lingala, Yoruba). It combines a professor-verified dictionary, structured grammar courses, and an AI chat assistant backed by a custom FAISS RAG system.

**Live app**: https://monoko-dictionary.vercel.app
**Admin panel**: https://monoko-dictionary.vercel.app/admin.html (password in Vercel env vars)

---

## Stack

| Layer | Technology | Where |
|---|---|---|
| Frontend | Single-file React (Babel standalone, no build step) | Vercel |
| Database | Supabase (PostgreSQL) | `haioiccujncsehadipzb.supabase.co` |
| RAG backend | FastAPI + FAISS | Railway |
| LLM | OpenAI `gpt-4o-mini` | via Vercel serverless `/api/chat.js` |
| Index storage | Cloudflare R2 | Public bucket `monoko-rag` |
| Admin writes | Vercel serverless function | `api/admin-action.js` |
| Chat proxy | Vercel serverless function | `api/chat.js` |

---

## Key files in this repo

```
index.html              — entire frontend (React, ~1700 lines)
admin.html              — admin panel for reviewing corrections
api/admin-action.js     — Vercel serverless function (secure Supabase writes)
api/chat.js             — Vercel serverless function (proxies chat to OpenAI gpt-4o-mini)
TECHNICAL_DOCS.md       — full system documentation
upload_to_supabase.py   — uploads Excel dictionary files to Supabase
upload_courses.py       — uploads course/lesson JSON to Supabase
```

## RAG backend (separate repo / Railway)

```
monoko_rag/
  rag_api.py                — FastAPI server (POST /api/context)
  step3_build_rag.py        — MonokoRAG class, FAISS indexes
  clean_nllb.py             — Stage 1 NLLB filter (lang detect + vocab overlap)
  score_nllb_ngram.py       — Stage 2 NLLB filter (n-gram perplexity)
  step1_download_data.py    — Downloads NLLB, FLORES, WAXAL, Monoko data
  step2_process_and_merge.py — Cleans and merges all sources
  eval_rag.py               — Evaluates retrieval quality
  upload_flores_to_supabase.py — Uploads FLORES-200 gold pairs
```

---

## Database tables (Supabase)

- `languages` — Lingala (id=1), Yoruba (id=2)
- `words` → `senses` → `examples` — dictionary hierarchy
- `senses.audio_url/audio_key/audio_source_cell` — Lingala word audio links (added 2026-03-15)
- `examples.audio_url/audio_key/audio_source_cell` — Lingala example audio links (added 2026-03-15)
- `parallel_sentences` — FR↔dialect sentence pairs for RAG (FLORES + approved corrections)
- `corrections` — user-submitted AI corrections (pending → approved/rejected)
- `courses` → `lessons` → `lesson_items` — structured grammar courses

---

## RAG pipeline (how chat works)

1. User message → `POST /api/context` on Railway → FAISS dual-path retrieval (FR query → FR index, Lingala → LN index) → top-30 semantically similar pairs (with `language_id` filter)
2. Context string → `POST /api/chat` (Vercel serverless) → OpenAI `gpt-4o-mini` with strict corpus-first system prompt
3. Response shown with quality indicators: ✓ verified / ~ suggestion (assembled from verified elements)

**Note**: Supabase `lesson_items` keyword search was removed from the chat pipeline — all context now comes from FAISS only. `top_k` increased from 20 → 30 to compensate.

**FAISS index**: 67,687 vectors — 5,227 verified (Monoko) + 2,008 gold (FLORES) + ~60,452 NLLB HC

---

## Correction flow

```
User flags AI error → corrections table (status: pending)
→ Admin reviews at /admin.html
→ Approve → inserts into parallel_sentences (quality: verified) + status: approved
→ Reject → status: rejected
```

---

## Environment variables

**Vercel**:
- `SUPABASE_SERVICE_KEY` — service role key for admin writes
- `ADMIN_PASSWORD` — password for admin.html
- `OPENAI_API_KEY` — OpenAI API key for `/api/chat.js`

**Railway**:
- `R2_PUBLIC_URL` — Cloudflare R2 public URL (e.g. `https://pub-xxx.r2.dev`)

**Cloudflare R2 audio migration details**:
- Bucket: `audios`
- Public base URL: `https://pub-78d23bf07fce46b3adc19df91148ffb8.r2.dev`
- Object layout:
  - `Lingala/senses/<letter>/<file>.mp3`
  - `Lingala/examples/<letter>/<file>.mp3`

---

## Important conventions

- `index.html` uses the **anon key** (public, read-only by default) for all Supabase reads
- All Supabase **writes** from the browser go through `/api/admin-action.js` (service key never in client code)
- All **LLM calls** go through `/api/chat.js` (OpenAI key never in client code; no user-entered API key)
- The RAG API URL is hardcoded in `index.html` at the `RAG_API_URL` constant — update this when redeploying Railway
- `admin.html` password is verified **server-side** only — no password logic in client code, no secrets in `admin.html`
- FAISS indexes are stored in Cloudflare R2, downloaded by Railway at startup — never committed to git
- Lingala dictionary audio is now linked through `senses.audio_url` and `examples.audio_url`
- `index.html` `WordDetail` renders audio buttons only when an audio URL exists

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

## Deploy

```bash
# Frontend (Vercel auto-deploys on push)
git add index.html admin.html api/admin-action.js api/chat.js
git commit -m "your message"
git push

# Backend (Railway auto-deploys on push to monoko-rag-api repo)
# After rebuilding FAISS indexes, upload to R2 first, then push
```

## Full docs

See `TECHNICAL_DOCS.md` for complete architecture, schema, RAG pipeline details, and a step-by-step guide to adding a new language.
