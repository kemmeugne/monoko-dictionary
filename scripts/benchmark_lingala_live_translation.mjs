import fs from "node:fs";
import path from "node:path";

import { buildSystemPrompt } from "../api/chat.js";
import {
  formatContext as formatRagContext,
  formatDictionaryContext,
  topCluster,
} from "../api/rag-context.js";
import { formatContext as formatLessonContext } from "../api/lesson-context.js";
import { supabaseServiceHeaders } from "../api/_supabase.js";

const MANIFEST_PATH = "artifacts/stt_benchmark/professor_25_manifest.json";
const STT_RESULTS_PATH = "artifacts/stt_benchmark/scribe_v2_professor_25_results.json";
const LINGALA_CORPUS_PATH = "artifacts/lingala_audio/lingala_audio_manifest.json";
const RESULTS_PATH = "artifacts/stt_benchmark/live_translation_professor_25_results.json";
const CSV_PATH = "artifacts/stt_benchmark/live_translation_professor_25_review.csv";
const HTML_PATH = "artifacts/stt_benchmark/live_translation_professor_25_review.html";
const AUDIO_ROOT = path.resolve(
  process.env.LINGALA_AUDIO_ROOT
    || "../raw_data/Lingala/audio/Audios Lingala Finaux (01.02.2026)",
);
const SUPABASE_URL = "https://haioiccujncsehadipzb.supabase.co";
const EMBED_MODEL = "text-embedding-3-small";
const TRANSLATION_MODEL = "gpt-4o-mini";
const JUDGE_MODEL = process.env.TRANSLATION_JUDGE_MODEL || "gpt-5-mini";
const REPORT_ONLY = process.argv.includes("--report-only");

function cleanEnvValue(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"'))
      || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function envValue(name) {
  if (process.env[name]) return process.env[name];
  for (const file of [".env.local", ".env"]) {
    if (!fs.existsSync(file)) continue;
    const line = fs.readFileSync(file, "utf8")
      .split(/\r?\n/)
      .find(candidate => candidate.startsWith(`${name}=`));
    if (line) return cleanEnvValue(line.slice(name.length + 1));
  }
  return "";
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .toLocaleLowerCase("fr")
    .replace(/\p{M}+/gu, "")
    .replace(/[’'`-]/gu, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function percentile(values, proportion) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(proportion * sorted.length) - 1] ?? null;
}

function editDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= right.length; j++) {
      const above = previous[j];
      previous[j] = left[i - 1] === right[j - 1]
        ? diagonal
        : Math.min(diagonal, previous[j - 1], above) + 1;
      diagonal = above;
    }
  }
  return previous[right.length];
}

function compact(value) {
  return normalize(value).replaceAll(" ", "");
}

function buildLexicalContext(query, corpusRows) {
  const normalizedQuery = compact(query);
  const ranked = corpusRows.map(row => {
    const candidate = compact(row.sentence_dialect);
    const denominator = Math.max(normalizedQuery.length, candidate.length, 1);
    return {
      sentence_french: row.sentence_french,
      sentence_dialect: row.sentence_dialect,
      similarity: 1 - editDistance(normalizedQuery, candidate) / denominator,
    };
  }).sort((a, b) => b.similarity - a.similarity);
  const best = ranked[0]?.similarity || 0;
  const matches = ranked
    .filter(row => row.similarity >= 0.72 && row.similarity >= best - 0.08)
    .slice(0, 3);
  const context = matches.length
    ? ["=== CORPUS LEXICAL LINGALA (paires vérifiées) ===", ...matches.map(
      row => `• ${row.sentence_french} → ${row.sentence_dialect} [vérifié; proximité ${(row.similarity * 100).toFixed(1)}%]`,
    )].join("\n")
    : "";
  return { context, matches, bestSimilarity: best };
}

async function fetchWithRetries(url, options, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok || (response.status < 429 && response.status < 500)) return response;
      lastError = new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, attempt * 1500));
  }
  throw lastError;
}

async function openAiJson(pathname, apiKey, body) {
  const response = await fetchWithRetries(`https://api.openai.com/v1/${pathname}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    throw new Error(`OpenAI HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
  }
  return response.json();
}

async function embedQuery(query, apiKey) {
  const data = await openAiJson("embeddings", apiKey, {
    model: EMBED_MODEL,
    input: query,
    dimensions: 384,
  });
  return data.data[0].embedding;
}

