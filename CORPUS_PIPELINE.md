# Monɔkɔ — Corpus-to-Lesson Pipeline

Spec for Claude Code. Build this when Phase 1 content is landing and we're
ready to turn the verified corpus into structured lessons + exercises.

Read this whole file before writing any code. The architectural principles
in Section 2 are the point — the individual scripts are easy once those are
respected.

---

## 1. Purpose

We have ~8,000 professor-verified Lingala example sentences and a 29-module
CEFR-aligned curriculum structure, but **no formal lessons were ever written**.
This pipeline derives lessons and auto-generated exercises *from the corpus*,
with a human (professor) verification checkpoint before anything reaches a
learner.

Goal: turn "professor must author lessons from scratch" into "professor
validates AI-drafted lessons" — a ~10× smaller job that unblocks Phase 1.

---

## 2. Core architectural principles (do not violate)

### 2.1 Simple, re-runnable scripts
Most of this work is deterministic data processing (Python + SQL + existing
pgvector embeddings). Only two slices touch an LLM, and both are **batch LLM
calls in a loop**, the same pattern as the existing GPT test pipeline.

- Keep it lightweight: plain scripts + SQL, nothing more elaborate than needed.
- Each step is a script that reads inputs, writes outputs, and can be re-run
  independently and inspected.
- Ship and inspect each step's output before starting the next.

### 2.2 Separate "describe" from "place" (critical)
Two different jobs must stay in two different steps:

- **Audit (Step 1)** describes what a sentence *is* — intrinsic properties
  (theme, grammatical features, person, polarity, sentence type, CEFR level).
  These are true regardless of where the sentence ends up in the course.
- **Mapping (Step 2)** decides where a sentence *goes* — which of the 29
  modules / `lesson_items` it belongs to, using rules we control.

Never fuse them. The audit must **not** tag sentences with lesson/module IDs.
Test: if we reorganized the entire curriculum tomorrow, the audit tags must
still be correct and useful. If a reorg would invalidate the tags, they were
fused too tightly — fix it.

Consequence: audit categories are **stable closed vocabularies** (broad themes,
real grammatical features), chosen to be a **superset** of everything the 29
modules need to route sentences. Before finalizing the audit vocabularies,
read `Cours/MONOKO_CURRICULUM.md` + `lesson_items` and confirm every theme and
feature the modules depend on is expressible in the audit's category lists
(e.g. if a module teaches tense, the audit must tag tense).

### 2.3 Verified-only reaches learners
Anything shown to a learner as "correct Lingala" must be professor-verified.
- Tag every corpus row by verification status.
- Only verified rows are used to *generate live exercises/lessons*.
- Unverified rows may seed *drafts* for the professor to check, never live output.

### 2.4 Human checkpoint is mandatory
LLM output is a draft, never a publish. Every LLM-produced artifact (audit tags
below a confidence threshold, lesson drafts) lands in a review queue / draft
table and only goes live after professor approval via the existing admin panel.

### 2.5 The LLM describes, it does not invent grammar
In the audit, the LLM *classifies* sentences using fixed categories. It must
**not** invent or explain grammar rules. Rule explanation happens only in
Step 4 (lesson drafts) and always passes through the professor. This keeps
hallucination risk (real for a low-resource, tonal Bantu language) out of the
descriptive layer entirely.

---

## 3. Data sources & model choice

**Sources (Supabase):**
- `lesson_items` — the curriculum spine (what we teach, in what order).
- `examples` (~8,000) — the reservoir (extra drill material, alternative
  phrasings, distractors, review items). Both are `language_id`-keyed.
- `senses` / dictionary data — reference where useful.
- Existing pgvector embeddings — reuse for clustering/similarity, do not recompute.

**Models:**
- **Deterministic work** → no LLM. Regex, string ops, SQL, clustering.
- **Audit LLM slice** → a strong current model is justified (bounded one-time
  enrichment of ~8k rows; quality matters). **Do not assume its Lingala accuracy
  — measure it first (Section 5).**
- **Lesson-draft slice** → batch calls; model choice can follow the calibration
  results.
- Always record `model_name` + `prompt_version` alongside any LLM output.

---

## 4. Step 1 — Corpus audit

Produce an enriched, per-sentence description table. Two parts.

### 4.1 Deterministic part (do this in code, NOT the LLM)
For each row compute, by rule:
- `verification_status` (from existing data)
- `token_count`, `char_length`
- `has_final_te` (negation marker `te` at sentence end)
- `subject_prefix` guess from surface form (`na-`, `o-`, `a-`, `to-`, `bo-`, `ba-`)
- `is_question` (ends with `?`)
- `is_imperative` (heuristic; flag as weak)
- shared-vocabulary keys (lemmatized tokens for grouping)

These are cheap, deterministic, and used to **cross-check** the LLM's proposals.

