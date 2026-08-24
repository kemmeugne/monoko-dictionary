# Monɔkɔ — Product Roadmap

Last updated: 2026-08-22

---

## Current state

- Live app at https://monoko-dictionary.vercel.app
- Lingala dictionary (public) with audio, professor-verified
- 31-module CEFR-aligned curriculum (A1 → B2+), 49 lessons live — **content complete for Lingala**
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
- **Learner experience redesign shipped (2026-08-22)** — quiet
  persistent shell, integrated home dictionary, continuous locked 49-lesson
  trail, mock-matched lesson and challenge previews, responsive top/bottom
  navigation, full profile, medals and 16 editable Lingala/Congolese culture
  capsules. Claimable gifts, capsule reveals and medal ceremonies use the live
  progression state and include their production celebrations.
- **Auth and navigation reworked (2026-08-23)** — a real login page in the
  redesigned template with password reset; signing out lands there rather than
  on the marketing landing; home and every learner screen now require a session
  instead of rendering signed-out and only challenging at Parcours; the trail
  page carries Paramètres and Déconnexion; and changing a password asks for the
  current one plus the new one twice.
- **Phase 2 — session, chat, live and dictionary redesigned (2026-08-24)** —
  the six exercise screens, the session shell, briefing and summary, Parler avec
  Monɔkɔ, Traduction en direct, the in-app dictionary and word detail all moved
  off the retired cream/purple palette onto the design tokens, with 8–10px radii
  and no gradients. Added `--m-correct` / `--m-wrong` tokens for exercise
  feedback. The app now has no retired colour literals outside the two
  intentional per-language brand entries.
- **Signup confirmation and resolved country (2026-08-24)** — signup asks for
  the password twice, and the ranking country is resolved once from Vercel's
  edge geolocation (`api/geo.js`, no third-party service). It is shown and
  correctable on the signup form — geolocation reports where the request came
  from, not where a learner lives, and the market is diaspora — then fixed, and
  read-only in settings thereafter.
- **Landing dictionary and folding language card (2026-08-24)** — the dictionary
  renders on the landing page itself (language tabs, direction, search, results
  that expand to senses with audio) instead of pushing a visitor into the app
  shell. The language description is folded on arrival and toggles open, so the
  map stays visible on a phone. Fixed hero clipping: `.m-landing-hero` is
  `overflow: hidden`, so content wider than the viewport was cut off while
  page-level overflow still read 0.
- **Public dictionary + account actions everywhere (2026-08-24)** — the landing
  page routes straight into the dictionary for signed-out visitors (hero action,
  header nav, one button per language) and the shell renders a visitor variant
  with a « Se connecter » call instead of an empty account. Paramètres et
  Déconnexion were dead on Accueil and Profil because those hubs build their own
  shells and were never handed the handlers; both now work from every screen,
  covered by a check that clicks them on all five.
- **Account settings, sign out and the weekly ranking (2026-08-22)** — a
  settings screen for every personal detail (password, display name, one-time
  pseudonym, country, ranking opt-in, optional phone/address/ethnicity), sign
  out from both the rail and settings, and the language switch finally
  reachable on a phone via the top-bar gear. The pseudonym is now unique across
  all learners and fixed once chosen. The ranking gained the dark standing
  card, a Rang/Apprenant/XP header and the gold "Vous" row. Exercise sessions
  are constrained to a 760px column instead of stretching across a desktop.
  `sql/account_settings.sql` applied 2026-08-23.
- **Post-ship verification pass (2026-08-23)** — found and fixed five bugs in
  the above: the signup pseudonym check queried `profiles` directly and RLS
  made it always pass, so uniqueness was never warned about and a collision
  left the learner with no profile row at all; the profile insert now retries
  without the name; signing in from the settings gate landed on home; the
  signup pseudonym field kept a stale value; and the auth gate called every
  destination "cours". Needs `sql/pseudonym_availability.sql`.
