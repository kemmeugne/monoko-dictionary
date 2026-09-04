// Sliding-window rate limiter — in-memory, per-IP.
// Provides meaningful protection within a warm Vercel function instance.
// Multiple concurrent cold-start instances each enforce their own window,
// which still caps sustained abuse significantly.

const windows = new Map();

/**
 * Returns true if the request is allowed, false if rate-limited.
 * @param {string} ip
 * @param {{ limit: number, windowMs: number }} opts
 */
export function checkRateLimit(ip, { limit, windowMs }) {
  const now = Date.now();
  const timestamps = (windows.get(ip) || []).filter(t => now - t < windowMs);

  if (timestamps.length >= limit) return false;

  timestamps.push(now);
  windows.set(ip, timestamps);

  // Prune stale entries to keep memory bounded (~5k IPs max)
  if (windows.size > 5000) {
    for (const [k, v] of windows) {
      if (v.every(t => now - t >= windowMs)) windows.delete(k);
    }
  }

  return true;
}

/**
 * Extracts the real client IP from Vercel request headers.
 */
export function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers["x-real-ip"] || req.socket?.remoteAddress || "unknown";
}

// Origins the app is served from. Both .vercel.app aliases stay live alongside
// the custom domains, so they keep their entries — listed here rather than left
// to PREVIEW_ORIGIN below, which exists for throwaway deployments.
const ALLOWED_ORIGINS = new Set([
  "https://monoko.africa",
  "https://www.monoko.africa",
  "https://monoko.ca",
  "https://www.monoko.ca",
  "https://monoko-app.vercel.app",
  "https://monoko-dictionary.vercel.app",
]);

// This project's own preview deployments only. A bare `.vercel.app` suffix test
// let any site hosted on Vercel call the API from a browser.
const PREVIEW_ORIGIN = /^https:\/\/monoko-[a-z0-9-]+\.vercel\.app$/;

/**
 * Sets CORS headers restricting API access to the Monoko app origins.
 * Allows this project's Vercel preview deployments and local dev.
 */
export function setCorsHeaders(res, req) {
  const origin = req.headers.origin || "";
  const allowed =
    ALLOWED_ORIGINS.has(origin) ||
    PREVIEW_ORIGIN.test(origin) ||
    origin.startsWith("http://localhost");

  if (allowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Vary", "Origin");
}
