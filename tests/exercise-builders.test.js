/**
 * Exercise builder unit tests — the pure session-assembly code from index.html.
 *
 * Same extraction trick as tests/tokenizer.test.js: the engine has no module to
 * import, so the relevant runs of the babel block are sliced out and evaluated.
 * The choose-audio helpers sit after MatchPairsScreen in the file, so three
 * slices are stitched together in dependency order.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = readFileSync(join(root, "index.html"), "utf8");

const slice = (from, to) => {
  const a = src.indexOf(from), b = src.indexOf(to);
  if (a < 0 || b < 0 || b <= a) {
    throw new Error(`engine markers not found: "${from}" .. "${to}" — did a section move?`);
  }
  return src.slice(a, b);
};

const engine = new Function(
  slice("const AUDIO_OPTIONS", "const ChooseAudioScreen") +
  slice("// ── Tokenizer ─", "// ── Exercise engine ─") +
  slice("// ── Exercise engine", "// ── Match-pairs screen") + `
  return { buildSession, buildWordOrder, wordOrderRows, wordOrderScreens,
           interleave, questionCount, countQuestions, makeLedger, itemId,
           usableRow, SESSION_QUESTIONS, WORD_ORDER_MIN, WORD_ORDER_MAX };`
)();

// A pool row shaped like lesson_pool's real columns.
let nextId = 1;
const row = (lingala, french, over = {}) => ({
  id: nextId++,
  source_table: "lesson_items",
  source_id: nextId,
  lingala, french,
  audio_url: "https://r2.test/a.mp3",
  tier: "native",
  orthography: "toned",
  token_count: lingala.trim().split(/\s+/).length,   // the DB's naive count
  effective_level: 1,
  ...over,
});

describe("buildWordOrder", () => {
  it("makes one tile per word", () => {
    const ex = engine.buildWordOrder(row("Nazali kokende na zando", "Je vais au marché"));
    expect(ex.type).toBe("word_order");
    expect(ex.tokens).toEqual(["Nazali", "kokende", "na", "zando"]);
  });

  it("answers with the TOKENISED sentence, not the raw string", () => {
    // The learner is never offered a "?" tile, so an answer compared against the
    // raw text could never be right.
    const ex = engine.buildWordOrder(row("Olingi kofanda na ndako ?", "Tu veux rester à la maison ?"));
    expect(ex.tokens).toEqual(["Olingi", "kofanda", "na", "ndako"]);
    expect(ex.item.ln).toBe("Olingi kofanda na ndako");
    expect(ex.tokens.join(" ")).toBe(ex.item.ln);
  });

  it("keeps a repeated word as two separate tiles", () => {
    const ex = engine.buildWordOrder(row("Na ndako na ngai", "Dans ma maison"));
    expect(ex.tokens).toEqual(["Na", "ndako", "na", "ngai"]);
    expect(ex.tokens.length).toBe(4);
  });

  it("carries poolId, so the attempt can be written", () => {
    const r = row("Nazali kokende na zando", "Je vais au marché");
    const ex = engine.buildWordOrder(r);
    expect(ex.item.poolId).toBe(r.id);
    expect(ex.item.id).toBe(engine.itemId(r));
  });
});

describe("wordOrderRows — what qualifies", () => {
  const level = 3;

  it("takes 3 to 9 tokens and nothing else", () => {
    const rows = [
      row("Mbote na yo", "Bonjour"),                                  // 3 ✓
      row("Nazali", "Je suis"),                                       // 1 ✗
      row("Mbote mingi", "Bonjour beaucoup"),                         // 2 ✗
      row("a b c d e f g h i", "neuf"),                               // 9 ✓
      row("a b c d e f g h i j", "dix"),                              // 10 ✗
    ];
    const got = engine.wordOrderRows(rows, level).map(r => r.lingala);
    expect(got).toEqual(["Mbote na yo", "a b c d e f g h i"]);
  });

  it("counts with the tokenizer, not the stored token_count", () => {
    // Stored as 3 by the DB's whitespace split; really 2 words + a floating "?".
    const r = row("Olingi kofanda ?", "Tu veux rester ?");
    expect(r.token_count).toBe(3);                       // what the column says
    expect(engine.wordOrderRows([r], level)).toEqual([]); // what is actually true
  });

  it("excludes rows above the learner's level", () => {
    const r = row("Mbote na yo mingi", "Bonjour", { effective_level: 6 });
    expect(engine.wordOrderRows([r], 1)).toEqual([]);
    expect(engine.wordOrderRows([r], 6)).toHaveLength(1);
  });

  it("excludes the dictionary's missing-translation placeholders", () => {
    expect(engine.usableRow(row("/", "Xylophone"))).toBe(false);
    expect(engine.wordOrderRows([row("/", "Xylophone"), row("?", "Air")], level)).toEqual([]);
  });

  it("survives an empty or null pool", () => {
    expect(engine.wordOrderRows([], level)).toEqual([]);
    expect(engine.wordOrderRows(null, level)).toEqual([]);
  });
});

describe("wordOrderScreens — budget and the ledger", () => {
  const pool = Array.from({ length: 30 }, (_, i) => row(`w${i} x${i} y${i}`, `fr ${i}`));

  it("never exceeds its question budget", () => {
    const screens = engine.wordOrderScreens(pool, 3, 5, engine.makeLedger());
    expect(screens).toHaveLength(5);
    expect(engine.countQuestions(screens)).toBe(5);
  });

  it("costs one question per screen", () => {
    const screens = engine.wordOrderScreens(pool, 3, 4, engine.makeLedger());
    screens.forEach(s => expect(engine.questionCount(s)).toBe(1));
  });

  it("never uses the same item twice in this format", () => {
    const screens = engine.wordOrderScreens(pool, 3, 30, engine.makeLedger());
    const ids = screens.map(s => s.item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("respects an item already spent on word_order by another builder", () => {
    const ledger = engine.makeLedger();
    const one = [row("aa bb cc", "fr")];
    ledger.use(engine.itemId(one[0]), "word_order");
    expect(engine.wordOrderScreens(one, 3, 5, ledger)).toEqual([]);
  });

  it("still allows an item that was used in a DIFFERENT format", () => {
    // Cross-format reuse is what lets a thin lesson fill a session.
    const ledger = engine.makeLedger();
    const one = [row("aa bb cc", "fr")];
    ledger.use(engine.itemId(one[0]), "match_pairs");
    expect(engine.wordOrderScreens(one, 3, 5, ledger)).toHaveLength(1);
  });
});

describe("interleave — mixing N exercise types", () => {
  const q1 = (n) => ({ type: "choose_audio", answer: { id: `a${n}` } });
  const q5 = (n) => ({ type: "match_pairs", pairs: Array.from({ length: 5 }, (_, i) => ({ id: `p${n}${i}` })) });

  it("alternates between lists rather than running one then the next", () => {
    const out = engine.interleave([[q1(1), q1(2)], [q1(3), q1(4)]], 4);
    expect(out.map(e => e.answer.id)).toEqual(["a1", "a3", "a2", "a4"]);
  });

  it("counts questions, not screens", () => {
    const out = engine.interleave([[q5(1)], [q1(1), q1(2)]], 20);
    expect(engine.countQuestions(out)).toBe(7);   // 5 + 1 + 1
  });

  it("never exceeds the budget", () => {
    const out = engine.interleave([[q5(1), q5(2), q5(3), q5(4), q5(5)], []], 20);
    expect(engine.countQuestions(out)).toBeLessThanOrEqual(20);
  });

  it("skips an oversized screen but keeps filling with ones that fit", () => {
    // 3 questions left, a 5-pair screen cannot fit, three singles can.
    const out = engine.interleave([[q5(1), q5(2), q5(3), q5(4), q5(5)], [q1(1), q1(2), q1(3)]], 18);
    expect(engine.countQuestions(out)).toBe(18);
    expect(out.filter(e => e.type === "choose_audio")).toHaveLength(3);
  });

  it("handles empty lists", () => {
    expect(engine.interleave([[], []], 20)).toEqual([]);
    expect(engine.interleave([], 20)).toEqual([]);
  });
});

describe("buildSession with three exercise types", () => {
  // A pool rich enough for every type: short pairs, audio, and 3-9 token rows.
  const pool = [
    ...Array.from({ length: 12 }, (_, i) => row(`mot${i}`, `mot ${i}`)),
    ...Array.from({ length: 12 }, (_, i) => row(`a${i} b${i} c${i} d${i}`, `phrase ${i} de test`)),
  ];

  it("fills the budget and mixes types", () => {
    const built = engine.buildSession(pool, 3, engine.SESSION_QUESTIONS);
    expect(engine.countQuestions(built)).toBeLessThanOrEqual(engine.SESSION_QUESTIONS);
    expect(engine.countQuestions(built)).toBeGreaterThan(0);
    expect(new Set(built.map(e => e.type)).size).toBeGreaterThan(1);
  });

  it("gives every word_order screen a valid, solvable shape", () => {
    for (let i = 0; i < 40; i++) {
      for (const ex of engine.buildSession(pool, 3).filter(e => e.type === "word_order")) {
        expect(ex.tokens.length).toBeGreaterThanOrEqual(engine.WORD_ORDER_MIN);
        expect(ex.tokens.length).toBeLessThanOrEqual(engine.WORD_ORDER_MAX);
        expect(ex.tokens.every(t => t.length > 0)).toBe(true);
        expect(ex.tokens.join(" ")).toBe(ex.item.ln);
        expect(ex.item.poolId).toBeDefined();
      }
    }
  });

  it("returns nothing rather than throwing on an empty pool", () => {
    expect(engine.buildSession([], 3)).toEqual([]);
    expect(engine.buildSession(null, 3)).toEqual([]);
  });
});
