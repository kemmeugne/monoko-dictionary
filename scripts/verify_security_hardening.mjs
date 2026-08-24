#!/usr/bin/env node

import { supabaseServiceHeaders } from "../api/_supabase.js";

const TEST_PROJECT_REF = "bdejouumyzovfirqxmdr";
const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;
const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;

if (!url || !anonKey || !serviceKey || !email || !password) {
  throw new Error("SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY, TEST_USER_EMAIL and TEST_USER_PASSWORD are required");
}
if (new URL(url).hostname.split(".")[0] !== TEST_PROJECT_REF) {
  throw new Error(`Refusing to run outside monoko-test (${TEST_PROJECT_REF})`);
}

const json = async response => {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(body)}`);
  return body;
};

const auth = await json(await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: anonKey, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
}));
const userToken = auth.access_token;
const userId = auth.user.id;
const userHeaders = { apikey: anonKey, Authorization: `Bearer ${userToken}`, "Content-Type": "application/json" };

const pool = await json(await fetch(`${url}/rest/v1/lesson_pool?select=id,lesson_id&tier=eq.native&order=id&limit=1`, { headers: userHeaders }));
if (!pool[0]) throw new Error("Test seed has no native lesson_pool row");

const sessionId = crypto.randomUUID();
const session = await json(await fetch(`${url}/rest/v1/rpc/record_learning_session`, {
  method: "POST",
  headers: userHeaders,
  body: JSON.stringify({
    p_session_id: sessionId,
    p_lesson_id: pool[0].lesson_id,
    p_language_id: 1,
    p_stage: "pratiquer",
    p_completed: false,
    p_attempts: [{ pool_item_id: pool[0].id, format: "choose_audio", correct: true, scored: true }],
    p_schedule: [],
    p_local_day: new Date().toLocaleDateString("en-CA"),
  }),
}));
if (!session.recorded || session.xp !== 0) throw new Error(`Unexpected session receipt: ${JSON.stringify(session)}`);

const duplicateAttempt = await fetch(`${url}/rest/v1/rpc/record_learning_session`, {
  method: "POST",
  headers: userHeaders,
  body: JSON.stringify({
    p_session_id: crypto.randomUUID(),
    p_lesson_id: pool[0].lesson_id,
    p_language_id: 1,
    p_stage: "pratiquer",
    p_completed: true,
    p_attempts: [
      { pool_item_id: pool[0].id, format: "choose_audio", correct: true, scored: true },
      { pool_item_id: pool[0].id, format: "choose_audio", correct: true, scored: true },
    ],
    p_schedule: [],
    p_local_day: new Date().toLocaleDateString("en-CA"),
  }),
});
if (duplicateAttempt.ok) throw new Error("Trusted session RPC accepted a duplicate item-format pair");

const forgedXp = await fetch(`${url}/rest/v1/user_xp_events`, {
  method: "POST",
  headers: userHeaders,
  body: JSON.stringify({ user_id: userId, language_id: 1, stage: "pratiquer", xp: 1000, event_key: crypto.randomUUID() }),
});
if (forgedXp.ok) throw new Error("Authenticated browser role can still mint XP directly");

const privateCorrections = await json(await fetch(`${url}/rest/v1/corrections?select=id&limit=1`, { headers: userHeaders }));
if (privateCorrections.length !== 0) throw new Error("Authenticated browser role can read corrections");

const anonCorrections = await json(await fetch(`${url}/rest/v1/corrections?select=id&limit=1`, {
  headers: { apikey: anonKey },
}));
if (anonCorrections.length !== 0) throw new Error("Anonymous browser role can read corrections");

const changedCountry = await fetch(`${url}/rest/v1/profiles?user_id=eq.${userId}`, {
  method: "PATCH",
  headers: { ...userHeaders, Prefer: "return=representation" },
  body: JSON.stringify({ country_code: "ZZ" }),
});
if (changedCountry.ok) throw new Error("Country immutability trigger did not reject a change");

const serviceHeaders = { ...supabaseServiceHeaders(serviceKey), "Content-Type": "application/json" };
const quotaScope = `verification-${crypto.randomUUID().slice(0, 8)}`;
const consumeQuota = async () => json(await fetch(`${url}/rest/v1/rpc/check_api_quota`, {
  method: "POST",
  headers: serviceHeaders,
  body: JSON.stringify({ p_user_id: userId, p_scope: quotaScope, p_limit: 2, p_window_seconds: 60 }),
}));
if (await consumeQuota() !== true || await consumeQuota() !== true || await consumeQuota() !== false) {
  throw new Error("Durable quota did not enforce its configured limit");
}

console.log("Security hardening verified against monoko-test: trusted session validation, XP denial, private corrections, fixed country, durable quota.");
