# Monɔkɔ — Harness Sprint

Spec for Claude Code. Build the verification harness for the Monoko app:
smoke tests, unit tests, guardrail lints, a test Supabase, and CI wiring.

This runs BEFORE Phase 3 feature work (exam engine, streaks, SM-2) and is a
hard prerequisite for Phase 3.5 (Stripe, quotas, rate limiting). Timing: the
waiting-on-professor window — this sprint needs no new content and no product
decisions.

Read this whole file before writing any code. Work session by session in the
order of Section 3. The deliverable of every session is **the component
running green**, not code written.

**Implementation status (2026-08-24)**: Sessions 1–5 are implemented. Vitest has
310 passing tests; the compiled app passes Chromium smoke tests at desktop,
390px and 320px, including authenticated monoko-test trail/lesson runs and a
developer completion/medal replay with a deterministic progress reset; the
guardrail scans secrets, correction RLS, progression writes and API auth; and
`.github/workflows/ci.yml` runs the gates. The first Vercel-preview PR run still
needs to be observed before the preview portion can be called operationally
verified.

**Update 2026-08-18 — the test project had drifted a full phase behind.**
`sql/test_schema.sql` held only the 12 base tables; every table added since
Slice 1 (`lesson_pool`, `exercise_attempts`, `lesson_stage_state`, the
conjugation grid, `user_streak`, `review_schedule`) was missing, so the test
project could not exercise any of the exercise engine.

`scripts/sync_test_schema.js` now applies `test_schema.sql` **and then the real
migration files** — the same files run against production — rather than a copy
of their DDL. Copying would fork the schema, and a forked schema drifts
silently: that is precisely how `lesson_stage_state.pratiquer_runs` lived in
production for a month while every file in the repo said otherwise. Data and
pgvector migrations are deliberately excluded.

**Resolved 2026-08-18.** The `TEST_SUPABASE_DB_URL` password had gone stale
(`psql` exit 2, FATAL password authentication failed — note that is a
*connection* error, not a SQL one, and the script now says so). Refreshed in
`.env.test`; all seven files apply clean and the test project is schema-
identical to production for every exercise-engine table.

One detail worth keeping: `progression.sql`'s drift-repair block reported
`column "pratiquer_runs" ... already exists, skipping`, because the corrected
`exercise_progress.sql` had just created it. That is the repair working — the
two files agree, and whichever runs first wins harmlessly.

**New: `npm run verify:progression`** (`scripts/verify_progression.mjs`) — an
end-to-end check of the Slice 7 progression path, run **as the test user with a
real session token** rather than the service key, so it exercises RLS instead
of bypassing it. It covers what unit tests structurally cannot: that a column
the code writes exists, that the `on_conflict` targets resolve, that `real` and
`date` round-trip, and that one learner can neither read nor forge another's
progress. It creates its own fixtures, deletes them, and refuses any project
but monoko-test. Exits 2 if the schema is not synced.

**18/18 green (2026-08-18)**, run twice, leaving zero rows behind. It proved
the whole Slice 7 path against a real database: all four session-end writes
succeed as a signed-in learner, both `on_conflict` targets resolve, `real` and
`date` round-trip, and RLS rejects a cross-user read **and a cross-user write**
(403 — the `WITH CHECK` half of the policy, which a `USING`-only policy would
have let through).

---

## 1. Purpose

The app began this sprint with no tests, no build step, and one Supabase project.
The completed harness now provides:

1. A **test Supabase** with seeded data, so nothing verifies against production.
2. **Unit tests** for `api/*.js` (quota logic, auth checks, response shapes).
3. **Playwright smoke tests** for the core user flows at 3 mobile viewports.
4. **Guardrail lints** encoding the existing hard rules from CLAUDE.md.
5. **CI wiring** (GitHub Actions) that runs the static, unit, build and browser
   gates on every PR.

Everything here also directly serves Phase 3.5: the `api/` mocking scaffolding
is what Stripe webhooks and rate-limiting code will be tested with.

**Phase 3.5 extension (approved 2026-08-25):** before monetization ships, extend
this harness for every entitlement state and the complete conversion journey in
`FREE_TIER_AND_CONVERSION_PLAN.md`. Unit tests cover idempotent Stripe webhooks,
quota reset/consumption and centralized access decisions. Database verification
covers RLS and developer bypass. Playwright covers the uninterrupted Niveau 1
medal ceremony, the subsequent Niveau 2 paywall, trial activation, expiry with
preserved progress, and a useful free fallback. Analytics assertions inspect
event names/properties and explicitly reject raw chat, translation, answer,
recording and email content.

