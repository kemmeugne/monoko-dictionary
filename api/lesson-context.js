/**
 * Vercel Serverless Function — Monoko Lesson Context
 *
 * Embeds the user query with OpenAI text-embedding-3-small (384 dim),
 * then calls the Supabase match_lesson_items RPC to find semantically
 * similar grammar course rows.  Returns a formatted context string
 * ready to be injected into the LLM system prompt alongside FAISS context.
 *
 * POST /api/lesson-context
 * Body: { query: string, language_id: number, match_count?: number }
 * Response: { context: string, result_count: number }
 *
 * Environment variables:
 *   OPENAI_API_KEY      — OpenAI key (sk-proj-...)
 *   SUPABASE_SERVICE_KEY — Supabase service role key (for RPC access)
 */

import { checkRateLimit, getClientIp, setCorsHeaders } from "./_rate-limit.js";

const SUPABASE_URL  = "https://haioiccujncsehadipzb.supabase.co";
const EMBED_MODEL   = "text-embedding-3-small";
const EMBED_DIMS    = 384;
const DEFAULT_MATCH = 8;
const SIMILARITY_THRESHOLD = 0.4;

// Rate limit: 40 requests per 10 minutes per IP
const LESSON_LIMIT  = 40;
const LESSON_WINDOW = 10 * 60 * 1000;

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

async function matchLessonItems(embedding, languageId, matchCount) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/match_lesson_items`, {
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

// Fetch all items belonging to the given lesson_ids (to get complete conjugation tables).
async function fetchFullLessons(lessonIds) {
  const ids = lessonIds.join(",");
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/lesson_items?lesson_id=in.(${ids})&select=id,lesson_id,french,dialect,example_french,example_dialect,audio_url,example_audio_url&order=lesson_id,item_order`,
    {
      headers: {
        "apikey":        process.env.SUPABASE_SERVICE_KEY,
        "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      },
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase fetch full lessons error: ${err}`);
  }

  return res.json();
}

export function formatContext(rows) {
  if (!rows || rows.length === 0) return "";

  const lines = ["=== COURS (DONNÉES VÉRIFIÉES) ==="];

  for (const row of rows) {
    const pair = `• ${row.french} → ${row.dialect} [cours vérifié]`;
    lines.push(pair);
    if (row.example_french && row.example_dialect) {
      lines.push(`  Ex: ${row.example_french} → ${row.example_dialect}`);
    }
  }

  return lines.join("\n");
}

export default async function handler(req, res) {
  setCorsHeaders(res, req);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const ip = getClientIp(req);
  if (!checkRateLimit(ip, { limit: LESSON_LIMIT, windowMs: LESSON_WINDOW })) {
    return res.status(429).json({ error: "Trop de requêtes. Veuillez patienter quelques minutes." });
  }

  const { query, language_id, match_count } = req.body;

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
    const topMatches = await matchLessonItems(embedding, language_id, match_count || DEFAULT_MATCH);

    // Expand: for matches above the similarity threshold, fetch all rows from
    // the same lesson so conjugation tables and vocabulary lists are complete.
    const relevantLessonIds = [
      ...new Set(
        topMatches
          .filter(r => r.similarity >= SIMILARITY_THRESHOLD)
          .map(r => r.lesson_id)
      ),
    ];

    let rows = topMatches;
    if (relevantLessonIds.length > 0) {
      rows = await fetchFullLessons(relevantLessonIds);
    }

    const context = formatContext(rows);
    return res.status(200).json({ context, result_count: rows.length });
  } catch (e) {
    console.error("lesson-context error:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
