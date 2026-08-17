# Tests

Status: Sessions 1 (test Supabase + seed data) and 2 (unit tests for
`api/*.js`) of `HARNESS_SPRINT.md` are done. Sessions 3–5 (Playwright smoke
tests, guardrail lints, CI) are not built yet.

## Running the unit tests

```bash
npm install
npm test          # vitest run — single pass, used in CI
npm run test:watch
```

No network calls are made. Every `api/*.js` handler is tested against a
stubbed `global.fetch` and a mocked `api/_rate-limit.js`, so tests run
offline and don't touch OpenAI, Supabase, ElevenLabs, or the HuggingFace
Space.

## Testing code that lives inside `index.html`

`tests/tokenizer.test.js` covers engine code, which has no module to import —
the whole frontend is one `<script type="text/babel">` block. It slices the
block between two marker comments out of `index.html` and evaluates it with
`new Function`, so the tests run against **the exact source the browser runs**
rather than a copy that can drift.

The markers are comment banners (`// ── Tokenizer ─` … `// ── Exercise engine ─`).
If you move or rename a section, the test throws with a clear message instead of
silently testing nothing. Use the same pattern for any further engine tests.

One gotcha worth knowing: a string literal containing an accented character can
be composed or decomposed depending on the editor that saved the file, and the
two look identical. Where the distinction is the point of the test, write the
character as an explicit `\uXXXX` escape.

## Test Supabase project (Session 1)

A dedicated Supabase project, `monoko-test` (ref `bdejouumyzovfirqxmdr`),
exists solely for this harness. It is never used for anything else, and
production is never touched by any script in this repo.

```bash
cp .env.test.example .env.test   # fill in real values, ask if you don't have them
set -a && source .env.test && set +a

npm run db:sync-test-schema      # applies sql/test_schema.sql via psql
npm run db:seed-test             # wipes + reseeds all tables, creates/reuses the test user
```

- `sql/test_schema.sql` — reconstructed from `TECHNICAL_DOCS.md`'s documented
  schema plus the tracked `sql/*.sql` migrations, since the base tables have
  no `CREATE TABLE` script anywhere in the repo (made via the dashboard).
  Idempotent; safe to re-run.
- `scripts/sync_test_schema.js` — applies it via `psql` (needs
  `TEST_SUPABASE_DB_URL`, the **Session pooler** connection string — Direct
  connection is IPv6-only and times out on most home networks). Refuses to
  run unless the connection string's project ref is exactly
  `bdejouumyzovfirqxmdr`.
- `scripts/seed_test_data.js` — wipes and reseeds every table via the REST
  API (`SUPABASE_SERVICE_KEY`), then creates the test Auth user itself via
  the Admin API (or reuses it if it already exists) rather than requiring a
  manual dashboard step. Same project-ref guard. Requires
  `TEST_USER_EMAIL`/`TEST_USER_PASSWORD` to be set — no hardcoded fallback
  password in the source (that would be exactly what Session 4's guardrail
  lint is meant to catch).
- Seeded data: 2 languages, 200 words/senses (25 real, sourced from
  Monoko's own `api/chat.js` examples; 175 synthetic padding for
  pagination/search volume), 25 examples, 45 `parallel_sentences`,
  3 corrections, 2 chat_events, 2 courses, 3 lessons, 7 lesson_items,
  1 profile, 2 user_progress rows.
- Both scripts are safe to re-run any time; re-running is the update
  mechanism, not a one-time setup step.

## Layout

- `tests/api/*.test.js` — one file per `api/*.js` handler, mirroring the
  source layout (including `tests/api/cron/` for `api/cron/`).
- `tests/fixtures/mockRes.js` — a minimal Vercel-style `res`/`req` mock
  (`status`/`json`/`setHeader`/`write`/`end`/`send`).
- `tests/fixtures/mockFetch.js` — builders for the upstream response shapes
  handlers expect (JSON, text, arrayBuffer, and a fake OpenAI SSE stream),
  plus `routeFetchByUrl` to dispatch a single `global.fetch` mock across
  multiple upstream hosts by matching on URL substrings.

## Conventions used across the suite

- `vi.mock("../../api/_rate-limit.js", ...)` replaces `checkRateLimit`,
  `getClientIp`, and `setCorsHeaders` with controllable mocks, so each
  handler's rate-limit/CORS behavior is tested once in
  `tests/api/_rate-limit.test.js` and trusted everywhere else.
- Every file that reads `process.env.*` **inside** its handler function
  (all of them except `mms-tts.js`) is tested with plain `vi.stubEnv(...)`
  in `beforeEach`/`afterEach`.
- `api/mms-tts.js` captures `MMS_SPACE_URL` into a module-level `const` at
  import time. Its test file works around this with `vi.resetModules()` +
  a dynamic `await import(...)` per test (see `loadHandler()` in
  `tests/api/mms-tts.test.js`) rather than stubbing the env after the fact.
- Pure helper functions (`buildSystemPrompt`, `formatContext` in both RAG
  files, `parseSSEAudio`) are exported from their modules solely so they
  can be unit-tested directly, in addition to being exercised indirectly
  through the handler tests.

## Known source-code observation (not fixed here)

`api/mms-tts.js`'s `parseSSEAudio` only recognizes the Gradio 4.x
`process_completed` event marker. Per `CLAUDE.md`, the HuggingFace Space
now runs Gradio 6.x, which emits `event: complete` instead, and
`index.html`'s client-side `lingalaTTS()` already handles both markers.
Per `TECHNICAL_DOCS.md` / `LIVE_AND_CHAT_IMPROVEMENTS.md`, `mms-tts.js`'s
POST path is "implemented but unused — client calls Space directly," so
this is likely latent/dead code rather than an active bug. Tests are
written against the code as it exists; flagging here rather than changing
handler logic, which is out of scope for this sprint.
