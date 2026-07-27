# Monɔkɔ — Soft-Launch Implementation Strategy (Master Orchestrator)

Execution brief for Claude Code. This is the **master plan** for getting Monoko
to a soft-launch-ready web app.

**Sequencing principle: engine first, UI later.** Build and heavily test the
lesson/exercise/exam **generation engine in isolation** before touching the
course UI. The engine's real output is what tells us how to design the UI — so
the UI, access gating, and Playwright tests all come *after* the engine reliably
produces good content. This ordering is deliberate; do not start UI work early.

Read this whole file first. The linchpin is Section 5 (the engine's output
contract) — freeze it before generating. Two decisions in Section 10 must be
confirmed with the owner before the code they affect is written.

Sub-specs (source of truth for their tracks):
- `CORPUS_PIPELINE.md` — the generation engine (lessons + exams).
- `HARNESS_SPRINT.md` — the test harness (Playwright, unit tests, test Supabase, CI).
- `CLAUDE.md` — standing rules (mobile-first, stack, do-not-change lists).

---

## 1. Goal & non-goals

**Goal:** a soft-launch-ready web app we can put in front of real Lingala-diaspora
users to measure conversion, retention, and funnel behavior.

**In scope (across both phases):** the lesson/exercise/exam generation engine and
its data-level testing (Phase 1); then course UI restructure, three-tier access,
the paywall gate, and the harness (Phase 2).

**Out of scope for this push (do not build):**
- Capacitor / native app / push notifications / native mic — later mobile phase.
- **Live Stripe checkout** — deferred (see §7). Build the entitlement gate, not
  payment code.
- Rebrand / new visual identity — Phase 2 is a **restructure**, keep the look.

---

## 2. The three tracks (do NOT conflate these)

Distinct systems, different inputs and skills. They were being confused as one
"Playwright" task — they are not.

| Track | What it is | When | Spec |
|---|---|---|---|
| **B — Generation engine** | The AI-generates-then-professor-reviews machinery that produces lesson + exam **data** from the corpus. NOT UI. NOT Playwright. | **Phase 1 (now)** | `CORPUS_PIPELINE.md` + §5–6 here |
| **A — Course UI restructure** | Pure frontend: lesson/exam screens, gating, paywall, dictionary sign-up prompts. Keeps visual identity. | Phase 2 | §8 here |
| **C — Test harness** | Playwright smoke tests, `api/` unit tests, test Supabase, CI. Verifies A and B; creates nothing. | Phase 2 | `HARNESS_SPRINT.md` |

Playwright (Track C) is **only a UI testing tool** — it clicks through the app to
catch regressions. It does not create lessons, exams, or rules. That is Track B.
Track B's own testing (Phase 1) is **data-level**, no browser (see §6).

---

## 3. Why engine-first

- The lesson/exam data is what everything else displays, tests, and gates. Design
  the UI before seeing real generated content and you build screens for imagined
  data — then rework them when reality differs (a teach-beat needing three cards,
  an exercise type that fits tonal Lingala poorly, an exam structure you didn't
  anticipate).
- The engine needs heavy iteration on generation quality. Isolating it means you
  tune quality without a half-built UI entangled in every change.
- A well-formed lesson/exam **as data is fully testable with zero UI** (§6). You
  can prove the engine works before a single screen exists — which is exactly the
  heavy testing this needs.
- Once the engine reliably emits good content in a fixed shape, the UI is designed
  around **real examples**, and because they share the shape, the UI renders them
  uniformly.

---

## 4. The contract is the engine's OUTPUT SPEC (reframed)

The shared data shape is **not** an upfront constraint serving a UI that doesn't
exist. It is the **engine's deliverable specification** — the target the engine
generates toward and the thing Phase 1 tests against. Framed this way it belongs
firmly in Phase 1: define "what a well-formed lesson and exam look like as data,"
generate toward it, test against it. The UI (Phase 2) is then designed around the
real output.

Freeze the contract before generating (Step 1 in §9). Store it as
`LESSON_CONTRACT.md` (or a JSON-schema file) in the repo.

---

## 5. The output contract — lessons AND exams (freeze first)

Review against the professor's real content (Step 0) before freezing, then treat
as stable.

### 5.1 Lesson
```jsonc
{
  "lesson_id": "1.2",
  "title": "Salutations et politesse",
  "level": "A1",
  "access_tier": "authenticated_free",   // public | authenticated_free | subscribed
  "teach_beat": [                          // 0–3 short cards; may be empty
    { "pattern": "Na = « je » au début de beaucoup de phrases",
      "example_lingala": "Na lembi", "example_french": "Je suis fatigué",
      "audio_url": "https://.../na_lembi.mp3" }
  ],
  "exercises": [ /* ordered; each is one of the 5 types below */ ],
  "source_status": "verified"              // only 'verified' ships to learners
}
```

**Five exercise types** (all generatable from a corpus row's french + lingala +
audio_url — see `CORPUS_PIPELINE.md` §7). Shared `{ id, type, prompt }` plus:

```jsonc
{ "id":"e1","type":"listen_type","audio_url":"…","answer":"Na lembi",
  "accept":["na lembi"] }                                   // 1. listen & type
{ "id":"e2","type":"match_pairs",
  "pairs":[{"lingala":"Na lembi","french":"Je suis fatigué"}, …] }  // 2. match
{ "id":"e3","type":"order_words","answer":["Na","lembi","lelo"],
  "bank":["Na","lembi","lelo","te","Olembi"] }              // 3. order (distractors)
{ "id":"e4","type":"fill_blank","sentence":["Na","___","te"],
  "answer":"lembi","options":["lembi","lelo","mbote"] }     // 4. fill blank
{ "id":"e5","type":"choose_audio","prompt_french":"Tu es fatigué ?",
  "options":[{"audio_url":"…","correct":true}, {"audio_url":"…"}, … ] } // 5. choose audio
```

### 5.2 Exam (first-class output, per level)
Per `ROADMAP.md`: each level ends with an exam of three weighted components,
70% pass threshold, per-component retry.

```jsonc
{
  "exam_id": "exam_level_1",
  "level": "A1",
  "pass_threshold": 0.70,
  "components": {
    "written":   { "weight": 0.40, "items": [ /* translation, fill_blank, order_words */ ] },
    "listening": { "weight": 0.30, "items": [ /* audio → choose meaning */ ] },
    "speaking":  { "weight": 0.30, "items": [ /* record → scored by STT/LLM */ ] }
  },
  "retry_policy": "per_component",   // failed components retried individually
  "source_status": "verified"
}
```
- Written/listening items reuse the same exercise-type shapes as lessons.
- Speaking items carry an expected target + a scoring mode (match% for levels
  1–3, LLM fluency scoring for 4–6) — per `ROADMAP.md` Phase 3.
- Wrong answers feed the SM-2 review queue.

### 5.3 Contract rules
- Every lesson/exam validates against this shape. New content = new data, never
  new UI (that constraint matters in Phase 2, but the shape is fixed now).
- Answer-checking is forgiving (trim, case-fold, tone-mark variants) via the
  `accept`/`options` fields.
- Only `source_status: "verified"` content is emitted for learners.
- If the professor's real content (Step 0) needs a shape this doesn't cover,
  amend the contract **before** freezing.

---

## 6. Phase 1 testing — data-level, no UI (the bulk of the work)

This is where the engine becomes operational. All of it runs without a browser.

**Validation suite** (every generated lesson/exam):
- schema-valid against the contract; every exercise is a known type
- lesson has a teach-beat (or explicit empty); exam components sum to weight 1.0
  and carry the 70% threshold
- only `verified` source content included
- audio exercises have a reachable `audio_url`

**Quality checks:**
- tokenizer correctness on Lingala (spacing, apostrophes, tone marks) — unit-tested
- distractors are plausible (drawn from same lesson/group, not random corpus)
- answer-checking accepts the right variants and rejects wrong ones (fixture tests)
- no duplicate/degenerate exercises within a lesson

**Human-in-the-loop:**
- generated lessons/exams land in the professor review queue (admin panel);
  nothing is "operational" until a representative sample passes professor review
- calibrate any LLM classification per `CORPUS_PIPELINE.md` §5 before trusting it

**Iterate** on generation quality against these tests until output is reliably
good. Exit criterion for Phase 1: the engine emits professor-verified lessons AND
exams that pass the full validation + quality suite, with no UI in the loop.

---

## 7. Access model — three tiers (defined now, enforced in Phase 2)

Access is **three states, not a boolean**: `public | authenticated_free |
subscribed`. Bake the tier into the content (`access_tier` in §5.1) now; enforce
it in the UI in Phase 2.

| Tier | Who | Gets | Gate |
|---|---|---|---|
| **public** | anyone, no account | Full dictionary (A-Z, search, audio) + sign-up prompts | none |
| **authenticated_free** | logged-in, no payment | Modules **1.1 + 1.2** + **10 AI chat msgs/day** | login |
| **subscribed** | logged-in + entitlement | Module **1.3+**, all exams, unlimited AI (fair-use cap) | login + entitlement |

- **Dictionary stays public** — SEO/funnel engine. Embed sign-up prompts inside
  it ("save this word", "try your first free lesson"); never wall it. Public +
  prompts yields MORE sign-ups than a wall (a wall also kills the traffic it
  would convert).
- **Login wall ≠ paywall.** Login fires at "I want to learn" (entry to 1.1).
  Payment fires at "I want more than the free taste" (entry to 1.3).
- **Stripe deferred.** The `subscribed` gate checks an entitlement flag and shows
  an interim upgrade state (§10 decides its behavior). No live checkout, no
  card/PII handling anywhere in this push — so it ships without the ToS/privacy
  legal gate (that blocks the first real charge, not this scaffolding). Build so a
  later Stripe integration just flips the flag.

---

## 8. Phase 2 — UI restructure, gating, harness (AFTER the engine is proven)

Only start once Phase 1's exit criterion is met and you have real generated
lessons/exams to design against.

**8.1 Course UI restructure (Track A)** — build screens around the real output:
- course home / level map (reshape existing Phase 2 progress work), lock state
  per access tier
