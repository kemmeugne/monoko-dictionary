import { authenticatedUser } from "./_auth.js";
import { checkRateLimit, getClientIp, setCorsHeaders } from "./_rate-limit.js";
import { supabaseServiceHeaders } from "./_supabase.js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://haioiccujncsehadipzb.supabase.co";
const LIMIT = 240;
const WINDOW_MS = 60 * 60 * 1000;
const EVENTS = new Set(["translation", "playback"]);
const DIRECTIONS = new Set(["fr_to_lingala", "lingala_to_fr"]);
const INPUT_MODES = new Set(["speech", "text", "edit"]);
const OUTCOMES = new Set(["success", "failure"]);
const FAILURE_STAGES = new Set(["capture", "stt", "context", "translation", "tts"]);
const LENGTH_BUCKETS = new Set(["1-25", "26-75", "76-150", "151+"]);
const AUDIO_BUCKETS = new Set(["0-3s", "3-7s", "7-15s", "15s+"]);
const FORBIDDEN_FIELDS = new Set(["audio", "text", "source", "transcript", "translation", "messages", "ragContext", "lessonContext"]);

const enumValue = (value, allowed) => allowed.has(value) ? value : null;
const timing = value => Number.isInteger(value) && value >= 0 && value <= 120_000 ? value : null;
const cleanCode = value => typeof value === "string" && /^[a-z0-9_-]{1,64}$/i.test(value) ? value : null;
const cleanEventId = value => typeof value === "string" && /^[a-z0-9-]{12,80}$/i.test(value) ? value : null;

export default async function handler(req, res) {
  setCorsHeaders(res, req);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error:"Method not allowed" });
  if (!checkRateLimit(getClientIp(req), { limit:LIMIT, windowMs:WINDOW_MS })) {
    return res.status(429).json({ error:"Trop de requêtes" });
  }

  const user = await authenticatedUser(req);
  if (!user) return res.status(401).json({ error:"Authentication required" });
  const body = req.body || {};
  if (Object.keys(body).some(key => FORBIDDEN_FIELDS.has(key))) {
    return res.status(400).json({ error:"Conversation content is not accepted by telemetry" });
  }

  const eventId = cleanEventId(body.event_id);
  const languageId = Number(body.language_id);
  const eventType = enumValue(body.event_type, EVENTS);
  const direction = enumValue(body.direction, DIRECTIONS);
  const inputMode = enumValue(body.input_mode, INPUT_MODES);
  const outcome = enumValue(body.outcome, OUTCOMES);
  if (!eventId || !Number.isInteger(languageId) || languageId <= 0 || !eventType || !direction || !inputMode || !outcome) {
    return res.status(400).json({ error:"Invalid telemetry event" });
  }

  const row = {
    event_id:eventId,
    user_id:user.id,
    language_id:languageId,
    event_type:eventType,
    direction,
    input_mode:inputMode,
    outcome,
    failure_stage:enumValue(body.failure_stage, FAILURE_STAGES),
    failure_code:cleanCode(body.failure_code),
    source_length_bucket:enumValue(body.source_length_bucket, LENGTH_BUCKETS),
    audio_duration_bucket:enumValue(body.audio_duration_bucket, AUDIO_BUCKETS),
    capture_ms:timing(body.capture_ms),
    stt_ms:timing(body.stt_ms),
    context_ms:timing(body.context_ms),
    translation_ms:timing(body.translation_ms),
    tts_ms:timing(body.tts_ms),
  };
  if (outcome === "success") { row.failure_stage = null; row.failure_code = null; }

  try {
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!key) throw new Error("Missing Supabase service configuration");
    const response = await fetch(`${SUPABASE_URL}/rest/v1/live_translation_events`, {
      method:"POST",
      headers:{ ...supabaseServiceHeaders(key), "Content-Type":"application/json", Prefer:"return=minimal" },
      body:JSON.stringify(row),
    });
    if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
    return res.status(201).json({ ok:true });
  } catch (error) {
    console.error("live-translation-events:", error);
    return res.status(503).json({ error:"Telemetry unavailable" });
  }
}
