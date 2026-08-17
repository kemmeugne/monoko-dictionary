# Monɔkɔ — Exercise Engine Plan

Written 2026-08-07, last updated 2026-08-17. **This file supersedes the Phase 3
"exam system" sections of `ROADMAP.md`, `PHASE3_LAUNCH_PLAN.md` and
`Cours/MONOKO_CURRICULUM.md`.** Where they disagree with this file, this file is
right.

**Status: Slices 0–5 shipped. Slice 6 is one exercise type from done.** A learner can open a lesson,
run a 20-question Pratiquer session on the professor's own rows, pass it at 80%
first-try, and unlock an endless Élargir session on the routed corpus. Attempts,
the gate and the mastery counter persist. **Five of six exercise types exist**:
match-pairs, choose-the-audio, tap-words-in-order, fill-the-blank and
listen-and-type. Only record-and-compare speaking is left.
**46 of 49 lessons build a full 20-question session** and none falls below 13.

| Slice | | |
|---|---|---|
| 0 · Routing QA | ✅ 2026-08-10 | cosine 77% → LLM judge 96% + reassignment 90% |
| 1 · `lesson_pool` | ✅ 2026-08-10 | 6,196 rows, every lesson |
| 2 · Session shell + match-pairs | ✅ 2026-08-10 | |
| 3 · Choose-the-audio | ✅ 2026-08-10 | reworked 2026-08-17 — play on request, waveform, line shown |
| 4 · Attempts + pool-shaped builder | ✅ 2026-08-17 | 20 questions, 3–5 pair screens, (item, format) ledger |
| 5 · Stage split | ✅ 2026-08-17 | tier filter, 80% gate, mastery counter, Signaler |
| 6 · The four remaining types | 🔶 **IN PROGRESS** | tokenizer ✅ · tap-words ✅ · fill-the-blank ✅ · listen-and-type ✅ · **speaking ⬜** |
| 7 · Progression + retention | ⬜ | XP, streaks, SM-2 (Pratiquer only) |
| 8 · Monetization | ⬜ | daily cap on Élargir, never on mistakes |

**Verify engine work with both:** `npm test` (213 tests, builders on hand-made
rows) and `node scripts/audit_exercise_types.mjs` (every shipped type against the
live 6,196-row pool, all lessons, both stages; exits non-zero on a violation).

---

## 1. What changed and why

The course is content-complete but is still a **bilingual table with play
buttons** — reference material, not a product. There is no practice, no
assessment, no reason to open the app tomorrow. Everything the launch plan
assumes (streaks, spaced repetition, paywall pressure) sits on top of a practice
loop that does not exist yet. Building that loop is the gap between here and a
sellable product.

**Exams are dropped.** The old plan gated each level behind a three-component
exam (written 40 / listening 30 / speaking 30, 70% to pass). That is a large
build whose job is gating rather than engagement, and it traps speaking practice
inside a once-per-level event. Replaced by continuous points on every exercise,
Duolingo-style. Speaking becomes an ordinary exercise type instead of an exam
component.

**TTS fine-tuning is deprioritised** (not cancelled). The professor's voice
already covers 100% of course items and ~2,600 dictionary examples; TTS only
speaks text he never recorded. STT fine-tuning is now the more valuable of the
two — see §7.

---

## 2. Decisions (settled 2026-08-07, do not re-litigate without reason)

| Question | Decision |
|---|---|
| Practice scope | **Both** — per-lesson practice *and* a level-wide review |
| Routing storage | **Persist** to a `lesson_pool` table, not recomputed |
| Question generation | **Client-side** — zero per-question cost, works offline under Capacitor |
| Routing QA | **Required before any engine code** (§4, Slice 0) |
| Untoned dictionary content | **Use it, never mixed** inside one exercise |
| Level progression | **All levels open.** The paywall (1.1 + 1.2 free) is the only gate |
| Wrong answer | Show the answer → **re-queue in the same session** → **"Pourquoi ?"** button |
| Guest play | **First session free**, progress in localStorage, migrates on signup |
| Distractors | **Shape homogeneity is a hard rule**; same-lesson preference is a soft nudge |

### Stage model (settled 2026-08-10)

The course has something Duolingo does not: a professor-authored lesson behind
every game. That asset is wasted if the game draws on the same undifferentiated
pool the lesson does. So a lesson is **three stages over two disjoint pools**.

| Stage | Material | Shape |
|---|---|---|
| **Apprendre** | the lesson page (exists today) | the teach beat |
| **Pratiquer** | `tier = native` only — 100% precision | **finite**, 80% to pass, unlocks Élargir |
| **Élargir** | `tier IN (approved, reassigned)` | **endless**, replayable for best score |

The stages never share material. Élargir is everything routed to that topic that
the lesson itself never taught.

| Question | Decision |
|---|---|
| Session length | **20 questions, fixed.** A match-pairs screen contributes 5 |
| Why questions, not screens | Screens are wildly unequal in time — a match-pairs screen is 5 decisions, a listen-and-type screen is 1. Counting questions equalises session duration *and* makes variable screen sizes free (a 3-pair screen is simply 3 questions) |
| Pratiquer pass bar | **80% first-try accuracy** (16/20). First-try can't be farmed by brute-forcing the retry |
| Failing Pratiquer | Retry immediately. No lives, no lockout |
| Thin lessons | **Test the same item in up to 3 different formats** rather than shortening the session. Varied retrieval practice beats 20 distinct items tested once |
| Élargir progression | Topic XP → topic level. The level **widens the pool** (short → long, approved → reassigned) and shifts the exercise mix **recognition → production** |
| Élargir exhaustion | **Recycles with spacing** — recently-seen suppressed, distractors reshuffled. Never "draw unseen", which breaks at session ~10 |
| Tier order | Serve `approved` before `reassigned`, so early sessions are ~96% precision |
| Free tier | **Cap sessions per day (~3), never cap mistakes.** Élargir capped; Pratiquer uncapped since it is finite. Limiting *time* keeps errors safe, which is why hearts were rejected |
| Retention mechanics | Streak · best score + medals (80/90/100) · perfect-session bonus · "18/25 maîtrisés" · the professor's voice on every correct answer |
| Rejected mechanics | **Speed bonuses** (train guessing; in a tonal language rushing teaches wrong tone) · **leaderboards** (need user density that does not exist) · **hearts/lives** (punitive) |
| Session builder signature | **`buildSession(items, level, count)` — a pool, never a `lesson_id`.** Every future entry point (topic hub, play button, level-wide play) is then the same function with a different pool |

**Routing error is not linguistic error.** Every row in `lesson_pool` comes from
professor-verified sources. The 96%/90% tiers measure *whether the item belongs
to this lesson*, not whether the Lingala is correct. A routing miss in Élargir
serves a correct sentence about food while you practise greetings — topical
dilution, not misinformation. Expected exposure is **~1.2 off-topic items per
20-question session**. This is what makes endless Élargir acceptable.