---

## 2. Ground rules

- **Never touch production.** All tests run against the test Supabase and
  localhost / Vercel preview deploys. No test, seed script, or CI job may hold
  production credentials. If a step seems to need production access, stop and
  ask.
- **No service keys client-side, ever** — in app code or test fixtures.
- **Keep the stack boring.** Vitest for unit tests, Playwright for smoke tests,
  a plain Node script (or ESLint rules) for lints, GitHub Actions for CI.
  No new frameworks beyond these.
- **Don't restructure the app.** This sprint adds a `tests/` + `scripts/` +
  `.github/workflows/` layer around the existing code. Refactors of
  `index.html` are out of scope.
- **Each session ends green.** Component built → run it → show it passing →
  only then move to the next session.
- Respect existing repo conventions (CLAUDE.md rules apply to any UI code
  touched, though this sprint should touch none).

---

## 3. Build order (five sessions)

| # | Session | Depends on | Status |
|---|---------|------------|--------|
| 1 | Test Supabase + seed script | User has created the project (see 4.1) | ✅ Done · schema brought current 2026-08-18 |
| 2 | Unit tests for `api/*.js` | Nothing (mocks only) | ✅ Done |
| 3 | Playwright smoke tests | Sessions 1 (data) | ✅ Implemented and locally verified at 1440px, 390px and 320px |
| 4 | Guardrail lint script | Nothing | ✅ Implemented (`scripts/check_guardrails.mjs`) |
| 5 | GitHub Actions CI | Sessions 1–4 | ✅ Workflow implemented; first preview PR observation pending |

Sessions 2 and 4 have no dependencies and can be pulled earlier if session 1
is blocked on account setup.

---

## 4. Session 1 — Test Supabase + seed data

### 4.1 User actions (not Claude Code — request these, then wait)
- Create a second Supabase project (free tier) named e.g. `monoko-test`.
- Provide its URL + anon key + service key as env vars (see Section 9).
- Create one dedicated test user account in it (email/password), e.g.
  `test@monoko.app`.

### 4.2 Claude Code work
- **Schema sync script** (`scripts/sync_test_schema.js` or `.py`): export the
  production schema (tables, RLS policies, indexes — structure only, never
  data) and apply it to the test project. Prefer generating SQL from the
  existing `sql/` files in the repo as source of truth; fall back to
  introspection only for anything not covered there. Output a single
  idempotent `sql/test_schema.sql` that can be re-run safely.
- **Seed script** (`scripts/seed_test_data.js` or `.py`): populate the test
  project with a few hundred representative rows per table — enough to
  exercise every smoke-test flow:
  - ~200 dictionary entries (senses/examples) incl. some with `audio_url`
  - 2–3 courses / levels with a handful of `lesson_items` each, some with audio
  - the test user's `profiles` row + a couple of `user_progress` rows
  - a few `corrections` / `chat_events` rows so admin views aren't empty
  - Use real-looking Lingala/French pairs (can copy a small verified subset);
    mark all seed rows clearly (e.g. a `seed = true` column or an ID range) so
    they're distinguishable.
- Seeding must be **idempotent**: re-running wipes and re-creates seed data
  (in the test project only — the script must hard-fail if pointed at the
  production URL; check the project ref explicitly).

**Done =** schema applied, seed script runs twice without error, test user can
log in against the test project locally.

### 4.3 Actual result (2026-07-09) — ✅ done, with two deviations

**Deviation 1 — schema source.** The base tables (`languages`, `words`,
`senses`, `examples`, `parallel_sentences`, `corrections`, `chat_events`,
`courses`, `lessons`, `lesson_items`) turned out to have **no CREATE TABLE
script anywhere in the repo** — they were made directly via the Supabase
dashboard. That's a real fork the "fall back to introspection" line above
glossed over: introspection means reading production, which the Ground
Rules (Section 2) say to stop and ask about. Asked the user; chose
reconstructing `sql/test_schema.sql` from `TECHNICAL_DOCS.md`'s documented
column-by-column schema instead of touching production, even read-only.
Verified clean against a real `monoko-test` project — applied twice,
second run idempotent (exit 0, no errors).

**Deviation 2 — test user creation.** Rather than 4.1's manual dashboard
step, `scripts/seed_test_data.js` creates the test user itself via the
Supabase Admin Auth API (`POST /auth/v1/admin/users`), looking it up instead
of failing if it already exists. Re-running the seed script *is* the full
Session 1 setup now — no manual Auth step needed beyond creating the project.
Verified: auth login test against `/auth/v1/token?grant_type=password`
returns a valid `access_token`.

