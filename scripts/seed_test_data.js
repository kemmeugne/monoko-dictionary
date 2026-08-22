#!/usr/bin/env node
/**
 * Seeds the Monoko test Supabase project (HARNESS_SPRINT.md Session 1).
 *
 * Idempotent: wipes every table it touches and re-inserts, every run.
 * Hard-refuses to run against anything but the known test project ref —
 * this can never point at production, even with a stale/wrong env var.
 *
 * Also ensures a test Auth user exists (via the Admin API), rather than
 * requiring it to be created by hand in the dashboard — re-running this
 * script is the whole Session 1 setup, no manual dashboard step needed
 * beyond creating the project itself.
 *
 * Usage:
 *   set -a && source .env.test && set +a && node scripts/seed_test_data.js
 *
 * Required env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY, TEST_USER_EMAIL,
 * TEST_USER_PASSWORD. No credential defaults are hardcoded here on purpose —
 * even for a disposable test project, a literal password fallback in a
 * committed file is exactly what Session 4's guardrail lint is meant to
 * catch. Set real values in .env.test (gitignored).
 */

const TEST_PROJECT_REF = "bdejouumyzovfirqxmdr"; // monoko-test

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;

if (!SUPABASE_URL || !SERVICE_KEY || !TEST_USER_EMAIL || !TEST_USER_PASSWORD) {
  console.error(
    "Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY, TEST_USER_EMAIL, TEST_USER_PASSWORD."
  );
  process.exit(1);
}

const urlRef = new URL(SUPABASE_URL).hostname.split(".")[0];
if (urlRef !== TEST_PROJECT_REF) {
  console.error(
    `Refusing to run: SUPABASE_URL points at project ref "${urlRef}", expected the test project ref "${TEST_PROJECT_REF}".\n` +
    `This script will only ever run against the known test project, never production.`
  );
  process.exit(1);
}

function headers() {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
}

async function rest(method, table, { body, query = "", prefer = "return=minimal" } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
    method,
    headers: { ...headers(), Prefer: prefer },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`${method} ${table} failed: ${res.status} ${await res.text()}`);
  }
  return prefer.includes("return=representation") ? res.json() : null;
}

const wipe = (table, pkFilterCol = "id") => rest("DELETE", table, { query: `?${pkFilterCol}=not.is.null` });

// ── Auth: ensure the test user exists ───────────────────────────────────

async function ensureTestUser(email, password) {
  const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { display_name: "Test User" } }),
  });
  if (createRes.ok) {
    const user = await createRes.json();
    console.log(`Created test user ${email} (${user.id})`);
    return user.id;
  }

  // Already exists (409/422) — look it up instead of failing.
  const listRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, { headers: headers() });
  if (!listRes.ok) throw new Error(`Failed to list users: ${await listRes.text()}`);
  const body = await listRes.json();
  const users = Array.isArray(body) ? body : body.users;
  const existing = users.find((u) => u.email === email);
  if (!existing) {
    throw new Error(`User create failed and no existing user found for ${email}: ${await createRes.text()}`);
  }
  console.log(`Reusing existing test user ${email} (${existing.id})`);
  return existing.id;
}

// ── Seed content ─────────────────────────────────────────────────────────
// Core vocabulary is sourced directly from Monoko's own documented, in-repo
// examples (api/chat.js system prompt) — not invented for this script.
// Padded with clearly-synthetic rows to reach realistic volume for
// pagination/search/browse smoke tests.

const CORE_VOCAB = [
  { fr: "Bonjour", ln: "Mbote", letter: "B" },
  { fr: "Merci", ln: "Botondi", letter: "M" },
  { fr: "Père", ln: "Tata", letter: "P" },
  { fr: "Mère", ln: "Mama", letter: "M" },
  { fr: "Je", ln: "Ngai", letter: "J" },
  { fr: "Tu", ln: "Yo", letter: "T" },
  { fr: "Il/Elle", ln: "Ye", letter: "I" },
  { fr: "Nous", ln: "Biso", letter: "N" },
  { fr: "Vous", ln: "Bino", letter: "V" },
  { fr: "Ils/Elles", ln: "Bango", letter: "I" },
  { fr: "Manger", ln: "Kolia", letter: "M" },
  { fr: "Aller", ln: "Kokende", letter: "A" },
  { fr: "Marché", ln: "Zando", letter: "M" },
  { fr: "Demain", ln: "Lobi", letter: "D" },
  { fr: "Aujourd'hui", ln: "Lelo", letter: "A" },
  { fr: "Fatigué", ln: "Alembi", letter: "F" },
  { fr: "Bien", ln: "Malamu", letter: "B" },
  { fr: "Un", ln: "Moko", letter: "U" },
  { fr: "Deux", ln: "Mibale", letter: "D" },
  { fr: "Trois", ln: "Misato", letter: "T" },
  { fr: "Quatre", ln: "Minei", letter: "Q" },
  { fr: "Cinq", ln: "Mitano", letter: "C" },
  { fr: "Eau", ln: "Mayi", letter: "E" },
  { fr: "Maison", ln: "Ndako", letter: "M" },
  { fr: "École", ln: "Kelasi", letter: "E" },
];