**Deferred, in this order:** practice hub (topic-first entry) → play button
(level-wide corpus) → placement session. All three are pool selectors over the
same engine, which is why the builder signature above matters now. A
self-rating "how good are you, 1–4" was considered and **rejected** — people
rate themselves badly in both directions; a 10-question adaptive placement
session using `effective_level` is the honest version.

---

## 3. The data (measured 2026-08-07 — trust these numbers over older docs)

### Pool size

| | Pairs |
|---|---:|
| Unique verified FR↔LN pairs the app owns | **10,072** |
| — with audio | 6,539 |
| FLORES-200 (unusable, see below) | 2,009 |
| **Usable for exercises** | **8,063** |

~~After routing to lessons at similarity ≥ 0.55, the course goes from 1,347 to
5,923 items.~~ **Superseded 2026-08-10** — cosine routing measured only 77%
precision and was replaced (see Slice 0). The real pool is **6,196**: 1,347
native + 3,063 judge-approved + 1,786 AI-reassigned.

Full routing output: `artifacts/professor_ingest/corpus_routing.json`
(regenerate with `python3 route_corpus_to_lessons.py`).

### Per exercise type (usable counts)

| Exercise | Course-grade | Dictionary | Usable | Constraint |
|---|---:|---:|---:|---|
| Match pairs | 878 | 2,695 | **3,573** | text; ≤3 tokens (tile fits 375px) |
| Choose the audio | 1,409 | 5,130 | **6,539** | needs audio; any length |
| Tap words in order | 2,097 | 2,603 | **4,700** | text; 3–9 tokens |
| Fill the blank | 2,298 | 2,895 | **5,193** | text; ≥3 tokens |
| Listen & type | 914 | 3,947 | **4,861** | needs audio; ≤6 tokens — **build last, see §5** |

### Per-lesson feasibility (measured 2026-08-10)

The §"Per exercise type" counts above are **corpus-wide** — how many items in the
whole pool fit each format's shape. They say nothing about whether an individual
lesson can build a session, which is what the stage model needs. Measured
per lesson, native content only:

| Exercise | Lessons with enough NATIVE material | With the full pool |
|---|---:|---:|
| Choose the audio | 49/50 | 50/50 |
| Listen & type | 47/50 | 50/50 |
| Match pairs | 38/50 | 47/50 |
| Fill the blank | 35/50 | 50/50 |
| Tap words in order | 32/50 | 50/50 |

**24 of 50 lessons support all five types from native content alone; 46 support
at least three.** Native content is 1,347 rows across 50 lessons — min 3,
median 25, max 62.

Two findings drive the design:

**The corpus's job is to unlock formats the lesson cannot pose.** The types
native content fails are exactly the two needing 3+ token sentences — tap-words
(32/50) and fill-the-blank (35/50) — and the corpus lifts both to 50/50. Élargir
is therefore not "more of the same, lower quality"; for a word-heavy lesson,
tap-words-in-order literally *becomes available* there.

**Every format is universal at the item level except match-pairs.** Because the
professor recorded everything, speaking and choose-the-audio are eligible on
**100%** of native items and listen-and-type on 79% — with **zero lessons
excluded**. Match-pairs excludes 12/50 lessons, and it is the only format with a
*group* requirement (5 items sharing orthography + shape band + ≤3 tokens).
Dropping the floor from 5 pairs to 3 recovers most of them, which the
question-budget model makes free.

Allowing an item to be tested in up to 3 different formats, **47/50 lessons fill
a full 20-question session from native content alone**. The exceptions are
content gaps, not engineering problems:

| Lesson | Native | Max questions |
|---|---:|---:|
| Comparatifs et superlatifs | 6 | 18 |
| Météo | 6 | 18 |
| **Les nombres ordinaux** | **3** | **9** |

### Élargir depth (measured 2026-08-10)

Distinct 20-question sessions before any repeat, corpus-only, per lesson:
**min 1 · p25 6 · median 10 · max 32**. **16 of 50 lessons hold fewer than 8
sessions**; *Les nombres ordinaux* (8 corpus items) and *Les mois* (13) hold one.
This is why Élargir must be built as a recycling pool from the start.

Tier split of the Élargir pool: **3,063 approved (96%) / 1,786 reassigned (90%)**
— 36% is the weaker tier. Most reassigned-heavy lessons: Comparatifs et
superlatifs (80%), Pronoms relatifs (80%), Conjugaison futur et impératif (74%).

Worked example — **Salutations et politesse**, 178 items: 29 native (Pratiquer) /
120 approved + 29 reassigned (Élargir, 149 items ≈ 7–10 sessions). Length spread
`1 token:15 · 2–3:64 · 4–6:72 · 7–9:24 · 10+:3`, and 119 toned / 59 untoned —
so the selector slices on **(level band × orthography)**, not level band alone.
*Présentation personnelle* inverts that ratio (40 toned / 75 untoned, being
dictionary-heavy), which is why orthography cannot be a global setting.

### Three findings that shape the design

**FLORES-200 is unusable, and not for the reason first assumed.** It is not a
register problem you can fix by gating it to levels 5–6 — **1,855 of its 2,009
sentences are 13+ tokens**. Only 32 fit a tap-in-order grid. You cannot put a
20-word Wikipedia sentence in a tile exercise at any level. Its job is RAG
context, which it already does. Conveniently, a similarity threshold of 0.55
discards 96% of FLORES automatically while keeping 91% of the professor
corrections — the quality gate and the register gate are the same gate.

**The dictionary is not tone-marked. At all.**

| Source | Tone-marked |
|---|---|
| `senses` (2,686 words) | 1 / 2,686 — **0%** |
| `examples` (2,686 sentences) | 9 / 2,686 — **0%** |
| `lesson_items` (course) | 425 / 1,347 — 31% |
| corpus `correction` | 438 / 1,263 — 34% |

Decisive test: of 678 Lingala words appearing in *both* the dictionary and the
course, **75 are never spelled the same** — always the tone (`bomba`/`bómba`,
`bosolo`/`bosôló`, `balabala`/`balábalá`). That 11% is a floor, not the true
rate: most dictionary words appear nowhere in the course and cannot be checked
this way. Module 1.1 exists partly to teach that tone changes meaning, so mixing
conventions inside one exercise teaches the opposite of lesson 1.

**Corpus and dictionary are complementary, not redundant.** The corpus is
conversational and amplifies lessons that were already strong (Salutations
29→151, Marché 53→154). It does nothing for closed-vocabulary lessons. The
dictionary rescues exactly those: Cuisine +168, Maison +154, Animaux +118,
Couleurs +109 — all lessons where the corpus contributed 1–7 items. Neither pool
alone covers the course.

---

## 4. Build order

Each slice ships something inspectable. Do not start the next until the previous
is verified.

### Slice 0 — Routing QA  ✅ DONE 2026-08-10

Every routed row now carries a measured precision, not an assumed one.

