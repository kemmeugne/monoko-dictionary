# Monɔkɔ — Exercise Engine Plan

Written 2026-08-07. **This file supersedes the Phase 3 "exam system" sections of
`ROADMAP.md`, `PHASE3_LAUNCH_PLAN.md` and `Cours/MONOKO_CURRICULUM.md`.** Where
they disagree with this file, this file is right.

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

### Slice 1 — `lesson_pool` table  ⬜
One SQL migration (Anthony runs it in the Supabase editor), then populate.

Columns: `lesson_id`, `source_table` + `source_id`, French and Lingala text
denormalised, `audio_url`, `token_count`, `orthography` (`toned` | `untoned`),
`similarity`, `is_native` (professor-authored vs routed).

Text is denormalised on purpose: the client does one query per pool instead of
joining four tables, and it freezes exactly what an exercise may display.

### Slice 2 — session shell + match-pairs  ⬜
The frame everything else plugs into.

- Full-screen view, one question per screen, no scrolling (mobile-first, 375px)
- 15 questions, **live queue** — wrong items are re-inserted and must be answered
  correctly before the session ends
- Shape-homogeneous options; same-lesson distractors preferred, level pool as fallback
- Orthography never mixed within one exercise
- XP scoring, session summary screen
- **"Pourquoi ?"** button on wrong answers → the existing lesson view for now,
  swapped for a rule card later (§6)
- Guest-capable; progress in localStorage, migrated on signup
- Entry point: an "S'entraîner" button on the lesson screen, so nothing existing
  changes until it is seen working

### Slice 3 — choose-the-audio  ⬜
Largest pool (6,539) and the one that shows off the professor's recordings.

### Slice 4 — tokenizer + tap-words-in-order  ⬜
Build and unit-test the tokenizer **first** — it must handle Lingala spacing,
apostrophes and tone marks consistently. Then the exercise.

### Slice 5 — fill-the-blank  ⬜
Reuses the tokenizer.

### Slice 6 — attempts + SM-2 review queue + streaks  ⬜
All thin once sessions exist. A review is a session sourced from the SM-2 queue;
a streak is "did you finish any session today".

---

## 5. Why listen-and-type is last

`CORPUS_PIPELINE.md` §7 says to build it first as "the simplest". The data says
otherwise:

- The learner types, so the expected string decides right/wrong — and 65% of the
  pool is in a different orthography from the course. Mixed spelling makes it
  unanswerable.
- Tone marks and `ɛ`/`ɔ` cannot be typed on an iPhone French keyboard at all.
- The spec's mitigation ("accept tone-mark variants") teaches that tone is
  optional, contradicting module 1.1.

If built, restrict it to the 914 course-grade items, or add a tap-the-character
helper rather than a raw keyboard.

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

Speaking is now an ordinary exercise type (app shows a word → learner says it →
STT scores it), built **last**.

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