**Also fixed along the way**: `scripts/seed_test_data.js` originally had a
hardcoded literal password as an env-var fallback — exactly what Session 4's
guardrail lint is meant to catch. Removed; the script now hard-fails if
`TEST_USER_EMAIL`/`TEST_USER_PASSWORD` aren't set via `.env.test` (gitignored).

**Final row counts** (`monoko-test`, project ref `bdejouumyzovfirqxmdr`):
2 languages, 200 words/senses, 25 examples, 45 parallel_sentences,
3 corrections, 2 chat_events, 2 courses, 3 lessons, 7 lesson_items,
1 profile, 2 user_progress.

---

## 5. Session 2 — Unit tests for `api/*.js`

- Framework: **Vitest**. Add as devDependency; no build step required for the
  serverless functions themselves.
- Mock the OpenAI client and Supabase client (module-level mocks; no network).
- Cover every file in `api/`:
  - auth checks (rejects missing/invalid token where required)
  - quota logic paths (under / at / over limits) — this scaffolding is reused
    for Phase 3.5
  - response shapes (including streaming format where used)
  - error paths (upstream API failure → clean error response, no crash)
- Fixtures live in `tests/fixtures/`; keep them small and readable.

**Done =** `npx vitest run` green locally, with every `api/` file covered by
at least happy-path + one failure-path test.

### 5.1 Actual result (2026-07-09) — ✅ done

110 tests across 9 files (all 8 `api/` handlers + `_rate-limit.js`), all
green. One discovery along the way: `api/_rate-limit.js` already existed in
the repo — a per-IP rate limiter + CORS layer applied to every endpoint,
undocumented elsewhere, part of Phase 3.5's rate-limiting requirement
already built. It's tested directly, then mocked in every other handler's
test file so each handler's tests focus on its own logic. `buildSystemPrompt`,
`formatContext` (both RAG files), and `parseSSEAudio` were given `export`
keywords (no logic changes) so their pure logic gets tested directly too.
See `tests/README.md` for full conventions.

**Since then (2026-08-17): the suite covers frontend engine code too — 213
tests.** The exercise engine lives inside `index.html`'s babel block with no
module to import, so `tests/tokenizer.test.js`, `tests/exercise-builders.test.js`
and `tests/audio-handoff.test.js` slice the relevant runs out of the file and
evaluate them. That means they test **the exact source the browser runs** rather
than a copy that can drift, and a moved section fails loudly instead of silently
testing nothing. Pattern documented in `tests/README.md`.

This does not replace Session 3's Playwright work: these are unit tests over pure
logic, so nothing here proves a screen renders or that a tap does what it looks
like it does. `node scripts/audit_exercise_types.mjs` covers the other half —
every exercise type against the live pool, all lessons, both stages.

---

## 6. Session 3 — Playwright smoke tests

- Framework: **Playwright**, `tests/smoke/`.
- Target URL comes from `PLAYWRIGHT_BASE_URL` env var → same suite runs against
  localhost, a Vercel preview, or staging. Supabase env must point at the
  **test** project (Section 9).
