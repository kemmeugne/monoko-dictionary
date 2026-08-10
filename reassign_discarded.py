#!/usr/bin/env python3
"""
reassign_discarded.py
─────────────────────
Gives the 3,334 sentences the judge rejected a second chance — by asking which
lesson they DO belong to, instead of only whether they belong where cosine put
them.

Why this exists: cosine routing picks the nearest lesson_item and inherits its
lesson. `llm_route_judge.py` then votes yes/no on that single guess. A sentence
about cooking that landed in the animals lesson gets a well-deserved "no" and is
thrown away — even though it is perfectly good material sitting one lesson over.
That is the whole reason more than half the routed rows were dropped.

Here the model sees ALL 50 lessons at once and picks the right one (or says none
of them fit). The lesson catalogue is identical on every request, so it sits in
the system prompt where prompt caching makes the repetition nearly free.

Each lesson is described by its TITLE, its LEVEL, and a spread of real items the
professor wrote for it. Titles alone are not enough — a human reviewer could not
judge "Construction de phrases 1" from the name, and neither can the model.
`lessons` has no description column and `parent_theme` is only "Niveau N", so
the professor's own content is the description.

Answers are keyed by sentence id, never positional: an array response that drifts
by one silently mislabels everything after it, which is exactly how the word
difficulty classifier failed before it was keyed.

Usage:
    python3 reassign_discarded.py --sample 30      # try it on 30 first
    python3 reassign_discarded.py                  # full pass (resumable)
    python3 reassign_discarded.py --report         # summarise what it decided
"""

from __future__ import annotations

import argparse
import json
import os
import random
import sys
import time
import urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import llm_route_judge as judge  # Progress, ask-style retry policy, client factory

ART = Path("artifacts/professor_ingest")
ROUTING = ART / "corpus_routing.json"
VERDICTS = ART / "llm_route_verdicts_strict.json"
OUT = ART / "lesson_reassignments.json"
CATALOGUE = ART / "lesson_catalogue.json"

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://haioiccujncsehadipzb.supabase.co").rstrip("/")
LANGUAGE_ID = 1
SAMPLES_PER_LESSON = 8
BATCH = 15


def supa(path: str) -> list[dict]:
    k = os.environ.get("SUPABASE_SERVICE_KEY")
    if not k:
        sys.exit("SUPABASE_SERVICE_KEY not set")
    req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/{path}",
                                 headers={"apikey": k, "Authorization": f"Bearer {k}"})
    return json.load(urllib.request.urlopen(req))


