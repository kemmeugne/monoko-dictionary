/**
 * /api/elevenlabs-tts.js
 * Proxy for ElevenLabs TTS — keeps API key server-side.
 * Accepts: POST { text: string }
 * Returns: audio/mpeg binary
 *
 * Voice: Rachel (21m00Tcm4TlvDq8ikWAM)
 * Model: eleven_v3 with language_code "lin" (Lingala ISO 639-3)
 *
 * NOTE: ElevenLabs has English accent bias for Lingala — no native Lingala
 * TTS model exists publicly (facebook/mms covers ASR only, not TTS).
 *
 * TODO: ElevenLabs Lingala TTS has English accent bias.
 * Future plan: fine-tune VITS model on native Lingala recordings (Borgeas studio sessions)
 * and host on our own HuggingFace Space. No pre-trained Lingala TTS model exists publicly.
 */

import { checkRateLimit, getClientIp, setCorsHeaders } from "./_rate-limit.js";

const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // Rachel
const MODEL_ID = "eleven_multilingual_v2";

// Rate limit: 30 requests per 5 minutes per IP
const TTS_LIMIT  = 30;
const TTS_WINDOW = 5 * 60 * 1000;

export default async function handler(req, res) {
  setCorsHeaders(res, req);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const ip = getClientIp(req);
  if (!checkRateLimit(ip, { limit: TTS_LIMIT, windowMs: TTS_WINDOW })) {
    return res.status(429).json({ error: "Trop de requêtes. Veuillez patienter quelques minutes." });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ElevenLabs API key not configured on server." });
  }

  const { text } = req.body || {};
  if (!text || !text.trim()) {
    return res.status(400).json({ error: "No text provided" });
  }
  if (text.length > 500) {
    return res.status(400).json({ error: "Text too long (max 500 chars)" });
  }

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: text.trim(),
          model_id: MODEL_ID,
          // language_code omitted — "lin" is not supported; v2 auto-detects from text
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error("ElevenLabs TTS error:", response.status, err);
      return res.status(response.status).json({ error: `ElevenLabs TTS ${response.status}: ${err.slice(0, 200)}` });
    }

    const audioBuffer = await response.arrayBuffer();
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.send(Buffer.from(audioBuffer));
  } catch (err) {
    console.error("ElevenLabs TTS exception:", err);
    return res.status(500).json({ error: err.message });
  }
}
