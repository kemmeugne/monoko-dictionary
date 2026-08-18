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
  slice("const AUDIO_OPTIONS", "const ClipPlayer") +
  slice("// ── Tokenizer ─", "// ── Exercise engine ─") +
  slice("// ── Exercise engine", "// ── Match-pairs screen") + `
  return { buildSession, buildWordOrder, wordOrderRows, wordOrderScreens,
           buildFillBlank, fillBlankRows, fillBlankScreens, blankCandidates,
           sameWord, tokenize, fold,
           buildListenType, listenTypeRows, listenTypeScreens, characters,
           buildSpeaking, speakingRows, speakingScreens,
           selectionOrder, screenItems, plural, PROGRAMME_LABELS, programmeOf,
           interleave, questionCount, countQuestions, scoreableAttempts, makeLedger, itemId,
           usableRow, SESSION_QUESTIONS, WORD_ORDER_MIN, WORD_ORDER_MAX,
           BLANK_MIN_CHARS, FILL_BLANK_MIN_TOKENS,
           LISTEN_MAX_TOKENS, LISTEN_MAX_CHARS, LISTEN_TILES };`
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

describe("blankCandidates — which word gets removed", () => {
  it("skips words shorter than the minimum, because those are grammar", () => {
    // na / ya / te / ko / ba are the pool's most frequent tokens by a mile.
    const got = engine.blankCandidates(["Nazali", "na", "ndako", "ya", "ngai"]);
    expect(got.map(c => c.word)).toEqual(["Nazali", "ndako", "ngai"]);
  });

  it("skips a word that appears twice in the sentence", () => {
    // Blanking one "ndako" while the other sits visible is not a question.
    const got = engine.blankCandidates(["ndako", "monene", "na", "ndako"]);
    expect(got.map(c => c.word)).toEqual(["monene"]);
  });

  it("treats accent variants of the same word as a repeat", () => {
    // "mbula" and "mbúla" are one word; blanking either gives the answer away.
    const got = engine.blankCandidates(["mbula", "eza", "mbúla", "malamu"]);
    expect(got.map(c => c.word)).toEqual(["malamu"]);
  });

  it("reports the index, not just the word", () => {
    const got = engine.blankCandidates(["na", "ndako", "monene"]);
    expect(got).toEqual([{ word: "ndako", i: 1 }, { word: "monene", i: 2 }]);
  });

  it("returns nothing when every word is short or repeated", () => {
    expect(engine.blankCandidates(["na", "ya", "te"])).toEqual([]);
  });
});

describe("fillBlankRows / buildFillBlank", () => {
  const level = 3;

  it("needs at least 3 tokens and one blankable word", () => {
    expect(engine.fillBlankRows([row("Nazali na ndako", "Je suis à la maison")], level)).toHaveLength(1);
    expect(engine.fillBlankRows([row("na ya te", "grammaire")], level)).toEqual([]);
    expect(engine.fillBlankRows([row("Nazali ndako", "deux mots")], level)).toEqual([]);
  });

  it("blanks a real word and keeps the rest of the sentence", () => {
    const ex = engine.buildFillBlank(row("Nazali na ndako ya ngai", "Je suis dans ma maison"));
    expect(ex.type).toBe("fill_blank");
    expect(ex.tokens[ex.blankIndex]).toBe(ex.answer);
    expect([...ex.answer].length).toBeGreaterThanOrEqual(engine.BLANK_MIN_CHARS);
    expect(ex.tokens.join(" ")).toBe(ex.item.ln);
  });

  it("never blanks a word that is short or repeated, over many draws", () => {
    const r = row("ndako monene na ndako ya biso", "la grande maison chez nous");
    for (let i = 0; i < 60; i++) {
      const ex = engine.buildFillBlank(r);
      expect(["monene", "biso"]).toContain(ex.answer);   // never "ndako" or "na"/"ya"
    }
  });

  it("varies which word it blanks across draws, so a replay differs", () => {
    const r = row("Nazali kokende zando monene lelo", "Je vais au grand marché");
    const seen = new Set();
    for (let i = 0; i < 60; i++) seen.add(engine.buildFillBlank(r).answer);
    expect(seen.size).toBeGreaterThan(1);
  });

  it("accepts the answer typed without its accents", () => {
    const r = row("Nazali na mbúla monene", "Je suis dans la grande pluie");
    for (let i = 0; i < 30; i++) {
      const ex = engine.buildFillBlank(r);
      expect(engine.sameWord(engine.fold(ex.answer), ex.answer)).toBe(true);
    }
  });

  it("excludes placeholder rows and rows above the level", () => {
    expect(engine.fillBlankRows([row("/", "Xylophone")], level)).toEqual([]);
    expect(engine.fillBlankRows([row("Nazali na ndako", "fr", { effective_level: 6 })], 1)).toEqual([]);
  });

  it("survives an empty or null pool", () => {
    expect(engine.fillBlankRows([], level)).toEqual([]);
    expect(engine.fillBlankRows(null, level)).toEqual([]);
  });
});

