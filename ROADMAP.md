# Monɔkɔ — Product Roadmap

Last updated: 2026-08-04

---

## Current state

- Live app at https://monoko-dictionary.vercel.app
- Lingala dictionary (public) with audio, professor-verified
- 31-module CEFR-aligned curriculum (A1 → B2+), 50 lessons live — **content complete for Lingala**
  (100% audio, no missing translations) as of 2026-08-04
- **Lesson structure reorganized & deduped (2026-07-27)** — mega-lessons split into
  focused ones, duplicates removed, pronouns consolidated. Full record in
  `LESSON_STRUCTURE_AUDIT.md`; backup-first scripts + rollback JSONs in
  `artifacts/lesson_backups/`. The content it was waiting on landed 2026-08-04
  (see Phase 1).
- Monoko AI chat (RAG-backed, pgvector, gpt-4o-mini) — the **dictionary was added
  to the RAG index on 2026-08-07**; before that the two retrieval RPCs reached
  5,238 of the ~10,066 verified FR↔LN pairs the app owns, and the model answered
  the other half from its own Lingala knowledge
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
- Lingala course audio coverage **70% → 100%** (**1,346 / 1,346** items)
- **183** rows with no Lingala text → **0**; all **6** `[PLACEHOLDER]` rows purged
- **632** clips transcoded WebM/Opus → MP3 128k mono and uploaded to
  `audios/Lingala/lesson_items/<module>/`. The transcode is **not optional** —
  iOS Safari cannot decode Opus, so the raw exports are silent on iPhone.
- Conjugation L358/L359 rebuilt to the parler/finir/vendre paradigm
  (`LESSON_STRUCTURE_AUDIT.md` §3a); the old single-verb *aimer* rows are gone
- 3 lessons added: *Conjugaison futur proche* (L393), *Religion et spiritualité*
  (L394), *Technologie et communication* (L395) — the last two the professor
  authored unprompted, now curriculum modules **6.5** and **6.6**
- All rows re-embedded so `match_lesson_items` stays correct

**Follow-on work, same day:**
- ✅ **The two stalled supplements landed 2026-08-04.** `2.1-supp Famille` (20/20)
  and `2.3-supp Manger_boire` (25/25) came back complete — and as *revisions*: he
  also corrected Lingala he had already submitted. Ingested with the new `upsert`
  mode (10 rows updated, 35 inserted). L351 → 40 rows, L353 → 49 rows.
- ✅ **Multi-variant cells split.** 163 rows held 2–6 dash-separated Lingala
  variants in one cell with a single clip covering all of them; **162 resolved**
  across two review passes, **202** alternatives moved to the corpus.
- ✅ **L364 Proverbes French rewritten** — the stub prompts ("Proverbe sur l'union
  qui fait la force") were replaced with real French during the variant review.

**Still open — needs the professor, not code:**
- **Row 8384** (`[Argot kinois]`, six street expressions in one clip) is flagged
  for re-record; it is the last multi-variant row. Details + corrected French in
  `artifacts/professor_ingest/rerecord.json`, ready for a slim "à refaire" page
  via the `generate-todo-recording-files` skill.
- **`Kulutu` vs `Kuluntu`** — the dictionary has one entry spelled `Kulutu`; six
  course rows and the corpus consistently use `Kuluntu`. Needs his ruling, then
  normalise so a learner searching one finds the other.
- ✅ **Religion + Technologie added to `Cours/MONOKO_CURRICULUM.md`** as modules
  **6.5** and **6.6** (2026-08-04). They are part of the *universal* curriculum
  now, so a new language should collect them too — `generate_course_templates.py`
  reads the live Lingala content, so it emits them automatically.

**Variant policy (decided 2026-08-04):** when the professor gives several ways to
say the same thing, the **course shows one** — the rest go to `parallel_sentences`
as `source='course_variant'` so the RAG chat knows them without cluttering the
lesson. **202** alternatives now live in the corpus. Verified live: a query for
*"une autre façon de dire aide-moi"* returns `Tiya ngai loboko, bolimbisi !`, an
alternative that no longer appears in any lesson.

Because the course keeps *one* variant, each lesson row is **updated in place** —
no delete/reinsert, so row ids, `item_order` and `user_progress` FKs are untouched.

Tooling: `make_variant_split_tool.py` → review in browser → `apply_variant_split.py`.
Cuts are pre-placed by a position-weighted silence search (validated at median
**0.11 s** against Anthony's hand-placed cuts, vs 3.62 s for a plain longest-pause
heuristic) but always human-confirmed. An unspaced slash (`Bokoki/okoki`) is
auto-expanded — he reads every combination, so 2 variants × 2 alternatives is 4
utterances in one clip — and **no confidence score detects this**: row 8494 scored
0.97 and was 4.8 s wrong. The reviewer can add or remove segments, and cuts are
re-suggested for the new count.

**Next: fine-tune Lingala TTS on the professor's voice** — now unblocked, and
richer for this work: `artifacts/professor_ingest/variant_clips_for_tts.json`
holds **203** extra single-utterance (audio, transcript) pairs cut out of the
multi-variant recordings. Full
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

## Phase 3 — Exercise engine  ← CURRENT

**Full plan: `EXERCISE_ENGINE_PLAN.md`. Read that file, not this summary.**

**Exams were dropped on 2026-08-07.** The old three-component exam (written 40 /
listening 30 / speaking 30, 70% to pass, gating each level) is replaced by
continuous points on every exercise, Duolingo-style. Speaking becomes an ordinary
exercise type rather than an exam component. All levels are open; the paywall
(modules 1.1 + 1.2 free) is the only gate.

**Goal:** turn the finished content from a bilingual table into a practice loop.

**Five exercise types**, generated client-side from a `lesson_pool` table with no
hand-authoring and no LLM at question time:

| Exercise | Usable items |
|---|---:|
| Choose the audio | 6,539 |
| Fill the blank | 5,193 |
| Tap words in order | 4,700 |
| Match pairs | 3,573 |
| Listen & type | 4,861 — built last, see the plan for why |

**Where the material came from.** Corpus→lesson routing, then two LLM passes to
make it trustworthy. Cosine similarity alone measured **77% precision and flat
across similarity bands** in human QA, so it was replaced: an LLM judge votes on
each placement (96% precision), and a second pass re-places what it rejects by
showing the model all 50 lessons (90% precision). Course material went from
**1,347 items to 6,196** — 1,347 native + 3,063 judge-approved + 1,786
reassigned. Full detail in `EXERCISE_ENGINE_PLAN.md` §Slice 0.

**Build order:** routing QA → `lesson_pool` table → session shell + match-pairs →
choose-the-audio → tokenizer + tap-words-in-order → fill-the-blank → attempts +
SM-2 review queue + streaks.

**Spaced repetition (SM-2)** is unchanged from the original plan: wrong answers
enter a review queue with `ease_factor`, `interval`, `repetitions`; the home
screen shows "X items to review today". It arrives as the last slice, because a
review session is just a session sourced from the queue.

**Dropped:** `exam_results` table, pass thresholds, level locking. `user_progress`
keeps its unused `exam_score` column for now.

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