**Cosine routing failed the QA, and the way it failed is the point.**
`route_corpus_to_lessons.py` assigns each verified pair to its nearest
`lesson_item` and inherits that item's lesson. 100 stratified sentences reviewed
by Anthony: **77% precision, flat across all four similarity bands**
(72/79/76/80). Precision was supposed to rise with similarity — it didn't, so no
threshold could rescue it. Cause: embeddings measure *topic*, but ~1/3 of the
lessons are defined by *grammar*. "Je ne sais pas quoi faire" matched an
identical sentence at 0.94 that lives in Pronoms relatifs as a structural
example. Grammar lessons scored 69%, topic lessons 79%. k-NN voting was tested
against the labels and was not a clear win, so it was not adopted.

**Stage 1 — `llm_route_judge.py`** asks the model the same yes/no question the
human answered, showing it real items from the target lesson (titles alone are
not judgeable — a human couldn't grade "Construction de phrases 1" from the name
either). Three prompt calibrations were scored head-to-head against the 101
labels; `strict` won and `open` was strictly dominated by `wide`:

| prompt | kept | precision | recall | bad kept |
|---|---:|---:|---:|---:|
| (cosine baseline) | 101 | 77% | 100% | 23 |
| **strict** | **67** | **96%** | **82%** | **3** |
| open | 86 | 86% | 95% | 12 |
| wide | 84 | 88% | 95% | 10 |

**The model mattered more than the prompt.** Identical `strict` prompt: 64%
recall on gpt-4o-mini, 82% on gpt-4.1-mini, precision unchanged at 96%. The
looser prompts existed only because strict seemed to discard too much; the model
swap largely removed that objection. Full pass kept **3,063 of 6,397**.

**Stage 2 — `reassign_discarded.py`** fixes what a yes/no judge structurally
cannot. When cosine mis-routes, the judge says no and the row is *discarded, not
corrected* — a cooking sentence that landed in Animaux is lost even though it is
good material one lesson over. Showing the model all 50 lessons at once (title,
level, and 8 real professor items each; the catalogue is a stable system-prompt
prefix so caching makes the repetition near-free) and asking **which** lesson it
belongs to recovered **1,786 of the 3,334 rejects at 90% precision** (60
reviewed, 0 unsure). **1,674 of them — 94% — went to a different lesson than
cosine chose**, which is the sharpest available measure of what cosine got wrong.

The 1,548 `null` results are mostly bare verbs and adjectives (*Soulever*,
*Détruire*, *Vérifier*) with no topical home — correctly unplaced, and still
reachable through the level-gated word pool their difficulty score governs.

**Resulting pool — carry these numbers into Slice 1:**

| Tier | Items | Precision |
|---|---:|---|
| Native (professor-authored) | 1,347 | 100% by construction |
| Judge-approved routing | 3,063 | 96% |
| AI-reassigned | 1,786 | 90% |
| **Total** | **6,196** | ≈95% weighted |

Up 4.6× from 1,347. Artifacts: `corpus_routing.json`,
`llm_route_verdicts_strict.json`, `lesson_reassignments.json`,
`lesson_catalogue.json`, plus both human verdict sets.

**Word difficulty** (`classify_word_difficulty.py`) ran alongside: all 2,311
dictionary headwords rated 1–6. Topic is the wrong axis for a single word;
level is the right one. Effective level = `max(lesson level, word difficulty)`,
so topical routing still enriches a lesson while a hard word cannot leak down
into an easy one. Distribution 155/821/858/467/5/4 — levels 5–6 are nearly empty
because this is an everyday dictionary; *exporter*, *victimisation*,
*négociation* are not in it at all.

### Slice 1 — `lesson_pool` table  ✅ DONE 2026-08-10

`sql/lesson_pool.sql` (applied) + `populate_lesson_pool.py`. **6,196 rows, all
50 lessons, median 107 items per lesson.** Only one lesson under 20 items
(Nombres ordinaux, 11).

A table rather than a view: the pool is assembled from four source tables plus
two LLM passes whose verdicts live in artifacts, not in the database — a view
cannot express "a model approved this placement" or "a model moved this row".
Text is denormalised so the client fetches a lesson's pool in one query, with
`source_table` + `source_id` keeping provenance traceable.

| Column | Why it exists |
|---|---|
| `tier` | native / approved / reassigned = 100% / 96% / 90% precision. Stored per row so the engine can prefer native material and reach for the rest only to top up. |
| `unique (source_table, source_id)` | Makes populate re-runnable — verified idempotent, 6,196 → 6,196. Without it a re-route silently doubles a lesson. |
| `orthography` | Follows the SOURCE, not the string. Sniffing for accents would misclassify every legitimately toneless word. This is what keeps toned and untoned content out of the same exercise. |
| `effective_level` | `max(level, difficulty)` — difficulty only ever restricts. 168 word rows are raised above their lesson's level; a hard word cannot leak into an easy lesson. `difficulty` is null for sentences, which length already grades. |

Shape available to the generator: 4,668 rows with audio · 4,553 with ≥3 tokens ·
968 single words · 3,425 untoned.

**Anon-key read verified** — the RLS policy is what stands between a working
engine and a table the app cannot see, so it is checked with the live app's own
publishable key, not the service key.

### Slice 2 — session shell + match-pairs  ✅ DONE 2026-08-10
Full-screen view, one question per screen, no scrolling. Live queue — missed
pairs are re-inserted and must be cleared before the session ends. XP, summary
screen, "Pourquoi ?" button, entry via "S'entraîner" on the lesson screen.
Shipped as `212ba5e`.

Shape homogeneity took three attempts and the first two shipped a broken
exercise. Filtering Lingala length alone still paired "Ami" with "La famille est
sacrée." The rule that works: **band the FRENCH column only**. The exploit needs
*correlation* between the columns — you pair the long left tile with the long
right one — so making one column uniform leaves length variation in the other
carrying no pairing information.

### Slice 3 — choose-the-audio  ✅ DONE 2026-08-10
Largest pool (6,539) and the one that shows off the professor's recordings.
The professor's clip is the **prompt** and the French options are the answers,
not the reverse — three clips to compare tests whether you can tell recordings
apart, which is not a skill anyone needs. Shipped as `599ae7b`.

**Audio prefetch** (`eb55200`): each screen preloads its own clips and the next
screen's, so the ~330ms R2 round trip never lands inside a tap. Measured
814ms → 0ms. Prefetch uses `<audio preload="auto">`, **not** `fetch()`+blob —
the bucket sends no `Access-Control-Allow-Origin` and 403s the OPTIONS
preflight, so `fetch()` cannot read those clips from the browser at all. A blob
cache fails *silently*, falling back to a network fetch on every tap. Media
elements are exempt from CORS. Setting `Cache-Control` + CORS on the R2 bucket
would fix this at the source and speed up dictionary audio too.

#### Revised 2026-08-17 — the screen plays on request, and shows the line

Three changes after the first real play-through on a phone:

