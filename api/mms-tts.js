/**
 * /api/mms-tts.js
 * Calls the facebook/mms HuggingFace Space for Lingala TTS.
 *
 * GET  /api/mms-tts           → warm-up + returns Space /info (useful for debugging)
 * POST /api/mms-tts { text }  → audio binary
 *
 * Tries Gradio 4.x named API first (/call/{fn}), then falls back to
 * Gradio 3.x (/run/predict with fn_index:1) if the named endpoint 404s.
 *
 * On timeout or unavailable: { error: "space_unavailable" } (HTTP 503)
 * ElevenLabs fallback: api/elevenlabs-tts.js (English accent, but reliable)
 *
 * ── Previous approach (HuggingFace Inference API) — NOT supported for MMS ──
 * const HF_URL = `https://router.huggingface.co/hf-inference/models/facebook/mms-tts-lin`;
 * → {"error":"Model not supported by provider hf-inference"}
 */

const SPACE = "https://facebook-mms.hf.space";
const LANG  = "lin-script_latin"; // Lingala, Latin script

// Vercel Pro: extend to 60s for Space cold-starts
export const maxDuration = 60;

export default async function handler(req, res) {

  // ── Warm-up / debug ping ───────────────────────────────────────────────────
  // Returns the Space's /info so we can see available functions & parameters.
  if (req.method === "GET") {
    try {
      const [pingRes, infoRes] = await Promise.allSettled([
        fetch(`${SPACE}/`, { signal: AbortSignal.timeout(8000) }),
        fetch(`${SPACE}/info`, { signal: AbortSignal.timeout(8000) }),
      ]);
      const info = infoRes.status === "fulfilled" && infoRes.value.ok
        ? await infoRes.value.json().catch(() => null)
        : null;
      return res.status(200).json({
        status: pingRes.status === "fulfilled" && pingRes.value.ok ? "ok" : "loading",
        space_info: info,
      });
    } catch {
      return res.status(200).json({ status: "warming" });
    }
  }

  if (req.method !== "POST") return res.status(405).end();

  const { text } = req.body || {};
  if (!text?.trim()) return res.status(400).json({ error: "No text provided" });

  try {
    // ── Strategy 1: Gradio 4.x named API ──────────────────────────────────────
    // Tries common TTS function names used in the facebook/mms Space.
    const fnNames = ["synthesise", "synthesize", "predict", "tts"];
    let audioBuffer = null;
    let contentType = "audio/wav";

    for (const fn of fnNames) {
      const startRes = await fetch(`${SPACE}/call/${fn}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: [text.trim(), LANG] }),
        signal: AbortSignal.timeout(10000),
      });

      if (startRes.status === 404) continue; // wrong name, try next

      if (!startRes.ok) {
        const err = await startRes.text();
        console.error(`MMS /call/${fn} error:`, startRes.status, err.slice(0, 200));
        break;
      }

      const { event_id } = await startRes.json().catch(() => ({}));
      if (!event_id) { console.error(`MMS /call/${fn}: no event_id`); break; }

      console.log(`MMS: using Gradio 4.x fn="${fn}" event_id=${event_id}`);

      const sseRes = await fetch(`${SPACE}/call/${fn}/${event_id}`, {
        signal: AbortSignal.timeout(45000),
      });
      const sseText = await sseRes.text();
      const audioSrc = parseSSEAudio(sseText);

      if (!audioSrc) {
        console.error(`MMS: no audio in SSE for fn="${fn}":`, sseText.slice(0, 400));
        break;
      }

      if (audioSrc.startsWith("data:")) {
        // Data URI — decode inline
        contentType = audioSrc.split(";")[0].slice(5) || "audio/wav";
        audioBuffer = Buffer.from(audioSrc.split(",")[1], "base64");
      } else {
        const audioUrl = audioSrc.startsWith("http") ? audioSrc : `${SPACE}/file=${audioSrc}`;
        const audioRes = await fetch(audioUrl, { signal: AbortSignal.timeout(10000) });
        contentType = audioRes.headers.get("content-type") || "audio/wav";
        audioBuffer = Buffer.from(await audioRes.arrayBuffer());
      }
      break; // success
    }

    // ── Strategy 2: Gradio 3.x /run/predict fallback ──────────────────────────
    if (!audioBuffer) {
      console.log("MMS: falling back to Gradio 3.x /run/predict fn_index=1");
      const predictRes = await fetch(`${SPACE}/run/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fn_index: 1, data: [text.trim(), LANG] }),
        signal: AbortSignal.timeout(50000),
      });

      if (predictRes.ok) {
        const json = await predictRes.json();
        // Gradio 3.x: data[0] is typically { name, data (base64), is_file }
        const d = json?.data?.[0];
        if (d) {
          if (typeof d === "string" && d.startsWith("data:")) {
            contentType = d.split(";")[0].slice(5) || "audio/wav";
            audioBuffer = Buffer.from(d.split(",")[1], "base64");
          } else if (d?.data) {
            // base64 in .data field
            contentType = d.name?.endsWith(".mp3") ? "audio/mpeg" : "audio/wav";
            audioBuffer = Buffer.from(d.data.split(",").pop(), "base64");
          } else if (d?.name) {
            const audioRes = await fetch(`${SPACE}/file=${d.name}`, { signal: AbortSignal.timeout(10000) });
            contentType = audioRes.headers.get("content-type") || "audio/wav";
            audioBuffer = Buffer.from(await audioRes.arrayBuffer());
          }
        }
        if (!audioBuffer) {
          console.error("MMS /run/predict: unexpected response:", JSON.stringify(json).slice(0, 400));
        }
      } else {
        const err = await predictRes.text();
        console.error("MMS /run/predict error:", predictRes.status, err.slice(0, 200));
      }
    }

    if (!audioBuffer) {
      return res.status(503).json({ error: "space_unavailable" });
    }

    res.setHeader("Content-Type", contentType);
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

/** Extract audio src from Gradio 4.x SSE stream. */
function parseSSEAudio(sseText) {
  const lines = sseText.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes("process_completed")) continue;
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (!line.startsWith("data: ")) continue;
      try {
        const payload = JSON.parse(line.slice(6));
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