### 4.2 LLM part (batch classification)
Call the LLM in batches of 10–20 sentences. **Structured JSON only.** Closed
category sets only. Include a confidence field and an explicit uncertainty
escape hatch.

**System prompt (audit):**
```
You are a Lingala language annotation assistant. You will receive Lingala
sentences with their French translations. For each sentence, classify it
using ONLY the fixed categories below. You are describing sentences, not
teaching grammar — never invent or explain grammatical rules.

Return ONLY a valid JSON array, no markdown, no commentary. One object per
input sentence, each with this exact schema:

{
  "id": <the id given in the input>,
  "theme": one of ["salutations","famille","nourriture","marché",
     "déplacements","santé","émotions","école","travail","maison",
     "temps","questions","conversation","téléphone","social","autre"],
  "register": one of ["oral_courant","neutre","poli","formel","incertain"],
  "person": one of ["1sg","2sg","3sg","1pl","2pl","3pl","aucun","incertain"],
  "polarity": one of ["affirmatif","négatif","incertain"],
  "sentence_type": one of ["déclaratif","interrogatif","impératif","incertain"],
  "tense": one of ["présent","passé","futur","aucun","incertain"],
  "difficulty": one of ["A1","A2","B1","B2","incertain"],
  "confidence": a number 0.0–1.0 for your OVERALL confidence on this sentence,
  "flag_for_professor": true if anything is unclear, unusual, or you are
     guessing; false only if you are confident on every field
}

Rules:
- If you are not sure about any field, use "incertain" for that field AND set
  flag_for_professor to true. Do not guess to appear confident.
- Base judgments on the Lingala, using the French only as support.
- Do not add fields. Do not output anything except the JSON array.
```

**User message (per batch):**
```
Classify these sentences:
[
  {"id": 1041, "lingala": "Na lembi lelo", "french": "Je suis fatigué aujourd'hui"},
  {"id": 1042, "lingala": "Olembi ?", "french": "Tu es fatigué ?"}
]
```

> Keep the theme/tense/feature vocabularies as a **superset** of what the 29
> modules need (see 2.2). Adjust the lists after the coverage check, then bump
> `prompt_version`.

### 4.3 Output table
```sql
create table if not exists corpus_audit (
  example_id      bigint primary key references examples(id),
  language_id     bigint references languages(id),
  -- deterministic
  verification_status text,
  token_count     int,
  char_length     int,
  has_final_te    boolean,
  subject_prefix  text,
  is_question     boolean,
  is_imperative   boolean,
  vocab_keys      text[],
  -- llm-proposed
  theme           text,
  register        text,
  person          text,
  polarity        text,
  sentence_type   text,
  tense           text,
  difficulty      text,
  confidence      numeric,
  flag_for_professor boolean,
  -- cross-check + provenance
  rule_llm_conflict boolean,   -- true where deterministic vs llm disagree
  model_name      text,
  prompt_version  text,
  audited_at      timestamptz default now()
);
```

