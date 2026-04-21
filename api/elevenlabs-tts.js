/**
 * /api/elevenlabs-tts.js
 * Proxy for ElevenLabs TTS — keeps API key server-side.
 * Accepts: POST { text: string }
 * Returns: audio/mpeg binary
 *
 * Voice: Rachel (21m00Tcm4TlvDq8ikWAM) — multilingual, works with eleven_v3.
 * To swap voice: update VOICE_ID below or add a ELEVENLABS_VOICE_ID env var.
 *
 * Future path: replace ElevenLabs with a VITS/Coqui model fine-tuned on
 * Lingala studio recordings from native speakers. The voice_id and model_id
 * params map cleanly to that architecture.
 */

const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // Rachel
const MODEL_ID = "eleven_v3";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ElevenLabs API key not configured on server." });
  }

  const { text } = req.body || {};
  if (!text || !text.trim()) {
    return res.status(400).json({ error: "No text provided" });
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
          language_code: "lin",
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
      return res.status(response.status).json({ error: `ElevenLabs TTS: ${response.status}` });
    }

    const audioBuffer = await response.arrayBuffer();
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "public, max-age=86400"); // cache 24h at CDN level
    return res.send(Buffer.from(audioBuffer));
  } catch (err) {
    console.error("ElevenLabs TTS exception:", err);
    return res.status(500).json({ error: err.message });
  }
}
