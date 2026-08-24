/**
 * /api/geo.js
 * GET → { country: "CA" | null }
 *
 * The country a learner is placed in for the weekly ranking, resolved once at
 * signup. It comes from Vercel's own edge geolocation header, so there is no
 * third-party geo-IP service in the path: no extra latency, no external
 * dependency, and no learner IP address handed to anyone else.
 *
 * Returns only a two-letter country code — never the city, region or IP — and
 * stores nothing. `x-vercel-ip-country` is absent in local development, which
 * is why the client keeps a fallback rather than treating null as an error.
 */

import { checkRateLimit, getClientIp, setCorsHeaders } from "./_rate-limit.js";

const LIMIT = 30;
const WINDOW_MS = 10 * 60 * 1000;

// The countries the app offers. Anything else resolves to OTHER rather than
// storing a code the profile form has no option for.
const KNOWN = new Set(["CA", "CD", "CG", "FR", "BE", "US"]);

export default async function handler(req, res) {
  setCorsHeaders(res, req);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });

  if (!checkRateLimit(getClientIp(req), { limit: LIMIT, windowMs: WINDOW_MS })) {
    return res.status(429).json({ error: "rate_limited" });
  }

  const header = req.headers["x-vercel-ip-country"];
  const code = typeof header === "string" ? header.trim().toUpperCase() : "";

  // No header at all (local dev, or an unusual edge) → null, and the client
  // falls back to its default rather than recording a guess as fact.
  if (!code || code.length !== 2) return res.status(200).json({ country: null });

  return res.status(200).json({ country: KNOWN.has(code) ? code : "OTHER" });
}
