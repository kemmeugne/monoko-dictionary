/**
 * Lesson word-highlighting unit tests.
 *
 * The highlighter marks, inside an example sentence, the word the row is
 * teaching. It lives in index.html's babel block, so the block between two
 * marker comments is sliced out and evaluated — these run against the exact
 * source the browser runs.
 *
 * Why this exists: the profile used to drop every word of two letters or fewer,
 * which silenced whole grammar lessons. Pronouns, prepositions and conjunctions
 * ARE short words, so "Tu / O", "Te / Mi" and "Na ngai" highlighted nothing at
 * all while vocabulary lessons worked fine.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { describe, expect, test } from "vitest";

const root = join(import.meta.dirname, "..");
const source = readFileSync(join(root, "index.html"), "utf8");
const start = source.indexOf("// LESSON_HIGHLIGHT_START");
const end = source.indexOf("// LESSON_HIGHLIGHT_END");
if (start < 0 || end < 0) throw new Error("lesson highlight markers not found in index.html");

const context = {
  fold: value => String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/ɛ/g, "e").replace(/ɔ/g, "o"),
  Set, Map,
};
vm.createContext(context);
vm.runInContext(
  `${source.slice(start, end)}\nthis.h={lessonWords,lessonItemHighlightProfile,isConjugationMarker};`,
  context,
);
const { lessonWords, lessonItemHighlightProfile, isConjugationMarker } = context.h;

const marks = (profile, language, sentence) =>
  lessonWords(sentence).filter((word, index) => isConjugationMarker(word, language, profile, index));

describe("lesson highlighting — short grammar words", () => {
  test.each([
    ["Tu", "O", "Tu aimes trop la viande", "Olingaka misuni mingi", ["Tu"], ["Olingaka"]],
    ["Ta", "Na yo", "Ta famille nous regarde", "Libota na yo ezali kotala biso", ["Ta"], ["na", "yo"]],
    ["Te", "Mi", "Tu te pinces", "Omifini", ["te"], []],
  ])("%s / %s is marked in its example", (french, dialect, exFr, exLn, expectFr) => {
    const profile = lessonItemHighlightProfile({ french, dialect, example_french: exFr, example_dialect: exLn });
    expect(profile).not.toBeNull();
    expect(marks(profile, "french", exFr)).toEqual(expectFr);
  });

  test("a two-word term marks both of its words, short one included", () => {
    const profile = lessonItemHighlightProfile({
      french: "Miens", dialect: "Ya ngai",
      example_french: "Ce sont les miens", example_dialect: "Ezali ya ngai",
    });
    expect(marks(profile, "dialect", "Ezali ya ngai")).toEqual(["ya", "ngai"]);
  });

  test("a full sentence entry still filters its filler words", () => {
    // Short words here are grammar, not the lesson's point: marking "le", "sur"
    // and "la" across the example would be noise.
    const profile = lessonItemHighlightProfile({
      french: "Le bébé est tombé sur la tête de son frère",
      dialect: "Mwana akweyi na mutu ya ndeko na ye",
      example_french: "Le chat est sur la table",
      example_dialect: "Nkoso ezali na mesa",
    });
    expect(marks(profile, "french", "Le chat est sur la table")).not.toContain("Le");
    expect(marks(profile, "french", "Le chat est sur la table")).not.toContain("la");
  });

  test("a row with no example has no profile to highlight into", () => {
    expect(lessonItemHighlightProfile({ french: "Tu", dialect: "O", example_french: "", example_dialect: "" }))
      .toBeNull();
  });
});

describe("lesson highlighting — Yoruba tone marks", () => {
  // Yoruba stacks a tone mark on ọ/ẹ, and those have no precomposed codepoint,
  // so \p{L} alone ended the token at the mark: "Wọ́n" became ["Wọ","n"].
  test.each([
    ["Wọ́n", 1],
    ["ọ̀gẹ̀dẹ̀", 1],
    ["Ọ̀pọ̀ ìgbà", 2],
    ["aláǹgbá", 1],
  ])("%s tokenises as one word per word", (value, expected) => {
    expect(lessonWords(value)).toHaveLength(expected);
  });

  test("a tone-marked headword is marked whole in its example", () => {
    const profile = lessonItemHighlightProfile({
      french: "Ils", dialect: "Wọ́n",
      example_french: "Ils sont partis", example_dialect: "Wọ́n ti lọ",
    });
    expect(marks(profile, "dialect", "Wọ́n ti lọ")).toEqual(["Wọ́n"]);
  });
});
