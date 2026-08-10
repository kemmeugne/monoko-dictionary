#!/usr/bin/env python3
"""
classify_word_difficulty.py
───────────────────────────
Assigns a difficulty level 1–6 to every French headword in the Lingala
dictionary, so single-word exercises can be gated by learner level.

Why words need this and sentences do not: topic is the wrong axis for a single
word. *Manger* and *boire* are beginner vocabulary whichever lesson they route
into, and *exporter* or *victimisation* should never reach a Niveau 1 learner
even when they route perfectly into "Le travail et les métiers". Sentences get a
usable difficulty signal for free from their token count; every word is one
token, so length tells us nothing and the signal has to come from somewhere else.

The level is judged from the FRENCH side. That is a proxy — what is hard for a
French speaker learning Lingala is not identical to what is a hard French word,
since a Lingala word can be structurally awkward while its gloss is trivial. It
is a good proxy for *concept* difficulty, which is the thing being gated, and not
worth more machinery than that.

The result RESTRICTS but never promotes: a row's effective level is
max(level of the lesson it routed into, this difficulty). Topical routing still
enriches a lesson, but a hard word can never leak down into an easy one.

Re-runnable: already-classified words are loaded from the output file and skipped,
so an interrupted run resumes without re-spending.

Usage:
    python3 classify_word_difficulty.py --dry-run
    python3 classify_word_difficulty.py
    python3 classify_word_difficulty.py --review     # print the boundaries
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request
from pathlib import Path

import re

import openai

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://haioiccujncsehadipzb.supabase.co").rstrip("/")
OUT = Path("artifacts/professor_ingest/word_difficulty.json")
MODEL = "gpt-4o-mini"
BATCH = 40
LANGUAGE_ID = 1

# Anchored with real examples so the model is not inventing its own scale. The
# six levels mirror the Monoko curriculum (A1 → B2+), not CEFR labels directly,
# because the question is "how early should a learner meet this concept".
SYSTEM = """Tu classes des mots français par difficulté, pour un cours de langue africaine destiné à des francophones.

La question n'est PAS « ce mot français est-il difficile à lire », mais « à quel
moment de son apprentissage un débutant devrait-il rencontrer ce concept ».

Barème :
1 — les tout premiers mots : manger, boire, eau, maison, bonjour, mère, un, deux
2 — vocabulaire concret du quotidien : marché, cuisine, voisin, chemise, dormir
3 — courant mais moins basique : réparer, expliquer, prudent, emprunter, jaloux
4 — abstrait ou spécialisé : contrat, opinion, développer, autorité, coutume
5 — formel, technique ou littéraire : exporter, négociation, juridique, décret
6 — rare ou très spécialisé : victimisation, jurisprudence, oligarchie

Réponds UNIQUEMENT par un objet JSON de la forme
{"Manger": 1, "Exporter": 5, ...} : chaque clé est le mot EXACTEMENT tel qu'il
t'a été donné, chaque valeur est un entier de 1 à 6. Inclus tous les mots."""


def norm_word(s: str) -> str:
    """Collapse every kind of whitespace (incl. \xa0) so lookups survive the
    model tidying up spacing."""
    return re.sub(r"\s+", " ", str(s).replace("\xa0", " ")).strip().casefold()


def aliases(w: str) -> set[str]:
    """Every form the model might answer with for one headword.

    Many entries are compounds — "Beau / Belle", "Décider / Décision",
    "Humid(it)é", "Cause (à cause de)" — and the model splits them, rating each
    half under its own key. Matching only the full string loses those rows on
    every retry, so each part is registered as an alias back to the headword.
    """
    out = {norm_word(w)}
    variants = {w,
                re.sub(r"\([^)]*\)", "", w),      # "Cause (à cause de)" -> "Cause"
                re.sub(r"[()]", "", w)}           # "Humid(it)é"         -> "Humidité"
    for v in variants:
        for part in re.split(r"\s*/\s*", v):
            part = norm_word(part)
            if len(part) > 2:
                out.add(part)
    return out


def key(name: str) -> str:
    v = os.environ.get(name)
    if not v:
        sys.exit(f"{name} not set")
    return v


