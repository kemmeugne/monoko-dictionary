/**
 * /api/mms-tts.js
 * Proxy for Kemz42/monoko-lingala-tts HuggingFace Space.
 * Model: DigitalUmuganda/lingala_vits_tts (ESPnet2 VITS, 71.6h native Lingala speech)
 * Source: tts_space/app.py in this repo.
 *
 * GET  /api/mms-tts           → warm-up ping (fires when live translation view opens)
 * POST /api/mms-tts { text }  → audio binary (WAV)
 *
 * Requires env var: MMS_SPACE_URL (set in Vercel)
 *   e.g. https://kemz42-monoko-lingala-tts.hf.space
 *
 * On timeout / Space sleeping: { error: "space_unavailable" } (HTTP 503)
 * Client shows "Audio en chargement…" text fallback.
 *
 * TODO: ElevenLabs Lingala TTS has English accent bias.
 * Future plan: fine-tune VITS model on native Lingala recordings (Borgeas studio sessions)
 * and host on our own HuggingFace Space. No pre-trained Lingala TTS model exists publicly.
 * → Current model (DigitalUmuganda) is a step in the right direction (71.6h Lingala).
 */

const SPACE_URL = process.env.MMS_SPACE_URL || "";
const FN = "synthesise"; // matches api_name in tts_space/app.py

export const maxDuration = 60;

export default async function handler(req, res) {

  // ── Warm-up ping ────────────────────────────────────────────────────────────
  if (req.method === "GET") {
    if (!SPACE_URL) return res.status(200).json({ status: "no_space_url" });
    try {
      const r = await fetch(`${SPACE_URL}/`, { signal: AbortSignal.timeout(8000) });
      return res.status(200).json({ status: r.ok ? "ok" : "loading" });
    } catch {
      return res.status(200).json({ status: "warming" });
    }
  }

  if (req.method !== "POST") return res.status(405).end();

  if (!SPACE_URL) {
    return res.status(500).json({ error: "MMS_SPACE_URL not configured on server." });
  }

  const { text } = req.body || {};
  if (!text?.trim()) return res.status(400).json({ error: "No text provided" });

  try {
    // ── Step 1: start Gradio prediction ─────────────────────────────────────
    const startRes = await fetch(`${SPACE_URL}/call/${FN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: [text.trim()] }),
      signal: AbortSignal.timeout(15000),
    });

    if (!startRes.ok) {
      console.error(`Space /call/${FN} error:`, startRes.status, (await startRes.text()).slice(0, 200));
      return res.status(503).json({ error: "space_unavailable" });
    }

    const { event_id } = await startRes.json();
    if (!event_id) return res.status(503).json({ error: "space_unavailable" });

    // ── Step 2: poll SSE until process_completed ─────────────────────────────
    const sseRes = await fetch(`${SPACE_URL}/call/${FN}/${event_id}`, {
      signal: AbortSignal.timeout(45000),
    });
    const sseText = await sseRes.text();
    const audioSrc = parseSSEAudio(sseText);

    if (!audioSrc) {
      console.error("Space: no audio in SSE:", sseText.slice(0, 500));
      return res.status(503).json({ error: "space_unavailable" });
    }

    // ── Step 3: fetch audio and forward to client ────────────────────────────
    const audioUrl = audioSrc.startsWith("http") ? audioSrc : `${SPACE_URL}/file=${audioSrc}`;
    const audioRes = await fetch(audioUrl, { signal: AbortSignal.timeout(10000) });
    if (!audioRes.ok) return res.status(503).json({ error: "space_unavailable" });

    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
    res.setHeader("Content-Type", audioRes.headers.get("content-type") || "audio/wav");
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.send(audioBuffer);

  } catch (err) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      console.log("Space timeout — may be waking up");
      return res.status(503).json({ error: "space_unavailable" });
    }
    console.error("MMS-TTS exception:", err);
    return res.status(500).json({ error: err.message });
  }
}

export function parseSSEAudio(sseText) {
  const lines = sseText.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes("process_completed")) continue;
    for (let j = i + 1; j < lines.length; j++) {
      if (!lines[j].startsWith("data: ")) continue;
      try {
        const payload = JSON.parse(lines[j].slice(6));
        const d = payload.output?.data ?? payload.data;
        if (!Array.isArray(d) || !d[0]) return null;
        const a = d[0];
        if (typeof a === "string") return a;
        if (a?.url)  return a.url;
        if (a?.path) return a.path;
        if (a?.name) return a.name;
      } catch { /* keep scanning */ }
    }
  }
  return null;
}
