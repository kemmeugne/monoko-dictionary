# Monɔkɔ — Lesson Structure Audit & Restructuring Plan (Lingala)

**Date:** 2026-07-27
**Scope:** Full audit of the live Lingala curriculum in production Supabase
(`courses` → `lessons` → `lesson_items`), 6 levels / 28 lessons / ~1,076 items.
**Method:** Queried production directly (read-only, anon key). No data was modified.
**Status:** ✅ **Executed 2026-07-27.** P0–P4 applied live to Supabase (mislabel fix,
5 lesson splits, ~50-row dedup, pronoun consolidation, minor cleanups). Backup-first
scripts (`split_lesson.py`, `dedup_lessons_p2.py`, `consolidate_pronouns_p3.py`,
`cleanup_p4.py`, `restructure_lessons_p0.py`) + rollback JSONs in
`artifacts/lesson_backups/`. **Still open, content-blocked (waiting on professor):**
conjugation rebuild L358/L359, placeholder lessons (Proverbes, Langue dans le monde),
and the L386 reflexive-pronoun quality pass. Next steps once content arrives: see
`ROADMAP.md` Phase 1.

---

## 1. Executive summary

The curriculum's *level/course* skeleton (6 CEFR levels) is sound. The problem is
**inside** the lessons: many are grab-bags that mix unrelated sub-themes, several
duplicate each other, two are placeholders, one is mislabeled, and the conjugation
lessons are broken (single verb, mixed tenses, French errors).

**Seven headline problems, worst first:**

1. **Conjugation lessons are broken** (L358, L359) — one verb only (*aimer*), présent + passé jammed into single cells, tenses out of order, past-progressive dumped into the wrong lesson, real French spelling errors (`Tu aimess`, `Ils aimes`, `Nous avons aimés`).
2. **`Chiffres, jours et temps` (L350, 92 items)** — six distinct topics in one lesson (numbers, ordinals, time units, days, months, seasons, telling time).
3. **`Construction de phrases 2` (L361, 237 items)** — a 237-item monster spanning 8 grammar topics (conjunctions, relatives, comparatives, adverbs, prepositions, personal/possessive/demonstrative pronouns).
4. **Cross-lesson duplication** — the same content is entered in 2+ lessons (family, kitchen objects, opinions, pronouns, weather/seasons, "learning the language").
5. **A mislabeled lesson** — `La ville et les lieux` (L366) actually contains **colors + clothing**, zero city/place content.
6. **Placeholders shipped to production** — `Proverbes` (L364) and `La langue dans le monde` (L374) contain `[PLACEHOLDER] … REQUIERT` rows.
7. **In-lesson duplicates & truncations** — repeated rows within a lesson, and items visibly cut off mid-sentence (data-entry artifacts).

---

## 2. Cross-cutting issues

### 2a. Duplicated content across lessons

