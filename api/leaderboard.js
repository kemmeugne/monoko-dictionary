import { checkRateLimit, getClientIp, setCorsHeaders } from "./_rate-limit.js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://haioiccujncsehadipzb.supabase.co";
const LIMIT = 60;
const WINDOW_MS = 10 * 60 * 1000;

async function supabaseJson(path, options = {}) {
  const key = process.env.SUPABASE_SERVICE_KEY;
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
  return response.json();
}

async function authenticatedUser(authorization) {
  if (!authorization?.startsWith("Bearer ")) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_KEY,
      Authorization: authorization,
    },
  });
  if (!response.ok) return null;
  return response.json();
}

export function rankParticipants(profiles, events, streaks, currentUserId, scope) {
  const currentProfile = profiles.find(profile => profile.user_id === currentUserId);
  if (!currentProfile) return { rows: [], current: null, total: 0 };
  const country = currentProfile.country_code;
  const xpByUser = new Map();
  for (const event of events) xpByUser.set(event.user_id, (xpByUser.get(event.user_id) || 0) + Number(event.xp || 0));
  const streakByUser = new Map(streaks.map(row => [row.user_id, row.current_streak || 0]));
  const eligible = profiles
    .filter(profile => scope !== "country" || (country && profile.country_code === country))
    .map(profile => ({
      userId: profile.user_id,
      pseudonym: profile.public_pseudonym,
      country: profile.country_code,
      xp: xpByUser.get(profile.user_id) || 0,
      streak: streakByUser.get(profile.user_id) || 0,
    }))
    .sort((a, b) => b.xp - a.xp || b.streak - a.streak || a.pseudonym.localeCompare(b.pseudonym, "fr"))
    .map((row, index) => ({ ...row, rank: index + 1, me: row.userId === currentUserId }));

  const currentIndex = eligible.findIndex(row => row.me);
  if (currentIndex < 0) return { rows: [], current: null, total: eligible.length };
  const start = Math.max(0, Math.min(currentIndex - 2, eligible.length - 5));
  const visible = eligible.slice(start, start + 5);
  const sanitize = row => ({ rank: row.rank, pseudonym: row.pseudonym, country: row.country, xp: row.xp, streak: row.streak, me: row.me });
  return { rows: visible.map(sanitize), current: sanitize(eligible[currentIndex]), total: eligible.length };
}

export default async function handler(req, res) {
  setCorsHeaders(res, req);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!process.env.SUPABASE_SERVICE_KEY) return res.status(500).json({ error: "Missing Supabase configuration" });
  if (!checkRateLimit(getClientIp(req), { limit: LIMIT, windowMs: WINDOW_MS })) return res.status(429).json({ error: "Trop de requêtes." });

  try {
    const user = await authenticatedUser(req.headers.authorization);
    if (!user) return res.status(401).json({ error: "Authentication required" });
    const languageId = Number(req.query?.language_id);
    const scope = req.query?.scope === "world" ? "world" : "country";
    if (!Number.isInteger(languageId) || languageId <= 0) return res.status(400).json({ error: "Invalid language_id" });

    const profiles = await supabaseJson("/rest/v1/profiles?select=user_id,public_pseudonym,country_code&leaderboard_opt_in=eq.true&public_pseudonym=not.is.null&limit=5000");
    if (!profiles.some(profile => profile.user_id === user.id)) return res.status(200).json({ rows: [], current: null, total: 0 });
    const ids = profiles.map(profile => profile.user_id);
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const idFilter = ids.join(",");
    const [events, streaks] = await Promise.all([
      supabaseJson(`/rest/v1/user_xp_events?select=user_id,xp&language_id=eq.${languageId}&earned_at=gte.${encodeURIComponent(since)}&user_id=in.(${idFilter})&limit=50000`),
      supabaseJson(`/rest/v1/user_streak?select=user_id,current_streak&user_id=in.(${idFilter})&limit=5000`),
    ]);
    return res.status(200).json(rankParticipants(profiles, events, streaks, user.id, scope));
  } catch (error) {
    console.error("leaderboard:", error);
    return res.status(500).json({ error: "Classement indisponible" });
  }
}
