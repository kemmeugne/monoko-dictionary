/**
 * Vercel Serverless Function — Monoko RAG Context
 *
 * Replaces the Railway/FAISS /api/context endpoint.
 * Embeds the user query with OpenAI text-embedding-3-small (384 dim), then
 * searches three verified sources in parallel:
 *   match_parallel_sentences — the FR↔Lingala corpus (corrections + FLORES)
 *   match_examples           — dictionary example sentences (professor-recorded)
 *   match_senses             — dictionary headword↔word pairs
 *
 * The two dictionary sources were added 2026-08-07. Before that only the corpus
 * and lesson_items were embedded, so ~4,800 of the ~10,000 verified pairs the
 * app owns were unreachable — the model answered those from its own Lingala
 * knowledge while the professor-verified pair sat in a table it could not see.
 *
 * The dictionary lookups are strictly additive: they run through allSettled and
 * a failure there degrades to the previous corpus-only behaviour rather than
 * failing the request.
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

// Dictionary caps. Kept well below DEFAULT_MATCH on purpose: the corpus is
// conversational and closest to what a learner asks, so it stays the bulk of
// the context. Sense rows are single words — useful for "comment dit-on X"
// but weak as sentence context, hence the smaller cap and higher floor.
const DICT_EXAMPLE_MATCH     = 12;
const DICT_SENSE_MATCH       = 6;
const DICT_SENSE_THRESHOLD   = 0.45;

// Dictionary entries are short strings, and short strings embed into a narrow
// similarity band — on "comment dit-on une cuillère" the right answer scores
// 0.67 and unrelated words (cochon, grillon, palabre) still score 0.48-0.52.
// No absolute floor separates those, and the band shifts per query, so we also
// drop anything trailing the best hit by more than this margin. When several
// entries are genuinely relevant they cluster near the top and all survive.
const DICT_RELATIVE_MARGIN   = 0.06;

export function topCluster(rows, margin = DICT_RELATIVE_MARGIN) {
  if (!rows || rows.length === 0) return [];
  const best = Math.max(...rows.map(r => r.similarity));
  return rows.filter(r => r.similarity >= best - margin);
}

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

async function callMatchRpc(rpc, embedding, languageId, matchCount) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${rpc}`, {
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

async function matchParallelSentences(embedding, languageId, matchCount) {
  return callMatchRpc("match_parallel_sentences", embedding, languageId, matchCount);
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

/**
 * Dictionary hits, kept in their own labelled sections so the model can tell a
 * professor-recorded example sentence from a bare headword gloss.
 */
export function formatDictionaryContext(examples, senses) {
  const lines = [];

  if (examples && examples.length > 0) {
    lines.push("=== DICTIONNAIRE — phrases d'exemple (vérifiées) ===");
    for (const row of examples) {
      lines.push(`• ${row.sentence_french} → ${row.sentence_dialect} [vérifié]`);
    }
  }

  if (senses && senses.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push("=== DICTIONNAIRE — mots (vérifiés) ===");
    for (const row of senses) {
      lines.push(`• ${row.french_word} → ${row.dialect_word} [vérifié]`);
    }
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
    const threshold = (typeof min_similarity === "number") ? min_similarity : SIMILARITY_THRESHOLD;

    // The corpus lookup is required; the dictionary ones are additive, so they
    // go through allSettled and a rejection there leaves chat exactly as it was.
    const [corpusRes, exampleRes, senseRes] = await Promise.allSettled([
      matchParallelSentences(embedding, language_id, match_count || DEFAULT_MATCH),
      callMatchRpc("match_examples", embedding, language_id, DICT_EXAMPLE_MATCH),
      callMatchRpc("match_senses",   embedding, language_id, DICT_SENSE_MATCH),
    ]);

    if (corpusRes.status === "rejected") throw corpusRes.reason;
    const rows = corpusRes.value;

    if (exampleRes.status === "rejected") console.error("match_examples failed:", exampleRes.reason?.message);
    if (senseRes.status   === "rejected") console.error("match_senses failed:",   senseRes.reason?.message);

    const dictExamples = topCluster(
      (exampleRes.status === "fulfilled" ? exampleRes.value : [])
        .filter(r => r.similarity >= threshold)
    );
    const dictSenses = topCluster(
      (senseRes.status === "fulfilled" ? senseRes.value : [])
        .filter(r => r.similarity >= Math.max(threshold, DICT_SENSE_THRESHOLD))
    );

    const relevant = rows.filter(r => r.similarity >= threshold);
    const parts = [
      formatContext(relevant.length > 0 ? relevant : rows),
      formatDictionaryContext(dictExamples, dictSenses),
    ].filter(Boolean);

    return res.status(200).json({
      context:      parts.join("\n\n"),
      result_count: rows.length + dictExamples.length + dictSenses.length,
    });
  } catch (e) {
    console.error("rag-context error:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
