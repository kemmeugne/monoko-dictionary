# Monɔkɔ — Product Roadmap

Last updated: 2026-08-04

---

## Current state

- Live app at https://monoko-dictionary.vercel.app
- Lingala dictionary (public) with audio, professor-verified
- 31-module CEFR-aligned course structure (A1 → B2+) — **content complete for Lingala**
  (100% audio, no missing translations) as of 2026-08-04
- **Lesson structure reorganized & deduped (2026-07-27)** — mega-lessons split into
  focused ones, duplicates removed, pronouns consolidated. Full record in
  `LESSON_STRUCTURE_AUDIT.md`; backup-first scripts + rollback JSONs in
  `artifacts/lesson_backups/`. The content it was waiting on landed 2026-08-04
  (see Phase 1).
- Monoko AI chat (RAG-backed, pgvector, gpt-4o-mini)
- Supabase Auth — dictionary public, courses + chat require login
- Admin panel for professor corrections at `/admin.html`
- User progress tracking — lesson completion, per-level progress bars, "Continuer" home shortcut

---

## Phase 1 — Content completion ✅ Shipped 2026-08-04

**Goal:** Full Lingala course content ready for learners.

**Status:** Done. All 39 returned ZIPs were ingested on 2026-08-04 via
`ingest_professor_zips.py` (three re-runnable stages: `plan` / `upload` / `apply`,
rollback JSONs in `artifacts/professor_ingest/`).

**Delivered:**
- Lingala course audio coverage **70% → 100%** (1,311 / 1,311 items)
- **183** rows with no Lingala text → **0**; all **6** `[PLACEHOLDER]` rows purged
- **587** clips transcoded WebM/Opus → MP3 128k mono and uploaded to
  `audios/Lingala/lesson_items/<module>/`. The transcode is **not optional** —
  iOS Safari cannot decode Opus, so the raw exports are silent on iPhone.
- Conjugation L358/L359 rebuilt to the parler/finir/vendre paradigm
  (`LESSON_STRUCTURE_AUDIT.md` §3a); the old single-verb *aimer* rows are gone
- 3 lessons added: *Conjugaison futur proche* (L393), *Religion et spiritualité*
  (L394), *Technologie et communication* (L395) — the last two are new modules the
  professor authored and are **not yet in `Cours/MONOKO_CURRICULUM.md`**
- All rows re-embedded so `match_lesson_items` stays correct

**Still open (small):**
- **35 items owed by the professor**, both from his first batch (2026-05-23, never
  revisited): `2.1-supp Famille` has 11 entries recorded with **no Lingala text
  typed** (audio exists, no transcript), and `2.3-supp Manger_boire` has 24 of 25
  untouched. Send a slim "à refaire" page rather than the full modules.
- ✅ **Multi-variant cells split (2026-08-04).** 148 rows held 2–6 dash-separated
  Lingala variants in one cell, with a single clip covering all of them. Reviewed
  in `variant_split_tool.html` (see "Variant policy" below); 141 done, **7 left**.
- **17 rows in L364 Proverbes have a French side that is still a stub prompt**
  ("Proverbe sur l'union qui fait la force.") rather than the French proverb. The
  Lingala is real; the French needs authoring.

**Variant policy (decided 2026-08-04):** when the professor gives several ways to
say the same thing, the **course shows one** — the rest go to `parallel_sentences`
as `source='course_variant'` so the RAG chat knows them without cluttering the
lesson. First pass moved **184** alternatives into the corpus. Verified live: a
query for *"une autre façon de dire aide-moi"* returns `Tiya ngai loboko,
bolimbisi !`, an alternative that no longer appears in any lesson.

Tooling: `make_variant_split_tool.py` → review in browser → `apply_variant_split.py`.
Cuts are pre-placed by a position-weighted silence search (validated at median
0.11 s against hand-placed cuts) but always human-confirmed — a slash inside a
variant means he read more utterances than the text lists, and no confidence
score detects that.

**Next: fine-tune Lingala TTS on the professor's voice** — now unblocked, and
richer for this work: `artifacts/professor_ingest/variant_clips_for_tts.json`
holds 185 extra (audio, transcript) pairs from the split clips. Full
pipeline in CLAUDE.md → "Next: Fine-tune TTS on professor's voice" (prepare data
from R2 + `dialect` transcripts → ESPnet2 VITS fine-tune on Colab → deploy new
weights to the HF Space).

---

## Phase 2 — User progress tracking ✅ Shipped 2026-04-14

