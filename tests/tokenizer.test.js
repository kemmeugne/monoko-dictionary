/**
 * Tokenizer unit tests.
 *
 * The engine lives inside index.html's <script type="text/babel"> block, so
 * there is nothing to import. The block between two marker comments is sliced
 * out and evaluated instead — which means these tests run against the exact
 * source the browser runs, not a copy that can drift from it.
 *
 * Three exercises in Slice 6 depend on these functions agreeing about where a
 * word ends (tap-words, fill-the-blank, listen-and-type), so a regression here
 * breaks three screens at once. That is why the tokenizer is tested before any
 * of them is built.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = readFileSync(join(root, "index.html"), "utf8");

const start = src.indexOf("// ── Tokenizer ─");
const end = src.indexOf("// ── Exercise engine ─");
if (start < 0 || end < 0 || end <= start) {
  throw new Error("tokenizer block markers not found in index.html — did the section move?");
}

const { tokenize, tokenCount, characters, fold, sameWord } = new Function(
  src.slice(start, end) +
  "return { tokenize, tokenCount, characters, fold, sameWord };"
)();

describe("tokenize — what counts as a word", () => {
  it("splits on whitespace", () => {
    expect(tokenize("Nazali kokende")).toEqual(["Nazali", "kokende"]);
  });

  it("drops punctuation that French typography leaves floating", () => {
    // The bug this whole exercise exists to prevent: the stored token_count
    // says 3, and a naive split renders a tile containing just "?".
    expect(tokenize("Olingi kofanda ?")).toEqual(["Olingi", "kofanda"]);
    expect(tokenize("Boyei bolamu !")).toEqual(["Boyei", "bolamu"]);
    expect(tokenCount("Olingi kofanda ?")).toBe(2);
  });

  it("strips punctuation clinging to a word's edge", () => {
    expect(tokenize("Mbote, baninga na ngai !")).toEqual(["Mbote", "baninga", "na", "ngai"]);
    expect(tokenize("« Mbóte »")).toEqual(["Mbóte"]);
  });

  it("drops parenthesised glosses, which are editorial not spoken", () => {
    expect(tokenize("Moteki (ba teki)")).toEqual(["Moteki"]);
    expect(tokenCount("Moteki (ba teki)")).toBe(1);
  });

  it("treats a slash as a variant separator, never a word character", () => {
    // An unspaced slash means the professor read both alternatives into one cell.
    expect(tokenize("Bokoki/okoki")).toEqual(["Bokoki", "okoki"]);
  });

  it("keeps hyphens and apostrophes inside a word", () => {
    expect(tokenize("bangɔmbɛ-mwâsí")).toEqual(["bangɔmbɛ-mwâsí"]);
    expect(tokenize("n'a boye")).toEqual(["n'a", "boye"]);
  });

  it("keeps toned vowels and ɛ/ɔ intact", () => {
    expect(tokenize("Mbúla ezalí")).toEqual(["Mbúla", "ezalí"]);
    expect(tokenize("bilɔkɔ")).toEqual(["bilɔkɔ"]);
  });

  it("survives empty, null and punctuation-only input", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize(null)).toEqual([]);
    expect(tokenize(undefined)).toEqual([]);
    expect(tokenize("  ?  ! ")).toEqual([]);
    expect(tokenCount(null)).toBe(0);
  });

  it("collapses runs of whitespace rather than emitting empty tokens", () => {
    expect(tokenize("Mbote   na    yo")).toEqual(["Mbote", "na", "yo"]);
    expect(tokenize("\n Mbote \t na yo \n")).toEqual(["Mbote", "na", "yo"]);
  });
});

describe("characters — the listen-and-type tile bank", () => {
  it("gives one tile per visible character", () => {
    expect(characters("mbote")).toEqual(["m", "b", "o", "t", "e"]);
  });

  it("keeps a toned vowel as ONE tile even when the input is NFD", () => {
    // A toned vowel written the decomposed way: o + U+0301. Without the NFC
    // normalise, a naive spread offers the learner a bare accent to place as
    // its own tile, which is not a thing anybody types.
    //
    // Written with explicit escapes on purpose. A literal here would look
    // identical either way, so whether this test tests anything at all would
    // depend on how the last editor to save the file normalised it.
    const nfd = "Mbo\u0301te";
    expect(nfd.length).toBe(6);                       // really is decomposed
    expect(characters(nfd)).toEqual(["M", "b", "\u00f3", "t", "e"]);
    expect(characters(nfd).length).toBe(5);           // five tiles, not six
  });

  it("keeps ɛ and ɔ as single tiles", () => {
    expect(characters("bilɔkɔ")).toEqual(["b", "i", "l", "ɔ", "k", "ɔ"]);
  });

  it("survives empty and null input", () => {
    expect(characters("")).toEqual([]);
    expect(characters(null)).toEqual([]);
  });
});

describe("fold — accent-insensitive comparison for fill-the-blank", () => {
  it("strips accents so an untypeable word can still be typed", () => {
    expect(fold("mbúla")).toBe("mbula");
    expect(fold("ezalí")).toBe("ezali");
    expect(fold("kofánda")).toBe("kofanda");
  });

  it("folds ɛ and ɔ, which Unicode decomposition does NOT touch", () => {
    // The whole reason an explicit rule is needed: these are distinct letters,
    // not accented vowels, and no French keyboard can produce them.
    expect("ɔ".normalize("NFD").length).toBe(1);   // proves decomposition is a no-op
    expect(fold("bilɔkɔ")).toBe("biloko");
    expect(fold("kobɛla")).toBe("kobela");
    expect(fold("telefɔni")).toBe("telefoni");
    expect(fold("monɔkɔ")).toBe("monoko");
  });

  it("handles the accented letters that are not simple vowels", () => {
    expect(fold("ç")).toBe("c");
    expect(fold("ē")).toBe("e");
    expect(fold("ǎ")).toBe("a");
  });

  it("normalises the iOS smart apostrophe to a plain one", () => {
    expect(fold("n’a")).toBe(fold("n'a"));
  });

  it("is case-insensitive, including for ɛ/ɔ", () => {
    expect(fold("MBÚLA")).toBe("mbula");
    expect(fold("Ɔ")).toBe("o");
  });

  it("trims surrounding whitespace a learner may type", () => {
    expect(fold("  mbula  ")).toBe("mbula");
  });
});

describe("sameWord — the fill-the-blank accept rule", () => {
  it("accepts the untoned spelling of a toned word", () => {
    expect(sameWord("mbula", "mbúla")).toBe(true);
    expect(sameWord("ezali", "ezalí")).toBe(true);
  });

  it("accepts input that omits ɛ/ɔ, which cannot be typed", () => {
    expect(sameWord("biloko", "bilɔkɔ")).toBe(true);
    expect(sameWord("monoko", "monɔkɔ")).toBe(true);
  });

  it("accepts the six pairs Anthony ruled to be the same word", () => {
    // Confirmed 2026-08-17. These differ only in accent POSITION, the one case
    // where folding could in principle have merged two different words.
    for (const [a, b] of [["mídi", "midí"], ["ntóngo", "ntɔngɔ"],
                          ["lisúkúlu", "lisúkulu"], ["ladió", "ladíó"],
                          ["nsékwá", "nsékwa"], ["minutí", "minúti"]]) {
      expect(sameWord(a, b)).toBe(true);
    }
  });

  it("still rejects a genuinely different word", () => {
    expect(sameWord("mbula", "mbote")).toBe(false);
    expect(sameWord("kofanda", "kokende")).toBe(false);
    // One letter apart, and it must stay wrong — folding is about accents only.
    expect(sameWord("biloko", "biloka")).toBe(false);
  });

  it("ignores punctuation the learner leaves on the edge", () => {
    expect(sameWord("mbula.", "mbúla")).toBe(true);
    expect(sameWord("  mbula ", "mbúla")).toBe(true);
  });

  it("never accepts empty input, whatever it is compared against", () => {
    expect(sameWord("", "")).toBe(false);
    expect(sameWord("", "mbula")).toBe(false);
    expect(sameWord(null, "mbula")).toBe(false);
    expect(sameWord("   ", "mbula")).toBe(false);
    expect(sameWord("...", "mbula")).toBe(false);
  });
});
