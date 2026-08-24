import { authorizeApiRequest } from "./_auth.js";
import { checkRateLimit, getClientIp, setCorsHeaders } from "./_rate-limit.js";
import { supabaseServiceHeaders } from "./_supabase.js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://haioiccujncsehadipzb.supabase.co";
const LIMIT = 20;
const WINDOW_MS = 60 * 60 * 1000;
const TYPES = new Set(["incorrect", "partial", "missing", "routing"]);

const clean = (value, max) => typeof value === "string" ? value.trim().slice(0, max) : null;

export default async function handler(req, res) {
  setCorsHeaders(res, req);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!checkRateLimit(getClientIp(req), { limit: LIMIT, windowMs: WINDOW_MS })) {
    return res.status(429).json({ error: "Trop de signalements. Réessayez plus tard." });
  }

  const user = await authorizeApiRequest(req, res, { scope: "corrections", limit: LIMIT, windowMs: WINDOW_MS });
  if (!user) return;

  const languageId = Number(req.body?.language_id);
  const correctionType = clean(req.body?.correction_type, 32);
  if (!Number.isInteger(languageId) || languageId <= 0 || !TYPES.has(correctionType)) {
    return res.status(400).json({ error: "Invalid correction" });
  }

  const row = {
    language_id: languageId,
    user_query: clean(req.body.user_query, 2000),
    ai_response: clean(req.body.ai_response, 5000),
    correction_type: correctionType,
    correct_lingala: clean(req.body.correct_lingala, 2000),
    correct_french: clean(req.body.correct_french, 2000),
    example_sentence: clean(req.body.example_sentence, 2000),
    tester_name: clean(req.body.tester_name, 80),
    session_id: clean(req.body.session_id, 120),
    submitted_by: user.id,
    status: "pending",
  };

  try {
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!key) throw new Error("Missing Supabase service configuration");
    const response = await fetch(`${SUPABASE_URL}/rest/v1/corrections`, {
      method: "POST",
      headers: {
        ...supabaseServiceHeaders(key),
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
    });
    if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
    return res.status(201).json({ ok: true });
  } catch (error) {
    console.error("corrections:", error);
    return res.status(500).json({ error: "Signalement non enregistré" });
  }
}
