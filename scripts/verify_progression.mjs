#!/usr/bin/env node
/**
 * End-to-end check of the Slice 7 progression path against the TEST project.
 *
 * WHY THIS EXISTS
 * `npm test` proves the SM-2 and streak maths are right, but every one of those
 * tests runs on plain objects. Nothing in the suite proves the numbers can
 * actually be written to and read back from a database by a logged-in learner —
 * and that is where this feature's real failure modes live:
 *
 *   - a column the code writes that the schema does not have
 *     (lesson_stage_state.pratiquer_runs was exactly this for a month, and
 *      PostgREST rejects the WHOLE row, so one unknown column silently takes
 *      the 80% gate down with it);
 *   - an `on_conflict` target PostgREST cannot infer, which answers 409
 *     (this is what bit populate_conjugation_forms.py);
 *   - an RLS policy that is missing, or that is too permissive and lets one
 *     learner read another's progress;
 *   - a type that does not round-trip — `ease` is `real`, `due_on` is `date`.
 *
 * It runs as the TEST USER with a real session token, exactly as the browser
 * does, rather than with the service key (which bypasses RLS and would prove
 * nothing about it).
 *
 *   set -a && source .env.test && set +a && node scripts/verify_progression.mjs
 *
 * Creates its own fixtures and deletes them again. Refuses to run against any
 * project but monoko-test.
 */
const TEST_PROJECT_REF = "bdejouumyzovfirqxmdr";

const URL_ = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
const EMAIL = process.env.TEST_USER_EMAIL;
const PASSWORD = process.env.TEST_USER_PASSWORD;

for (const [k, v] of Object.entries({ SUPABASE_URL: URL_, SUPABASE_ANON_KEY: ANON,
  SUPABASE_SERVICE_KEY: SERVICE, TEST_USER_EMAIL: EMAIL, TEST_USER_PASSWORD: PASSWORD })) {
  if (!v) { console.error(`Missing ${k} — source .env.test first.`); process.exit(1); }
}

// Same guard as sync_test_schema.js and seed_test_data.js: this script writes
// and deletes rows, so it may only ever see the test project.
const ref = URL_.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
if (ref !== TEST_PROJECT_REF) {
  console.error(`Refusing to run: SUPABASE_URL points at "${ref || "unknown"}", expected the test project "${TEST_PROJECT_REF}".`);
  process.exit(1);
}

let pass = 0, fail = 0;
const ok = (name, extra = "") => { pass++; console.log(`  ✅ ${name}${extra ? "  " + extra : ""}`); };
const bad = (name, why) => { fail++; console.log(`  ❌ ${name}\n       ${String(why).slice(0, 300)}`); };

const rest = async (path, { token, service, method = "GET", body, prefer } = {}) => {
  const key = service ? SERVICE : ANON;
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${service ? SERVICE : (token || ANON)}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch {}
  return { status: res.status, body: json, raw: text };
};

