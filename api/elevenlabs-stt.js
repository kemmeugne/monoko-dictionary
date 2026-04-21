/**
 * /api/elevenlabs-stt.js
 * Proxy for ElevenLabs Scribe v2 STT — keeps API key server-side.
 * Accepts: POST { audio: base64string, mimeType: string }
 * Returns: { text: string }
 *
 * The client records audio via MediaRecorder, converts the blob to base64,
 * and sends it here. We re-hydrate the buffer and forward as multipart
 * to ElevenLabs Scribe.
 *
 * Language: Lingala ("lin"). French STT is handled client-side via
 * the free Web Speech API (no proxy needed).
 *
 * Future path: replace with a Whisper model fine-tuned on WAXAL ASR data
 * (google/WaxalNLP on HuggingFace, 1,250h Lingala speech, CC-BY-4.0).
 * This will eliminate API costs and significantly improve accuracy beyond
 * ElevenLabs Scribe's current "moderate" rating (20-50% WER on Lingala).
 */

const MODEL_ID = "scribe_v2";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ElevenLabs API key not configured on server." });
  }

  const { audio, mimeType = "audio/webm" } = req.body || {};
  if (!audio) {
    return res.status(400).json({ error: "No audio data provided" });
  }

  try {
    const audioBuffer = Buffer.from(audio, "base64");

    // Node 18+ has native FormData and Blob
    const blob = new Blob([audioBuffer], { type: mimeType });
    const formData = new FormData();
    formData.append("file", blob, "audio.webm");
    formData.append("model_id", MODEL_ID);
    formData.append("language_code", "lin"); // Lingala ISO 639-3

    const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: formData,
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("ElevenLabs STT error:", response.status, err);
      return res.status(response.status).json({ error: `ElevenLabs STT: ${response.status}` });
    }

    const data = await response.json();
    return res.status(200).json({ text: data.text || "" });
  } catch (err) {
    console.error("ElevenLabs STT exception:", err);
    return res.status(500).json({ error: err.message });
  }
}