| Content | Appears in | Recommendation |
|---|---|---|
| Family vocab (Père, Mère, Frère…) | C1·L3 *Présentation* (#10–30) **and** C2·L1 *Famille* | Keep in *Famille* only; strip from *Présentation* |
| Kitchen objects (Assiette, Couteau, Marmite…) — **11 identical rows** | C2·L2 *Maison* (#26–36) **and** C6·L2 *Cuisine* (#56–66) | Keep one canonical "Ustensiles" block; remove the other |
| Opinions (Je sais, D'accord, Tu as raison…) — **22 identical rows** | C3·L5 *Sentiments* (#9–30) **and** C5·L2 *Débats* (#1–22) | Split cleanly: emotions → *Sentiments*, opinion/agreement → *Débats* |
| Pronouns (possessive & personal) | C1·L4 *Pronoms* (adjectives only) **and** C3·L6 (#177–237) | Consolidate all pronoun families into a dedicated pronoun lesson set |
| Seasons / weather (Saison des pluies/sèche…) | C1·L5 (#62–63,84–85) **and** C4·L2 (#60–61) | One "Météo & saisons" home; remove from Chiffres/temps |
| "J'apprends la langue / Je parle le patois" | C1·L3 (#31–33) **and** C6·L4 (#1–3) | Keep in C6·L4; remove from C1·L3 |
| Presentation questions (Comment tu t'appelles?…) | C1·L2 *Salutations* (#29–31) **and** C1·L3 *Présentation* | Keep in *Présentation*; remove from *Salutations* |

### 2b. In-lesson duplicates & data errors

- `Saison sèche` appears twice in L350 (#63 and #85).
- `Qu'est-ce que ça veut dire ?` appears twice in L354 (#29 and #31).
- `Je suis perdu` appears 3× in L356 (#1, #14, #37).
- `Combien ça coûte ?` / `C'est trop cher` / `C'est bon marché` duplicated in L362 (#1–3 vs #12,13,18).
- Truncated rows (data-entry cutoffs): L348 #32 (`Je ne parle pas bien la langue. Je par`), L353 #1, and many in L355/L361 (display truncation vs. stored truncation should be verified).
- French spelling/agreement errors in L358: `Tu aimess`, `Ils aimes`, `Nous avons aimés`, `Vous avez aimé` inconsistencies.

### 2c. Placeholders & mislabels

- **L364 Proverbes** — all 3 items are `[PLACEHOLDER] … REQUIERT SA` (needs native speaker).
- **L374 La langue dans le monde** — 3 real + 3 `[PLACEHOLDER] … REQ`.
- **L366 "La ville et les lieux"** — content is **colors (#1–10) + clothing (#11–29)**. Either retitle to *Couleurs et vêtements* and create a real city/places lesson, or move colors/clothing to their own lessons.

---

## 3. Priority restructures (detailed)

### 3a. Conjugation — L358 & L359 (the ask)

**Current (broken):** one verb (*aimer*), présent+passé merged, imparfait out of order,
past-progressive misplaced, French errors. L359 mixes futur, a stray present-progressive
block, and 6 random imperative phrases.

**Proposed model** — mirrors the restructured recording apps
(`audio_collection_html/…3.3/3.4…`): 3 regular verbs **parler (-er), finir (-ir),
vendre (-re)**, every tense as its **own section**, **all six persons** je→ils/elles,
plus one **example sentence per person** (already authored — 90 sentences — in
`regenerate_conjugation_modules.py`).

**L358 → "Conjugaison : présent et passé"**
- Section *Présent* — parler / finir / vendre × 6 persons
- Section *Passé composé* — same 3 verbs × 6 persons
- Section *Imparfait* — same 3 verbs × 6 persons

**L359 → "Conjugaison : futur et impératif"**
- Section *Futur simple* — 3 verbs × 6 persons
- Section *Impératif affirmatif* — 3 verbs × (tu, nous, vous)
- (Move futur proche + impératif négatif to the existing **supplément** module.)

Delete the single-verb *aimer* rows once the professor's *aimer* audio (if any) is
re-mapped. The audio recording apps are already rebuilt to this exact structure, so the
DB and the recording workflow will finally match.

> **Update 2026-08-18 — the *aimer* paradigm was not junk, it was mangled.**
> The single-verb rows this section proposed deleting were a **flattened** view of
> a complete grid: the workbook holds *ko linga* as a matrix (rows 259–264 = the
> six persons, columns B–F = five tenses) and the original migration read it
> row-wise, which is why it arrived as a jumble with the tenses out of order and
> the passé progressif in the wrong place. Read as the grid it is, it is
> complete — 30 forms, no gaps — and it makes the distinction these lessons blur
> (*Na lingi* présent vs *Na zo linga* présent progressif). **24 of the 30 forms
> already have his recording**, addressed by workbook cell (`2.C259.mp3`).
>
> It now lives in `conjugation_forms` as a grid and heads L358/L359 as tense
> tabs, showing only the tenses each lesson teaches. The French spelling errors
> listed in §2 (`Tu aimess`, `Ils aimes`, `Nous avons aimés`) are **fixed by
> generation** — one regular verb, so the glosses are derived from (tense,
> person) rather than copied; the Lingala stays verbatim.
>
> The three-verb parler/finir/vendre model above is still the target for the
> lesson *body*; the paradigm grid is a second, complementary surface, and the
> plan is now **a table per verb per tense** as the professor records them.
> See `EXERCISE_ENGINE_PLAN.md` § "Conjugation paradigms".

### 3b. `Chiffres, jours et temps` — L350 (the ask)

Split the 92-item bucket into **5 focused lessons** (or one lesson with 5 clearly
ordered sections via `item_order` blocks):

1. **Les nombres** — cardinals 1 → 1 000 000 (#1–55)
2. **Les nombres ordinaux** — 1er, 2e, 3e… (#56–58) *(expand beyond 3)*
3. **Jours & unités de temps** — Jour, Semaine, Mois, Année + Lundi→Dimanche (#59–71)
4. **Les mois** — Janvier→Décembre (#72–83)
5. **Saisons & dire l'heure** — saisons (dedupe) + time expressions (#84–92)

### 3c. `Construction de phrases 2` — L361 (237 items → split)

This is really 8 lessons wearing a trench coat. Break into:

| New lesson | Source rows |
|---|---|
| Conjonctions | #1–12 |
| Pronoms relatifs (qui/que/quoi/où/lequel…) | #13–24 |
| Comparatifs & superlatifs | #25–30 |
| Adverbes de fréquence & de quantité | #31–40, #140–176 |
| Prépositions (lieu, temps, manière) | #41–139 |
| Pronoms personnels (sujet/COD/COI/toniques) | #177–212 |
| Pronoms possessifs | #213–227 |
| Démonstratifs | #228–237 |

Merge the pronoun lessons here with **C1·L4** so pronouns live in one coherent place
(and add the missing 1st-person possessives *Mon/Ma/Mes* — currently L4 starts at *Ton*).

---

## 4. Level-by-level audit

### Course 1 — Niveau 1 · Fondations
| Lesson | Items | Assessment |
|---|---|---|
| L1 Sons et alphabet | 45 | ✅ Well-structured (voyelles → consonnes → sons composés → tons). Fix: #44 missing example word. |
| L2 Salutations et politesse | 41 | ⚠️ Greetings drift into wishes/compliments (#32–41) and presentation questions (#29–31, dup of L3). Split: *Salutations* vs *Vœux & compliments*; remove L3 dupes. |
| L3 Présentation personnelle | 33 | ⚠️ Presentation phrases (#1–9,31–33) mixed with **family vocab** (#10–30, dup of C2·L1). Keep phrases; move family out. Fix truncation #32. |
| L4 Pronoms et adjectifs possessifs | 12 | ⚠️ Only possessive *adjectives*, and starts at *Ton* (missing Mon/Ma/Mes). No personal pronouns (those are stranded in C3·L6). Consolidate pronouns. |
| L5 Chiffres, jours et temps | 92 | 🔴 Split into 5 (see §3b). Dedupe *Saison sèche*. |

### Course 2 — Niveau 2 · Vie quotidienne
| Lesson | Items | Assessment |
|---|---|---|
| L1 La famille | 14 | ✅ Clean vocab, but overlaps C1·L3. Make this the single family home. |
| L2 La maison et les objets | 36 | ⚠️ House/places (#1–25) + kitchen objects (#26–36, **dup of C6·L2**). Split; dedupe. |
| L3 Manger et boire | 24 | ⚠️ Phrases (#1–8) + food vocab (#9–24, overlaps C6 Cuisine). Consider merging food vocab with Cuisine, keep phrases here. |
| L4 Le corps et la santé | 50 | 🔴 Body parts (#34–50) + illness (#1–24) + **comprehension/communication phrases** (#25–32, off-topic) with an internal dup (#29/#31). Split into *Corps* / *Santé* / move comm-phrases to a comprehension lesson. |
| L5 Construction de phrases 1 | 62 | ✅ **The good model** — full *aller* paradigm (aff/nég, all persons) + question words + interro/passive. Keep as template (could add more verbs). |

### Course 3 — Niveau 3 · Communication
| Lesson | Items | Assessment |
|---|---|---|
| L1 Déplacements et directions | 40 | ⚠️ Reasonable, but "Je suis perdu" ×3 and mixed phrase/vocab order. Dedupe & group (phrases utiles / directions / transport). |
| L2 Le travail et les métiers | 25 | ✅ Clean vocab list. |
| L3 Conjugaison présent et passé | 18 | 🔴 See §3a. |
| L4 Conjugaison futur et impératif | 18 | 🔴 See §3a. |
| L5 Sentiments et émotions | 30 | 🔴 Emotions (#1–17) + opinions (#18–30, **dup of C5·L2**). Keep emotions; move opinions to Débats. |
| L6 Construction de phrases 2 | 237 | 🔴 Split into 8 (see §3c). |

### Course 4 — Niveau 4 · Approfondissement
| Lesson | Items | Assessment |
|---|---|---|
| L1 Le marché et l'argent | 35 | ⚠️ Two merged blocks with dupes (#1–3 vs #12,13,18). Dedupe. |
| L2 La nature et les animaux | 75 | 🔴 Animals (#1–34) + nature/elements (#35–69) + weather phrases (#70–75). Split: *Animaux* / *Nature & éléments* / *Météo*. Dedupe seasons vs L350. |
| L3 Proverbes et expressions | 3 | 🔴 All placeholders — needs native speaker content. |
| L4 Raconter une histoire | 18 | ✅ Clean (narrative connectors). |
| L5 La ville et les lieux | 29 | 🔴 **Mislabeled** — actually colors (#1–10) + clothing (#11–29). Retitle or re-scope + build a real city lesson. |

### Course 5 — Niveau 5 · Maîtrise
| Lesson | Items | Assessment |
|---|---|---|
| L1 Registres : formel vs informel | 30 | ✅ Well-tagged ([Formel]/[Informel]/[Respect]…). |
| L2 Débats et opinions | 22 | 🔴 Full **dup of C3·L5** (#1–22). Make this the single opinions home. |
| L3 Médias et actualités | 20 | ✅ Clean. |
| L4 Écriture et composition | 25 | ✅ Clean (letter-writing formulas). |

### Course 6 — Niveau 6 · Culture vivante
| Lesson | Items | Assessment |
|---|---|---|
| L1 Musique et arts | 25 | ✅ Clean. |
| L2 Cuisine et gastronomie | 66 | ⚠️ Food/plants (#1–55) + kitchen objects (#56–66, **dup of C2·L2**). Split; dedupe. |
| L3 Traditions et cérémonies | 30 | ✅ Clean. |
| L4 La langue dans le monde | 6 | 🔴 3 real (dup of C1·L3) + 3 placeholders. Populate. |

---

## 5. Prioritized action plan

**P0 — Fix what's broken/embarrassing in production**
1. Rebuild conjugation lessons L358/L359 to the paradigm model (§3a).
2. Replace/hide the 6 `[PLACEHOLDER]` rows (L364, L374).
3. Fix the mislabel (L366) — retitle or re-scope.
4. Fix French errors in L358.

**P1 — Split the giant/mixed lessons**
5. Split L350 (Chiffres/jours/temps) → 5 (§3b).
6. Split L361 (Construction 2, 237) → 8 (§3c).
7. Split L363 (Nature/animaux) and L354 (Corps/santé/comm).

**P2 — Deduplicate**
8. Resolve the 7 cross-lesson duplications (§2a) — pick one canonical home each.
9. Remove in-lesson dupes and truncated rows (§2b).

**P3 — Consolidate pronouns** into one coherent set (C1·L4 + the pronoun blocks from L361), add missing 1st-person possessives.

---

## 6. Implementation notes (when approved)

- **Re-embedding required:** any lesson split/move changes `lesson_items` rows →
  affected rows must be re-embedded (`embed_lesson_items.py`) so RAG course search
  (`match_lesson_items`) stays correct.
- **Audio links:** moving rows must preserve `audio_url`/`example_audio_url`
  (match by `french`+`dialect`), same as the curriculum migration's Step 4.
- **Progress tracking:** `user_progress.lesson_id` FKs — if lessons are deleted rather
  than re-scoped, existing completions for those lesson_ids are orphaned. Prefer
  re-scoping in place + adding new lessons over delete/recreate where possible.
- **Order of ops per lesson:** edit rows → set `item_order`/`lesson_order` → re-embed →
  verify in app (chat + course browse) → then move to next.
- Do the conjugation rebuild first: the recording apps are already restructured to match,
  so the DB, the app, and the professor workflow converge.
