# Monɔkɔ — Product Roadmap

Last updated: 2026-04-14

---

## Current state

- Live app at https://monoko-dictionary.vercel.app
- Lingala dictionary (public) with audio, professor-verified
- 29-module CEFR-aligned course structure (A1 → B2+) — content partially complete
- Monoko AI chat (RAG-backed, pgvector, gpt-4o-mini)
- Supabase Auth — dictionary public, courses + chat require login
- Admin panel for professor corrections at `/admin.html`
- User progress tracking — lesson completion, per-level progress bars, "Continuer" home shortcut

---

## Phase 1 — Content completion (BLOCKED on professor)

**Goal:** Full Lingala course content ready for learners.

**What's needed from the professor:**
- 346 items in `audio_collection_html/` need Lingala translations filled in + audio recorded
- 4 modules left entirely to professor:
  - 3.3 / 3.4 — Conjugaison présent/passé + futur/impératif (verb tables are language-specific)
  - 4.3 — Proverbes et expressions idiomatiques (native speaker required)
  - 6.4 — La langue dans le monde (cultural context required)

**After professor delivers ZIPs:**
1. Upload audio files to Cloudflare R2 (`audios/Lingala/...`)
2. Update `lesson_items.audio_url` in Supabase
3. Re-run `embed_lesson_items.py` for newly added items
4. Re-generate `audio_collection_html/` and verify coverage

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
