/**
 * /api/cron/keep-tts-warm
 * Pings the HuggingFace TTS Space every 9 minutes to prevent it from sleeping.
 * HF Spaces sleep after ~10 min idle; waking takes 30-60s and breaks the first user's experience.
 *
 * Requires Vercel Pro plan (Hobby plan is limited to daily crons).
 * Configured in vercel.json: { "crons": [{ "path": "/api/cron/keep-tts-warm", "schedule": "* /9 * * * *" }] }
 */

export default async function handler(req, res) {
  const spaceUrl = process.env.MMS_SPACE_URL;
  if (!spaceUrl) return res.status(200).json({ status: "no_space_url" });
  try {
    const r = await fetch(`${spaceUrl}/`, { signal: AbortSignal.timeout(8000) });
    return res.status(200).json({ status: r.ok ? "ok" : "loading" });
  } catch {
    return res.status(200).json({ status: "warming" });
  }
}
