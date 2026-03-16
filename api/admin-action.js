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

const SUPABASE_URL = "https://haioiccujncsehadipzb.supabase.co";

async function supaWrite(method, table, body, filter = "") {
  const url = `${SUPABASE_URL}/rest/v1/${table}${filter ? "?" + filter : ""}`;
  const res = await fetch(url, {
    method,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
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

export default async function handler(req, res) {
  // Only accept POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { action, password, ...params } = req.body;

  // Verify admin password
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    if (action === "verify") {
      // Just a password check — used by the Login screen
      return res.status(200).json({ ok: true });
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
      await supaWrite("PATCH", "corrections", { status: "approved" }, `id=eq.${correction.id}`);
      return res.status(200).json({ ok: true });
    }

    if (action === "reject") {
      const { id } = params;
      await supaWrite("PATCH", "corrections", { status: "rejected" }, `id=eq.${id}`);
      return res.status(200).json({ ok: true });
    }

    if (action === "bulk_approve") {
      // Bulk: rows already filtered to complete pairs by the client
      const { rows, ids } = params;
      await supaWrite("POST", "parallel_sentences", rows);
      await supaWrite("PATCH", "corrections", { status: "approved" }, `id=in.(${ids.join(",")})`);
      return res.status(200).json({ ok: true, count: rows.length });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