- lesson player: the 4-beat flow (teach-beat cards → one exercise per screen, no
  scroll, top progress bar, large tap targets → conversational close handing to
  AI chat → completion, with celebration on correct answers)
- the 5 exercise components + the exam components (written/listening/speaking),
  each driven purely by contract data — no per-lesson custom UI
- dictionary sign-up prompts (public dictionary unchanged in access)
- paywall / upgrade screen (interim state per §10; not a live checkout)
- engagement mechanics: visible streak counter (priority), daily review queue
  ("X items to review"), SM-2 scheduling
- all new UI mobile-first per `CLAUDE.md` (375px-first, ≥44px targets, `100dvh`,
  16px inputs, safe-area insets, no hover-only, bottom nav)

**8.2 Three-tier enforcement + paywall wiring** — entitlement checked
server-side; free modules require login; 1.3+ shows the interim upgrade state.

**8.3 Harness (Track C, `HARNESS_SPRINT.md`)** — now, against the stabilized UI:
test Supabase, `api/` unit tests, Playwright smoke tests over the new flows at 3
viewports, CI gates. Writing these earlier would test UI we then replaced.

**8.4 Soft-launch readiness pass** — seed real content; verify the full funnel
(dictionary → sign-up prompt → free lesson → paywall → interim upgrade); confirm
the 10/day free chat quota + fair-use cap; confirm analytics capture the funnel
metrics the launch plan needs.

---

## 9. Build order (with checkpoints)

**Phase 1 — engine in isolation:**
0. **Review professor content** — read `Prof_Borgeas/`. Report what was
   delivered, its structure, and whether the §5 contract covers lessons AND
   exams for it. Input to freezing the contract. (Do this first.)
1. **Freeze the output contract** (§5, lessons + exams) — amend if Step 0
   surfaced gaps, then write `LESSON_CONTRACT.md`. Owner approves. Nothing else
   starts first.
2. **Build the generation engine** per `CORPUS_PIPELINE.md` — lessons + exams
   into the contract, through the professor review queue.
3. **Data-level testing + iteration** (§6) — validation + quality suites,
   professor review of a representative sample, tune generation quality.
   *Exit criterion:* engine reliably emits professor-verified lessons + exams
   passing the full suite, no UI involved.

**Phase 2 — UI, gating, harness (only after the Phase 1 exit criterion):**
4. Design + build the course UI (§8.1) around real generated output.
5. Three-tier access architecture + paywall wiring (§8.2), Stripe-less.
6. Harness / Playwright (§8.3) against the stabilized UI.
7. Soft-launch readiness pass (§8.4).

Parallel/later (non-blocking): full corpus scale-up, live Stripe (needs legal
gate), Capacitor/mobile.

---

## 10. Confirm before building (do not guess)

1. **Interim upgrade state (Stripe deferred).** At the 1.3+ paywall, show (a) a
   "coming soon / join waitlist" capture, or (b) a manual-unlock mechanism (owner
   grants entitlement to specific testers)? Determines §8.2. Recommend based on
   whether the soft launch must *measure paywall demand* (→ waitlist) or *let real
   testers use paid content* (→ manual unlock). Possibly both. (Phase 2 decision —
   surface it before Step 5.)
2. **Split `index.html` or keep monolithic?** After reading the file, recommend
   splitting into a few `<script>` includes (widens parallel work, shrinks blast
   radius, still no build step) vs. keeping it single. One-time refactor before
   §8.1 if splitting, verified by the harness. (Phase 2 decision.)

---

## 11. Guardrails (never skip)

- Engine first. No UI work until Phase 1's exit criterion (§6) is met.
- The contract is the engine's output spec — freeze it before generating; validate
  every lesson AND exam against it.
- Only `verified` content is emitted. Professor review queue is the gate; no
  AI-generated lesson/exam goes live unreviewed.
- Access is three states, not a boolean. Enforced server-side in Phase 2, never
  client-only.
- Dictionary stays public. Sign-up prompts, never a wall.
- New content renders from the contract with no new UI code (Phase 2). Custom UI
  needed ⇒ the contract was wrong ⇒ fix the contract.
- All new UI is mobile-first per `CLAUDE.md`.
- Stripe deferred — entitlement flag only, no card/PII handling in this push.
- Harness (Track C) comes after the UI stabilizes, and tests the real new flows.
- Supabase access from local/CI uses the **session pooler** connection string
  (the direct connection is IPv6-only and times out on many networks).
- The chat system prompt is protected: any change triggers `monoko_auto_test.py`
  and blocks on regression.

---

## 12. How the specs relate

- **This file** — the master order (engine-first), the access model, and the
  engine's output contract for lessons + exams.
- **`LESSON_CONTRACT.md`** — (written in Step 1) the frozen output shape.
- **`CORPUS_PIPELINE.md`** — Track B: how lessons/exams are generated and verified.
- **`HARNESS_SPRINT.md`** — Track C: how the assembled app is tested (Phase 2).
- **`CLAUDE.md`** — standing rules throughout.

Start at Step 0. Freeze the contract (lessons + exams) before generating. Prove
the engine at the data level before any UI. Confirm the §10 forks when Phase 2
begins.