**Goal:** Know where each user is in the curriculum.

**Delivered:**
- `profiles` and `user_progress` Supabase tables with RLS (`sql/progress_tracking.sql`)
- `user_progress` has `UNIQUE(user_id, lesson_id)` and a `(user_id, language_id)` index; `exam_score` column is `null` until Phase 3
- "✓ J'ai terminé ce module" button at the bottom of every lesson
- Checkmarks on completed lesson rows in the course detail view
- Per-level progress bar (X/Y modules) on every level card
- "Continuer ▶" shortcut card on home screen — drops the user directly back into their last lesson
- Progress auto-loads on login and language switch via `supabaseClient` + RLS

---

## Phase 3 — Exam system

**Goal:** Test and certify learner progression between levels.

**Structure (per MONOKO_CURRICULUM.md):**

Each of the 6 levels ends with an exam composed of 3 components:

| Component | Weight | Format |
|---|---|---|
| Written | 40% | Translation, fill-in-the-blank, sentence construction |
| Listening | 30% | Audio comprehension questions |
| Speaking | 30% | User records response, AI scores via speech-to-text |

- Pass threshold: **70%** overall
- Must pass to unlock next level
- Failed components can be retried individually
- Wrong answers fed into spaced repetition queue

**Supabase table:**
```sql
exam_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users,
  course_id int references courses(id),
  written_score numeric,
  listening_score numeric,
  speaking_score numeric,
  overall_score numeric,
  passed boolean,
  taken_at timestamptz default now()
)
```

**UX — flashcard style (Duolingo/Anki inspired):**
- One question per screen, no scrolling
- Progress bar at top (e.g. 8/20)
- Large tap targets (mobile-first)
- Celebration animation on correct answer
- Written: multiple choice or fill-in-the-blank
- Listening: tap to play audio, select correct meaning
- Speaking: tap microphone → record → submit → score displayed

**Speaking evaluation:**
- Levels 1–3: speech-to-text transcription matched against expected text (match %)
- Levels 4–6: transcription evaluated by LLM for fluency, grammar, vocabulary range
- Tool: ElevenLabs Scribe (speech-to-text), gpt-4o-mini (LLM evaluation)
- Level 6 final: 10-minute free conversation with Monoko AI, holistic scoring

**Spaced repetition (SM-2 algorithm):**
- Wrong answers → added to review queue with `ease_factor`, `interval`, `repetitions`
- Home screen shows "X items to review today"
- Review sessions independent of lesson/exam flow

---

## Phase 4 — Mobile app

**Goal:** Ship on App Store + Google Play.

**Approach: Capacitor (web wrapper)**

Rationale:
- Reuses existing HTML/JS/React codebase — no rewrite
- One codebase for web + iOS + Android
- Capacitor handles native microphone access (required for speaking exercises)
- Can ship in weeks vs months compared to React Native rewrite
- Upgrade path: migrate specific screens to native later if needed

**Steps:**
1. Make `index.html` fully responsive / touch-friendly (large tap targets, no hover dependencies)
2. Install Capacitor, wrap the web app
3. Add native microphone plugin for speaking exercises
4. Add offline support — cache lesson content locally (Capacitor Filesystem or SQLite plugin)
5. Submit to App Store / Play Store

**Mobile-specific additions:**
- Push notifications for daily practice reminders
- Streak counter (days of consecutive practice)
- Offline mode for lesson content (connectivity is unreliable in target markets)

---

## Phase 5 — Multi-language expansion

**Goal:** Onboard Yoruba (and future languages) using the template system.

**Process:**
1. Run `generate_course_templates.py --language Yoruba` → 29 HTML recording apps
2. Send to Yoruba professor
3. Receive ZIPs → upload audio to R2 → push items to Supabase with `language_id=2`
4. Run `embed_lesson_items.py` for Yoruba items
5. Language appears in app language selector

**Infrastructure already in place:**
- `generate_course_templates.py` produces language-agnostic templates
- All DB tables are `language_id`-keyed
- RAG pipeline filters by `language_id`

---

## Future / not yet planned

- **Paid subscription** — Stripe integration, subscription check on courses/chat access (auth gate already in place)
- **Professor role** — replace shared admin password with Supabase Auth role (`user_metadata.role = "professor"`)
- **Progress sharing** — share completion badges, vocabulary learned count
- **Community corrections** — community-submitted corrections (currently professor-only)
- **Tone/phoneme feedback** — phoneme-level pronunciation scoring for tonal languages (Lingala, Yoruba)