**Nothing autoplays.** The screen used to play its prompt on mount, which fired
the instant the previous screen handed over — and since there is one shared
`<audio>` element, `playClip` stopping the sounding clip meant a match-pairs
answer got talked over by the next question. Sound now follows a tap, never a
mount. This also sidesteps iOS, where a fresh element cannot play without a
gesture anyway, so the old autoplay was unreliable there regardless.

**A 64px play button beside a 32-bar waveform**, replacing the 108px circle. The
bars are **drawn, not measured**, and this is forced rather than lazy: reading
real amplitudes means routing the element through Web Audio, and R2 sends no
`Access-Control-Allow-Origin`, so a cross-origin element in an audio graph
outputs **silence** — measuring the wave would cost the sound. Heights are seeded
from the item id so a clip always draws the same shape, and the fill tracks real
playback position, which is the part that is honest.

**The Lingala line is shown while it plays.** This is a deliberate product
decision with a real cost: the options are French, so a learner who can read the
orthography can answer *without listening*, which is not what a listening
exercise is for. It was taken as reading support for beginners — mapping sound to
spelling is exactly what lesson 1.1 teaches. **If it proves too generous, gate it
behind the first wrong answer** — the text is already rendered, it needs only a
`wrongIds.length > 0 &&` around it.

---

## 4b. Build order from here (revised 2026-08-10)

The stage model changes the remaining slices. **Slices 2 and 3 shipped before it
was settled and now need modification** — see "What already-shipped code must
change" below.

### Slice 4 — foundations: attempts + pool-shaped builder  ✅ DONE 2026-08-17

- `sql/exercise_progress.sql` — `exercise_attempts` + `lesson_stage_state`, RLS
  mirroring `user_progress`. **Applied 2026-08-17**; Slice 5 is what writes to it.
  A second index (`user_id, pool_item_id`) was added for the SM-2 question,
  which is a different shape from the 80%-bar question.
- `buildSession(items, level, count)` takes a pool and never a `lesson_id`.
  `startSession` now owns material selection, which is the single line Slice 5
  splits in two.
- Session budget is **20 questions**, not 15 screens. `questionCount()` prices a
  screen: match-pairs costs `pairs.length`, everything else costs 1. XP is 10 a
  **question** now (a full session is 200, was 750), and the progress bar and
  the summary's success rate are both computed over questions.
- Match-pairs screens are **3–5 pairs**, sized to the bucket and the remaining
  budget. This is what a question budget buys: a 3-pair screen simply costs 3.
- A per-session **ledger keyed by (item, format)**, capped at 3 formats per item.
  An item may be matched and then heard; it may not be matched twice.

**Measured over 200 builds per lesson, against the live pool:**

| | pool | native only (what Slice 5 serves Pratiquer) |
|---|---|---|
| Météo (thin, 6 native) | 20 questions, 16 screens | 10 questions, one **4-pair** screen + 6 audio |
| Salutations (29 native / 149 corpus) | 20 questions, 16 screens | 20 questions, 16 screens |

The 4-pair screen is the point of the 3–5 rule: at a fixed 5 that lesson built no
match-pairs screen at all. Météo reaching only 10 questions from native content is
the thin-lesson case Slice 6's four extra formats exist to fill — the ledger
already permits the reuse, there is simply nothing yet to reuse it *into*.

### Slice 5 — stage split  ✅ DONE 2026-08-17

`startSession(stage)` filters the pool — `tier=eq.native` for Pratiquer,
`tier=in.(approved,reassigned)` for Élargir — which is the whole bug fix. Two
buttons on the lesson screen; Élargir is locked behind `pratiquer_passed`, shows
`18/25 maîtrisés` under Pratiquer, and 80% first-try passes.

- **Attempts are written per question, first try only**, batched into one insert
  at session end. An abandoned session still flushes its attempts (they feed the
  mastery counter, which counts items ever answered right, not sessions
  finished) but never moves the gate — only a completed session can pass.
- **Retry screens record nothing.** Marked `retry: true`; counting them would
  let the gate be farmed by failing and then clearing the retry.
- **In match-pairs the French tile is the question** — "which Lingala goes with
  this?" — so a mis-pairing is charged to it. The Lingala tile reached for was a
  wrong answer, not a question failed.
- `pratiquer_passed` is a **one-way door**: a later weaker session never takes
  Élargir away from someone who has earned it.
- **Élargir serves `approved` before `reassigned`** via `shuffleByTier` —
  random within a tier, ordered between them, so the 96% material is spent
  before the 90%. In Pratiquer everything is native, making it a plain shuffle.

**Measured across all 50 lessons, 25 builds each:**

| Pratiquer questions available | Lessons |
|---|---|
| 20 (full session) | 35 |
| 10–19 | 12 |
| 5–9 | 1 |
| 1–4 | 2 |
| **0 — gate unreachable** | **0** |

