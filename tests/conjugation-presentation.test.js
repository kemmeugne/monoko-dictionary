import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { describe, expect, test } from "vitest";

const root = join(import.meta.dirname,"..");
const source = readFileSync(join(root,"index.html"),"utf8");
const start = source.indexOf("// CONJUGATION_EXAMPLE_LOGIC_START");
const end = source.indexOf("// CONJUGATION_EXAMPLE_LOGIC_END");
if (start < 0 || end < 0) throw new Error("conjugation example logic markers not found");

const context = {
  fold: value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase(),
  // Must mirror index.html's lessonWords: \p{M} keeps Yoruba tone marks attached,
  // which have no precomposed codepoint and otherwise end the token.
  lessonWords: value => String(value || "").match(/[\p{L}\p{M}]+(?:[-'’ʼ][\p{L}\p{M}]+)*/gu) || [],
  Set,
  Map,
};
vm.createContext(context);
vm.runInContext(`${source.slice(start,end)}\nthis.helpers={conjugationExampleCategory,conjugationExampleHighlightProfile,exampleMatchesConjugationVerb};`,context);

const table = (verb,verbFr,imperfect) => ({
  verb,
  verbFr,
  forms:imperfect.map(french => ({ tense:"imparfait", person:"test", french })),
});
const parler = table("koloba","parler",["je parlais","tu parlais","elle parlait","nous parlions","vous parliez","ils parlaient"]);
const finir = table("kosilisa","finir",["je finissais","tu finissais","il finissait","nous finissions","vous finissiez","ils finissaient"]);
const vendre = table("kotekisa","vendre",["je vendais","tu vendais","elle vendait","nous vendions","vous vendiez","ils vendaient"]);

describe("conjugation example presentation", () => {
  test.each([
    ["Je parle à mon ami.","Nazoloba na moninga.",parler,"present"],
    ["Hier, j'ai parlé avec ma mère.","Lobi, nasololaki na mamá.",parler,"passe_compose"],
    ["Quand j'étais petit, je parlais souvent.","Ntango nazalaki moke, nazalaki kosolola mingi.",parler,"imparfait"],
    ["Nous avons fini la réunion.","Tosilisi likita.",finir,"passe_compose"],
    ["Autrefois, je finissais en retard.","Na kala, nazalaki kosilisa na nsima.",finir,"imparfait"],
    ["Ils vendaient de tout.","Bazalaki kotekisa nyonso.",vendre,"imparfait"],
  ])("classifies %s", (french,dialect,model,expected) => {
    expect(context.helpers.conjugationExampleCategory({ french,dialect },model)).toBe(expected);
  });

  test("highlights the passé composé auxiliary and participle", () => {
    const item = { french:"Hier, j'ai parlé avec ma mère.", dialect:"Lobi, nasololaki na mamá." };
    const profile = context.helpers.conjugationExampleHighlightProfile(item,parler,"passe_compose");
    expect([...profile.frenchIndexes]).toEqual([2,1]);
    expect([...profile.dialectIndexes]).toEqual([1]);
  });

  test("highlights only the auxiliary attached to the target Lingala verb", () => {
    const item = {
      french:"Nous finissions l'école à midi quand j'étais jeune.",
      dialect:"Tozalaki kosilisa kelasi na nzanga ntango nazalaki elenge.",
    };
    const profile = context.helpers.conjugationExampleHighlightProfile(item,finir,"imparfait");
    expect([...profile.frenchIndexes]).toEqual([1]);
    expect([...profile.dialectIndexes].sort((a,b) => a-b)).toEqual([0,1]);
  });

  test("shared Lingala auxiliaries do not move finir or vendre under parler", () => {
    const finirItem = { french:"Je finissais toujours en retard.", dialect:"Nazalaki kosilisa kaka na nsima." };
    const vendreItem = { french:"Avant, je vendais des journaux.", dialect:"Liboso, nazalaki kotekisa mikanda." };
    expect(context.helpers.exampleMatchesConjugationVerb(finirItem,parler)).toBe(false);
    expect(context.helpers.exampleMatchesConjugationVerb(vendreItem,parler)).toBe(false);
    expect(context.helpers.exampleMatchesConjugationVerb(finirItem,finir)).toBe(true);
    expect(context.helpers.exampleMatchesConjugationVerb(vendreItem,vendre)).toBe(true);
  });

  test("lobi does not move a future finir example under parler", () => {
    const futureFinir = {
      ...finir,
      forms:[...finir.forms,{ tense:"futur", person:"je", french:"je finirai" }],
    };
    const item = { french:"Je finirai ce livre demain.", dialect:"Nakosilisa buku oyo lobi." };
    expect(context.helpers.exampleMatchesConjugationVerb(item,parler)).toBe(false);
    expect(context.helpers.exampleMatchesConjugationVerb(item,futureFinir)).toBe(true);
    expect(context.helpers.conjugationExampleCategory(item,futureFinir)).toBe("futur");
  });

  test("recognises the professor's kosuka variant as finir", () => {
    const futureFinir = {
      ...finir,
      forms:[...finir.forms,{ tense:"futur", person:"tu", french:"tu finiras" }],
    };
    const item = { french:"Tu finiras par comprendre.", dialect:"Okosuka na kososola." };
    const profile = context.helpers.conjugationExampleHighlightProfile(item,futureFinir,"futur");
    expect(context.helpers.exampleMatchesConjugationVerb(item,futureFinir)).toBe(true);
    expect([...profile.dialectIndexes]).toEqual([0]);
  });
});
