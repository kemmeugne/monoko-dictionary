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

/**
 * Sets CORS headers restricting API access to the Monoko app origin.
 * Allows Vercel preview deployments and local dev.
 */
export function setCorsHeaders(res, req) {
  const origin = req.headers.origin || "";
  const allowed =
    origin === "https://monoko-dictionary.vercel.app" ||
    origin.endsWith(".vercel.app") ||
    origin.startsWith("http://localhost");

  if (allowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
}
