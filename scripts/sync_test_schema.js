#!/usr/bin/env node
/**
 * Applies sql/test_schema.sql to the Monoko test Supabase project
 * (HARNESS_SPRINT.md Session 1).
 *
 * Hard-refuses to run against anything but the known test project ref —
 * this can never be pointed at production, even with a stale/wrong env var.
 * Requires `psql` (e.g. `brew install libpq`, keg-only — set PSQL_BIN if
 * it's not symlinked onto your PATH).
 *
 * Usage:
 *   set -a && source .env.test && set +a && node scripts/sync_test_schema.js
 *
 * Required env var: TEST_SUPABASE_DB_URL
 *   (Session pooler connection string — Direct connection is IPv6-only and
 *   times out on most home networks. Dashboard: Connect → Session pooler.)
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const TEST_PROJECT_REF = "bdejouumyzovfirqxmdr"; // monoko-test
const PSQL = process.env.PSQL_BIN || "/opt/homebrew/opt/libpq/bin/psql";

const dbUrl = process.env.TEST_SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("Missing TEST_SUPABASE_DB_URL env var (session pooler connection string for the test project).");
  process.exit(1);
}

// Project ref appears as `postgres.<ref>:<password>@` in a pooler URL, or
// `db.<ref>.supabase.co` in a direct-connection URL.
const refMatch = dbUrl.match(/postgres\.([a-z0-9]+)[:@]/) || dbUrl.match(/db\.([a-z0-9]+)\.supabase\.co/);
const ref = refMatch?.[1];

if (ref !== TEST_PROJECT_REF) {
  console.error(
    `Refusing to run: connection string project ref is "${ref || "unknown"}", expected the test project ref "${TEST_PROJECT_REF}".\n` +
    `This script will only ever run against the known test project, never production.`
  );
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = (name) => path.join(__dirname, "..", "sql", name);

// `test_schema.sql` holds ONLY the base tables — the ones made by hand in the
// Supabase dashboard, which have no migration file anywhere and had to be
// reconstructed from TECHNICAL_DOCS.md (see HARNESS_SPRINT.md §4.3).
//
// Everything after it is applied FROM THE REAL MIGRATION FILE, the same file
// that was run against production. That is deliberate: copying this DDL into
// test_schema.sql would fork it, and a forked schema drifts silently — exactly
// what happened to lesson_stage_state's pratiquer_runs/elargir_runs, which
// existed in production for a month while every file in the repo said
// otherwise. A test project that is not schema-identical to production tests
// the wrong database.
//
// Structural migrations only. Data migrations (sql/merge_ordinals_into_numbers.sql)
// and pgvector migrations (which need the extension enabled and embeddings the
// test project has no reason to hold) are deliberately excluded.
const FILES = [
  "test_schema.sql",                      // base tables (no migration file exists)
  "lesson_pool.sql",                      // Slice 1 — exercise material
  "exercise_progress.sql",                // Slice 4 — attempts + stage state
  "conjugation_tables.sql",               // conjugation grid
  "conjugation_lesson_tenses.sql",        // ...and the per-lesson tense list
  "lesson_pool_conjugation_source.sql",   // ...admitted into lesson_pool
  "progression.sql",                      // Slice 7 — streak + SM-2 schedule
  "culture_capsules.sql",                 // course-path cultural rewards
  "community_experience.sql",             // profile privacy + XP leaderboard
  "lesson_exercise_policy.sql",           // per-lesson exercise-type allow-list
];

console.log(`Applying ${FILES.length} SQL files to test project (${ref})...\n`);
for (const name of FILES) {
  process.stdout.write(`  ${name} ... `);
  try {
    execFileSync(PSQL, [dbUrl, "-v", "ON_ERROR_STOP=1", "-q", "-f", sql(name)], { stdio: "inherit" });
  } catch (e) {
    // Node puts the full argv in the error it throws, and argv[0] here is a
    // connection string WITH THE DATABASE PASSWORD IN IT. Letting that bubble
    // up prints the password to the terminal and into any CI log. Swallow the
    // original and report only what is useful.
    console.log("FAILED");
    console.error(`\npsql failed on sql/${name} (exit ${e.status}).`);
    if (e.status === 2) {
      console.error(
        "Exit 2 is a connection error, not a SQL error — most often a stale\n" +
        "TEST_SUPABASE_DB_URL password. Refresh it in the Supabase dashboard\n" +
        "(Project Settings → Database → Reset database password, then Connect →\n" +
        "Session pooler) and update .env.test."
      );
    }
    process.exit(1);
  }
  console.log("ok");
}
console.log("\nSchema sync complete.");