const SYNTHETIC_COUNT = 175; // brings dictionary volume to ~200 entries total
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function syntheticWords() {
  return Array.from({ length: SYNTHETIC_COUNT }, (_, i) => {
    const n = i + 1;
    return {
      fr: `Mot de test ${n}`,
      ln: `Liloba ya komeka ${n}`,
      letter: LETTERS[n % LETTERS.length],
    };
  });
}

function fakeAudioUrl(letter, key) {
  // Well-formed R2-style URL that won't resolve to a real file. Sufficient
  // for the Playwright smoke test's <audio> element/src/play() checks,
  // which explicitly do not assert real sound output (see HARNESS_SPRINT.md
  // Section 6, item 4).
  return `https://pub-78d23bf07fce46b3adc19df91148ffb8.r2.dev/Lingala/senses/${letter}/${key}.mp3`;
}

async function main() {
  console.log(`Seeding test project (${TEST_PROJECT_REF})...`);

  // ── Wipe, children first ────────────────────────────────────────────
  console.log("Wiping existing seed data...");
  await wipe("app_developers", "user_id");
  await wipe("lesson_reward_claims", "user_id");
  await wipe("user_culture_rewards", "user_id");
  await wipe("level_challenge_state", "user_id");
  await wipe("user_level_rewards", "user_id");
  await wipe("user_xp_events");
  await wipe("lesson_stage_state", "user_id");
  await wipe("user_streak", "user_id");
  await wipe("user_progress");
  await wipe("profiles", "user_id");
  await wipe("chat_events");
  await wipe("corrections");
  await wipe("examples");
  await wipe("senses");
  await wipe("words");
  await wipe("lesson_items");
  await wipe("lessons");
  await wipe("courses");
  await wipe("parallel_sentences");
  await wipe("languages");

  // ── languages ────────────────────────────────────────────────────────
  await rest("POST", "languages", {
    body: [
      { id: 1, name: "Lingala", code: "lin", status: "active" },
      { id: 2, name: "Yoruba", code: "yor", status: "active" },
    ],
  });

  // ── words / senses / examples ───────────────────────────────────────
  const allVocab = [...CORE_VOCAB, ...syntheticWords()];

  const words = await rest("POST", "words", {
    body: allVocab.map((v) => ({ language_id: 1, french_word: v.fr, letter: v.letter })),
    prefer: "return=representation",
  });

  const senses = await rest("POST", "senses", {
    // PostgREST's bulk insert requires every object in the array to have the
    // same keys (PGRST102 otherwise) — always include the audio_* keys,
    // null when unused, rather than conditionally spreading them in.
    body: words.map((w, i) => {
      const v = allVocab[i];
      const withAudio = i % 3 === 0; // every 3rd entry gets audio, incl. some CORE_VOCAB entries
      return {
        word_id: w.id,
        sense_number: 1,
        dialect_word: v.ln,
        audio_url: withAudio ? fakeAudioUrl(v.letter, `${v.letter}.SEED${i}`) : null,
        audio_key: withAudio ? `Lingala/senses/${v.letter}/${v.letter}.SEED${i}.mp3` : null,
        audio_source_cell: withAudio ? `SEED.${i}` : null,
      };
    }),
    prefer: "return=representation",
  });

  // Examples on the real CORE_VOCAB senses only (first N senses correspond to CORE_VOCAB, same order).
  await rest("POST", "examples", {
    body: senses.slice(0, CORE_VOCAB.length).map((s, i) => {
      const v = CORE_VOCAB[i];
      return {
        sense_id: s.id,
        sentence_french: `${v.fr} à toi aussi.`,
        sentence_dialect: `${v.ln} na yo pe.`,
      };
    }),
  });

  // ── parallel_sentences (RAG corpus) ─────────────────────────────────
  await rest("POST", "parallel_sentences", {
    body: [
      ...CORE_VOCAB.map((v) => ({
        language_id: 1,
        french_text: v.fr,
        lingala_text: v.ln,
        source: "seed_script",
        quality: "verified",
      })),
      ...syntheticWords()
        .slice(0, 20)
        .map((v) => ({
          language_id: 1,
          french_text: v.fr,
          lingala_text: v.ln,
          source: "seed_script",
          quality: "auto",
        })),
    ],
  });

  // ── corrections + chat_events (so admin/tester views aren't empty) ──
  // Same PGRST102 constraint as senses/lesson_items: every row needs
  // identical keys, null where a given row doesn't use that field.
  await rest("POST", "corrections", {
    body: [
      {
        language_id: 1,
        user_query: "Comment dit-on bonjour ?",
        ai_response: "Mbote ~",
        correction_type: "partial",
        correct_lingala: "Mbote",
        correct_french: "Bonjour",
        example_sentence: "Mbote na yo.",
        tester_name: "Seed Tester",
        session_id: "seed-session-1",
        status: "pending",
        professor_modified: null,
        reviewed_at: null,
      },
      {
        language_id: 1,
        user_query: "Comment dit-on merci beaucoup ?",
        ai_response: "Botondi mingi",
        correction_type: "missing",
        correct_lingala: "Botondi mingi",
        correct_french: "Merci beaucoup",
        example_sentence: null,
        tester_name: "Seed Tester",
        session_id: "seed-session-1",
        status: "approved",
        professor_modified: false,
        reviewed_at: new Date().toISOString(),
      },
      {
        language_id: 1,
        user_query: "Comment dit-on au revoir ?",
        ai_response: "Kende malamu te",
        correction_type: "incorrect",
        correct_lingala: "Kende malamu",
        correct_french: "Au revoir",
        example_sentence: null,
        tester_name: "Seed Tester",
        session_id: "seed-session-1",
        status: "rejected",
        professor_modified: null,
        reviewed_at: new Date().toISOString(),
      },
    ],
  });

  await rest("POST", "chat_events", {
    body: [
      {
        tester_name: "Seed Tester",
        session_id: "seed-session-1",
        language_id: 1,
        user_query: "Comment dit-on bonjour ?",
        assistant_response: "Mbote ✓",
        message_count: 1,
        t_rag_ms: 320,
        t_llm_ms: 890,
      },
      {
        tester_name: "Seed Tester",
        session_id: "seed-session-1",
        language_id: 1,
        user_query: "Comment dit-on merci ?",
        assistant_response: "Botondi ✓",
        message_count: 2,
        t_rag_ms: 280,
        t_llm_ms: 760,
      },
    ],
  });

  // ── courses / lessons / lesson_items ────────────────────────────────
  const courses = await rest("POST", "courses", {
    body: [
      { language_id: 1, title: "Niveau 1 — Fondations", icon: "🌱", course_order: 1 },
      { language_id: 1, title: "Niveau 2 — Vie quotidienne", icon: "🏠", course_order: 2 },
    ],
    prefer: "return=representation",
  });

  const lessons = await rest("POST", "lessons", {
    body: [
      { course_id: courses[0].id, title: "Salutations et politesse", lesson_order: 1 },
      { course_id: courses[0].id, title: "Présentation personnelle", lesson_order: 2 },
      { course_id: courses[1].id, title: "La famille", lesson_order: 1 },
    ],
    prefer: "return=representation",
  });

  const lessonItemRows = [
    { lesson_id: lessons[0].id, french: "Bonjour", dialect: "Mbote", example_french: "Bonjour à tous.", example_dialect: "Mbote na bino nyonso.", item_order: 1, withAudio: true },
    { lesson_id: lessons[0].id, french: "Merci", dialect: "Botondi", item_order: 2, withAudio: true },
    { lesson_id: lessons[0].id, french: "Au revoir", dialect: "Kende malamu", item_order: 3, withAudio: false },
    { lesson_id: lessons[1].id, french: "Je", dialect: "Ngai", item_order: 1, withAudio: true },
    { lesson_id: lessons[1].id, french: "Tu", dialect: "Yo", item_order: 2, withAudio: false },
    { lesson_id: lessons[2].id, french: "Père", dialect: "Tata", example_french: "Mon père va bien.", example_dialect: "Tata na ngai azali malamu.", item_order: 1, withAudio: true },
    { lesson_id: lessons[2].id, french: "Mère", dialect: "Mama", item_order: 2, withAudio: false },
  ];

  const lessonItems = await rest("POST", "lesson_items", {
    // `?? null` matters here: JSON.stringify silently drops keys whose value
    // is `undefined` (unlike explicit `null`), which would reproduce the
    // same PGRST102 "keys must match" error across rows that don't set
    // example_french/example_dialect.
    body: lessonItemRows.map((r, i) => ({
      lesson_id: r.lesson_id,
      french: r.french,
      dialect: r.dialect,
      example_french: r.example_french ?? null,
      example_dialect: r.example_dialect ?? null,
      item_order: r.item_order,
      audio_url: r.withAudio ? fakeAudioUrl("L", `LESSON.SEED${i}`) : null,
      audio_key: r.withAudio ? `Lingala/lessons/L.SEED${i}.mp3` : null,
      audio_source_cell: r.withAudio ? `LESSON.SEED.${i}` : null,
    })),
    prefer: "return=representation",
  });

  await rest("POST", "lesson_pool", {
    body: lessonItems.map((item, i) => ({
      language_id: 1,
      lesson_id: item.lesson_id,
      source_table: "lesson_items",
      source_id: item.id,
      french: item.french,
      lingala: item.dialect,
      audio_url: item.audio_url,
      tier: "native",
      token_count: Math.max(item.french.trim().split(/\s+/).length, item.dialect.trim().split(/\s+/).length),
      orthography: "toned",
      level: item.lesson_id === lessons[2].id ? 2 : 1,
      difficulty: 1,
      effective_level: item.lesson_id === lessons[2].id ? 2 : 1,
    })),
  });

  // ── Auth user + profile + progress ──────────────────────────────────
  const userId = await ensureTestUser(TEST_USER_EMAIL, TEST_USER_PASSWORD);

  await rest("POST", "app_developers", {
    body: { user_id: userId },
  });

  await rest("POST", "profiles", {
    body: {
      user_id: userId,
      display_name: "Test User",
      preferred_language_id: 1,
      public_pseudonym: "MonokoTest",
      country_code: "CA",
      leaderboard_opt_in: true,
    },
  });

  await rest("POST", "user_progress", {
    body: [
      { user_id: userId, lesson_id: lessons[0].id, language_id: 1, completed_at: new Date().toISOString() },
      { user_id: userId, lesson_id: lessons[1].id, language_id: 1, completed_at: new Date().toISOString() },
    ],
  });

  await rest("POST", "lesson_stage_state", {
    body: [
      {
        user_id: userId, lesson_id: lessons[0].id, language_id: 1,
        pratiquer_passed: true, pratiquer_best: 90, elargir_best: 84,
        pratiquer_xp: 250, elargir_xp: 200, pratiquer_runs: 1, elargir_runs: 1,
      },
      {
        user_id: userId, lesson_id: lessons[1].id, language_id: 1,
        pratiquer_passed: true, pratiquer_best: 85, elargir_best: 0,
        pratiquer_xp: 200, elargir_xp: 0, pratiquer_runs: 1, elargir_runs: 0,
      },
    ],
  });

  await rest("POST", "user_streak", {
    body: {
      user_id: userId, current_streak: 4, longest_streak: 7,
      last_day: new Date().toISOString().slice(0, 10),
    },
  });

  await rest("POST", "user_xp_events", {
    body: [
      { user_id: userId, language_id: 1, lesson_id: lessons[0].id, stage: "pratiquer", xp: 250, event_key: "11111111-1111-4111-8111-111111111111" },
      { user_id: userId, language_id: 1, lesson_id: lessons[0].id, stage: "elargir", xp: 200, event_key: "22222222-2222-4222-8222-222222222222" },
      { user_id: userId, language_id: 1, lesson_id: lessons[1].id, stage: "pratiquer", xp: 200, event_key: "33333333-3333-4333-8333-333333333333" },
    ],
  });

  await rest("POST", "culture_capsules", {
    body: [
      {
        id: "seed-lingala-locuteurs", lesson_id: lessons[0].id, level: 1, sort_order: 1,
        title: "Le lingala, une langue qui voyage", region: "Les deux Congo",
        short_copy: "Le lingala est parle bien au-dela de Kinshasa et Brazzaville.",
        body_copy: "Le lingala relie des millions de personnes dans les deux Congo et au sein de nombreuses communautes de la diaspora.",
        icon: "globe", visual_key: "art-conversation", source_label: "Contenu de test",
        review_status: "draft", reward_xp: 50, is_published: true,
      },
      {
        id: "seed-rumba-congolaise", lesson_id: lessons[1].id, level: 1, sort_order: 2,
        title: "La rumba congolaise", region: "Kinshasa et Brazzaville",
        short_copy: "Une musique partagee entre les deux rives du fleuve Congo.",
        body_copy: "La rumba congolaise fait dialoguer guitare, danse et langues locales, dont le lingala.",
        icon: "music", visual_key: "art-rumba", source_label: "Contenu de test",
        review_status: "draft", reward_xp: 50, is_published: true,
      },
    ],
  });

  console.log("Seed complete.");
  console.log(`  languages: 2, words/senses: ${allVocab.length}, examples: ${CORE_VOCAB.length}`);
  console.log(`  courses: ${courses.length}, lessons: ${lessons.length}, lesson_items: ${lessonItemRows.length}`);
  console.log(`  corrections: 3, chat_events: 2, culture_capsules: 2`);
  console.log(`  test user: ${TEST_USER_EMAIL} / ${TEST_USER_PASSWORD} (${userId})`);
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