### 4.4 Guardrails for the run
- Parse defensively: strip ```json fences, validate array length == batch size,
  re-queue any batch that doesn't parse. Never silently drop rows.
- Compute `rule_llm_conflict` by comparing deterministic fields (polarity from
  `has_final_te`, sentence_type from `is_question`, person from `subject_prefix`)
  against the LLM's answer. Conflicts → flag.
- Rows with `flag_for_professor = true` OR `confidence < 0.7` OR
  `rule_llm_conflict = true` go to the professor review queue, **not** straight
  into trusted use.

---

## 5. Calibration harness (RUN BEFORE the full audit)

Do not trust the model on Lingala by assumption. Measure per-field agreement
against the professor's already-verified data first.

1. Sample 50 sentences the professor has verified with known features.
2. Run them through the exact audit prompt, blind (no professor labels shown).
3. Compute **per-field** agreement (theme %, polarity %, tense %, difficulty %, …).
4. Report a table: field → agreement %.

Decision rule:
- Field ≥ ~90% agreement → trust the LLM for that field.
- Field mid → keep it but always cross-check / flag.
- Field low (e.g. difficulty, register often are) → do **not** auto-use; leave
  blank for professor, or derive by rule.

This tells us *which fields to trust* and *whether a cheaper model suffices for
the easy fields*, before spending on the full 8k run. Output the report to
`artifacts/corpus_audit/calibration_report.md`.

---

## 6. Step 2 — Curriculum mapping

Match audited sentences to `lesson_items` / the 29 modules using **our rules**,
not another LLM guess. Because sentences are already described, this is mostly
a query.

- Read `Cours/MONOKO_CURRICULUM.md` + `lesson_items` to get each module's
  target theme(s), CEFR level, and target grammatical feature(s).
- For each module, select verified sentences whose audit tags match
  (e.g. module 1.2 → theme in {salutations}, difficulty in {A1}).
- A sentence may map to **several** modules — allow many-to-many; do not force
  a single home.
- Output a mapping table:
```sql
create table if not exists corpus_lesson_map (
  id           bigserial primary key,
  example_id   bigint references examples(id),
  lesson_id    bigint references lesson_items(id),
  match_reason text,       -- which rule matched, for debugging
  priority     int,        -- primary vs supplementary material
  created_at   timestamptz default now()
);
```
- Re-running after a curriculum tweak should re-run **only this step**, cheaply.
  If a reorg forces re-running Step 1, the describe/place separation (2.2) was
  violated — fix it.

---

## 7. Step 3 — Exercise generator

Template functions that turn any **verified** sentence (or small group) into
the 5 exercise types. No hand-authoring; no LLM required.

The five types (all derivable from `french` + `lingala` + `audio_url`):
1. **Listen & type** — play `audio_url`, check typed input against `lingala`.
2. **Match pairs** — Lingala ↔ French across several items in the group.
3. **Tap words in order** — tokenized `lingala` + distractor tokens from the
   same lesson group.
4. **Fill the blank** — mask one token in `lingala`; options include plausible
   distractors from the group.
5. **Choose the audio** — play 3 clips, learner picks the one matching a prompt.

**Data-hygiene rules (this is where quality lives):**
- Tokenization must handle Lingala spacing, apostrophes, and tone marks
  consistently. Build and unit-test the tokenizer first.
- Listen-and-type checking must be forgiving: trim whitespace, normalize case,
  accept tone-mark variants; consider accepting near-miss spellings.
- Distractors must be **plausible**: pull from the same lesson group / similar
  audit tags so wrong answers aren't absurd. Never random corpus rows.
- Only generate from rows where `verification_status = verified` and
  `audio_url` is present (for audio exercises).

Build **listen-and-type first** end-to-end (simplest, uses existing TTS audio),
prove the tokenizer + data are clean, then add the other four.

Output: an `exercises` table (or generate on the fly and cache); include
`exercise_type`, `lesson_id`, source `example_id`(s), payload JSON, and the
distractor set used.

---

## 8. Step 4 — Lesson-draft generator (batch LLM)

For each lesson group, draft the short "teach beat" (2 cards: the pattern + an
example + which audio to play). Same batch-LLM pattern as the test pipeline.

- Input: a group of related verified sentences (from Step 2) + their audit tags.
- Output → `lesson_drafts` table, `status = 'pending_review'`, with
  `model_name` + `prompt_version`.
- The draft may *propose* a simple pattern note (e.g. "`te` at the end = not"),
  but it is a **draft for the professor**, never published directly.
- Keep the teach beat short — a card or two, not a grammar lecture.

```sql
create table if not exists lesson_drafts (
  id           bigserial primary key,
  lesson_id    bigint references lesson_items(id),
  draft_json   jsonb,        -- teach-beat cards, example refs, proposed note
  status       text default 'pending_review',  -- pending_review | approved | rejected
  model_name   text,
  prompt_version text,
  created_at   timestamptz default now(),
  reviewed_by  text,
  reviewed_at  timestamptz
);
```

---

## 9. Step 5 — Verification checkpoint (human)

- Professor reviews/edits `lesson_drafts` and flagged `corpus_audit` rows in the
  **existing admin panel** (extend it; reuse the `corrections` /
  `tester_name` / `session_id` tracking already in place).
- Approved drafts become live lessons; approved audit rows become trusted tags.
- Rejected/edited drafts feed corrections back so future prompts improve.
- No learner-facing content goes live without passing through here.

---

## 10. Rules summary (quick reference)

- Lightweight scripts that read → transform → write, each independently re-runnable.
- Audit **describes**; mapping **places**. Never fuse. No lesson IDs in the audit.
- Audit vocabularies = superset of what the 29 modules need. Verify coverage first.
- Verified-only reaches learners. Unverified may seed drafts only.
- LLM output is always a draft → professor approves via admin panel.
- LLM never invents grammar in the audit. Explanation only in Step 4, then verified.
- Calibrate the model per-field on 50 verified sentences BEFORE the full run.
- Record `model_name` + `prompt_version` on every LLM output.
- Distractors must be plausible (same group), never random.
- Parse LLM output defensively; never silently drop rows.

---

## 11. Suggested build order

1. **Coverage check** — map the 29 modules to required audit theme/feature tags;
   confirm the audit vocabularies cover them. (Output a short checklist doc.)
2. **Deterministic audit** (4.1) + the `corpus_audit` table skeleton.
3. **Calibration harness** (Section 5) — decide which fields to trust.
4. **LLM audit** (4.2) full run, with guardrails (4.4).
5. **Curriculum mapping** (Step 2).
6. **Tokenizer + listen-and-type generator** (Step 3, first type), unit-tested.
7. **Remaining four exercise types** (Step 3).
8. **Lesson-draft generator** (Step 4).
9. **Admin-panel review flow** (Step 5).

Ship and inspect each step's output before starting the next. Every step is
cheap to re-run; correctness at each stage matters more than speed.