- **Public landing and lesson pages redesigned (2026-08-22)** — the three views
  the redesign had left behind now share the shell and the design tokens. `/` is
  a signed-out marketing landing with an immersive (non-interactive) hero map;
  signed-in learners resume in their own language via `preferred_language_id`
  and switch language from a sheet instead of the landing page. Lesson pages run
  inside the standard shell: entries are stacked cards on a phone and a
  two-column table from 760px, and the conjugation paradigm, the Sons-et-alphabet
  tiles and the practice block all moved off the retired cream/purple palette.
- **Level milestones and community loop shipped (2026-08-22)** — fixed 500-XP
  level completion rewards, optional 20-question Grand défi with permanent
  enriched-level distinction, and opt-in pseudonymous weekly country/world ranking.
- **The practice loop is complete (2026-08-18)** — all six exercise types, plus
  XP, medals, streaks, SM-2 review scheduling and Élargir topic levels. Only the
  daily session cap (the paywall) is left in Phase 3.
- **A build step is now a Phase 4 prerequisite** — `index.html` is ~6,700 lines
  transpiled in the browser on every load. See `BUILD_AND_SPLIT_PLAN.md`.
- **Content that was in the database but not on screen was surfaced 2026-08-18** —
  181 example sentences across 9 lessons, 179 of them already carrying the
  professor's audio (two rendering bugs, nothing added), plus the first professor's complete *ko linga* conjugation
  paradigm, 30 forms with 24 of his clips, lost in the original row-wise import
  of a workbook that was a matrix. See Phase 3 below.

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
- Lesson completion — originally a "✓ J'ai terminé ce module" button; **since 2026-08-20 a module is validated only by passing Pratiquer at 80% first-try**, so the checkmark means the same thing as the gate
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

**Six exercise types**, generated client-side from a `lesson_pool` table with no
hand-authoring and no LLM at question time:

| Exercise | Usable items |
|---|---:|
| Choose the audio | 6,539 |
| Fill the blank | 5,193 |
| Tap words in order | 4,700 |
| Match pairs | 3,573 |
| Listen & type | 4,861 — **character tiles, not a keyboard**; 1,524 items at ≤2 tokens |
| Speaking | 4,668 — **record-and-compare**, no STT, excluded from the 80% gate |

**Where the material came from.** Corpus→lesson routing, then two LLM passes to
make it trustworthy. Cosine similarity alone measured **77% precision and flat
across similarity bands** in human QA, so it was replaced: an LLM judge votes on
each placement (96% precision), and a second pass re-places what it rejects by
showing the model all 50 lessons (90% precision). Course material went from
**1,347 items to 6,196** — 1,347 native + 3,063 judge-approved + 1,786
reassigned. Full detail in `EXERCISE_ENGINE_PLAN.md` §Slice 0.

**The stage model (settled 2026-08-10).** A lesson is three stages over two
**disjoint** pools — Élargir is everything routed to the topic that the lesson
itself never taught:

| Stage | Material | Shape |
|---|---|---|
| Apprendre | the lesson page (exists) | the teach beat |
| **Pratiquer** | `tier = native`, 100% precision | finite, **80% to pass**, unlocks Élargir |
| **Élargir** | `approved` + `reassigned` | endless, replayable for best score |

A session is **20 questions** (a match-pairs screen counts as 5), identical in
both stages, so every session takes the same time regardless of lesson size.
Thin lessons test the same item in up to 3 *different formats* rather than
running short — 47/50 lessons then fill a full session from native content alone.

Élargir levels up on topic XP: the level widens the pool (short → long
sentences, `approved` → `reassigned`) and shifts the exercise mix from
recognition to production. It recycles with spacing rather than exhausting —
median depth is only 10 distinct sessions.

**Free tier caps sessions per day (~3), never mistakes.** Élargir is capped;
Pratiquer is not, being finite. Retention comes from streak, best score +
medals, perfect-session bonus and the mastery counter. Speed bonuses,
leaderboards and hearts were all rejected — see the plan for why.

