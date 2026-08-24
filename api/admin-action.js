/**
 * Vercel Serverless Function — Monoko Admin Actions
 *
 * Handles all write operations that require the Supabase service role key.
 * The key never leaves the server — admin.html only calls this endpoint.
 *
 * Environment variables to set in Vercel dashboard:
 *   SUPABASE_SERVICE_KEY  — your Supabase service role key
 *   ADMIN_PASSWORD        — the admin panel password
 */

import { timingSafeEqual } from "node:crypto";
import { checkRateLimit, getClientIp } from "./_rate-limit.js";
import { supabaseServiceHeaders } from "./_supabase.js";

const SUPABASE_URL = "https://haioiccujncsehadipzb.supabase.co";

// Rate limit: 15 requests per 15 minutes per IP (brute-force password protection)
const ADMIN_LIMIT  = 15;
const ADMIN_WINDOW = 15 * 60 * 1000;

async function supaWrite(method, table, body, filter = "") {
  const url = `${SUPABASE_URL}/rest/v1/${table}${filter ? "?" + filter : ""}`;
  const res = await fetch(url, {
    method,
    headers: {
      ...supabaseServiceHeaders(),
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${method} ${table}: ${text}`);
  }
}

async function supaRead(path, { count = false } = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      ...supabaseServiceHeaders(),
      ...(count ? { Prefer: "count=exact", Range: "0-0" } : {}),
    },
  });
  if (!response.ok) throw new Error(`Supabase GET: ${await response.text()}`);
  if (count) {
    const range = response.headers.get("content-range");
    return range ? Number(range.split("/")[1]) : 0;
  }
  return response.json();
}

function passwordMatches(value) {
  const expected = process.env.ADMIN_PASSWORD || "";
  const supplied = typeof value === "string" ? value : "";
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const ip = getClientIp(req);
  if (!checkRateLimit(ip, { limit: ADMIN_LIMIT, windowMs: ADMIN_WINDOW })) {
    return res.status(429).json({ error: "Too many requests" });
  }

  const { action, password, ...params } = req.body;

  if (!passwordMatches(password)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    if (action === "verify") {
      // Just a password check — used by the Login screen
      return res.status(200).json({ ok: true });
    }

    if (action === "stats") {
      const statuses = ["pending", "approved", "rejected"];
      const values = await Promise.all(statuses.map(status =>
        supaRead(`corrections?select=id&status=eq.${status}`, { count: true })));
      return res.status(200).json(Object.fromEntries(statuses.map((status, index) => [status, values[index]])));
    }

    if (action === "list" || action === "list_all_pending") {
      const status = action === "list_all_pending" ? "pending" : params.status;
      if (!["pending", "approved", "rejected"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }
      const languageId = params.language_id === null || params.language_id === undefined
        ? null : Number(params.language_id);
      if (languageId !== null && (!Number.isInteger(languageId) || languageId <= 0)) {
        return res.status(400).json({ error: "Invalid language" });
      }
      const limit = action === "list_all_pending" ? 5000 : Math.min(50, Math.max(1, Number(params.limit) || 10));
      const offset = action === "list_all_pending" ? 0 : Math.max(0, Number(params.offset) || 0);
      const order = status === "pending" ? "created_at.asc" : "reviewed_at.desc.nullslast";
      const query = new URLSearchParams({
        select: action === "list_all_pending" ? "*" : "*,languages(name)",
        status: `eq.${status}`,
        order,
        limit: String(limit),
        offset: String(offset),
      });
      if (languageId !== null) query.set("language_id", `eq.${languageId}`);
      const rows = await supaRead(`corrections?${query.toString()}`);
      return res.status(200).json({ rows });
    }

    if (action === "approve") {
      // Single approve: insert pair + mark approved
      const { correction } = params;
      await supaWrite("POST", "parallel_sentences", {
        language_id:  correction.language_id,
        french_text:  correction.correct_french,
        lingala_text: correction.correct_lingala,
        source:       "correction",
        quality:      "verified",
      });
      await supaWrite("PATCH", "corrections", {
        status:               "approved",
        correct_french:       correction.correct_french,
        correct_lingala:      correction.correct_lingala,
        example_sentence:     correction.example_sentence,
        professor_modified:   correction.professor_modified ?? false,
        reviewed_at:          new Date().toISOString(),
      }, `id=eq.${correction.id}`);
      return res.status(200).json({ ok: true });
    }

    if (action === "reject") {
      const { id } = params;
      await supaWrite("PATCH", "corrections", {
        status:      "rejected",
        reviewed_at: new Date().toISOString(),
      }, `id=eq.${id}`);
      return res.status(200).json({ ok: true });
    }

    if (action === "bulk_approve") {
      // Bulk: rows already filtered to complete pairs by the client
      const { rows, ids } = params;
      await supaWrite("POST", "parallel_sentences", rows);
      await supaWrite("PATCH", "corrections", {
        status:      "approved",
        reviewed_at: new Date().toISOString(),
      }, `id=in.(${ids.join(",")})`);
      return res.status(200).json({ ok: true, count: rows.length });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