- The suite logs in as the test user, then covers the core flows:
  1. Login succeeds
  2. Dictionary search returns results (seeded entry)
  3. Open a course → open a lesson → content renders
  4. Audio: for a seeded item with `audio_url` — assert the audio element
     exists, has a valid `src`, and `play()` resolves without throwing.
     **Do NOT assert actual sound output** — headless browsers + autoplay
     policies make that unpassable in CI. This caveat is load-bearing.
  5. Chat: send a message, receive a response (mock or a cheap real call —
     prefer intercepting the network call and returning a canned response so
     CI doesn't spend tokens or flake on upstream latency)
  6. Mark a lesson complete → checkmark appears → progress persists on reload

The first implementation intentionally covers the highest-risk shell path:
public landing containment, then authenticated login → home → trail → lesson
preview. Dictionary interaction, audio, mocked chat, and full session persistence
remain browser-suite expansions; their lower-level behavior is already covered
by Vitest and the real-database security verifier.
- Run each flow in Chromium at **desktop 1440px, mobile 390px and narrow mobile
  320px**. Playwright projects provide the matrix without duplicating tests.
- Set sane timeouts and retries (`retries: 1` in CI). Browser tests run against
  the same compiled `dist/` artifact Vercel serves.

**Done =** full suite green against localhost + test Supabase, then green
against a Vercel preview deploy.

---

## 7. Session 4 — Guardrail lints

A plain Node script (`scripts/lint_guardrails.js`) that greps/parses the
codebase and fails with a clear message per violation. Encode the enforceable
rules already written in CLAUDE.md and LIVE_AND_CHAT_IMPROVEMENTS.md:

- no `100vh` in CSS (must be `100dvh`)
- no `position: fixed` introduced in primary UI (allowlist any existing
  legacy occurrences at adoption time so the lint only catches NEW ones)
- `<input>` / `<textarea>` styles: `font-size` ≥ 16px
- no Supabase **service** key string patterns anywhere client-side
- no hardcoded API keys / tokens (basic secret patterns: `sk-`, `ghp_`,
  `eyJ` service-role JWTs, etc.)
- `demo.queue()` present in `app.py` (Gradio rule from existing docs)

Output format: one line per violation with file:line and the rule name;
exit non-zero on any violation. Keep rules in a small config array so adding
one later is a one-liner.

**Done =** script runs clean on the current repo (after allowlisting legacy
occurrences), and deliberately introducing a violation makes it fail.

---

## 8. Session 5 — CI wiring (GitHub Actions)

`.github/workflows/ci.yml`, triggered on every PR:

1. **Lint gate** — `node scripts/lint_guardrails.js`
2. **Unit gate** — `npx vitest run`
3. **Smoke gate** — Playwright against the Vercel **preview deploy** for the
   PR (wait for the deploy, read its URL from the Vercel GitHub integration),
   with Supabase env pointed at the test project via repo secrets.
4. **Prompt-regression gate** (conditional): if the diff touches the chat
   system prompt (path filter on wherever the prompt lives), run
   `monoko_auto_test.py` and **fail the job on score regression** against the
   stored baseline. Store the baseline score in the repo; update it only
   deliberately.

- Secrets needed in GitHub: test Supabase URL/keys, test user credentials,
  (only if the prompt gate makes real calls) an OpenAI key with a low spend cap.
- Keep total CI time reasonable (< ~10 min): run lint + unit first (fast fail),
  smoke after.

**Done =** a demo PR shows all gates running; a PR that violates a lint rule
or breaks a smoke flow is blocked; a PR touching the prompt triggers the
auto-test.

---

## 9. Environment variable layout

| Variable | Local dev | CI / previews | Production |
|---|---|---|---|
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | test project | test project (secrets) | prod project |
| `SUPABASE_SERVICE_KEY` | test project, server-side only | test project (secrets) | prod, server-side only |
| `TEST_SUPABASE_DB_URL` | test project, Session pooler URI — for `scripts/sync_test_schema.js` only (DDL needs a real Postgres connection; REST/PostgREST can't run `CREATE TABLE`) | not needed in CI (schema is applied once, not per-run) | never |
| `BASE_URL` (smoke tests) | `http://localhost:...` | Vercel preview URL | — |
| `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` | test user | secrets | — |
| `OPENAI_API_KEY` | dev key, low cap | low-cap key (secrets) | prod key |

All of the above (except `OPENAI_API_KEY`) live in a local `.env.test`
(gitignored via the `.env*` pattern) — see `.env.test.example` if one gets
added, or ask for the current values. Use the **Session pooler** connection
string for `TEST_SUPABASE_DB_URL`, not Direct connection — Direct connection
is IPv6-only and times out on most home networks.

Rules:
- Vercel **preview** environment env vars → test Supabase.
  Vercel **production** environment env vars → production Supabase.
  These are separate env scopes in Vercel settings; the user sets them once.
- Any script that writes data must check which project it's pointed at and
  refuse to run destructive operations against the production project ref.

---

## 10. Definition of done (whole sprint)

- [x] Test Supabase exists, schema-synced, seeded, test user works — 2026-07-09
- [x] `npx vitest run` green; every `api/` file has happy + failure path tests — 2026-07-09
- [ ] Playwright smoke suite green at 3 viewports on a preview (local compiled
      app and authenticated monoko-test runs are green as of 2026-08-24)
- [x] Guardrail lint runs clean and catches secret, RLS, progression and API-auth regressions
- [ ] CI blocks PRs on every configured gate (workflow committed; first PR observation pending)
- [x] No production credential appears anywhere in tests, fixtures, or CI —
      `.env.test` gitignored, `.env.test.example` committed with no real
      values, both `scripts/*.js` refuse to run against a non-test project ref
- [x] A short `tests/README.md` documents how to run everything locally
      (kept up to date as sessions complete)

After this sprint: Phase 3 feature work proceeds with regression protection,
and Phase 3.5 (Stripe/quotas) inherits the mocking scaffolding and staging
environment it requires.