describe("fillBlankScreens — budget and ledger", () => {
  const pool = Array.from({ length: 20 }, (_, i) => row(`aaa${i} bbbb${i} cccc${i}`, `fr ${i}`));

  it("costs one question per screen and respects the budget", () => {
    const screens = engine.fillBlankScreens(pool, 3, 4, engine.makeLedger());
    expect(screens).toHaveLength(4);
    expect(engine.countQuestions(screens)).toBe(4);
  });

  it("never repeats an item within the format", () => {
    const screens = engine.fillBlankScreens(pool, 3, 20, engine.makeLedger());
    const ids = screens.map(s => s.item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("still allows an item already used in another format", () => {
    const ledger = engine.makeLedger();
    const one = [row("aaaa bbbb cccc", "fr")];
    ledger.use(engine.itemId(one[0]), "word_order");
    expect(engine.fillBlankScreens(one, 3, 5, ledger)).toHaveLength(1);
  });
});

describe("listenTypeRows / buildListenType", () => {
  const level = 3;

  it("takes 1 to 2 tokens and needs a recording", () => {
    expect(engine.listenTypeRows([row("mbote", "bonjour")], level)).toHaveLength(1);
    expect(engine.listenTypeRows([row("mbote na yo", "bonjour à toi")], level)).toEqual([]);
    expect(engine.listenTypeRows([row("mbote", "bonjour", { audio_url: null })], level)).toEqual([]);
  });

  it("rejects a word too long for the tile bank", () => {
    const long = "a".repeat(engine.LISTEN_MAX_CHARS + 1);
    expect(engine.listenTypeRows([row(long, "trop long")], level)).toEqual([]);
    expect(engine.listenTypeRows([row("a".repeat(engine.LISTEN_MAX_CHARS), "ok")], level)).toHaveLength(1);
  });

  it("folds ɛ and ɔ to plain letters, one tile each", () => {
    // The learner spells the skeleton; the reveal teaches the real orthography.
    const ex = engine.buildListenType(row("bilɔkɔ", "les choses"));
    expect(ex.words).toEqual([["b", "i", "l", "o", "k", "o"]]);
    expect(ex.item.ln).toBe("bilɔkɔ");        // the truth is kept for the reveal
  });

  it("folds tones and capitals out of the tiles", () => {
    const ex = engine.buildListenType(row("Mbóte", "bonjour"));
    expect(ex.words).toEqual([["m", "b", "o", "t", "e"]]);
    expect(ex.item.ln).toBe("Mbóte");
  });

  it("keeps the slot count equal to the real spelling's length", () => {
    // Folding is 1:1 per character, so the tiles never mislead about length.
    for (const w of ["Mbóte", "bilɔkɔ", "kobɛla", "telefɔni"]) {
      const ex = engine.buildListenType(row(w, "fr"));
      expect(ex.words.flat().length).toBe([...w].length);
    }
  });

  it("groups slots per word so a space is never a tile", () => {
    const ex = engine.buildListenType(row("mbote yo", "bonjour toi"));
    expect(ex.words).toEqual([["m", "b", "o", "t", "e"], ["y", "o"]]);
    expect(ex.tiles.some(t => t.ch === " ")).toBe(false);
  });

  it("offers every character the answer needs", () => {
    const ex = engine.buildListenType(row("mbóte", "bonjour"));
    const bank = ex.tiles.map(t => t.ch);
    for (const ch of ex.words.flat()) {
      const need = ex.words.flat().filter(c => c === ch).length;
      expect(bank.filter(c => c === ch).length).toBeGreaterThanOrEqual(need);
    }
  });

  it("never offers a tile the learner cannot be expected to place", () => {
    // No tones, no ɛ/ɔ, no capitals in the bank: accents are taught in the
    // reveal, not demanded from someone who has heard the word once.
    for (const w of ["Mbóte", "bilɔkɔ", "kobɛla"]) {
      const bank = engine.buildListenType(row(w, "fr")).tiles.map(t => t.ch);
      expect(bank.every(c => /[a-z]/.test(c))).toBe(true);
    }
  });

  it("skips compound words, whose hyphen cannot be heard", () => {
    // "Kili-kili" would need a hyphen tile. Costs 1 native row of 644.
    expect(engine.listenTypeRows([row("Kili-kili", "aisselle")], 3)).toEqual([]);
    expect(engine.listenTypeRows([row("mbote", "bonjour")], 3)).toHaveLength(1);
  });

  it("fills the bank to LISTEN_TILES without duplicating tile keys", () => {
    const ex = engine.buildListenType(row("mbote", "bonjour"));
    expect(ex.tiles.length).toBe(engine.LISTEN_TILES);
    expect(new Set(ex.tiles.map(t => t.key)).size).toBe(ex.tiles.length);
  });

  it("never offers fewer tiles than the answer needs, even at max length", () => {
    const ex = engine.buildListenType(row("a".repeat(engine.LISTEN_MAX_CHARS), "long"));
    expect(ex.tiles.length).toBeGreaterThanOrEqual(engine.LISTEN_MAX_CHARS);
  });

  it("carries poolId and the French for the reveal", () => {
    const r = row("mbote", "bonjour");
    const ex = engine.buildListenType(r);
    expect(ex.item.poolId).toBe(r.id);
    expect(ex.item.fr).toBe("bonjour");
    expect(ex.item.ln).toBe("mbote");
  });

  it("excludes placeholder rows", () => {
    expect(engine.listenTypeRows([row("/", "Xylophone")], level)).toEqual([]);
  });
});

describe("listenTypeScreens — budget and ledger", () => {
  // Letters only: the builder excludes anything whose folded spelling is not
  // pure a-z, because a tile has to be something you can hear.
  const abc = "abcdefghijklmnopqrst";
  const pool = Array.from({ length: 20 }, (_, i) => row(`mot${abc[i]}`, `fr ${i}`));

  it("costs one question per screen and respects the budget", () => {
    const screens = engine.listenTypeScreens(pool, 3, 3, engine.makeLedger());
    expect(screens).toHaveLength(3);
    expect(engine.countQuestions(screens)).toBe(3);
  });

  it("never repeats an item within the format", () => {
    const screens = engine.listenTypeScreens(pool, 3, 20, engine.makeLedger());
    expect(new Set(screens.map(s => s.item.id)).size).toBe(screens.length);
  });
});

describe("record-and-compare speaking", () => {
  it("needs professor audio and keeps prompts to eight tokens", () => {
    expect(engine.speakingRows([row("mbote", "bonjour")], 3)).toHaveLength(1);
    expect(engine.speakingRows([row("mbote", "bonjour", { audio_url: null })], 3)).toEqual([]);
    expect(engine.speakingRows([row("a b c d e f g h i", "trop long")], 3)).toEqual([]);
  });

  it("carries the pool id, both texts, and the professor clip", () => {
    const r = row("Mbote na yo", "Bonjour à toi");
    const ex = engine.buildSpeaking(r);
    expect(ex.type).toBe("speaking");
    expect(ex.item).toMatchObject({ poolId: r.id, ln: "Mbote na yo", fr: "Bonjour à toi",
                                   audio: r.audio_url });
  });

  it("never adds more than three speaking prompts to one session", () => {
    const pool = Array.from({ length: 20 }, (_, i) => row(`mot${i}`, `mot ${i}`));
    const screens = engine.speakingScreens(pool, 3, 20, engine.makeLedger());
    expect(screens).toHaveLength(3);
    expect(engine.countQuestions(screens)).toBe(3);
  });

  it("excludes self-ratings from objective scoring", () => {
    const attempts = [
      { format: "choose_audio", correct: true },
      { format: "fill_blank", correct: false },
      { format: "speaking", correct: true, scored: false },
      { format: "speaking", correct: false, scored: false },
    ];
    expect(engine.scoreableAttempts(attempts)).toEqual(attempts.slice(0, 2));
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

describe("selectionOrder — breadth first", () => {
  const rows = [row("aaa", "a"), row("bbb", "b"), row("ccc", "c"), row("ddd", "d")];

  it("puts items never met in a past session ahead of ones already met", () => {
    const seen = new Map([[rows[0].id, 100], [rows[1].id, 100]]);
    const out = engine.selectionOrder(rows, engine.makeLedger(), seen);
    const unseen = [rows[2].id, rows[3].id];
    expect(unseen).toContain(out[0].id);
    expect(unseen).toContain(out[1].id);
  });

  it("puts items untouched in THIS session ahead of ones already used", () => {
    const ledger = engine.makeLedger();
    ledger.use(engine.itemId(rows[0]), "match_pairs");
    ledger.use(engine.itemId(rows[1]), "word_order");
    const out = engine.selectionOrder(rows, ledger, new Map());
    expect([rows[2].id, rows[3].id]).toContain(out[0].id);
  });

  it("brings the stalest item back first among ones already met", () => {
    const seen = new Map([[rows[0].id, 300], [rows[1].id, 100], [rows[2].id, 200], [rows[3].id, 400]]);
    const out = engine.selectionOrder(rows, engine.makeLedger(), seen);
    expect(out.map(r => r.id)).toEqual([rows[1].id, rows[2].id, rows[0].id, rows[3].id]);
  });

  it("prefers the better tier when nothing else separates two items", () => {
    const mixed = [row("aaa", "a", { tier: "reassigned" }), row("bbb", "b", { tier: "approved" })];
    const out = engine.selectionOrder(mixed, engine.makeLedger(), new Map());
    expect(out[0].tier).toBe("approved");
  });

  it("but breadth beats tier — an unseen reassigned row outranks a seen approved one", () => {
    const app = row("aaa", "a", { tier: "approved" });
    const rea = row("bbb", "b", { tier: "reassigned" });
    const out = engine.selectionOrder([app, rea], engine.makeLedger(), new Map([[app.id, 1]]));
    expect(out[0].id).toBe(rea.id);
  });

  it("orders randomly when nothing separates the items", () => {
    const many = Array.from({ length: 12 }, (_, i) => row(`w${i}`, `f${i}`));
    const firsts = new Set();
    for (let i = 0; i < 40; i++)
      firsts.add(engine.selectionOrder(many, engine.makeLedger(), new Map())[0].id);
    expect(firsts.size).toBeGreaterThan(1);
  });

  it("survives a null history and a null row list", () => {
    expect(engine.selectionOrder(rows, engine.makeLedger(), null)).toHaveLength(4);
    expect(engine.selectionOrder(null, engine.makeLedger(), null)).toEqual([]);
  });
});

describe("repeat sessions cover new material", () => {
  // 40 short rows: enough that one session cannot show them all.
  const pool = Array.from({ length: 40 }, (_, i) => row(`mot${i}`, `mot ${i}`));

  const playSessions = (n, useHistory) => {
    const history = new Map();
    const covered = new Set();
    let clock = 1;
    for (let s = 0; s < n; s++) {
      for (const ex of engine.buildSession(pool, 3, 20, useHistory ? history : null))
        for (const it of engine.screenItems(ex)) { covered.add(it.poolId); history.set(it.poolId, clock++); }
    }
    return covered.size;
  };

  it("a second session teaches items the first one did not", () => {
    // The point of the feature: tapping S'entraîner again moves through the
    // lesson rather than re-rolling the same 20 items.
    expect(playSessions(2, true)).toBeGreaterThan(playSessions(1, true));
  });

  it("covers more of the pool than random selection does", () => {
    const led = playSessions(3, true), random = playSessions(3, false);
    expect(led).toBeGreaterThan(random);
  });

  it("does not stall — repeated sessions keep adding until the pool is spent", () => {
    expect(playSessions(6, true)).toBe(pool.length);
  });
});

describe("plural — French counts", () => {
  it("stays singular after 0 and 1, plural only from 2", () => {
    expect(engine.plural(0, "partie", "parties")).toBe("0\u00A0partie");
    expect(engine.plural(1, "partie", "parties")).toBe("1\u00A0partie");
    expect(engine.plural(2, "partie", "parties")).toBe("2\u00A0parties");
  });

  it("joins with a non-breaking space, so the number never wraps off its unit", () => {
    expect(engine.plural(20, "question", "questions")).toContain("\u00A0");
    expect(engine.plural(20, "question", "questions")).not.toContain(" ");
  });
});

describe("programmeOf — the briefing's Au programme list", () => {
  const pool = [
    ...Array.from({ length: 12 }, (_, i) => row(`mot${"abcdefghijkl"[i]}`, `mot ${i}`)),
    ...Array.from({ length: 12 }, (_, i) => row(`aaa${i} bbbb${i} cccc${i} dddd${i}`, `phrase ${i} de test`)),
  ];

  it("EVERY type buildSession can emit has a label", () => {
    // Without this, a sixth exercise type would render a blank line in the
    // briefing and nobody would notice until a learner mentioned it.
    const seen = new Set();
    for (let i = 0; i < 60; i++)
      for (const ex of engine.buildSession(pool, 3)) seen.add(ex.type);
    expect(seen.size).toBeGreaterThan(1);
    for (const type of seen) {
      expect(engine.PROGRAMME_LABELS[type], `no Au programme label for "${type}"`).toBeDefined();
      expect(typeof engine.PROGRAMME_LABELS[type](3)).toBe("string");
    }
  });

  it("counts questions off the built queue, not screens", () => {
    // A match-pairs screen is 5 questions; the briefing must say 5, not 1.
    const queue = [
      { type: "match_pairs", pairs: [1, 2, 3, 4, 5].map(i => ({ id: i })) },
      { type: "choose_audio", answer: { id: "a" } },
    ];
    const rows = engine.programmeOf(queue);
    expect(rows.find(r => r.type === "match_pairs").n).toBe(5);
    expect(rows.find(r => r.type === "choose_audio").n).toBe(1);
  });

  it("orders by count, biggest first", () => {
    const queue = [
      { type: "choose_audio", answer: { id: "a" } },
      { type: "match_pairs", pairs: [1, 2, 3].map(i => ({ id: i })) },
      { type: "word_order", tokens: ["a", "b", "c"], item: { id: "w" } },
    ];
    expect(engine.programmeOf(queue).map(r => r.n)).toEqual([3, 1, 1]);
  });

  it("omits types the session does not contain", () => {
    const rows = engine.programmeOf([{ type: "fill_blank", item: { id: "f" } }]);
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("fill_blank");
  });

  it("labels read as French, singular at 1", () => {
    expect(engine.PROGRAMME_LABELS.match_pairs(1)).toBe("1\u00A0paire à associer");
    expect(engine.PROGRAMME_LABELS.match_pairs(5)).toBe("5\u00A0paires à associer");
    expect(engine.PROGRAMME_LABELS.listen_type(1)).toBe("1\u00A0mot à écrire à l'oreille");
    expect(engine.PROGRAMME_LABELS.listen_type(4)).toBe("4\u00A0mots à écrire à l'oreille");
    expect(engine.PROGRAMME_LABELS.choose_audio(2)).toBe("2\u00A0enregistrements à reconnaître");
    expect(engine.PROGRAMME_LABELS.word_order(3)).toBe("3\u00A0phrases à remettre dans l'ordre");
    expect(engine.PROGRAMME_LABELS.fill_blank(1)).toBe("1\u00A0phrase à compléter");
    expect(engine.PROGRAMME_LABELS.speaking(3)).toBe("3\u00A0prononciations à comparer");
  });

  it("survives an empty or null queue", () => {
    expect(engine.programmeOf([])).toEqual([]);
    expect(engine.programmeOf(null)).toEqual([]);
  });
});

describe("buildSession with all exercise types", () => {
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
