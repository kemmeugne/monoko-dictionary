# Monɔkɔ — Product Roadmap

Last updated: 2026-08-31

---

## Current state

Last full review: 2026-08-27.

**The product.** Live at https://monoko.africa (moved from
monoko-dictionary.vercel.app on 2026-09-04). A public Lingala
dictionary with professor-verified audio, a 49-lesson CEFR curriculum (A1 → B2+)
that is content-complete for Lingala, a six-type practice loop with XP, medals,
streaks and SM-2 review, an opt-in weekly ranking, and a RAG-backed AI chat.
Supabase Auth throughout.

**Who sees what.** `lang_select` is a public marketing landing with the
dictionary rendered on it. `auth` is the login page. Everything else — home,
the course trail, lessons, sessions, profile, settings, chat, live translation —
requires a learner. The dictionary stays free forever; it is the SEO and
goodwill engine, not a revenue line.

**The design system.** One shell (rail on desktop, top bar + bottom nav on
mobile), one palette in `monoko-ui.css`, 8–10px radii, no gradients. As of
2026-08-24 no screen carries a retired colour literal, the two per-language
brand colours for the map markers aside.

**What is still open.** The daily session cap — the paywall — is the last item
in Phase 3. The production build prerequisite for Phase 4 is now implemented:
esbuild compiles the single-file JSX into `dist/app.js`, so deployed clients no
longer download or run Babel. Splitting the source into modules remains a
separate maintainability task (`BUILD_AND_SPLIT_PLAN.md`).

### Recent history

- **Content completion (2026-08-04)** — all 39 professor ZIPs ingested; Lingala
  audio coverage 70% → 100%. Full record in Phase 1.
- **Structure and hidden content (2026-07-27 → 2026-08-18)** — mega-lessons
  split and deduped (`LESSON_STRUCTURE_AUDIT.md`); 181 example sentences and the
  first complete *ko linga* conjugation paradigm surfaced from data that was
  already in the database but never rendered.
- **The practice loop completed (2026-08-18)** — all six exercise types, XP,
  medals, streaks, SM-2 scheduling and Élargir topic levels.
- **Learner experience redesign (2026-08-22)** — persistent shell, continuous
  locked 49-lesson trail, lesson and challenge previews, profile, medals, 16
  culture capsules, level milestones, the Grand défi and the weekly ranking.
- **Landing and lesson pages (2026-08-22)** — the three views the redesign had
  left behind. `/` became a marketing landing; lesson pages moved into the shell
  as cards on a phone and a two-column table from 760px.
- **Account, settings and ranking (2026-08-22 → 08-23)** — a settings screen for
  every personal detail, sign out (which did not exist in the app), the language
  switch (unreachable on mobile), a pseudonym that is unique across all learners
  and chosen once, and the ranking's standing card and gold "Vous" row.
- **Auth and navigation (2026-08-23)** — a real login page with password reset;
  signing out lands there rather than on the marketing landing; every learner
  screen now requires a session instead of rendering signed-out and only
  challenging at Parcours; password change requires the current password.
- **Public dictionary and the landing (2026-08-24)** — the dictionary renders on
  the landing page itself, and the shell has a signed-out visitor variant. The
  language description folds so the map stays visible on a phone.
- **Signup and country (2026-08-24)** — password confirmed twice; the ranking
  country resolved once from Vercel's edge geolocation, correctable on the
  signup form, fixed thereafter.
- **Phase 2 design pass (2026-08-24)** — the six exercise screens, session shell,
  chat, live translation, dictionary and word detail moved onto the design
  tokens. `--m-correct` / `--m-wrong` added for exercise feedback.
- **Security and release hardening (2026-08-24)** — paid APIs now require a
  Supabase bearer token and use durable per-account quotas; corrections are
  private and server-mediated; competitive progression is recorded by trusted,
  idempotent database functions; country immutability is database-enforced.
  The compiled build, secret/RLS guardrails, 310 unit tests, and Chromium smoke
  tests at desktop, 390px and 320px now run in GitHub Actions. The migration was
  verified on `monoko-test`, applied to production, and its anonymous boundaries
  rechecked on 2026-08-24. The exposed legacy key was revoked and Vercel was moved to a server-only `sb_secret_...` key on 2026-08-24.
- **Developer progression simulator (2026-08-24)** — authorized developers can
  now advance the next lesson from either its preview or the three-dot menu.
  Production XP and reward state is rebuilt through the protected developer
  RPC; the trail animates the completed and unlocked nodes, shows a status
  confirmation, and replays the automatic medal sheet at a level boundary.
- **Culture artwork refresh (2026-08-31)** — 14 of the 16 cultural capsules now
  have subject-specific optimized artwork rather than sharing two generic
  montages. Kinshasa–Brazzaville also identifies the pair as the closest
  capitals of distinct countries, with the Rome–Vatican exception stated. Image
  source and licence provenance remains a pre-launch clearance item.

### Bugs this cycle worth remembering

- **The signup pseudonym check could never see a collision.** It queried
  `profiles`, whose RLS is `auth.uid() = user_id`, so a visitor still signing up
  read an empty set for every name. The account was created, the duplicate
  failed later on the profile insert, and that error was only logged — leaving
  the learner with no profile row, no pseudonym and no message. Fixed with a
  `SECURITY DEFINER` availability function and a resilient insert.
- **Paramètres and Déconnexion did nothing on Accueil and Profil.** Those hubs
  build their own shells and were never handed the handlers; an undefined
  `onClick` fails silently.
- **Hero content was clipped, not overflowing.** `.m-landing-hero` is
  `overflow: hidden`, so `scrollWidth - clientWidth` stayed 0 while the end of
  every line was cut off. Checks now measure element edges against `innerWidth`.
- **`document.body.textContent` includes the inline babel source**, so text
  assertions can match the code rather than the screen. Three checks passed
  while the feature underneath was broken. Assert on rendered elements.

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

**Verification grew with it.** `npm test` is **310** (was 228); the esbuild
production build parses the whole JSX block, so a stray bracket no unit test
slices fails the release gate instead of shipping a blank page; and
**`npm run verify:progression`** exercises the write path
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
ceremony testing; a one-lesson simulator now exercises the real path animation
and automatically replays a boundary medal. The release is covered by a repeatable authenticated
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

**Prerequisite completed 2026-08-24 — production build.** Source remains in
`index.html`, but `npm run build` compiles it with esbuild and Vercel serves the
generated `dist/app.js`; Babel standalone is absent from the deployed artifact.
**See `BUILD_AND_SPLIT_PLAN.md`** for why splitting the source remains a separate
change with a different risk profile.

**Steps:**
0. ✅ **Build step** (`BUILD_AND_SPLIT_PLAN.md` Stage A) — implemented and tested
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
