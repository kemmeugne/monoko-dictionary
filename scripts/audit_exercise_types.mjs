/**
 * Audits every shipped exercise type against the LIVE corpus — all 50 lessons,
 * both stages.   node scripts/audit_exercise_types.mjs
 *
 * Unit tests (tests/exercise-builders.test.js) prove the builders behave on
 * hand-made rows. This proves they behave on the 6,196 real ones, where the odd
 * shapes actually live: it is what found the 9 rows whose Lingala is "/" and the
 * 947 whose stored token_count disagrees with the tokenizer.
 *
 * Read-only, anon key, production data. Part of the per-slice definition of done
 * in EXERCISE_ENGINE_PLAN.md — re-run it whenever a new exercise type lands.
 */
import fs from "fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const U = "https://haioiccujncsehadipzb.supabase.co";
const K = "sb_publishable_W6hYzyecMTm06Cr9siLV1A_4qtR5ect";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = fs.readFileSync(join(root, "index.html"), "utf8");
const slice = (a, b) => src.slice(src.indexOf(a), src.indexOf(b));
const E = new Function(
  slice("const AUDIO_OPTIONS", "const ChooseAudioScreen") +
  slice("// ── Tokenizer ─", "// ── Exercise engine ─") +
  slice("// ── Exercise engine", "// ── Match-pairs screen") + `
  return { buildSession, countQuestions, questionCount, screenItems, fold, sameWord,
           wordOrderRows, fillBlankRows, tokenize, BLANK_MIN_CHARS,
           WORD_ORDER_MIN, WORD_ORDER_MAX, PAIRS_MIN, PAIRS_MAX, SESSION_QUESTIONS };`)();

const api = async (t, q, r) => {
  const res = await fetch(`${U}/rest/v1/${t}?${q}`, {
    headers: { apikey: K, Authorization: `Bearer ${K}`, ...(r ? { Range: r } : {}) } });
  if (!res.ok) throw new Error(`${t}: ${res.status}`);
  return res.json();
};
const pageAll = async (t, q) => {
  let out = [], from = 0;
  while (true) { const p = await api(t, q, `${from}-${from + 999}`); out = out.concat(p);
    if (p.length < 1000) return out; from += 1000; }
};

const problems = new Set();
const P = (m) => problems.add(m);

const audit = (ex, lesson) => {
  for (const it of E.screenItems(ex)) {
    if (it.poolId == null) P(`${lesson}: ${ex.type} item without poolId`);
    if (!it.fr || !it.fr.trim()) P(`${lesson}: ${ex.type} item without a French prompt`);
  }
  if (ex.type === "match_pairs") {
    if (ex.pairs.length < E.PAIRS_MIN || ex.pairs.length > E.PAIRS_MAX)
      P(`${lesson}: match_pairs of ${ex.pairs.length}`);
    const orth = new Set(ex.pairs.map(p => p.orthography));
    if (new Set(ex.pairs.map(p => p.fr.toLowerCase())).size !== ex.pairs.length)
      P(`${lesson}: duplicate French tile`);
  }
  if (ex.type === "word_order") {
    if (ex.tokens.length < E.WORD_ORDER_MIN || ex.tokens.length > E.WORD_ORDER_MAX)
      P(`${lesson}: word_order of ${ex.tokens.length} tokens`);
    if (ex.tokens.join(" ") !== ex.item.ln) P(`${lesson}: word_order answer != tiles`);
  }
  if (ex.type === "fill_blank") {
    const { tokens, blankIndex, answer } = ex;
    if (!(blankIndex >= 0 && blankIndex < tokens.length)) P(`${lesson}: blankIndex out of range`);
    if (tokens[blankIndex] !== answer) P(`${lesson}: blank does not match the token it replaced`);
    if ([...answer].length < E.BLANK_MIN_CHARS) P(`${lesson}: blank "${answer}" too short`);
    const folded = tokens.map(E.fold);
    if (folded.indexOf(folded[blankIndex]) !== folded.lastIndexOf(folded[blankIndex]))
      P(`${lesson}: blanked a word that repeats in the sentence`);
    // The whole point of the fold: an accent-free typing must be accepted.
    if (!E.sameWord(E.fold(answer), answer)) P(`${lesson}: blank "${answer}" unanswerable without accents`);
    if (tokens.join(" ") !== ex.item.ln) P(`${lesson}: fill_blank sentence != item.ln`);
  }
  if (ex.type === "choose_audio") {
    if (!ex.options.some(o => o.id === ex.answer.id)) P(`${lesson}: answer missing from options`);
    if (!ex.answer.audio) P(`${lesson}: choose_audio without a clip`);
  }
};

const courses = await api("courses", "select=id,course_order&limit=50");
const lessons = await api("lessons", "select=id,title,course_id&limit=200");
const levelOf = l => courses.find(c => c.id === l.course_id)?.course_order || 1;

const pool = await pageAll("lesson_pool",
  "select=id,lesson_id,tier,lingala,french,audio_url,orthography,effective_level,token_count,source_table,source_id");
const byLesson = {};
for (const r of pool) (byLesson[r.lesson_id] ||= []).push(r);

const rows = [];
const mix = {};
for (const [lid, all] of Object.entries(byLesson)) {
  const lesson = lessons.find(l => l.id === Number(lid));
  if (!lesson) continue;
  const level = levelOf(lesson);
  const native = all.filter(r => r.tier === "native");
  let best = 0;
  for (let i = 0; i < 25; i++) {
    const built = E.buildSession(native, level);
    best = Math.max(best, E.countQuestions(built));
    for (const ex of built) {
      audit(ex, lesson.title);
      if (i === 0) mix[ex.type] = (mix[ex.type] || 0) + E.questionCount(ex);
    }
  }
  // Elargir too — the corpus pool is where the odd shapes live.
  const corpus = all.filter(r => r.tier !== "native");
  for (let i = 0; i < 10; i++)
    for (const ex of E.buildSession(corpus, level)) audit(ex, `${lesson.title}/elargir`);

  rows.push({ lesson: lesson.title.slice(0, 30), native: native.length,
              fb: E.fillBlankRows(native, level).length,
              wo: E.wordOrderRows(native, level).length, prat: best });
}

const b = { "20 (full)": 0, "10-19": 0, "5-9": 0, "1-4": 0, "0": 0 };
for (const r of rows) {
  if (r.prat === 0) b["0"]++; else if (r.prat < 5) b["1-4"]++;
  else if (r.prat < 10) b["5-9"]++; else if (r.prat < 20) b["10-19"]++; else b["20 (full)"]++;
}
console.log(`lessons: ${rows.length}\n\nPratiquer questions with FOUR types (best of 25 builds):`);
for (const [k, v] of Object.entries(b)) console.log(`  ${String(v).padStart(3)}  ${k}`);
console.log(`\nquestion mix (one build per lesson): ` +
  Object.entries(mix).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · "));
console.log(`lessons with no fill-blank material: ${rows.filter(r => r.fb === 0).length}`);

console.log(`\nthinnest lessons now:`);
console.table(rows.filter(r => r.prat < 20).sort((a, b) => a.prat - b.prat).slice(0, 6));

console.log(problems.size
  ? `\nPROBLEMS (${problems.size}):\n  ${[...problems].slice(0, 12).join("\n  ")}`
  : `\nAll type invariants OK across every lesson, both stages`);

process.exit(problems.size ? 1 : 0);
