/**
 * /api/mms-tts.js
 * Calls the facebook/mms HuggingFace Space via Gradio 4.x API for Lingala TTS.
 *
 * GET  /api/mms-tts           → warm-up ping (fire when live translation view opens)
 * POST /api/mms-tts { text }  → audio binary (wav/flac/mp3 depending on Space output)
 *
 * Flow:
 *   1. POST /call/synthesise → { event_id }
 *   2. GET  /call/synthesise/{event_id} → SSE stream → audio path/URL
 *   3. GET  audio file → forward bytes to client
 *
 * On timeout or Space sleeping: returns { error: "space_unavailable" } (HTTP 503)
 * so the client can show "Audio en chargement, réessayez dans quelques secondes".
 *
 * ElevenLabs fallback: see api/elevenlabs-tts.js (English accent, but reliable).
 *
 * Future: replace with a fine-tuned VITS model on professor recordings.
 */

// ── Previous approach (HuggingFace Inference API) — NOT supported for MMS models ──
// const HF_MODEL = "facebook/mms-tts-lin";
// const HF_URL   = `https://router.huggingface.co/hf-inference/models/${HF_MODEL}`;
// → Returns: {"error":"Model not supported by provider hf-inference"}

const SPACE = "https://facebook-mms.hf.space";
const LANG  = "lin-script_latin"; // Lingala, Latin script

// Vercel Pro: extend timeout to 60s so Space cold-starts don't abort the function.
// On Hobby plan this is ignored but the warm-up ping reduces cold-start risk.
export const maxDuration = 60;

export default async function handler(req, res) {

  // ── Warm-up ping ────────────────────────────────────────────────────────────
  // Client fires GET /api/mms-tts when live translation view mounts so the
  // Gradio Space wakes up before the user actually needs audio.
  if (req.method === "GET") {
    try {
      const r = await fetch(`${SPACE}/`, {
        signal: AbortSignal.timeout(8000),
        headers: { Accept: "text/html" },
      });
      return res.status(200).json({ status: r.ok ? "ok" : "loading", code: r.status });
    } catch {
      return res.status(200).json({ status: "warming" });
    }
  }

  if (req.method !== "POST") return res.status(405).end();

  const { text } = req.body || {};
  if (!text?.trim()) return res.status(400).json({ error: "No text provided" });

  try {
    // ── Step 1: Start Gradio prediction ─────────────────────────────────────
    const startRes = await fetch(`${SPACE}/call/synthesise`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: [text.trim(), LANG] }),
      signal: AbortSignal.timeout(15000),
    });

    if (!startRes.ok) {
      const err = await startRes.text();
      console.error("MMS Space start error:", startRes.status, err.slice(0, 300));
      return res.status(503).json({ error: "space_unavailable" });
    }

    const { event_id } = await startRes.json();
    if (!event_id) {
      console.error("MMS Space: no event_id in response");
      return res.status(503).json({ error: "space_unavailable" });
    }

    // ── Step 2: Poll SSE stream until process_completed ──────────────────────
    const sseRes = await fetch(`${SPACE}/call/synthesise/${event_id}`, {
      signal: AbortSignal.timeout(45000),
    });

    const sseText = await sseRes.text();
    const audioSrc = parseSSEAudio(sseText);

    if (!audioSrc) {
      console.error("MMS Space: no audio extracted. SSE snippet:", sseText.slice(0, 500));
      return res.status(503).json({ error: "space_unavailable" });
    }

    // ── Step 3: Fetch the audio file and forward to client ───────────────────
    // Gradio returns either an absolute URL or a relative /file= path.
    const audioUrl = audioSrc.startsWith("http")
      ? audioSrc
      : `${SPACE}/file=${audioSrc}`;

    const audioRes = await fetch(audioUrl, { signal: AbortSignal.timeout(10000) });
    if (!audioRes.ok) {
      console.error("MMS Space: audio fetch failed", audioRes.status);
      return res.status(503).json({ error: "space_unavailable" });
    }

    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
    const ct = audioRes.headers.get("content-type") || "audio/wav";

    res.setHeader("Content-Type", ct);
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.send(audioBuffer);

  } catch (err) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      console.log("MMS Space timeout — Space may be waking up");
      return res.status(503).json({ error: "space_unavailable" });
    }
    console.error("MMS-TTS exception:", err);
    return res.status(500).json({ error: err.message });
  }
}

/**
 * Parse a Gradio 4.x SSE stream text for the audio output.
 * Looks for the `process_completed` event and extracts data[0] (the audio).
 * Returns a string (URL, data URI, or relative path) or null if not found.
 */
function parseSSEAudio(sseText) {
  const lines = sseText.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes("process_completed")) continue;
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (!line.startsWith("data: ")) continue;
      try {
        const payload = JSON.parse(line.slice(6));
        // Gradio 4.x: output.data[] or data[] (older shape)
        const d = payload.output?.data ?? payload.data;
        if (!Array.isArray(d) || !d[0]) return null;
        const a = d[0];
        if (typeof a === "string") return a;  // data URI or path
        if (a?.url)  return a.url;
        if (a?.path) return a.path;
        if (a?.name) return a.name;           // prefixed with /file= below
      } catch { /* keep scanning */ }
    }
  }
  return null;
}