**Build order:** routing QA ✅ → `lesson_pool` ✅ → session shell + match-pairs ✅
→ choose-the-audio ✅ → attempts + pool-shaped `buildSession` ✅ → stage split +
80% gate ✅ → tokenizer ✅ → tap-words ✅ → fill-the-blank ✅ →
listen-and-type ✅ → record-and-compare speaking ✅ → XP/streaks/SM-2 ✅ →
**session cap ← NEXT**.

**Shipped 2026-08-17 — the practice loop is playable end to end.** A learner
opens a lesson, runs a 20-question **Pratiquer** session on the professor's own
rows, passes it at 80% first-try, and unlocks endless **Élargir** on the routed
corpus. All six exercise types exist: match-pairs, choose-the-audio,
tap-words-in-order, fill-the-blank, listen-and-type and speaking.

- **Speaking shipped 2026-08-18:** at most three prompts per session, recordings
  stay on-device, professor and learner play back-to-back, and the learner
  self-rates. Speaking earns XP and coverage but is excluded from the objective
  80% gate. No STT and no database migration.

- The budget is 20 **questions**, not 15 screens; `buildSession(items, level,
  count, history)` takes a pool, never a `lesson_id`.
- `startSession(stage)` filters by tier — the whole stage split. Before it,
  practice served corpus rows the lesson never taught (178 items for Salutations
  against the 29 the professor wrote).
- `exercise_attempts` + `lesson_stage_state` persist attempts, the gate and the
  "18/25 maîtrisés" counter (`sql/exercise_progress.sql`), first-try only.
- **Selection is breadth-first**: unseen across sessions → unused in this
  session → better tier → longest ago → random. Replaying "S'entraîner" sweeps
  forward through the lesson instead of re-rolling — Les nombres goes from 87%
  coverage after 6 random sessions to 100% after 4.
- A three-item lesson turned out to be a content problem, not an engine one:
  "Les nombres ordinaux" was folded into "Les nombres"
  (`sql/merge_ordinals_into_numbers.sql`), leaving **49 lessons**.

**Measured across every lesson:** 47 build a full 20-question Pratiquer session
and 2 build 15–19 — so the harshest gate in the curriculum is 8/10 rather than
the 3/3 one lesson demanded that morning. Verified by `npm test` (228) and
`node scripts/audit_exercise_types.mjs` across all 49 lessons and both stages.

**The audit is a best-of-25 randomised build, so its floor moves.** *Comparatifs
et superlatifs* comes out at 15 or 16 depending on the draw (three consecutive
runs: 16, 16, 15). Quote the floor as **15**, not 16, and treat a one-question
change in the thinnest lesson as noise rather than a regression.

**2026-08-18 — a briefing, and conjugation tables that are also exercises.**

- Every session now opens on a briefing that runs **stage → lesson title →
  description → stats → Au programme → Commencer**, and *Au programme* lists one
  line per exercise type **actually in the built queue** ("5 paires à associer"),
  counted off the queue rather than the budget so it cannot describe a session
  the learner is not about to get.
- The first professor's **complete conjugation paradigm** now heads the
  conjugation lessons — *ko linga*, 5 tenses × 6 persons, 24 of the 30 forms
  carrying his recording. It had been lost since the original import read a
  workbook matrix row-wise. Stored as a **grid**, French glosses generated (his
  workbook French has typos; his Lingala is copied verbatim), rendered as tense
  tabs above the lesson, and **each lesson shows only the tenses it teaches** —
  L393 futur proche deliberately shows nothing, because this paradigm has no
  futur proche column and the futur simple would teach the wrong tense there.
- Those forms are the **best match-pairs material the course has** — six forms of
  one tense share an orthography, a shape band and a topic by construction. The
  mirroring into `lesson_pool` is written and driven by the same link rows that
  decide what a lesson displays, so the professor's next verb becomes exercise
  material with no code change. **`sql/lesson_pool_conjugation_source.sql` was
  applied 2026-08-18** and the pool now holds **30 conjugation rows** (24 on
  L358, 6 on L359). Only the imparfait and futur sets reach match-pairs — the
  progressives and most of the présent are too long for the `longestSide <= 3`
  cap — but that was enough to take **L358 from zero viable match-pairs buckets
  to one**, and L359 from one to two.
