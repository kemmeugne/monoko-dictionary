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
const schemaFile = path.join(__dirname, "..", "sql", "test_schema.sql");

console.log(`Applying ${schemaFile} to test project (${ref})...`);
execFileSync(PSQL, [dbUrl, "-v", "ON_ERROR_STOP=1", "-f", schemaFile], { stdio: "inherit" });
console.log("Schema sync complete.");
