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

const SUPABASE_URL  = "https://haioiccujncsehadipzb.supabase.co";
const EMBED_MODEL   = "text-embedding-3-small";
const EMBED_DIMS    = 384;
const DEFAULT_MATCH = 8;

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

function formatContext(rows) {
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
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { query, language_id, match_count } = req.body;

  if (!query || !language_id) {
    return res.status(400).json({ error: "Missing query or language_id" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OPENAI_API_KEY not configured" });
  }

  if (!process.env.SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: "SUPABASE_SERVICE_KEY not configured" });
  }

  try {
    const embedding = await embedQuery(query);
    const rows      = await matchLessonItems(embedding, language_id, match_count || DEFAULT_MATCH);
    const context   = formatContext(rows);

    return res.status(200).json({ context, result_count: rows.length });
  } catch (e) {
    console.error("lesson-context error:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