- **181 example sentences became visible**, none of them new: a "these values
  repeat, so they must be section headers" heuristic was turning 131 real
  sentences into headings across 4 lessons, and every niveau-1 lesson took an
  earlier "Série 1 / Série 2" branch that had no example row at all (50 more
  sentences, 48 recorded).

**2026-08-18 — Slice 7 shipped: progression and retention.** XP (with a flat
50-XP perfect-session bonus), medals at 80/90/100, a streak, SM-2 scheduling and
Élargir topic levels. `sql/progression.sql` applied — `user_streak` (one row per
**learner**, spanning every language, keyed on the learner's **local** day) and
`review_schedule` (SM-2 state, both stages from 2026-08-20).

**Spaced repetition (SM-2) runs on both stages** (Élargir added 2026-08-20).
It needs a finite item set with per-item state, and both are finite **per
lesson** — median 25 native items, median 80 routed. The corpus-wide figure that
first excluded Élargir counts all 49 lessons, which no learner ever meets.
Scheduling Élargir is what turns it from endless recycling into a pool a learner
gets through.
Because a screen only knows right or wrong, the quality signal is one bit:
ease moves +0.1/−0.2 under a **3.0 ceiling that is ours, not SM-2's**.
Due items are served **below** breadth in `selectionOrder` — an unseen item has
no schedule row and cannot be due, so scheduling first would have undone the
breadth-first coverage Slice 6 measured.

**Verification grew with it.** `npm test` is **286** (was 228);
**`npm run check:syntax`** parses the whole babel block, which nothing else did
— a stray bracket in the React no unit test slices used to pass every gate and
ship a blank page; and **`npm run verify:progression`** exercises the write path
against monoko-test **as a signed-in learner**, catching what pure-function
tests structurally cannot (a column the schema lacks, an unresolvable
`on_conflict`, a type that will not round-trip, a policy missing its
`WITH CHECK`). **The test project had drifted a whole phase behind** — it held
only the 12 base tables — and `db:sync-test-schema` now applies the real
migration files rather than a copy of their DDL.

**Dropped:** `exam_results`, exam pass thresholds and the old exam-based level locking. `user_progress`
keeps its unused `exam_score` column for now.

**2026-08-22 — Course trail and learner shell completed.** The production UI now
uses one continuous path across all six niveaux. Passing Pratiquer unlocks the
next lesson; finishing every lesson in a niveau opens the next niveau, awards a
named medal and 500 XP once, and unlocks a separate Grand défi. Passing that
optional level-wide challenge at 80% enriches the existing medal and awards 300
XP once. Lesson-level Aller plus loin remains independent and marks its lesson
node with a gold ring at 80%. Completed non-final lessons expose a one-time XP
gift; linked cultural gifts also enter the profile collection. Final lessons
open an automatic medal ceremony before the Grand défi becomes available.
Home, profile, culture collection and the opt-in weekly pseudonym ranking share
the same live progression state. Authorized developer presets rebuild real
progress and prior rewards while leaving the selected boundary claimable for
ceremony testing. The release is covered by a repeatable authenticated
real-Chrome check against monoko-test at desktop, 390px and 320px.

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

**Prerequisite — a build step, before anything here.** `index.html` is ~6,700
lines transpiled in the browser by Babel standalone: ~700 KB gzipped for the
compiler plus 350–650 ms of transpile on a phone, on every cold load, before
first paint. Wrapping that in Capacitor pays it again on every app launch, on
top of the slower WebView startup — and undoing it afterwards means another
store review. **See `BUILD_AND_SPLIT_PLAN.md`**, which also explains why adding
the bundler and splitting the file are separate changes with different risk.

**Steps:**
0. **Build step** (`BUILD_AND_SPLIT_PLAN.md` Stage A) — hard gate
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