const main = async () => {
  console.log(`\nProgression path — end-to-end against monoko-test (${ref})\n`);

  // ── Schema present? ──────────────────────────────────────────────────────
  const spec = await rest("", { service: true });
  const defs = Object.keys(spec.body?.definitions || {});
  const need = ["lesson_pool", "exercise_attempts", "lesson_stage_state", "user_streak", "review_schedule"];
  const missing = need.filter(t => !defs.includes(t));
  if (missing.length) {
    console.log("Schema is not synced — missing: " + missing.join(", "));
    console.log("\nRun:  set -a && source .env.test && set +a && npm run db:sync-test-schema");
    console.log("(needs a working TEST_SUPABASE_DB_URL — see that script's error text if it fails)\n");
    process.exit(2);
  }
  console.log("schema:");
  for (const t of need) ok(t);

  // ── Log in as the test user ──────────────────────────────────────────────
  const auth = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!auth.ok) { console.log("\n❌ test user login failed:", await auth.text()); process.exit(1); }
  const { access_token: token, user } = await auth.json();
  const uid = user.id;
  console.log(`\nsigned in as the test user (${uid.slice(0, 8)}…)`);

  // ── Fixtures (service key: the learner cannot create course content) ─────
  const lesson = (await rest("lessons?select=id&limit=1", { service: true })).body?.[0];
  const lang = (await rest("languages?select=id&limit=1", { service: true })).body?.[0];
  if (!lesson || !lang) { console.log("\n❌ test project has no lessons/languages — run npm run db:seed-test"); process.exit(1); }

  const SOURCE_ID = 999_000_001;   // far outside any seeded range
  await rest("lesson_pool?source_table=eq.lesson_items&source_id=eq." + SOURCE_ID, { service: true, method: "DELETE" });
  const made = await rest("lesson_pool", {
    service: true, method: "POST", prefer: "return=representation",
    body: [{
      language_id: lang.id, lesson_id: lesson.id, source_table: "lesson_items", source_id: SOURCE_ID,
      french: "vérification", lingala: "bokebi", tier: "native", token_count: 1,
      orthography: "toned", level: 1, effective_level: 1,
    }],
  });
  const poolId = made.body?.[0]?.id;
  if (!poolId) { console.log("\n❌ could not create a lesson_pool fixture:", made.raw.slice(0, 200)); process.exit(1); }

  const today = new Date().toISOString().slice(0, 10);
  const cleanup = async () => {
    await rest(`review_schedule?user_id=eq.${uid}&pool_item_id=eq.${poolId}`, { service: true, method: "DELETE" });
    await rest(`exercise_attempts?user_id=eq.${uid}&pool_item_id=eq.${poolId}`, { service: true, method: "DELETE" });
    await rest(`lesson_stage_state?user_id=eq.${uid}&lesson_id=eq.${lesson.id}`, { service: true, method: "DELETE" });
    await rest(`user_streak?user_id=eq.${uid}`, { service: true, method: "DELETE" });
    await rest(`lesson_pool?id=eq.${poolId}`, { service: true, method: "DELETE" });
  };

  try {
    // ── The four writes handleSessionEnd makes, as the learner ─────────────
    console.log("\nwrites the app makes at session end (as the signed-in learner):");

    const att = await rest("exercise_attempts", { token, method: "POST", prefer: "return=minimal",
      body: [{ user_id: uid, pool_item_id: poolId, lesson_id: lesson.id, stage: "pratiquer",
               format: "match_pairs", correct: true }] });
    att.status < 300 ? ok("exercise_attempts insert") : bad("exercise_attempts insert", att.raw);

    // The on_conflict target is the thing being tested here: an unresolvable
    // one answers 409, which is how the conjugation populate script failed.
    const sched = await rest("review_schedule?on_conflict=user_id,pool_item_id", {
      token, method: "POST", prefer: "resolution=merge-duplicates,return=representation",
      body: [{ user_id: uid, pool_item_id: poolId, lesson_id: lesson.id,
               ease: 2.6, interval_days: 6, reps: 2, due_on: today }] });
    sched.status < 300 ? ok("review_schedule upsert", "on_conflict=user_id,pool_item_id")
                       : bad("review_schedule upsert", `${sched.status} ${sched.raw}`);

    const streak = await rest("user_streak?on_conflict=user_id", {
      token, method: "POST", prefer: "resolution=merge-duplicates,return=representation",
      body: [{ user_id: uid, current_streak: 3, longest_streak: 7, last_day: today }] });
    streak.status < 300 ? ok("user_streak upsert", "on_conflict=user_id")
                        : bad("user_streak upsert", `${streak.status} ${streak.raw}`);

    // The exact column set handleSessionEnd sends — including the two that
    // existed in production but in no file in the repo.
    const stage = await rest("lesson_stage_state?on_conflict=user_id,lesson_id", {
      token, method: "POST", prefer: "resolution=merge-duplicates,return=representation",
      body: [{ user_id: uid, lesson_id: lesson.id, language_id: lang.id,
               pratiquer_passed: true, pratiquer_best: 85, elargir_best: 0, elargir_xp: 250,
               pratiquer_runs: 1, elargir_runs: 0 }] });
    stage.status < 300 ? ok("lesson_stage_state upsert", "incl. pratiquer_runs / elargir_runs")
                       : bad("lesson_stage_state upsert", `${stage.status} ${stage.raw}`);

    // ── Types round-trip ───────────────────────────────────────────────────
    console.log("\ntypes survive the round trip:");
    const back = (await rest(`review_schedule?user_id=eq.${uid}&pool_item_id=eq.${poolId}&select=*`, { token })).body?.[0];
    if (!back) bad("review_schedule read-back", "no row");
    else {
      Math.abs(back.ease - 2.6) < 1e-4 ? ok("ease (real)", `${back.ease}`) : bad("ease (real)", back.ease);
      back.due_on === today ? ok("due_on (date)", back.due_on) : bad("due_on (date)", `${back.due_on} != ${today}`);
      back.reps === 2 && back.interval_days === 6 ? ok("reps / interval_days") : bad("reps / interval_days", JSON.stringify(back));
    }

    // ── The reads the app makes on load ───────────────────────────────────
    console.log("\nreads the app makes (loadStreak / loadSchedule / loadStageState):");
    const mine = (await rest(`user_streak?user_id=eq.${uid}&select=*`, { token })).body;
    mine?.length === 1 && mine[0].current_streak === 3 ? ok("loadStreak sees its own row") : bad("loadStreak", JSON.stringify(mine));

    const sch = (await rest(`review_schedule?user_id=eq.${uid}&lesson_id=eq.${lesson.id}&select=pool_item_id,ease,interval_days,reps,due_on&limit=2000`, { token })).body;
    sch?.length === 1 ? ok("loadSchedule sees its own row") : bad("loadSchedule", JSON.stringify(sch));

    const st = (await rest(`lesson_stage_state?user_id=eq.${uid}&lesson_id=eq.${lesson.id}&select=*`, { token })).body?.[0];
    st?.pratiquer_runs === 1 ? ok("stage state reads back runs") : bad("stage state runs", JSON.stringify(st));

    // ── RLS: another learner's rows ───────────────────────────────────────
    console.log("\nRLS — one learner cannot reach another's progress:");
    const other = "00000000-0000-4000-8000-00000000dead";
    const peek = await rest(`user_streak?user_id=eq.${other}&select=*`, { token });
    (peek.body || []).length === 0 ? ok("cannot read another user's streak")
                                   : bad("cannot read another user's streak", peek.raw);

    // A policy with USING but no WITH CHECK would let this through.
    const forge = await rest("user_streak", { token, method: "POST", prefer: "return=minimal",
      body: [{ user_id: other, current_streak: 999, longest_streak: 999, last_day: today }] });
    forge.status >= 400 ? ok("cannot write a row for another user", `${forge.status}`)
                        : bad("cannot write a row for another user", "the insert SUCCEEDED — check WITH CHECK on the policy");
    if (forge.status < 400) await rest(`user_streak?user_id=eq.${other}`, { service: true, method: "DELETE" });

    // Anon holds no session at all.
    const anon = await rest(`user_streak?select=*`, {});
    (anon.body || []).length === 0 ? ok("anonymous request sees nothing") : bad("anonymous request sees nothing", anon.raw);

  } finally {
    await cleanup();
    console.log("\nfixtures cleaned up.");
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
};

main().catch((e) => { console.error(e); process.exit(1); });
