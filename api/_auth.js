import { supabaseServiceHeaders } from "./_supabase.js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://haioiccujncsehadipzb.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_W6hYzyecMTm06Cr9siLV1A_4qtR5ect";

export async function authenticatedUser(req) {
  const authorization = req.headers?.authorization;
  if (!authorization?.startsWith("Bearer ")) return null;

  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: authorization,
    },
  });
  if (!response.ok) return null;
  return response.json();
}

async function consumeDurableQuota(userId, scope, limit, windowMs) {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!serviceKey) throw new Error("Missing Supabase service configuration");

  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/check_api_quota`, {
    method: "POST",
    headers: {
      ...supabaseServiceHeaders(serviceKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_user_id: userId,
      p_scope: scope,
      p_limit: limit,
      p_window_seconds: Math.max(1, Math.ceil(windowMs / 1000)),
    }),
  });
  if (!response.ok) throw new Error(`Quota service ${response.status}`);
  return response.json();
}

export async function authorizeApiRequest(req, res, { scope, limit, windowMs }) {
  try {
    const user = await authenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return null;
    }
    const allowed = await consumeDurableQuota(user.id, scope, limit, windowMs);
    if (!allowed) {
      res.status(429).json({ error: "Trop de requêtes. Veuillez patienter quelques minutes." });
      return null;
    }
    return user;
  } catch (error) {
    console.error(`authorizeApiRequest/${scope}:`, error);
    res.status(503).json({ error: "Service temporairement indisponible" });
    return null;
  }
}
