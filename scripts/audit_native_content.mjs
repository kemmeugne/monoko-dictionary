/**
 * Read-only audit for professor-native exercise material.
 *
 * The lesson page is allowed to preserve editorial notes and bundled source
 * material. This script checks the narrower contract required by Pratiquer:
 * one non-blank French prompt, one non-blank Lingala answer, and no exact pair
 * duplicated in the native pool.
 *
 * Run after sql/native_content_cleanup.sql and after any lesson-pool rebuild:
 *   npm run audit:native-content
 */

const U = "https://haioiccujncsehadipzb.supabase.co";
const K = "sb_publishable_W6hYzyecMTm06Cr9siLV1A_4qtR5ect";

const EXCLUDED = new Set([7093, 7747, 7770, 8384, 8642, 8643, 8688, 8689, 8690, 8692]);
const EXAMPLE_SOURCES = new Set([7746, 7751, 7754, 7755]);
const OVERRIDES = new Map([
  [7775, { lingala: "Oyo" }],
  [8641, { french: "Parle ! (tu)" }],
  [8662, { french: "Ne parle pas ! (tu)" }],
  [8663, { french: "Ne finis pas ! (tu)" }],
  [8664, { french: "Ne vends pas ! (tu)" }],
]);

const api = async (table, query, range) => {
  const response = await fetch(`${U}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: K,
      Authorization: `Bearer ${K}`,
      ...(range ? { Range: range } : {}),
    },
  });
  if (!response.ok) throw new Error(`${table}: ${response.status} ${await response.text()}`);
  return response.json();
};

const pageAll = async (table, query) => {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const page = await api(table, query, `${from}-${from + 999}`);
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
};

const clean = value => String(value ?? "").replace(/\s+/g, " ").trim();
const fold = value => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
const problems = [];

const pool = await pageAll(
  "lesson_pool",
  "select=id,lesson_id,source_table,source_id,french,lingala,audio_url,tier&tier=eq.native",
);
const nativeLessonItems = pool.filter(row => row.source_table === "lesson_items");
const bySource = new Map(nativeLessonItems.map(row => [row.source_id, row]));

for (const row of pool) {
  if (!clean(row.french)) problems.push(`pool ${row.id}: blank French prompt`);
  if (!clean(row.lingala)) problems.push(`pool ${row.id}: blank Lingala answer`);
}

for (const sourceId of EXCLUDED) {
  if (bySource.has(sourceId)) problems.push(`lesson_items:${sourceId} should be excluded from exercises`);
}

const exampleIds = [...EXAMPLE_SOURCES].join(",");
const examples = await api(
  "lesson_items",
  `select=id,example_french,example_dialect,example_audio_url&id=in.(${exampleIds})`,
);
for (const source of examples) {
  const row = bySource.get(source.id);
  if (!row) {
    problems.push(`lesson_items:${source.id} example replacement is missing from the pool`);
    continue;
  }
  if (clean(row.french) !== clean(source.example_french)
      || clean(row.lingala) !== clean(source.example_dialect)
      || clean(row.audio_url) !== clean(source.example_audio_url)) {
    problems.push(`lesson_items:${source.id} does not use its professor-recorded example`);
  }
}

for (const [sourceId, expected] of OVERRIDES) {
  const row = bySource.get(sourceId);
  if (!row) {
    problems.push(`lesson_items:${sourceId} normalized row is missing from the pool`);
    continue;
  }
  for (const [field, value] of Object.entries(expected)) {
    if (clean(row[field]) !== value) problems.push(`lesson_items:${sourceId} has unexpected ${field}`);
  }
}

const firstByPair = new Map();
for (const row of pool) {
  // Reuse across lessons is intentional reinforcement. Duplication inside one
  // lesson is what can make the learner answer the same prompt twice.
  const pair = `${row.lesson_id}\u0000${fold(row.french)}\u0000${fold(row.lingala)}`;
  const first = firstByPair.get(pair);
  if (first) {
    problems.push(
      `exact native duplicate: ${first.source_table}:${first.source_id} and ${row.source_table}:${row.source_id}`,
    );
  } else {
    firstByPair.set(pair, row);
  }
}

const missingAudio = pool.filter(row => !clean(row.audio_url));
const unexpectedMissingAudio = missingAudio.filter(row => row.source_table !== "conjugation_forms");
for (const row of unexpectedMissingAudio) {
  problems.push(`${row.source_table}:${row.source_id} has no professor audio`);
}

console.log(`${pool.length} native exercise rows audited`);
console.log(`${nativeLessonItems.length} from lesson_items; ${pool.length - nativeLessonItems.length} generated forms`);
console.log(`${missingAudio.length} rows without audio (${unexpectedMissingAudio.length} unexpected)`);

if (problems.length) {
  console.error(`\nPROBLEMS (${problems.length}):\n  ${problems.join("\n  ")}`);
  process.exit(1);
}

console.log("\nNative exercise content is clean.");
