import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const SOURCE_PATH = "artifacts/lingala_audio/lingala_audio_manifest.json";
const MANIFEST_PATH = "artifacts/stt_benchmark/professor_25_manifest.json";
const RESULTS_PATH = "artifacts/stt_benchmark/scribe_v2_professor_25_results.json";
const CSV_PATH = "artifacts/stt_benchmark/scribe_v2_professor_25_review.csv";
const HTML_PATH = "artifacts/stt_benchmark/scribe_v2_professor_25_review.html";
const AUDIO_ROOT = path.resolve(
  process.env.LINGALA_AUDIO_ROOT
    || "../raw_data/Lingala/audio/Audios Lingala Finaux (01.02.2026)",
);
const ELEVENLABS_URL = "https://api.elevenlabs.io/v1/speech-to-text";
const MODEL_ID = "scribe_v2";
const LANGUAGE_CODE = "lin";
const PREPARE_ONLY = process.argv.includes("--prepare-only");
const REPORT_ONLY = process.argv.includes("--report-only");

const BUCKETS = {
  short: { min: 2, max: 4, target: 3, quota: 5 },
  medium: { min: 5, max: 8, target: 6, quota: 10 },
  long: { min: 9, max: 15, target: 11, quota: 10 },
};

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

function normalizeText(value, { stripDiacritics = false } = {}) {
  let text = String(value || "")
    .normalize(stripDiacritics ? "NFD" : "NFC")
    .toLocaleLowerCase("fr")
    .replace(/[’'`\-]/gu, " ");
  if (stripDiacritics) text = text.replace(/\p{M}+/gu, "");
  return text
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function words(value, options) {
  const normalized = normalizeText(value, options);
  return normalized ? normalized.split(" ") : [];
}

function align(reference, hypothesis) {
  const rows = reference.length + 1;
  const columns = hypothesis.length + 1;
  const distance = Array.from({ length: rows }, () => Array(columns).fill(0));
  const action = Array.from({ length: rows }, () => Array(columns).fill(""));
  for (let i = 1; i < rows; i++) {
    distance[i][0] = i;
    action[i][0] = "delete";
  }
  for (let j = 1; j < columns; j++) {
    distance[0][j] = j;
    action[0][j] = "insert";
  }

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < columns; j++) {
      if (reference[i - 1] === hypothesis[j - 1]) {
        distance[i][j] = distance[i - 1][j - 1];
        action[i][j] = "equal";
        continue;
      }
      const choices = [
        { cost: distance[i - 1][j - 1] + 1, action: "substitute" },
        { cost: distance[i - 1][j] + 1, action: "delete" },
        { cost: distance[i][j - 1] + 1, action: "insert" },
      ].sort((a, b) => a.cost - b.cost);
      distance[i][j] = choices[0].cost;
      action[i][j] = choices[0].action;
    }
  }

  const operations = [];
  let i = reference.length;
  let j = hypothesis.length;
  while (i > 0 || j > 0) {
    const type = action[i][j];
    if (type === "equal" || type === "substitute") {
      operations.push({ type, reference: reference[i - 1], hypothesis: hypothesis[j - 1] });
      i--;
      j--;
    } else if (type === "delete") {
      operations.push({ type, reference: reference[i - 1], hypothesis: null });
      i--;
    } else {
      operations.push({ type: "insert", reference: null, hypothesis: hypothesis[j - 1] });
      j--;
    }
  }
  operations.reverse();

  const counts = { substitutions: 0, deletions: 0, insertions: 0 };
  for (const operation of operations) {
    if (operation.type === "substitute") counts.substitutions++;
    if (operation.type === "delete") counts.deletions++;
    if (operation.type === "insert") counts.insertions++;
  }
  return { distance: distance.at(-1).at(-1), counts, operations };
}

function score(referenceText, hypothesisText, options = {}) {
  const referenceWords = words(referenceText, options);
  const hypothesisWords = words(hypothesisText, options);
  const wordAlignment = align(referenceWords, hypothesisWords);
  const referenceCharacters = normalizeText(referenceText, options).replace(/\s/g, "").split("");
  const hypothesisCharacters = normalizeText(hypothesisText, options).replace(/\s/g, "").split("");
  const characterAlignment = align(referenceCharacters, hypothesisCharacters);
  return {
    reference_words: referenceWords.length,
    hypothesis_words: hypothesisWords.length,
    word_errors: wordAlignment.distance,
    wer: referenceWords.length ? wordAlignment.distance / referenceWords.length : null,
    character_errors: characterAlignment.distance,
    reference_characters: referenceCharacters.length,
    cer: referenceCharacters.length ? characterAlignment.distance / referenceCharacters.length : null,
    exact: referenceWords.join(" ") === hypothesisWords.join(" "),
    word_edits: wordAlignment.counts,
    word_operations: wordAlignment.operations.filter(operation => operation.type !== "equal"),
  };
}

function stableRank(value) {
  return crypto.createHash("sha256").update(`monoko-stt-v1:${value}`).digest("hex");
}

function bucketFor(wordCount) {
  return Object.entries(BUCKETS)
    .find(([, bucket]) => wordCount >= bucket.min && wordCount <= bucket.max)?.[0];
}

function prepareManifest() {
  const source = JSON.parse(fs.readFileSync(SOURCE_PATH, "utf8"));
  const seenText = new Set();
  const candidates = [];

  for (const row of source) {
    const reference = String(row.sentence_dialect || "").replace(/\s+/g, " ").trim();
    const normalized = normalizeText(reference, { stripDiacritics: true });
    const wordCount = words(reference).length;
    const bucket = bucketFor(wordCount);
    const audioRelativePath = path.join(`Lettre ${row.workbook_letter}`, row.audio_file || "");
    const localAudioPath = path.join(AUDIO_ROOT, audioRelativePath);
    if (row.target_type !== "example_sentence"
        || row.db_match_status !== "matched"
        || (!fs.existsSync(localAudioPath) && !row.public_url)
        || !reference
        || !bucket
        || seenText.has(normalized)
        || /[\/|]/.test(reference)) continue;
    seenText.add(normalized);
    candidates.push({
      id: `${row.workbook_letter}-${row.source_cell}`,
      bucket,
      word_count: wordCount,
      workbook_letter: row.workbook_letter,
      source_cell: row.source_cell,
      object_key: row.object_key,
      audio_relative_path: audioRelativePath,
      audio_url: row.public_url,
      reference,
      french: row.sentence_french,
      rank: stableRank(row.object_key),
    });
  }

  const selected = [];
  const usedLetters = new Set();
  for (const [bucketName, bucket] of Object.entries(BUCKETS)) {
    const pool = candidates
      .filter(candidate => candidate.bucket === bucketName)
      .sort((a, b) => {
        const lengthDifference = Math.abs(a.word_count - bucket.target)
          - Math.abs(b.word_count - bucket.target);
        return lengthDifference || a.rank.localeCompare(b.rank);
      });
    for (const candidate of pool) {
      if (selected.filter(item => item.bucket === bucketName).length >= bucket.quota) break;
      if (usedLetters.has(candidate.workbook_letter)) continue;
      selected.push(candidate);
      usedLetters.add(candidate.workbook_letter);
    }
    for (const candidate of pool) {
      if (selected.filter(item => item.bucket === bucketName).length >= bucket.quota) break;
      if (selected.some(item => item.id === candidate.id)) continue;
      selected.push(candidate);
    }
  }

  if (selected.length !== 25) {
    throw new Error(`Expected 25 benchmark clips, selected ${selected.length}`);
  }
  selected.sort((a, b) => {
    const bucketOrder = Object.keys(BUCKETS).indexOf(a.bucket)
      - Object.keys(BUCKETS).indexOf(b.bucket);
    return bucketOrder || a.workbook_letter.localeCompare(b.workbook_letter);
  });

  const manifest = {
    version: 1,
    created_at: new Date().toISOString(),
    source: SOURCE_PATH,
    selection: {
      population: "Professor-recorded, database-matched dictionary example sentences",
      buckets: BUCKETS,
      unique_workbook_letters: new Set(selected.map(item => item.workbook_letter)).size,
      exclusions: "Missing/unmatched audio, duplicate normalized text, slash alternatives, <2 or >15 words",
    },
    clips: selected.map(({ rank, ...clip }) => clip),
  };
  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
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

async function transcribe(clip, apiKey) {
  const localAudioPath = path.join(AUDIO_ROOT, clip.audio_relative_path);
  let audioBuffer;
  let mimeType = "audio/mpeg";
  if (fs.existsSync(localAudioPath)) {
    audioBuffer = fs.readFileSync(localAudioPath);
  } else {
    const audioResponse = await fetchWithRetries(clip.audio_url, {
      signal: AbortSignal.timeout(60_000),
    });
    if (!audioResponse.ok) throw new Error(`Audio HTTP ${audioResponse.status}`);
    audioBuffer = await audioResponse.arrayBuffer();
    mimeType = audioResponse.headers.get("content-type") || mimeType;
  }
  const form = new FormData();
  form.append("file", new Blob([audioBuffer], { type: mimeType }), path.basename(clip.object_key));
  form.append("model_id", MODEL_ID);
  form.append("language_code", LANGUAGE_CODE);
  form.append("tag_audio_events", "true");

  const startedAt = performance.now();
  const response = await fetchWithRetries(ELEVENLABS_URL, {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form,
    signal: AbortSignal.timeout(120_000),
  });
  const latencyMs = Math.round(performance.now() - startedAt);
  if (!response.ok) throw new Error(`ElevenLabs HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const data = await response.json();
  return {
    hypothesis: data.text || "",
    detected_language: data.language_code || null,
    language_probability: data.language_probability ?? null,
    audio_duration_s: Array.isArray(data.words)
      ? Math.max(0, ...data.words.map(word => Number(word.end) || 0))
      : null,
    latency_ms: latencyMs,
  };
}

function aggregateScore(results, key) {
  const scores = results.filter(result => result.ok).map(result => result[key]);
  const sum = field => scores.reduce((total, item) => total + item[field], 0);
  const referenceWords = sum("reference_words");
  const referenceCharacters = sum("reference_characters");
  return {
    reference_words: referenceWords,
    word_errors: sum("word_errors"),
    wer: referenceWords ? sum("word_errors") / referenceWords : null,
    reference_characters: referenceCharacters,
    character_errors: sum("character_errors"),
    cer: referenceCharacters ? sum("character_errors") / referenceCharacters : null,
    exact_matches: scores.filter(item => item.exact).length,
    exact_match_rate: scores.length
      ? scores.filter(item => item.exact).length / scores.length
      : null,
    word_edits: {
      substitutions: scores.reduce((total, item) => total + item.word_edits.substitutions, 0),
      deletions: scores.reduce((total, item) => total + item.word_edits.deletions, 0),
      insertions: scores.reduce((total, item) => total + item.word_edits.insertions, 0),
    },
  };
}

function percentile(values, proportion) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(proportion * sorted.length) - 1] ?? null;
}

function summarize(manifest, results) {
  const successful = results.filter(result => result.ok);
  const latencies = successful.map(result => result.latency_ms);
  const durations = successful.map(result => result.audio_duration_s).filter(Number.isFinite);
  const accentInsensitive = aggregateScore(results, "accent_insensitive");
  const byBucket = Object.fromEntries(Object.keys(BUCKETS).map(bucket => [
    bucket,
    {
      clips: successful.filter(result => result.bucket === bucket).length,
      ...aggregateScore(
        results.filter(result => result.bucket === bucket),
        "accent_insensitive",
      ),
    },
  ]));
  const detectedLanguages = {};
  for (const result of successful) {
    const language = result.detected_language || "unknown";
    detectedLanguages[language] = (detectedLanguages[language] || 0) + 1;
  }
  return {
    benchmark_version: 1,
    generated_at: new Date().toISOString(),
    model_id: MODEL_ID,
    language_code: LANGUAGE_CODE,
    production_equivalent: {
      model_id: MODEL_ID,
      language_code: LANGUAGE_CODE,
      tag_audio_events: true,
      note: "Calls ElevenLabs directly to avoid Monoko auth and the 20-per-5-minute app rate limit; transcription parameters match production.",
    },
    selection: manifest.selection,
    samples: results.length,
    successes: successful.length,
    failures: results.length - successful.length,
    total_audio_duration_s: Number(durations.reduce((sum, value) => sum + value, 0).toFixed(2)),
    latency_ms: latencies.length ? {
      median: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      max: Math.max(...latencies),
    } : null,
    strict: aggregateScore(results, "strict"),
    accent_insensitive: accentInsensitive,
    practical_quality: {
      character_perfect_ignoring_boundaries: successful.filter(
        result => result.accent_insensitive.cer === 0,
      ).length,
      clips_at_or_below_5_percent_cer: successful.filter(
        result => result.accent_insensitive.cer <= 0.05,
      ).length,
      clips_at_or_below_10_percent_cer: successful.filter(
        result => result.accent_insensitive.cer <= 0.1,
      ).length,
      clips_at_or_below_20_percent_cer: successful.filter(
        result => result.accent_insensitive.cer <= 0.2,
      ).length,
      by_bucket: byBucket,
    },
    language_classifier: {
      requested_language: LANGUAGE_CODE,
      returned_language_counts: detectedLanguages,
      mean_probability: successful.length
        ? successful.reduce((sum, result) => sum + (result.language_probability || 0), 0)
          / successful.length
        : null,
    },
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

function writeReviewArtifacts(manifest, report) {
  const clipsById = new Map(manifest.clips.map(clip => [clip.id, clip]));
  const successful = report.results
    .filter(result => result.ok)
    .sort((a, b) => b.accent_insensitive.cer - a.accent_insensitive.cer);
  const csvRows = [[
    "id", "bucket", "reference", "hypothesis", "wer_percent", "cer_percent",
    "latency_ms", "detected_language", "language_probability", "audio_relative_path",
  ]];
  for (const result of successful) {
    const clip = clipsById.get(result.id);
    csvRows.push([
      result.id,
      result.bucket,
      result.reference,
      result.hypothesis,
      (result.accent_insensitive.wer * 100).toFixed(1),
      (result.accent_insensitive.cer * 100).toFixed(1),
      result.latency_ms,
      result.detected_language,
      result.language_probability,
      clip?.audio_relative_path,
    ]);
  }
  fs.writeFileSync(CSV_PATH, `${csvRows.map(row => row.map(csvCell).join(",")).join("\n")}\n`);

  const htmlDirectory = path.dirname(path.resolve(HTML_PATH));
  const rows = successful.map(result => {
    const clip = clipsById.get(result.id);
    const audioPath = clip
      ? path.relative(htmlDirectory, path.join(AUDIO_ROOT, clip.audio_relative_path))
      : "";
    return `
      <tr>
        <td><strong>${escapeHtml(result.id)}</strong><br><small>${escapeHtml(result.bucket)}</small></td>
        <td><audio controls preload="none" src="${escapeHtml(audioPath)}"></audio></td>
        <td>${escapeHtml(result.reference)}</td>
        <td>${escapeHtml(result.hypothesis)}</td>
        <td class="number">${(result.accent_insensitive.wer * 100).toFixed(1)}%</td>
        <td class="number">${(result.accent_insensitive.cer * 100).toFixed(1)}%</td>
        <td>${escapeHtml(result.detected_language || "-")}</td>
      </tr>`;
  }).join("");
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Monoko - Revue STT Lingala</title>
<style>
body{font-family:system-ui,sans-serif;margin:32px;color:#17231b;background:#f5f7f4}main{max-width:1400px;margin:auto}
h1{font-family:Georgia,serif}.summary{display:flex;gap:24px;flex-wrap:wrap;margin:20px 0}.summary strong{font-size:1.4rem}
table{width:100%;border-collapse:collapse;background:white}th,td{padding:12px;border:1px solid #d9e2da;text-align:left;vertical-align:top}
th{background:#153f34;color:white;position:sticky;top:0}.number{font-variant-numeric:tabular-nums;white-space:nowrap}audio{width:220px;max-width:30vw}
small{color:#647168}@media(max-width:800px){body{margin:12px}table{font-size:.85rem}th,td{padding:8px}audio{width:150px}}
</style></head><body><main>
<h1>Benchmark STT Lingala - 25 voix professeur</h1>
<p>Les lignes sont classees par CER decroissant afin de verifier d'abord les transcriptions les plus eloignees.</p>
<div class="summary"><span><strong>${(report.accent_insensitive.wer * 100).toFixed(1)}%</strong><br>WER</span>
<span><strong>${(report.accent_insensitive.cer * 100).toFixed(1)}%</strong><br>CER sans accents</span>
<span><strong>${report.practical_quality.character_perfect_ignoring_boundaries}/25</strong><br>caracteres exacts hors espaces</span>
<span><strong>${report.latency_ms.median} ms</strong><br>latence mediane</span></div>
<table><thead><tr><th>Clip</th><th>Audio</th><th>Reference professeur</th><th>Scribe v2</th><th>WER</th><th>CER</th><th>Langue detectee</th></tr></thead>
<tbody>${rows}</tbody></table>
</main></body></html>`;
  fs.writeFileSync(HTML_PATH, html);
}

const manifest = prepareManifest();
console.log(`Prepared ${manifest.clips.length} clips across ${manifest.selection.unique_workbook_letters} workbook letters.`);
for (const bucket of Object.keys(BUCKETS)) {
  console.log(`  ${bucket}: ${manifest.clips.filter(clip => clip.bucket === bucket).length}`);
}
const localClipCount = manifest.clips.filter(clip => fs.existsSync(
  path.join(AUDIO_ROOT, clip.audio_relative_path),
)).length;
console.log(`  local audio: ${localClipCount}/${manifest.clips.length}`);
if (PREPARE_ONLY) process.exit(0);

if (REPORT_ONLY) {
  if (!fs.existsSync(RESULTS_PATH)) throw new Error(`Missing existing report: ${RESULTS_PATH}`);
  const existing = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf8"));
  const report = summarize(manifest, existing.results || []);
  fs.writeFileSync(RESULTS_PATH, `${JSON.stringify(report, null, 2)}\n`);
  writeReviewArtifacts(manifest, report);
  console.log(JSON.stringify({
    samples: report.samples,
    successes: report.successes,
    failures: report.failures,
    latency_ms: report.latency_ms,
    strict: report.strict,
    accent_insensitive: report.accent_insensitive,
    practical_quality: report.practical_quality,
    language_classifier: report.language_classifier,
    results_path: RESULTS_PATH,
  }, null, 2));
  process.exit(0);
}

const apiKey = envValue("ELEVENLABS_API_KEY");
if (!apiKey) throw new Error("ELEVENLABS_API_KEY is missing from the environment or .env.local");

const results = [];
for (const [index, clip] of manifest.clips.entries()) {
  try {
    const transcription = await transcribe(clip, apiKey);
    const result = {
      id: clip.id,
      bucket: clip.bucket,
      word_count: clip.word_count,
      reference: clip.reference,
      ...transcription,
      ok: true,
      strict: score(clip.reference, transcription.hypothesis),
      accent_insensitive: score(clip.reference, transcription.hypothesis, { stripDiacritics: true }),
    };
    results.push(result);
    console.log(
      `${index + 1}/${manifest.clips.length} OK  `
      + `WER ${(result.accent_insensitive.wer * 100).toFixed(1)}%  `
      + `${result.latency_ms} ms  ${clip.id}`,
    );
  } catch (error) {
    results.push({
      id: clip.id,
      bucket: clip.bucket,
      word_count: clip.word_count,
      reference: clip.reference,
      ok: false,
      error: error.message,
    });
    console.error(`${index + 1}/${manifest.clips.length} FAIL ${clip.id}: ${error.message}`);
  }
  fs.writeFileSync(RESULTS_PATH, `${JSON.stringify(summarize(manifest, results), null, 2)}\n`);
}

const report = summarize(manifest, results);
fs.writeFileSync(RESULTS_PATH, `${JSON.stringify(report, null, 2)}\n`);
writeReviewArtifacts(manifest, report);
console.log(JSON.stringify({
  samples: report.samples,
  successes: report.successes,
  failures: report.failures,
  total_audio_duration_s: report.total_audio_duration_s,
  latency_ms: report.latency_ms,
  strict: report.strict,
  accent_insensitive: report.accent_insensitive,
  practical_quality: report.practical_quality,
  language_classifier: report.language_classifier,
  results_path: RESULTS_PATH,
}, null, 2));
if (report.failures) process.exitCode = 1;