def build_catalogue(routing: list[dict]) -> list[dict]:
    """One entry per lesson: level, title, and a spread of the professor's items.

    Sampled evenly across the lesson rather than taking the first N — the opening
    items of a lesson are often its narrowest (a numbers lesson starts at one,
    two, three), which would misrepresent what the lesson covers.
    """
    if CATALOGUE.exists():
        return json.loads(CATALOGUE.read_text(encoding="utf-8"))

    courses = {c["id"]: c for c in supa(f"courses?select=id,title,course_order&language_id=eq.{LANGUAGE_ID}")}
    lessons = [l for l in supa("lessons?select=id,course_id,title,lesson_order&limit=200")
               if l["course_id"] in courses]

    native = defaultdict(list)
    for r in routing:
        if r["is_native"]:
            native[r["lesson_id"]].append(r["french"])

    cat = []
    for l in sorted(lessons, key=lambda x: (courses[x["course_id"]]["course_order"], x["lesson_order"])):
        items = native.get(l["id"], [])
        step = max(1, len(items) // SAMPLES_PER_LESSON)
        cat.append({
            "lesson_id": l["id"],
            "level": courses[l["course_id"]]["course_order"],
            "title": l["title"],
            "samples": [i for i in items[::step][:SAMPLES_PER_LESSON] if i],
        })
    CATALOGUE.write_text(json.dumps(cat, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"catalogue built: {len(cat)} lessons -> {CATALOGUE}")
    return cat


def catalogue_text(cat: list[dict]) -> str:
    out = []
    for c in cat:
        ex = " · ".join(c["samples"][:SAMPLES_PER_LESSON])
        out.append(f'[{c["lesson_id"]}] N{c["level"]} — {c["title"]}\n     ex : {ex}')
    return "\n".join(out)


SYSTEM_TEMPLATE = """Tu ranges des phrases françaises dans le bon chapitre d'un cours de lingala.

Voici les 50 leçons du cours. Chaque ligne donne l'identifiant entre crochets, le
niveau, le titre, puis de vrais exemples écrits par le professeur pour cette
leçon — ce sont ces exemples qui définissent le contenu réel de la leçon, bien
plus que son titre.

{catalogue}

Pour chaque phrase qu'on te donne, indique l'identifiant de la leçon où elle a sa
place.

Règles :
- Choisis la leçon dont le contenu ressemble le plus à la phrase.
- Certaines leçons portent sur un point de GRAMMAIRE (prépositions, pronoms,
  conjugaison) plutôt que sur un thème : n'y place une phrase que si elle
  illustre vraiment ce point.
- Tiens compte du NIVEAU : une phrase simple va plutôt dans les premiers niveaux,
  une phrase longue ou abstraite dans les derniers.
- Si aucune leçon ne convient vraiment, réponds null pour cette phrase. Mieux
  vaut null qu'un rangement arbitraire.

Réponds uniquement par un objet JSON associant chaque numéro de phrase à un
identifiant de leçon ou à null, par exemple :
{{"1": 351, "2": null, "3": 366}}"""


def classify_batch(client, provider, model, system, rows) -> dict[str, int | None]:
    listing = "\n".join(f'{i+1}. {r["french"]}' for i, r in enumerate(rows))
    text = judge._call_raw(client, provider, model, system, listing, 90, max_tokens=600)
    got = json.loads(text)
    out: dict[str, int | None] = {}
    for i, r in enumerate(rows):
        v = got.get(str(i + 1), got.get(i + 1, "MISSING"))
        if v == "MISSING":
            continue
        out[f'{r["source_table"]}:{r["source_id"]}'] = int(v) if isinstance(v, (int, float)) else None
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", type=int, help="only classify N random discarded rows")
    ap.add_argument("--report", action="store_true", help="summarise existing results, no API calls")
    ap.add_argument("--provider", default="openai", choices=["anthropic", "openai"])
    ap.add_argument("--model", default="gpt-4.1-mini")
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    routing = json.loads(ROUTING.read_text(encoding="utf-8"))["rows"]
    verdicts = json.loads(VERDICTS.read_text(encoding="utf-8"))["verdicts"]
    by_key = {f'{r["source_table"]}:{r["source_id"]}': r for r in routing if not r["is_native"]}
    discarded = [by_key[k] for k, v in verdicts.items() if v == "no" and k in by_key]

    done: dict[str, int | None] = {}
    if OUT.exists():
        done = json.loads(OUT.read_text(encoding="utf-8"))["assignments"]

    if args.report:
        report(routing, by_key, done)
        return

    cat = build_catalogue(routing)
    system = SYSTEM_TEMPLATE.format(catalogue=catalogue_text(cat))

    todo = [r for r in discarded if f'{r["source_table"]}:{r["source_id"]}' not in done]
    if args.sample:
        random.Random(args.seed).shuffle(todo)
        todo = todo[:args.sample]
    print(f"{len(discarded)} discarded rows · {len(done)} already placed · {len(todo)} to do")
    print(f"catalogue ≈ {len(system)//4} tokens (cached across calls)")
    if not todo:
        report(routing, by_key, done)
        return

    client = judge.make_client(args.provider)
    judge.preflight(client, args.provider, args.model)

    batches = [todo[i:i + BATCH] for i in range(0, len(todo), BATCH)]
    prog = judge.Progress(len(todo), label="rangement ")

    def run(batch):
        for attempt in range(4):
            try:
                res = classify_batch(client, args.provider, args.model, system, batch)
                for _ in batch:
                    prog.tick("yes")
                return res
            except Exception as e:
                if not judge._is_retryable(e) or attempt == 3:
                    prog.log(f"  échec lot : {type(e).__name__}: {str(e)[:110]}")
                    for _ in batch:
                        prog.tick(None)
                    return {}
                time.sleep(2 ** attempt)
        return {}

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        for res in ex.map(run, batches):
            done.update(res)
            OUT.write_text(json.dumps({"model": args.model, "assignments": done},
                                      ensure_ascii=False), encoding="utf-8")
    prog.close()
    report(routing, by_key, done)


def report(routing, by_key, done) -> None:
    titles = {r["lesson_id"]: r["lesson"] for r in routing}
    placed = {k: v for k, v in done.items() if v is not None}
    print(f"\n{len(done)} classées · {len(placed)} rangées dans une leçon · "
          f"{len(done)-len(placed)} sans leçon (null)")
    moved = sum(1 for k, v in placed.items() if k in by_key and v != by_key[k]["lesson_id"])
    print(f"   dont {moved} déplacées vers une AUTRE leçon que celle du cosinus "
          f"({len(placed)-moved} confirmées au même endroit)")
    print("\nleçons qui récupèrent le plus :")
    for lid, n in Counter(placed.values()).most_common(12):
        print(f"   +{n:>4}  {titles.get(lid, f'lesson {lid}')}")


if __name__ == "__main__":
    main()