def fetch_words() -> list[str]:
    k, out, offset = key("SUPABASE_SERVICE_KEY"), [], 0
    while True:
        url = (f"{SUPABASE_URL}/rest/v1/words?select=french_word"
               f"&language_id=eq.{LANGUAGE_ID}&limit=1000&offset={offset}")
        req = urllib.request.Request(url, headers={"apikey": k, "Authorization": f"Bearer {k}"})
        batch = json.load(urllib.request.urlopen(req))
        out.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000
    return sorted({(w["french_word"] or "").strip() for w in out if (w["french_word"] or "").strip()})


def review(levels: dict[str, int]) -> None:
    """Errors concentrate at the boundaries, so read those rather than sample the
    middle: the hardest words called level 1 and the easiest called level 6 are
    where a bad scale shows itself."""
    from collections import Counter
    counts = Counter(levels.values())
    print("distribution:")
    for lvl in range(1, 7):
        n = counts.get(lvl, 0)
        print(f"   niveau {lvl}: {n:>5}  {'█' * (n // 25)}")
    for lvl in range(1, 7):
        words = sorted(w for w, v in levels.items() if v == lvl)
        if not words:
            continue
        print(f"\nniveau {lvl} ({len(words)}) — échantillon:")
        step = max(1, len(words) // 18)
        print("   " + ", ".join(words[::step][:18]))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--review", action="store_true", help="print distribution + samples, no API calls")
    args = ap.parse_args()

    done: dict[str, int] = {}
    if OUT.exists():
        done = json.loads(OUT.read_text(encoding="utf-8"))["levels"]

    if args.review:
        if not done:
            sys.exit(f"{OUT} missing — run without --review first")
        review(done)
        return

    words = fetch_words()
    todo = [w for w in words if w not in done]
    print(f"{len(words)} unique French words · {len(done)} already classified · {len(todo)} to do")
    if args.dry_run:
        print(f"would issue {(len(todo) + BATCH - 1) // BATCH} calls to {MODEL}")
        return
    if not todo:
        review(done)
        return

    client = openai.OpenAI(api_key=key("OPENAI_API_KEY"))
    for i in range(0, len(todo), BATCH):
        chunk = todo[i:i + BATCH]
        # Keyed by the word, never positional: an array response that drifts by
        # one silently mislabels everything after it, and the model does drift.
        # Keying also makes a partial answer usable instead of worthless.
        # Match loosely: several headwords contain non-breaking spaces
        # ("Beau\xa0/ Belle") which the model silently normalises, so an exact
        # key comparison drops them on every retry.
        lookup = {a: w for w in chunk for a in aliases(w)}
        try:
            resp = client.chat.completions.create(
                model=MODEL, temperature=0, max_tokens=4000,
                response_format={"type": "json_object"},
                messages=[{"role": "system", "content": SYSTEM},
                          {"role": "user", "content": "\n".join(chunk)}],
            )
            got = json.loads(resp.choices[0].message.content)
        except (json.JSONDecodeError, openai.APIError) as e:
            print(f"  !! batch {i//BATCH} failed ({type(e).__name__}) — will retry on re-run")
            continue

        # A compound may collect several answers ("Beau" 2, "Belle" 2). Keep the
        # highest: the level restricts what a learner sees, so erring upward is
        # the safe direction.
        hits = 0
        for k, lv in got.items():
            w = lookup.get(norm_word(k))
            if w and isinstance(lv, int) and 1 <= lv <= 6:
                if w not in done:
                    hits += 1
                done[w] = max(done.get(w, 0), lv)
        if hits < len(chunk):
            print(f"  .. batch {i//BATCH}: {hits}/{len(chunk)} returned; rest retried on re-run")
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps({"model": MODEL, "levels": done}, ensure_ascii=False, indent=0),
                       encoding="utf-8")
        print(f"  {min(i+BATCH, len(todo))}/{len(todo)}", flush=True)

    print(f"\n{len(done)} words classified -> {OUT}\n")
    review(done)


if __name__ == "__main__":
    main()
