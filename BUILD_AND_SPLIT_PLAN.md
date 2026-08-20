# Monɔkɔ — Build step, then splitting `index.html`

Written 2026-08-18, after Slice 7.

**Decision: add a build step before Capacitor (Phase 4). Split the file after
Playwright (Harness Session 3). They are two separate changes and must not be
done as one.**

---

## 1. Why now

`index.html` is the entire frontend: one file, one `<script type="text/babel">`
block, transpiled in the browser by Babel standalone at load. That was a good
choice at 3,000 lines. Measured 2026-08-18, after Slice 7:

| | |
|---|---|
| `index.html` | **6,109 lines**, 324 KB raw, **77 KB gzipped** |
| of which the babel block | 318 KB, 6,075 lines |
| `function App()` alone | **2,417 lines** (3689 → 6106) |
| Babel standalone, from CDN | 2.3 MB raw, ~700 KB gzipped |
| **Babel transform of the block** | **median 109 ms** (M-series Mac, node, 5 runs) |
| the same on a mid-range phone | **~350–650 ms**, slower again in a Capacitor WebView |

Every cold visit pays ~700 KB of transfer for the compiler plus a third to two
thirds of a second of main-thread work **before first paint**. That lands
hardest on the launch audience — diaspora learners on phones — and `ROADMAP.md`
Phase 4 already notes that "connectivity is unreliable in target markets".

For scale: `EXERCISE_ENGINE_PLAN.md` §8 raised this risk when the file was
**3,203** lines and estimated Slice 7 would add 600–800. The file is now roughly
double what that assessment was made against.

## 2. The two changes are worth different things

This is the part usually conflated, and the reason this file exists.

| | Buys | Costs | Risk |
|---|---|---|---|
| **A · Build step** | ~700 KB and ~400 ms off every cold load | an esbuild command + a Vercel build setting | **Low** — the source does not move |
| **B · Split into modules** | maintainability; lazy-loading; real imports in tests | a very large diff across untested UI | **High until Playwright exists** |

**Essentially all of the user-visible win is in A, and A is the cheap one.** B is
a developer-experience and future-performance change. Doing A does not require
doing B: the build step is perfectly happy with one 6,000-line module.

**Not a reason to avoid either:** `PHASE3_LAUNCH_PLAN.md` justifies the current
setup partly on "instant Vercel deploys vs App Store review cycles". A build
step does not threaten that — Vercel builds in seconds. That argument is against
a *native rewrite*, not against bundling.

---

## 3. Stage A — the build step  ⬜

**Hard gate: this must land before the Capacitor wrap (Phase 4).** Shipping
browser-Babel inside an app-store binary is the version of this that is
genuinely painful to undo — a cold app launch would pay WebView startup *plus*
the transpile, and fixing it afterwards means a new store review.

**Shape:**
- esbuild (already the ecosystem default, and rolldown/oxc is on disk via
  vitest). One command: JSX in, one minified `.js` out.
- `index.html` keeps its markup and loses the `text/babel` script and the Babel
  CDN tag; it loads the built bundle instead.
- React stays on the CDN or moves into the bundle — decide by measuring, not by
  taste.
- Vercel: set the build command and output directory. Preview deploys must build
  too, or the smoke tests test something that is not shipped.

**Done =** the built page renders identically, the Babel CDN tag is gone, cold
load drops by roughly the numbers in §1 (measure, don't assume), and
`npm run check:syntax` is replaced by the build itself failing on a syntax error.

**Note:** the build step *subsumes* `scripts/check_syntax.mjs`. That script
exists only because nothing else catches a stray bracket in a no-build-step app.
Once the build runs in CI, delete it rather than maintaining two answers to the
same question.

---

## 4. Stage B — splitting the file  ⬜

**Prerequisite: Harness Session 3 (Playwright smoke tests).** This is the
sequencing point that matters most in this document.

Breaking up a 2,417-line component is safe when a smoke suite can tell you the
lesson screen still renders. Today nothing can: `npm test` slices *engine*
sections and asserts on pure functions, and `check:syntax` proves only that the
file parses. **Neither would notice if the courses view stopped rendering.**
Splitting untested UI is where this goes wrong, not the file size.

### The seams already exist

The `// ── Section ─` banners are real boundaries and the tests already treat
them as module boundaries — `tests/tokenizer.test.js`, `exercise-builders.test.js`,
`audio-handoff.test.js` and `progression.test.js` all slice by marker comment and
`new Function` the result. **After the split those become plain `import`s, which
makes the suite simpler and stronger, not weaker.** Keep the markers until they
do.

Rough target, in ascending order of difficulty:

| Module | Source today | Notes |
|---|---|---|
| `engine/tokenizer.js` | `// ── Tokenizer ─` | pure, already isolated |
| `engine/session.js` | `// ── Exercise engine ─` + the builders | pure |
| `engine/progression.js` | `// ── Progression ─` | pure; SM-2, streak, medals, levels |
| `screens/*.jsx` | the six exercise screens (~1,400 lines) | React, self-contained, prop-driven |
| `views/AlphabetPanel.jsx` | 314–506 | self-contained |
| `views/ConjugationTable.jsx` | 2847–2993 | self-contained |
| `views/LiveTranslation.jsx` | 3066– | self-contained; holds the mic/TTS gotchas |
| `lib/tts.js` | 2993–3066 | |
| **`App.jsx`** | **3689–6106** | **the hard part — 2,417 lines, all the state** |

The first eight are close to mechanical. `App` holds every piece of state and
every loader, and is the only place where the split is real design work rather
than moving text.

### What the split buys beyond tidiness

Lazy-loading. `LiveTranslationView`, `AlphabetPanel` and the six exercise
screens are a large share of the bundle and none of them is needed to render the
home screen or the dictionary — which is the entire public, un-authenticated
surface and the SEO engine. Code-splitting those behind their routes is only
possible once they are modules.

### Rules to carry across

Splitting must not lose the hard-won constraints that currently live as comments
next to the code they govern. These in particular, all documented in
`CLAUDE.md`:

- **one shared `<audio>` element**, and `afterClip` rather than `setTimeout` —
  `tests/audio-handoff.test.js` guards this and must keep passing
- **no exercise screen autoplays**; sound follows a tap
- **exercises play Lingala only** — never wire Web Speech into an exercise
- `fold()`/`sameWord()` are **fill-the-blank only**, never listen-and-type
- centre scrollable boxes with `margin: auto`, never `justify-content: center`

**Done =** the app renders identically, `npm test` imports rather than slices,
the Playwright suite is green at all three viewports before and after, and the
public dictionary path no longer downloads the exercise engine.

---

## 5. Sequencing

```
Slice 8 (session cap / paywall)          ← finishes Phase 3
  ↓
Harness Session 3 — Playwright            ← unblocks the split, already a
                                             Phase 3.5 prerequisite
  ↓
Stage A — build step                      ← HARD GATE before Capacitor
  ↓
Stage B — split index.html                ← safe once Playwright exists
  ↓
Phase 4 — Capacitor wrap
```

Stage A could be pulled earlier — it does not depend on Playwright, only on
wanting the load-time win. Stage B genuinely should not.

---

## 6. Non-goals

- **Not a framework migration.** No Next.js, no Vite-plus-router rewrite, no
  React Native. The stack stays boring; the deliverable is a bundler and, later,
  module boundaries.
- **Not a redesign.** The split must be observably a no-op to a learner.
- **Not TypeScript.** Worth discussing separately once modules exist; adding it
  to the same diff would make the split unreviewable.