Tier isolation holds everywhere (no stage ever served the other's material) and
every served item carries a `poolId`, without which an attempt cannot be written.

**Known consequence, not yet a problem.** The two thinnest lessons — Nombres
ordinaux (3 native) and Comparatifs et superlatifs (6 native) — build 3- and
4-question sessions, and 80% of 3 questions means **3/3**. The gate is strictly
harder on a thin lesson than a fat one. Slice 6 is the fix already planned for
it: with six formats instead of two, cross-format reuse fills these sessions out
(the plan's own estimate is 47/50 lessons filling a full session from native
content alone). Revisit only if Slice 6 leaves a lesson short.

**Deliberately not done: bucketing Élargir on level band.** §4c asked for slices
on (level band × orthography). Buckets remain keyed on (orthography × shape
band) with the existing `effective_level <= level` filter on top. Adding level to
the key fragments buckets, and match-pairs needs ≥3 in one bucket to build a
screen at all — it would cost the thin lessons their only matching exercise to
solve a problem no lesson currently has.

### Slice 6 — the four remaining exercise types  🔶 IN PROGRESS
**All six types ship here** (decided 2026-08-10). Nothing is deferred: listen-and-type
and speaking were previously "build last", but the blockers on both turned out to be
input-mechanism problems, not feasibility problems.

1. **Tokenizer** — ✅ **done 2026-08-17**, 25 unit tests in `tests/tokenizer.test.js`.
   See "the tokenizer" below for what it decided and what it found.
2. **Tap words in order** — ✅ **done 2026-08-17**. French prompt, shuffled
   Lingala word tiles, 3–9 tokens. See "tap words in order" below.
3. **Fill the blank** — ✅ **done 2026-08-17**. One content word removed, typed
   back, accents optional. See "fill the blank" below.
4. **Listen & type** — ✅ **done 2026-08-17**. Character tiles, never a keyboard
   (see §5). See "listen and type" below.
5. **Speaking** — **record-and-compare**, no STT (see §7).

### The tokenizer (built 2026-08-17)

`tokenize` / `tokenCount` / `characters` / `fold` / `sameWord` / `usableRow`, at
the top of the babel block in `index.html`. Tested by `tests/tokenizer.test.js`,
which slices the block out of `index.html` and evaluates it — so the tests run
against the source the browser runs, with no copy to drift. **This is the first
`npm test` coverage of engine code** (144 tests, up from 119).

**Why it had to come first.** `lesson_pool.token_count` was computed by a bare
whitespace split in `populate_lesson_pool.py`, and French typography puts a space
before `?` and `!`. So `"Olingi kofanda ?"` is stored as 3 tokens and is really 2
words plus a floating punctuation mark — which tap-words would have rendered as
**a tile containing "?"**. **947 of 6,196 rows disagree** (254 native), and 60 of
the 660 rows tap-words would have selected fall outside its 3–9 band once
tokenised properly. The stored column is now a coarse index only; `longestSide`
and both bucket filters count with the tokenizer, because that is what gets
rendered.

**What it decided.** Parenthesised glosses are editorial and dropped
(`"Moteki (ba teki)"` → one word). An unspaced slash separates variants, never a
word. Edge punctuation is stripped; hyphens and apostrophes stay inside a word.
Everything normalises to NFC first, which keeps a toned vowel a single tile — the
pool is all NFC today, but one NFD paste from a professor delivery would
otherwise be invisible until the tiles looked broken.

**Accent folding for fill-the-blank (decided 2026-08-17).** `fold` strips accents
and maps `ɛ→e`, `ɔ→o` — those two need explicit rules because they are distinct
letters, not accented vowels, so Unicode decomposition does not touch them.
**17.7% of candidate blank-words carry a character no iPhone French keyboard can
produce**, so without this one blank in six is unanswerable. The exercise shows
the correctly accented form after the answer, which is what stops leniency from
teaching that tone is optional.

Folding merges 309 spelling groups: 303 are one word written untoned (dictionary)
and toned (course). The other 6 differ only in accent *position* — `mídi/midí`,
`ntóngo/ntɔngɔ`, `lisúkúlu/lisúkulu`, `ladió/ladíó`, `nsékwá/nsékwa`,
`minutí/minúti` — and **Anthony ruled on 2026-08-17 that each pair is the same
word**, so there are no false accepts left. This applies to fill-the-blank only:
listen-and-type tests transcription, where accepting untoned input would delete
the only thing being measured.

**What it found: 9 unusable rows in `lesson_pool`.** The dictionary writes `/` or
`?` where a translation is missing, and those leaked through — 7 rows whose
Lingala is `"/"` (Xylophone ×4, Automne ×2, one sentence), one `"?"` (Air), and
one **native** row whose Lingala is the bare gloss `"(Oyo)"`. A `.trim()` check
passes all of them because `"/"` is not empty, so they were live material and a
match-pairs tile could read `/`. `usableRow` now requires an actual word on both
sides. **Worth fixing at the source too** — these came in from `senses` and one
`lesson_items` row, so they are wrong in the dictionary, not just in the pool.

**Tile-bank sizing for listen-and-type.** Build tiles from the *tokens*, not the
raw string: on the raw string a "2-token" row like
`"Malamu ? (= Eza malamu ? = Óndimi / Kitoko ?)"` needs 35 tiles. From tokens the
native 1–2 token material is **median 6, p90 11, max 22 tiles, and 99.7% fits a
16-tile bank** (659/661). Cap on tiles as well as tokens.

### Tap words in order (built 2026-08-17)

`wordOrderRows` / `buildWordOrder` / `wordOrderScreens` / `WordOrderScreen`, plus
22 tests in `tests/exercise-builders.test.js`. It proved the Slice 2 design goal:
a new type is one entry in `EXERCISE_SCREENS` and a builder, with the shell,
progress, scoring, summary and Signaler untouched.

**It needs no buckets, and that is the point.** Match-pairs and choose-the-audio
put several items on one screen, so every item there must share an orthography
and a shape band or the answer is readable off the tile lengths. Word-order shows
**one** item and the tiles are its own words — there is nothing to mix, so the
whole bucket apparatus drops away. Expect the same for fill-the-blank and
listen-and-type; only the multi-item types need it.

**Non-obvious decisions:**
- **The answer is the tokenised sentence**, not the raw string. The learner is
  never offered a `?` tile, so comparing against `"Olingi kofanda ?"` would fail
  a correct answer on punctuation that was never on screen.
- **Tiles are keyed by position, not by text.** `na` occurs twice in plenty of
  Lingala sentences and the two tiles must stay distinct.
- **A placed tile leaves a greyed gap in the bank** rather than the bank
  reflowing, so a tile never moves out from under a finger mid-tap.
- **A wrong answer clears back to the bank** after showing the correct sentence.
  Rebuilding it is the practice; leaving the wrong order on screen is not.
- **Auto-checks when the last tile lands** — no submit button, matching every
  other screen in the app.
- `interleave` now takes **N lists**, so the remaining types cost one line each.

**Measured over all 50 lessons, 25 builds each — Pratiquer (native only):**

| Questions available | Two types | **Three types** |
|---|---:|---:|
| 20 (full session) | 35 | **40** |
| 10–19 | 12 | 8 |
| 5–9 | 1 | 1 |
| 1–4 | 2 | 1 |
| 0 — gate unreachable | 0 | **0** |

Météo goes from 10 questions to 14, Comparatifs from 4 to 7. **Nombres ordinaux
stays at 3** — its 3 native rows are all too short to order, so it is the one
lesson still facing a 3/3 gate. Six lessons have no word-order material at all,
which is expected: their native rows are all under 3 or over 9 tokens.

### Fill the blank (built 2026-08-17)

The French sentence is the prompt, the Lingala sentence is shown with one word
replaced by an inline input, and the learner types it back. This is the exercise
the tokenizer's `fold`/`sameWord` were built for.

**Which word gets blanked — two rules, both measured.**
- **≥4 characters.** The pool's most frequent tokens are all grammar: `na`
  (3,478), `ya` (1,352), `te` (785), `ko` (669), `ba` (518). Blanking those tests
  nothing. The rule keeps **99.8%** of ≥3-token rows viable.
- **Unique within its sentence** (compared folded, so `mbula`/`mbúla` count as
  one word). **27.4% of rows repeat a word**, and blanking one copy while the
  other sits visible two words away is not a question.

The word is drawn **at random** among the candidates rather than always taking
the longest, so meeting the same row again in a later Élargir session does not
ask the identical question.

**Accents are optional, then shown.** `sameWord` accepts the answer without its
accents — **8.2% of candidate blank-words carry a character no iPhone French
keyboard can produce**, so strictness would make those unanswerable rather than
hard. When the answer was right but spelled plainly, the feedback adds *"Avec les
accents : **Mbúla**"*. That second half is not decoration: it is what keeps
leniency from teaching that tone is optional, and it is the reason this exercise
may fold while listen-and-type may not.

**Audio plays only after the answer.** The clip is the professor reading the
whole sentence, so playing it first would read the missing word aloud.

**iOS input rules that are not optional:** `autoCorrect="off"` (autocorrect
rewrites Lingala into French words), `autoCapitalize="none"`, `spellCheck=false`,
and `fontSize: 16` (anything smaller makes iOS zoom the page on focus). Checked
against a 375×667 screen with the keyboard up: the input and the Vérifier button
both stay visible with ~82px to spare.

**Measured with `scripts/audit_exercise_types.mjs` — Pratiquer (native only):**

| Questions a session can reach | 2 types | 3 types | 4 types | **+ the merge** |
|---|---:|---:|---:|---:|
| 20 — a full session | 35 | 40 | 43 | **43** |
| 10–19 — short | 12 | 8 | 6 | **6** |
| 5–9 — very short | 1 | 1 | 0 | **0** |
| 1–4 — barely a session | 2 | 1 | 1 | **0** |
| 0 — nothing buildable | 0 | 0 | 0 | **0** |
| *lessons* | *50* | *50* | *50* | ***49*** |

Both short buckets are empty. The weakest lesson in the curriculum is now
Comparatifs et superlatifs at 10 questions, so **the harshest gate anywhere is
8/10** rather than 3/3. Mix across one build per lesson: choose_audio 349 ·
word_order 207 · fill_blank 207 · match_pairs 187 — no type dominating.

**Nombres ordinaux was stranded at 3 questions — fixed as content, not code
(applied 2026-08-17).**
Its 3 native rows ("1er → Ya liboso") are too short for word-order and
fill-the-blank, so 80% of its session meant 3/3, a strictly harder gate than any
other lesson. Anthony's call on 2026-08-17: **three items is not a lesson, and
ordinals belong with cardinals.** `sql/merge_ordinals_into_numbers.sql` folds
L375 into L350 "Les nombres" (55 items → 58, pool 111 → 122).

Simulated against the live pool before applying: the merged lesson still builds
a full 20-question session with all four types, and **every lesson in the
curriculum can then build at least 5 questions** — the 1–4 bucket empties.

The lesson had no teaching reason to exist; it was an artefact of the July 2026
restructure splitting mega-lessons. Worth remembering when a lesson looks
unbuildable: the engine constraint was pointing at a content problem.

Two traps that migration documents, because both fail silently:
- `lesson_items`, `lesson_pool`, `exercise_attempts`, `user_progress` and
  `lesson_stage_state` all cascade from `lessons`, so the delete must come last.
  Attempts are **moved** (their pool items moved too, so the evidence is still
  about L350); stage state and completion are **dropped**, because passing a
  3-item lesson is not passing a 58-item one.
- `populate_lesson_pool.py` reads lesson ids from artifacts frozen at routing
  time. A merged-away id has no level, and a row with no level is *skipped* —
  a normal outcome for unplaceable rows, so 11 rows would have vanished with no
  error. The script now carries `LESSON_MERGES = {375: 350}`.

### Listen and type (built 2026-08-17)

`listenTypeRows` / `listenDistractors` / `buildListenType` / `ListenTypeScreen`.
Play the professor, spell what you hear from a bank of character tiles.

**The distractors are the exercise.** They are drawn first from the **accent
twins** of the letters the answer actually uses — offering a bare `o` beside the
required `ó` is what makes this a test of tone rather than a letter-hunt. Only
after those are exhausted does the bank fill from the pool's plain alphabet, so
nothing on screen looks foreign to Lingala.

**No folding here, unlike fill-the-blank.** This exercise *is* the spelling, so
the answer is compared exactly. That is fair precisely because tiles are used:
the learner can only build what is offered, so there is no keyboard to fight and
no "accept the untoned variant" rule needed. Those two exercises make opposite
choices about accents for the same reason — what each one measures.

**A space is never a tile.** The answer area is one group of slots per word, so
the gap between words is *drawn*. A `␣` key reads as a puzzle piece rather than
as writing.

**Sizing:** 1–2 tokens and ≤14 characters (97.4% of candidates; the worst case in
the pool is 22), an 18-tile bank — 3 rows of 6 at 375px, with 141px of vertical
slack. Slots wrap within a word too: 14 slots on one row is 476px against 339px
of usable width, and no screen may scroll sideways.

Also refactored the play button + waveform out of `ChooseAudioScreen` into a
shared **`ClipPlayer`**, now used by both audio-prompted screens.

**Measured — Pratiquer (native only):**

| Questions a session can reach | 3 types | 4 types | **5 types** |
|---|---:|---:|---:|
| 20 — a full session | 40 | 43 | **46** |
| 10–19 | 8 | 6 | **3** |
| below 10 | 2 | 0 | **0** |

Nothing in the curriculum now falls below **13** questions. Mix stays even:
choose_audio 250 · listen_type 198 · match_pairs 187 · fill_blank 167 ·
word_order 166.

### Breadth: one session, and the next one (2026-08-17)

Three rules asked for after the first real play-through, all landing in one
place — `selectionOrder`, the order every builder now draws in.

**1. No screen hands over while audio is sounding.** Four of the five screens
already waited via `afterClip`; choose-the-audio did not — it used a fixed 620ms
timer, and a learner who answers while the clip is still playing got the
professor cut off. `afterClip` now takes a **floor**, so a screen waits for the
clip when one is sounding and still holds its own reveal beat when none is.
Permanently covered by `tests/audio-handoff.test.js`, including the two failure
modes that hang a session: a clip that never loads (no `ended` event ever) and a
clip that finished before the learner answered (the event already gone).

**2. A session is as wide as the lesson allows.** Builders used to draw at
random within tier, so an item could be picked for a second format while others
had not appeared at all. Selection now prefers items **untouched in this
session**; cross-format reuse still exists — it is what fills a thin lesson — but
only once everything else has had a turn.

**3. Tapping "S'entraîner" again teaches something new.** `startSession` loads
what this learner has already been asked from `exercise_attempts` (keyed by
`lesson_pool.id`, valued by the most recent answer) and passes it to
`buildSession`. Never-seen items go first; among seen ones the stalest returns
first, which is spacing in its crudest form until SM-2 arrives in Slice 7.

The full priority, highest first: **unseen across sessions → unused in this
session → better tier → longest ago → random**. Ties stay random because the
list is shuffled before a *stable* sort, so two sessions over the same material
never run in the same order.

Note rule 3 outranks tier: an **unseen `reassigned` row is served before a seen
`approved` one**. Breadth was the explicit goal, and a routing miss costs a
correct sentence in the wrong lesson, not a wrong sentence.

**Measured — distinct items met after N sessions (30 runs, native pool):**

| Lesson | | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---:|---:|---:|---:|---:|---:|
| Salutations (29) | random | 20 | 25 | 27 | 28 | 28 | 29 |
| | **history-led** | 20 | **29** | 29 | 29 | 29 | 29 |
| Les nombres (58) | random | 20 | 31 | 38 | 44 | 48 | 50 |
| | **history-led** | 20 | 37 | 49 | **58** | 58 | 58 |

Les nombres is the case that matters: random selection plateaus around **87%** of
the lesson and leaves the tail unseen for a long time, while history-led covers
**all 58 items in four sessions**. Météo (6 items) is covered in one either way.

### Slice 6 constraints that are not negotiable

**Listen-and-type is a tile exercise.** The pool uses **42 distinct alphabetic
characters**; 16 of them cannot be produced on an iPhone French keyboard at all:
`à á â ç è é ë í î ó ô ú ē ǎ ɔ ɛ`. A free-text input makes the exercise
unanswerable, not merely awkward. Tapping from an offered character bank also
dissolves the orthography objection — the learner can only build what is offered,
so there is no "accept tone-mark variants" fudge teaching that tone is optional.

Restricted to ≤2 tokens the tile version covers **1,524 items (602 native) across
45/50 lessons**, median 6 characters and p90 12 — a comfortable tile count. At
1 token it is 927 items / 35 lessons; at ≤3 tokens, 1,961 items / 48 lessons but
p90 rises to 15 characters. **≤2 tokens is the right cut.**

**Speaking is record-and-compare, and is excluded from the Pratiquer 80% gate.**
Play the professor, record yourself, hear them back to back. No STT, so no
dependency on the unmeasured WER (§7). Coverage is not a problem: 75% of the pool
carries the professor's voice, **49/50 lessons have ≥20 such items and none have
zero**.

Because self-assessment cannot be objectively scored, a speaking question earns
XP and self-grades ("Encore" / "C'était bon") but **does not count toward the 80%
pass calculation** — certifying a lesson on an unscoreable question would make
the bar meaningless. If WER is later measured below ~15% on sentences, scored
speaking can replace the self-grade and rejoin the gate.

### Slice 7 — progression and retention  ⬜
XP, best score, medals, streak. Thin once sessions and attempts exist.
SM-2 scheduling belongs **only to Pratiquer** — spaced repetition needs a finite
item set with per-item state, which native content (median 25) is and the
6,196-row corpus is not. Élargir draws at random with no per-item state.

### Slice 8 — monetization  ⬜
Daily session cap on Élargir (~3/day free, unlimited paid). Mistakes are never
capped. Needs auth + the attempts table.

### Later (genuinely deferred)
Practice hub (topic-first entry) · play button (level-wide corpus) · placement
session · scored speaking, if WER is ever measured below ~15%.

---

## 4c. The executable task list (written 2026-08-10, Slice 4 struck 2026-08-17)

All engine code lives in `index.html` inside the `<script type="text/babel">`
block. Line numbers are from the Slice 4 commit and will drift — grep the
identifier, do not trust the number.

| What | Where (after Slice 5) |
|---|---|
| `SESSION_QUESTIONS = 20`, `PAIRS_MIN/MAX = 3/5` | `index.html:515-517` |
| `questionCount`, `countQuestions`, `itemId` | `index.html:520-526` |
| `makeLedger`, `MAX_FORMATS_PER_ITEM` | `index.html:537`, `535` |
| `TIER_RANK`, `shuffleByTier` | `index.html:554`, `570` |
| `playingClip`, `afterClip` — **the screen-boundary audio rule** | `index.html:648`, `664` |
| `screenItems`, `shapeBand` | `index.html:691`, `716` |
| `buildMatchPairs`, `matchPairsScreens` | `index.html:750`, `769` |
| `audioBuckets`, `buildChooseAudio`, `AUDIO_OPTIONS` | `index.html:961`, `981` |
| `chooseAudioScreens`, `interleave`, `buildSession` | `index.html:789`, `811`, `831` |
| `MatchPairsScreen`, `waveShape`, `ChooseAudioScreen` | `index.html:842`, `1005`, `1014` |
| `EXERCISE_SCREENS`, `PASS_PCT`, `SessionView` | `index.html:1154`, `1159`, `1161` |
| `STAGE_TIERS`, `loadStageState`, `startSession` | `index.html:2343`, `2348`, `2377` |
| `handleSessionEnd`, `reportPoolItem` | `index.html:2404`, `2440` |

### Slice 4 — ✅ done 2026-08-17, all five steps

**1. SQL migration** → `sql/exercise_progress.sql`, **applied 2026-08-17** by
hand in the Supabase SQL editor, like every other migration in `sql/`.

```sql
-- one row per question answered; the substrate for SM-2, the 80% bar and streaks
create table if not exists exercise_attempts (
  id           bigserial primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  pool_item_id bigint not null references lesson_pool(id) on delete cascade,
  lesson_id    bigint not null,
  stage        text   not null check (stage in ('pratiquer','elargir')),
  format       text   not null,      -- match_pairs | choose_audio | word_order | ...
  correct      boolean not null,     -- FIRST-TRY correctness; retries are separate rows
  answered_at  timestamptz not null default now()
);
create index if not exists exercise_attempts_user_lesson
  on exercise_attempts (user_id, lesson_id, answered_at desc);

-- one row per user per lesson: the stage state the UI reads
create table if not exists lesson_stage_state (
  user_id           uuid   not null references auth.users(id) on delete cascade,
  lesson_id         bigint not null,
  language_id       bigint not null,
  pratiquer_passed  boolean     not null default false,
  pratiquer_best    int         not null default 0,   -- % first-try, best session
  elargir_best      int         not null default 0,   -- % first-try, best session
  elargir_xp        int         not null default 0,   -- drives the topic level
  updated_at        timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

alter table exercise_attempts  enable row level security;
alter table lesson_stage_state enable row level security;
-- RLS mirrors user_progress in sql/progress_tracking.sql: own rows only.
create policy "own attempts" on exercise_attempts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own stage state" on lesson_stage_state
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

Note `correct` stores **first-try** correctness — the 80% bar is computed from it,
and storing retries in the same column would let the bar be farmed by
brute-forcing the retry.

**2–5. Shipped** — `buildSession(items, level, count)` takes a pool,
`SESSION_QUESTIONS = 20` replaced `SESSION_MAX = 15`, pair screens are 3–5, and a
(item, format) ledger replaced once-per-session dedupe. See the Slice 4 entry in
§4b for the measured result.

Two things worth carrying forward:

- **`interleave` skips an oversized screen rather than stopping.** A 5-pair screen
  will not fit in the last 2 questions of the budget where two choose-the-audio
  screens still do; ending the queue there hands back a short session with
  material still on the table.
- **The retry screen is deliberately allowed below `PAIRS_MIN`.** It is
  re-exposure, not assessment — the answer has already been shown, and retries
  never feed the first-try pass rate that the 80% bar reads.

### Slice 5 — ✅ done 2026-08-17

Shipped: the tier filter, both entry buttons with the lock, the 80% gate,
`shuffleByTier`, the mastery counter, and the Signaler flag (⚑ in the session
header on Élargir only, listing the current screen's items — distractors
excluded, since the routing verdict in question is the answer's). Reports land in
`corrections` with `correction_type = 'routing'`, so the professor can tell a
placement complaint from a translation fix in the admin queue.

**Still open from this slice:** Élargir does not yet recycle with spacing once
its pool is exhausted (median 10 sessions away, so nothing is blocked). It must
be built as a recycling pool, never "draw unseen" — that needs the per-item
history in `exercise_attempts`, which now exists.

### Slice 6 — see the four types above

Tokenizer first, unit-tested. Each new type is one entry in `EXERCISE_SCREENS`
(`index.html:928`) plus a builder — the shell, progress, scoring and summary do
not change. That was the design goal of Slice 2 and it should hold.

### Definition of done for each slice

- `npx esbuild` syntax check on the extracted babel block passes
- `npm test` passes (213 tests as of 2026-08-17)
- `node scripts/audit_exercise_types.mjs` exits 0 — every shipped type checked
  against the **live** 6,196-row pool, all 50 lessons, both stages. Unit tests
  prove the builders work on hand-made rows; this proves it on the real ones,
  where the odd shapes live
- Verified on a 375px viewport, and on a real iPhone via the Vercel URL
- Verified against a **thin** lesson (Météo, 6 native) and a **fat** one
  (Salutations, 29 native / 149 corpus) — the thin case is where every
  bucket/shape rule breaks

---

**The "signaler" button is worth more than it looks.** The whole flow already
exists end to end (`corrections` → admin panel → professor approve/reject →
`professor_modified`). Wiring Élargir into it makes learners the QA pass on
routing — and the 1,786 reassigned items are exactly the population that needs
human review at a volume no one can review by hand.

---

## 5. Listen-and-type needs tiles, not a keyboard

**Superseded 2026-08-10.** This section used to argue that listen-and-type should
be built last, against `CORPUS_PIPELINE.md` §7 which called it "the simplest".
Both were reasoning about a *typed* exercise. The objections were:

- The learner types, so the expected string decides right/wrong — and 65% of the
  pool is in a different orthography from the course.
- Tone marks and `ɛ`/`ɔ` cannot be typed on an iPhone French keyboard.
- The spec's mitigation ("accept tone-mark variants") teaches that tone is
  optional, contradicting module 1.1.

**A character-tile input removes all three at once**, so the exercise ships in
Slice 6 with everything else. The learner taps from an offered bank rather than
typing: orthography cannot drift because only the correct characters are offered,
`ɛ`/`ɔ`/toned vowels are just tiles, and no variant-acceptance fudge is needed.

Measured: the pool needs a 42-key bank, of which **16 keys are unreachable from an
iPhone French keyboard** — which is what makes tiles mandatory rather than merely
nicer. Scope it to ≤2 tokens: 1,524 items, 602 native, 45/50 lessons, median 6
characters. See Slice 6.

---

## 6. Rule cards ("Pourquoi ?")

Revives Step 4 of `CORPUS_PIPELINE.md` for a different purpose than it was
written for — not authoring lessons (the professor did that), but inducing the
*rule* behind a lesson so a learner who fails a question can ask why.

Viable only because routing happened: "Conjugaison - présent et passé" now has
172 examples to induce from instead of 54.

Two constraints:
- **Professor-verified before shipping.** `CORPUS_PIPELINE.md` §2.3 — anything
  shown as correct Lingala is verified. A wrong grammar rule is worse than a
  wrong vocabulary item because learners generalise from it. The review job is
  ~50 rule cards, not 1,347 items.
- **Failure-triggered, not front-loaded.** Shown when someone gets it wrong, not
  as a card nobody reads at lesson start.

---

## 7. Speaking, and the STT question

**Decided 2026-08-10: speaking ships in Slice 6 as record-and-compare, with no
STT at all.** Play the professor's clip, record yourself, hear them back to back.
That removes the WER dependency entirely, so speaking is no longer gated on the
measurement below — the measurement now only decides whether a *scored* version
can replace the self-grade later.

Coverage is not a constraint: 75% of the pool carries the professor's voice,
49/50 lessons have ≥20 such items, none have zero. Because self-assessment
cannot be objectively scored, speaking earns XP but is excluded from the
Pratiquer 80% gate (see Slice 6).

The original framing, kept because the STT reasoning still governs any future
scored version:

`api/elevenlabs-stt.js` already exists and is deployed (Scribe v2, `lin`). But
its own header comment records the blocker: **20–50% WER on Lingala**. Making
speaking a continuous scoring mechanic *raises* the accuracy bar rather than
lowering it — in an exam a bad score is one bad experience per level; in a points
loop it denies points every session to someone who pronounced the word correctly.
Single words are also the worst case for STT, which has no context to condition on.
And STT cannot hear tone, so it cannot tell `bomba` from `bómba`.

**Before committing:** measure real WER. There are 6,539 professor recordings with
known-correct transcripts — perfect ground truth. Push ~50 through the existing
endpoint.

- WER < ~15% on sentences → ship scored, sentences only, never single words
- WER as documented → ship **record-and-compare** (play professor, record self,
  hear back to back). No STT, no false negatives, works today.

This is what justifies the Whisper/WAXAL fine-tune (`google/WaxalNLP`, 1,250h
Lingala, CC-BY-4.0) — and makes it more valuable than the TTS fine-tune, which
only changes how the app sounds.

---

## 8. Open risks

- **`index.html` is 3,203 lines**, single-file, transpiled in-browser by Babel
  standalone. This work adds ~600–800. That is where a build step stops being
  optional, especially with Capacitor's slower WebView startup.
- **Untoned dictionary text now reaches two surfaces** — chat context (live since
  2026-08-07) and exercises (once built). Tone restoration would unlock 5,220
  pairs into first-class use: build a lexicon from the toned sources, restore by
  lookup, professor resolves ambiguities. Not a v1 blocker.
- **R2 token pasted into a chat transcript on 2026-08-07 — rotate it.** It is
  write-capable on the `audios` bucket. Once rotated, put it in a gitignored
  `.env.r2`; nothing in the repo reads R2 credentials from a file yet.
- **Harness sessions 3–5** (Playwright, lints, CI) remain a hard prerequisite for
  Phase 3.5 (Stripe). They do not gate this work, but do not drift into
  monetisation without closing them.

---

## 9. Docs this plan invalidates

- `ROADMAP.md` "Phase 3 — Exam system" — replaced by this file
- `PHASE3_LAUNCH_PLAN.md` "Phase 3 — Exam system + Duolingo engagement mechanics" — exams removed
- `Cours/MONOKO_CURRICULUM.md` "EXAM SYSTEM SPECIFICATIONS" and "Every module ends with an exam"
- `CORPUS_PIPELINE.md` Steps 1, 2, 4, 5 — superseded by real professor content;
  only Step 3 (exercise generator) is live, and topic routing was done with the
  existing embeddings rather than the planned LLM audit
