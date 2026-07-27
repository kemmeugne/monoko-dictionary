/**
 * Vercel Serverless Function — Monoko RAG Context
 *
 * Replaces the Railway/FAISS /api/context endpoint.
 * Embeds the user query with OpenAI text-embedding-3-small (384 dim),
 * then calls the Supabase match_parallel_sentences RPC to find semantically
 * similar FR↔Lingala sentence pairs from the verified corpus.
 *
 * POST /api/rag-context
 * Body: { query: string, language_id: number, match_count?: number }
 * Response: { context: string, result_count: number }
 *
 * Environment variables:
 *   OPENAI_API_KEY       — OpenAI key (sk-proj-...)
 *   SUPABASE_SERVICE_KEY — Supabase service role key
 */

import { checkRateLimit, getClientIp, setCorsHeaders } from "./_rate-limit.js";

const SUPABASE_URL         = "https://haioiccujncsehadipzb.supabase.co";
const EMBED_MODEL          = "text-embedding-3-small";
const EMBED_DIMS           = 384;
const DEFAULT_MATCH        = 30;
const SIMILARITY_THRESHOLD = 0.3;

// Rate limit: 40 requests per 10 minutes per IP (called automatically alongside chat)
const RAG_LIMIT  = 40;
const RAG_WINDOW = 10 * 60 * 1000;

async function embedQuery(query) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model:      EMBED_MODEL,
      input:      query,
      dimensions: EMBED_DIMS,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI embedding error: ${err}`);
  }

  const data = await res.json();
  return data.data[0].embedding;
}

async function matchParallelSentences(embedding, languageId, matchCount) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/match_parallel_sentences`, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "apikey":        process.env.SUPABASE_SERVICE_KEY,
      "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
    },
    body: JSON.stringify({
      query_embedding: embedding,
      match_count:     matchCount,
      p_language_id:   languageId,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase RPC error: ${err}`);
  }

  return res.json();
}

export function formatContext(rows) {
  if (!rows || rows.length === 0) return "";

  // Put verified/gold pairs first
  const HIGH_QUALITY = new Set(["verified", "gold"]);
  const sorted = [
    ...rows.filter(r => HIGH_QUALITY.has(r.quality)),
    ...rows.filter(r => !HIGH_QUALITY.has(r.quality)),
  ];

  const lines = ["=== CORPUS VÉRIFIÉ (paires FR↔Lingala) ==="];
  for (const row of sorted) {
    const tag = HIGH_QUALITY.has(row.quality) ? "[vérifié]" : "[auto]";
    lines.push(`• ${row.french_text} → ${row.lingala_text} ${tag}`);
  }

  return lines.join("\n");
}

export default async function handler(req, res) {
  setCorsHeaders(res, req);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const ip = getClientIp(req);
  if (!checkRateLimit(ip, { limit: RAG_LIMIT, windowMs: RAG_WINDOW })) {
    return res.status(429).json({ error: "Trop de requêtes. Veuillez patienter quelques minutes." });
  }

  const { query, language_id, match_count, min_similarity } = req.body;

  if (!query || !language_id) {
    return res.status(400).json({ error: "Missing query or language_id" });
  }
  if (typeof query === "string" && query.length > 1000) {
    return res.status(400).json({ error: "Query too long (max 1000 chars)" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OPENAI_API_KEY not configured" });
  }

  if (!process.env.SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: "SUPABASE_SERVICE_KEY not configured" });
  }

  try {
    const embedding = await embedQuery(query);
    const rows = await matchParallelSentences(
      embedding,
      language_id,
      match_count || DEFAULT_MATCH
    );

    const threshold = (typeof min_similarity === "number") ? min_similarity : SIMILARITY_THRESHOLD;
    const relevant = rows.filter(r => r.similarity >= threshold);
    const context  = formatContext(relevant.length > 0 ? relevant : rows);

    return res.status(200).json({ context, result_count: rows.length });
  } catch (e) {
    console.error("rag-context error:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
