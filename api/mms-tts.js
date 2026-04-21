/**
 * /api/mms-tts.js
 * Proxy for Meta MMS-TTS facebook/mms-tts-lin (Lingala)
 * Keeps HuggingFace token server-side.
 *
 * Accepts:  POST { text: string }
 * Returns:  audio/flac binary
 *
 * HuggingFace free tier cold-starts the model — first request after
 * idle may return 503 with estimated_time. We retry once after that delay.
 *
 * Future: replace with a VITS model fine-tuned on professor recordings.
 */

const HF_MODEL = "facebook/mms-tts-lin";
const HF_URL   = `https://router.huggingface.co/hf-inference/models/${HF_MODEL}`;
const MAX_WAIT  = 30; // seconds to wait for model warm-up

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const hfToken = process.env.HF_TOKEN;
  if (!hfToken) return res.status(500).json({ error: "HF_TOKEN not configured on server." });

  const { text } = req.body || {};
  if (!text?.trim()) return res.status(400).json({ error: "No text provided" });

  const headers = {
    Authorization: `Bearer ${hfToken}`,
    "Content-Type": "application/json",
  };
  const body = JSON.stringify({ inputs: text.trim() });

  try {
    let response = await fetch(HF_URL, { method: "POST", headers, body });

    // Handle model cold-start: HF returns 503 with estimated_time
    if (response.status === 503) {
      const data = await response.json().catch(() => ({}));
      const wait = Math.min(data.estimated_time || 10, MAX_WAIT);
      console.log(`MMS-TTS model loading, waiting ${wait}s…`);
      await new Promise(r => setTimeout(r, wait * 1000));
      response = await fetch(HF_URL, { method: "POST", headers, body });
    }

    if (!response.ok) {
      const err = await response.text();
      console.error("MMS-TTS error:", response.status, err);
      return res.status(500).json({ error: `MMS-TTS ${response.status}: ${err.slice(0, 200)}` });
    }

    const audioBuffer = await response.arrayBuffer();
    res.setHeader("Content-Type", "audio/flac");
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.send(Buffer.from(audioBuffer));
  } catch (err) {
    console.error("MMS-TTS exception:", err);
    return res.status(500).json({ error: err.message });
  }
}