async function supabaseJson(pathname, serviceKey, body = null) {
  const response = await fetchWithRetries(`${SUPABASE_URL}/rest/v1/${pathname}`, {
    method: body ? "POST" : "GET",
    headers: {
      ...supabaseServiceHeaders(serviceKey),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(`Supabase HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
  }
  return response.json();
}

function matchRpc(name, embedding, matchCount, serviceKey) {
  return supabaseJson(`rpc/${name}`, serviceKey, {
    query_embedding: embedding,
    match_count: matchCount,
    p_language_id: 1,
  });
}

async function retrieveContext(query, apiKey, serviceKey) {
  const startedAt = performance.now();
  const embedding = await embedQuery(query, apiKey);
  const [corpusResult, examplesResult, sensesResult, lessonsResult] = await Promise.allSettled([
    matchRpc("match_parallel_sentences", embedding, 30, serviceKey),
    matchRpc("match_examples", embedding, 12, serviceKey),
    matchRpc("match_senses", embedding, 6, serviceKey),
    matchRpc("match_lesson_items", embedding, 8, serviceKey),
  ]);
  if (corpusResult.status === "rejected") throw corpusResult.reason;

  const corpusRows = corpusResult.value;
  const relevantCorpus = corpusRows.filter(row => row.similarity >= 0.5);
  const examples = topCluster(
    (examplesResult.status === "fulfilled" ? examplesResult.value : [])
      .filter(row => row.similarity >= 0.5),
  );
  const senses = topCluster(
    (sensesResult.status === "fulfilled" ? sensesResult.value : [])
      .filter(row => row.similarity >= 0.5),
  );
  const ragContext = [
    formatRagContext(relevantCorpus.length ? relevantCorpus : corpusRows),
    formatDictionaryContext(examples, senses),
  ].filter(Boolean).join("\n\n");

  let lessonRows = lessonsResult.status === "fulfilled" ? lessonsResult.value : [];
  const lessonIds = [...new Set(
    lessonRows.filter(row => row.similarity >= 0.4).map(row => row.lesson_id),
  )];
  if (lessonIds.length) {
    const ids = lessonIds.join(",");
    lessonRows = await supabaseJson(
      `lesson_items?lesson_id=in.(${ids})&select=id,lesson_id,french,dialect,example_french,example_dialect,audio_url,example_audio_url&order=lesson_id,item_order`,
      serviceKey,
    );
  }

  return {
    ragContext,
    lessonContext: formatLessonContext(lessonRows),
    contextMs: Math.round(performance.now() - startedAt),
    counts: {
      corpus: corpusRows.length,
      relevant_corpus: relevantCorpus.length,
      examples: examples.length,
      senses: senses.length,
      lessons: lessonRows.length,
    },
  };
}

async function translate(hypothesis, context, apiKey) {
  const startedAt = performance.now();
  const systemPrompt = buildSystemPrompt(
    "Lingala",
    context.ragContext,
    context.lessonContext,
    "live-translation",
    "lingala_to_fr",
  );
  const data = await openAiJson("chat/completions", apiKey, {
    model: TRANSLATION_MODEL,
    temperature: 0.2,
    max_tokens: 512,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: hypothesis },
    ],
  });
  return {
    translation: String(data.choices?.[0]?.message?.content || "").trim(),
    translationMs: Math.round(performance.now() - startedAt),
    usage: data.usage || null,
  };
}

function parseJsonArray(value) {
  const text = String(value || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end < start) throw new Error("Judge did not return a JSON array");
  return JSON.parse(text.slice(start, end + 1));
}

async function judgeTranslations(rows, apiKey, translationField = "translation") {
  const payload = rows.map(row => ({
    id: row.id,
    verified_french: row.reference_french,
    pipeline_french: row[translationField],
  }));
  const data = await openAiJson("chat/completions", apiKey, {
    model: JUDGE_MODEL,
    max_completion_tokens: 6000,
    reasoning_effort: "minimal",
    messages: [
      {
        role: "system",
        content: `Tu évalues une traduction vocale lingala vers français en comparant uniquement deux textes français.
Classe chaque résultat:
- correct: même sens utile, les reformulations naturelles sont acceptées;
- minor: sens principal préservé mais détail, nuance, personne, temps ou nombre légèrement altéré;
- incorrect: sens principal changé, information importante perdue/ajoutée, négation ou acteur inversé.
Réponds uniquement par un tableau JSON. Pour chaque entrée: {"id":"...","verdict":"correct|minor|incorrect","reason":"explication française courte"}.
N'évalue ni l'orthographe lingala ni la proximité mot à mot.`,
      },
      { role: "user", content: JSON.stringify(payload) },
    ],
  });
  return parseJsonArray(data.choices?.[0]?.message?.content);
}

function summarize(results) {
  const successful = results.filter(row => row.ok);
  const verdictCounts = { correct: 0, minor: 0, incorrect: 0, unreviewed: 0 };
  const lexicalVerdictCounts = { correct: 0, minor: 0, incorrect: 0, unreviewed: 0 };
  for (const row of successful) {
    const verdict = row.semantic_review?.verdict;
    if (verdict in verdictCounts) verdictCounts[verdict]++;
    else verdictCounts.unreviewed++;
    const lexicalVerdict = row.lexical_semantic_review?.verdict;
    if (lexicalVerdict in lexicalVerdictCounts) lexicalVerdictCounts[lexicalVerdict]++;
    else lexicalVerdictCounts.unreviewed++;
  }
  const contextLatencies = successful.map(row => row.context_ms);
  const translationLatencies = successful.map(row => row.translation_ms);
  return {
    benchmark_version: 1,
    generated_at: new Date().toISOString(),
    pipeline: {
      input: "Stored Scribe v2 hypotheses from the professor 25-clip STT benchmark",
      embedding_model: EMBED_MODEL,
      rag_min_similarity: 0.5,
      translation_model: TRANSLATION_MODEL,
      translation_mode: "live-translation / lingala_to_fr",
      judge_model: JUDGE_MODEL,
      isolated_turns: true,
      note: "No professor audio is uploaded again. Direct provider calls reproduce production retrieval and translation settings while bypassing app auth/rate limits.",
    },
    samples: results.length,
    successes: successful.length,
    failures: results.length - successful.length,
    exact_french_matches: successful.filter(
      row => normalize(row.reference_french) === normalize(row.translation),
    ).length,
    reference_pair_retrieved: successful.filter(row => row.reference_pair_retrieved).length,
    semantic_verdicts: verdictCounts,
    acceptable_rate: successful.length
      ? (verdictCounts.correct + verdictCounts.minor) / successful.length
      : null,
    lexical_ab: {
      description: "High-confidence character retrieval over professor examples; vector and lesson context omitted",
      reference_pair_retrieved: successful.filter(
        row => row.lexical_reference_pair_retrieved,
      ).length,
      semantic_verdicts: lexicalVerdictCounts,
      acceptable_rate: successful.length
        ? (lexicalVerdictCounts.correct + lexicalVerdictCounts.minor) / successful.length
        : null,
    },
    latency_ms: successful.length ? {
      context_median: percentile(contextLatencies, 0.5),
      context_p95: percentile(contextLatencies, 0.95),
      translation_median: percentile(translationLatencies, 0.5),
      translation_p95: percentile(translationLatencies, 0.95),
    } : null,
    results,
  };
}

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function writeArtifacts(manifest, report) {
  fs.mkdirSync(path.dirname(RESULTS_PATH), { recursive: true });
  fs.writeFileSync(RESULTS_PATH, `${JSON.stringify(report, null, 2)}\n`);
  const clipsById = new Map(manifest.clips.map(clip => [clip.id, clip]));
  const priority = { incorrect: 0, minor: 1, unreviewed: 2, correct: 3 };
  const rows = [...report.results].sort((a, b) => {
    const aVerdict = a.lexical_semantic_review?.verdict || "unreviewed";
    const bVerdict = b.lexical_semantic_review?.verdict || "unreviewed";
    return priority[aVerdict] - priority[bVerdict]
      || (b.stt_cer || 0) - (a.stt_cer || 0);
  });
  const csv = [[
    "id", "verdict", "reason", "lingala_reference", "scribe_transcript",
    "verified_french", "production_french", "production_verdict", "lexical_french",
    "lexical_verdict", "lexical_reason", "stt_cer_percent", "vector_pair_retrieved",
    "lexical_pair_retrieved", "lexical_best_similarity",
  ], ...rows.map(row => [
    row.id,
    row.semantic_review?.verdict,
    row.semantic_review?.reason,
    row.reference_lingala,
    row.stt_hypothesis,
    row.reference_french,
    row.translation,
    row.semantic_review?.verdict,
    row.lexical_translation,
    row.lexical_semantic_review?.verdict,
    row.lexical_semantic_review?.reason,
    Number.isFinite(row.stt_cer) ? (row.stt_cer * 100).toFixed(1) : null,
    row.reference_pair_retrieved,
    row.lexical_reference_pair_retrieved,
    row.lexical_best_similarity,
  ])].map(row => row.map(csvCell).join(",")).join("\n");
  fs.writeFileSync(CSV_PATH, `${csv}\n`);

  const htmlDirectory = path.dirname(path.resolve(HTML_PATH));
  const tableRows = rows.map(row => {
    const clip = clipsById.get(row.id);
    const audioPath = clip
      ? path.relative(htmlDirectory, path.join(AUDIO_ROOT, clip.audio_relative_path))
      : "";
    const verdict = row.lexical_semantic_review?.verdict || "unreviewed";
    return `<tr class="${escapeHtml(verdict)}"><td><strong>${escapeHtml(row.id)}</strong><br><span class="badge">${escapeHtml(verdict)}</span></td>
<td><audio controls preload="none" src="${escapeHtml(audioPath)}"></audio></td>
<td><small>Professeur</small>${escapeHtml(row.reference_lingala)}<br><small>Scribe</small>${escapeHtml(row.stt_hypothesis)}</td>
<td><small>Attendu</small>${escapeHtml(row.reference_french)}<br><small>Production</small>${escapeHtml(row.translation)}<br><small>Lexical</small>${escapeHtml(row.lexical_translation)}</td>
<td>${escapeHtml(row.lexical_semantic_review?.reason || "-")}</td><td>Vecteur: ${row.reference_pair_retrieved ? "oui" : "non"}<br>Lexical: ${row.lexical_reference_pair_retrieved ? "oui" : "non"}</td></tr>`;
  }).join("\n");
  const acceptablePercent = report.acceptable_rate == null
    ? "-"
    : `${(report.acceptable_rate * 100).toFixed(1)}%`;
  const lexicalAcceptablePercent = report.lexical_ab.acceptable_rate == null
    ? "-"
    : `${(report.lexical_ab.acceptable_rate * 100).toFixed(1)}%`;
  fs.writeFileSync(HTML_PATH, `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Monoko - Validation traduction en direct</title><style>
body{font-family:system-ui,sans-serif;margin:32px;color:#17231b;background:#f5f7f4}main{max-width:1500px;margin:auto}h1{font-family:Georgia,serif}
.summary{display:flex;gap:28px;flex-wrap:wrap;margin:20px 0}.summary strong{font-size:1.45rem}table{width:100%;border-collapse:collapse;background:#fff}
th,td{padding:12px;border:1px solid #d9e2da;text-align:left;vertical-align:top}th{background:#153f34;color:#fff;position:sticky;top:0}
small{display:block;color:#66736b;font-weight:700;margin:0 0 3px}.badge{font-size:.75rem;text-transform:uppercase;font-weight:800}.incorrect .badge{color:#b83222}.minor .badge{color:#91610b}.correct .badge{color:#197043}
audio{width:210px;max-width:25vw}@media(max-width:850px){body{margin:10px}table{font-size:.82rem}th,td{padding:7px}audio{width:130px}}
</style></head><body><main><h1>Validation Lingala parle vers français</h1>
<p>Les erreurs potentielles apparaissent en premier. La décision automatique doit être confirmée humainement.</p>
<div class="summary"><span><strong>${acceptablePercent}</strong><br>production acceptable</span><span><strong>${lexicalAcceptablePercent}</strong><br>lexical acceptable</span><span><strong>${report.lexical_ab.semantic_verdicts.correct}</strong><br>lexical correct</span><span><strong>${report.lexical_ab.semantic_verdicts.minor}</strong><br>lexical mineur</span><span><strong>${report.lexical_ab.semantic_verdicts.incorrect}</strong><br>lexical incorrect</span><span><strong>${report.lexical_ab.reference_pair_retrieved}/25</strong><br>paire lexicale retrouvée</span></div>
<table><thead><tr><th>Clip</th><th>Audio</th><th>Lingala</th><th>Français</th><th>Évaluation lexicale</th><th>Corpus</th></tr></thead><tbody>${tableRows}</tbody></table>
</main></body></html>`);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
const sttReport = JSON.parse(fs.readFileSync(STT_RESULTS_PATH, "utf8"));
const sttById = new Map(sttReport.results.filter(row => row.ok).map(row => [row.id, row]));
const lexicalCorpus = JSON.parse(fs.readFileSync(LINGALA_CORPUS_PATH, "utf8"))
  .filter(row => row.target_type === "example_sentence"
    && row.db_match_status === "matched"
    && row.sentence_dialect
    && row.sentence_french)
  .filter((row, index, rows) => rows.findIndex(candidate => (
    normalize(candidate.sentence_dialect) === normalize(row.sentence_dialect)
    && normalize(candidate.sentence_french) === normalize(row.sentence_french)
  )) === index);

if (REPORT_ONLY) {
  if (!fs.existsSync(RESULTS_PATH)) throw new Error(`Missing existing report: ${RESULTS_PATH}`);
  const existing = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf8"));
  const report = summarize(existing.results || []);
  writeArtifacts(manifest, report);
  console.log(JSON.stringify({ ...report, results: undefined }, null, 2));
  process.exit(0);
}

const apiKey = envValue("OPENAI_API_KEY");
const serviceKey = envValue("SUPABASE_SERVICE_KEY");
if (!apiKey) throw new Error("OPENAI_API_KEY is missing from the environment or .env.local");
if (!serviceKey) throw new Error("SUPABASE_SERVICE_KEY is missing from the environment or .env.local");

const previous = fs.existsSync(RESULTS_PATH)
  ? JSON.parse(fs.readFileSync(RESULTS_PATH, "utf8")).results || []
  : [];
const resultsById = new Map(previous.filter(row => row.ok).map(row => [row.id, row]));

for (const [index, clip] of manifest.clips.entries()) {
  const existingResult = resultsById.get(clip.id);
  if (existingResult?.lexical_translation) {
    console.log(`${index + 1}/${manifest.clips.length} CACHED ${clip.id}`);
    continue;
  }
  const stt = sttById.get(clip.id);
  if (!stt) throw new Error(`Missing successful STT result for ${clip.id}`);
  try {
    let result = existingResult;
    if (!result) {
      const context = await retrieveContext(stt.hypothesis, apiKey, serviceKey);
      const translated = await translate(stt.hypothesis, context, apiKey);
      const combinedContext = `${context.ragContext}\n${context.lessonContext}`;
      result = {
        id: clip.id,
        bucket: clip.bucket,
        reference_lingala: clip.reference,
        stt_hypothesis: stt.hypothesis,
        stt_cer: stt.accent_insensitive.cer,
        reference_french: clip.french,
        translation: translated.translation,
        reference_pair_retrieved: normalize(combinedContext).includes(normalize(clip.reference))
          && normalize(combinedContext).includes(normalize(clip.french)),
        context_counts: context.counts,
        context_ms: context.contextMs,
        translation_ms: translated.translationMs,
        usage: translated.usage,
        ok: true,
      };
    }
    const lexical = buildLexicalContext(stt.hypothesis, lexicalCorpus);
    const lexicalTranslation = await translate(stt.hypothesis, {
      ragContext: lexical.context,
      lessonContext: "",
    }, apiKey);
    result.lexical_translation = lexicalTranslation.translation;
    result.lexical_translation_ms = lexicalTranslation.translationMs;
    result.lexical_usage = lexicalTranslation.usage;
    result.lexical_best_similarity = lexical.bestSimilarity;
    result.lexical_matches = lexical.matches;
    result.lexical_reference_pair_retrieved = lexical.matches.some(row => (
      normalize(row.sentence_dialect) === normalize(clip.reference)
      && normalize(row.sentence_french) === normalize(clip.french)
    ));
    resultsById.set(clip.id, result);
    console.log(`${index + 1}/${manifest.clips.length} OK ${clip.id} lexical ${(lexical.bestSimilarity * 100).toFixed(1)}%`);
  } catch (error) {
    resultsById.set(clip.id, {
      id: clip.id,
      bucket: clip.bucket,
      reference_lingala: clip.reference,
      stt_hypothesis: stt.hypothesis,
      stt_cer: stt.accent_insensitive.cer,
      reference_french: clip.french,
      ok: false,
      error: error.message,
    });
    console.error(`${index + 1}/${manifest.clips.length} FAIL ${clip.id}: ${error.message}`);
  }
  writeArtifacts(manifest, summarize([...resultsById.values()]));
}

const successfulRows = [...resultsById.values()].filter(row => row.ok);
if (successfulRows.some(row => !row.semantic_review)) {
  const reviews = await judgeTranslations(successfulRows, apiKey);
  const reviewsById = new Map(reviews.map(review => [review.id, review]));
  for (const row of successfulRows) row.semantic_review = reviewsById.get(row.id) || null;
}
const lexicalReviews = await judgeTranslations(successfulRows, apiKey, "lexical_translation");
const lexicalReviewsById = new Map(lexicalReviews.map(review => [review.id, review]));
for (const row of successfulRows) {
  row.lexical_semantic_review = lexicalReviewsById.get(row.id) || null;
}

const report = summarize([...resultsById.values()]);
writeArtifacts(manifest, report);
console.log(JSON.stringify({ ...report, results: undefined }, null, 2));
if (report.failures
    || report.semantic_verdicts.unreviewed
    || report.lexical_ab.semantic_verdicts.unreviewed) process.exitCode = 1;
