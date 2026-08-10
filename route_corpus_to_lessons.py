#!/usr/bin/env python3
"""
route_corpus_to_lessons.py
──────────────────────────
Assigns every verified FR↔dialect pair the app owns to its nearest lesson, so the
exercise engine can draw on the whole corpus instead of only `lesson_items`.

Sources (all already embedded with text-embedding-3-small, 384 dim):
    lesson_items        — the professor's course content; native, similarity 1.0
    parallel_sentences  — corrections, course variants, FLORES
    examples            — dictionary example sentences  (embedded 2026-08-07)
    senses              — dictionary headword↔word pairs (embedded 2026-08-07)

Routing is cosine top-1 against the lesson_items vectors: a candidate joins the
lesson whose content it most resembles. No LLM — `CORPUS_PIPELINE.md` Step 1
planned an LLM audit to make this possible, but the embeddings already exist and
give a free, deterministic answer. See that file's status banner.

Orthography is a property of the SOURCE, not of the string. The dictionary is
written without tone marks and the course with them, so "Mbote" from the course
is correctly spelled while "Mbula" from the dictionary is missing a tone the
course would write. Testing a string for accents would misclassify every
legitimately toneless word, so we tag by origin instead. The engine must never
mix the two inside one exercise — see EXERCISE_ENGINE_PLAN.md §3.

Usage:
    python3 route_corpus_to_lessons.py                 # writes the full routing
    python3 route_corpus_to_lessons.py --threshold 0.6
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import unicodedata
import urllib.request
from pathlib import Path

import numpy as np

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://haioiccujncsehadipzb.supabase.co").rstrip("/")
OUT = Path("artifacts/professor_ingest/corpus_routing.json")
LANGUAGE_ID = 1

# FLORES is machine-translation benchmark text: 92% of it is 13+ tokens, far too
# long for any tile exercise, and its tone-marking is inconsistent. It earns its
# keep as RAG context, not as exercise material.
EXCLUDE_SOURCES = {"flores200"}


def key() -> str:
    k = os.environ.get("SUPABASE_SERVICE_KEY")
    if not k:
        sys.exit("SUPABASE_SERVICE_KEY not set")
    return k


def page(table: str, select: str, extra: str = "", limit: int = 500) -> list[dict]:
    k, out, offset = key(), [], 0
    while True:
        url = f"{SUPABASE_URL}/rest/v1/{table}?select={select}{extra}&limit={limit}&offset={offset}"
        req = urllib.request.Request(url, headers={"apikey": k, "Authorization": f"Bearer {k}"})
        batch = json.load(urllib.request.urlopen(req))
        out.extend(batch)
        if len(batch) < limit:
            return out
        offset += limit


def vec(e) -> np.ndarray:
    return np.array(json.loads(e) if isinstance(e, str) else e, dtype=np.float64)


def norm_key(s: str) -> str:
    s = unicodedata.normalize("NFD", (s or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9 ]", "", re.sub(r"\s+", " ", s)).strip()


def tokens(s: str) -> int:
    return len([t for t in re.split(r"\s+", (s or "").strip()) if t])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--threshold", type=float, default=0.55,
                    help="minimum cosine similarity to accept a routing (default 0.55)")
    args = ap.parse_args()

    print("fetching…", flush=True)
    courses = {c["id"] for c in page("courses", "id", f"&language_id=eq.{LANGUAGE_ID}")}
    lessons = {l["id"]: l for l in page("lessons", "id,course_id,title,lesson_order")
               if l["course_id"] in courses}
    items = [r for r in page("lesson_items", "id,lesson_id,french,dialect,audio_url,item_order,embedding",
                             "&embedding=not.is.null") if r["lesson_id"] in lessons]
    ps = page("parallel_sentences", "id,french_text,lingala_text,source,embedding",
              f"&language_id=eq.{LANGUAGE_ID}&embedding=not.is.null")
    words = {w["id"]: w["french_word"] for w in page("words", "id,french_word", f"&language_id=eq.{LANGUAGE_ID}")}
    senses = [s for s in page("senses", "id,word_id,dialect_word,audio_url,embedding", "&embedding=not.is.null")
              if s["word_id"] in words]
    sense_ids = {s["id"] for s in senses}
    examples = [e for e in page("examples", "id,sense_id,sentence_french,sentence_dialect,audio_url,embedding",
                                "&embedding=not.is.null") if e["sense_id"] in sense_ids]
    print(f"  lessons {len(lessons)} · lesson_items {len(items)} · corpus {len(ps)} "
          f"· senses {len(senses)} · examples {len(examples)}")

    L = np.stack([vec(r["embedding"]) for r in items])
    L /= np.linalg.norm(L, axis=1, keepdims=True)

    # Candidates to route: (french, lingala, audio, source_table, source_id, orthography, vector)
    cand = []
    for p in ps:
        if p["source"] in EXCLUDE_SOURCES:
            continue
        cand.append((p["french_text"], p["lingala_text"], None, "parallel_sentences",
                     p["id"], "toned", p["embedding"]))
    for e in examples:
        cand.append((e["sentence_french"], e["sentence_dialect"], e["audio_url"], "examples",
                     e["id"], "untoned", e["embedding"]))
    for s in senses:
        cand.append((words[s["word_id"]], s["dialect_word"], s["audio_url"], "senses",
                     s["id"], "untoned", s["embedding"]))
    cand = [c for c in cand if (c[0] or "").strip() and (c[1] or "").strip()]

    # A pair already taught in a lesson must not be routed in a second time.
    native_keys = {(norm_key(r["french"]), norm_key(r["dialect"])) for r in items}

    C = np.stack([vec(c[6]) for c in cand])
    C /= np.linalg.norm(C, axis=1, keepdims=True)
    # Accelerate/BLAS on Apple silicon raises spurious divide/overflow warnings on
    # large matmuls. Checked: every row of both matrices is finite and unit-norm,
    # and the resulting similarities are in range — so the warnings are noise.
    with np.errstate(divide="ignore", over="ignore", invalid="ignore"):
        S = C @ L.T
    assert np.isfinite(S).all(), "non-finite similarity — embeddings are corrupt"
    best, sim = S.argmax(1), S.max(1)

    rows = []
    for r in items:  # the professor's own content is native to its lesson
        rows.append({
            "lesson_id": r["lesson_id"], "lesson": lessons[r["lesson_id"]]["title"],
            "source_table": "lesson_items", "source_id": r["id"],
            "french": r["french"], "lingala": r["dialect"], "audio_url": r["audio_url"],
            "token_count": tokens(r["dialect"]), "orthography": "toned",
            "similarity": 1.0, "is_native": True,
            "matched_item": None, "matched_lingala": None,
        })

    dropped_dupe = 0
    for i, (fr, ln, audio, table, sid, orth, _) in enumerate(cand):
        if float(sim[i]) < args.threshold:
            continue
        if (norm_key(fr), norm_key(ln)) in native_keys:
            dropped_dupe += 1
            continue
        item = items[best[i]]
        rows.append({
            "lesson_id": item["lesson_id"], "lesson": lessons[item["lesson_id"]]["title"],
            "source_table": table, "source_id": sid,
            "french": fr, "lingala": ln, "audio_url": audio,
            "token_count": tokens(ln), "orthography": orth,
            "similarity": round(float(sim[i]), 4), "is_native": False,
            "matched_item": item["french"], "matched_lingala": item["dialect"],
        })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"threshold": args.threshold, "language_id": LANGUAGE_ID,
                               "rows": rows}, ensure_ascii=False), encoding="utf-8")

    native = sum(1 for r in rows if r["is_native"])
    print(f"\n{len(rows)} pool rows ({native} native + {len(rows)-native} routed)")
    print(f"  already taught in a lesson, not re-added: {dropped_dupe}")
    print(f"  lessons with no additions: "
          f"{len(lessons) - len({r['lesson_id'] for r in rows if not r['is_native']})}")
    print(f"-> {OUT}")


if __name__ == "__main__":
    main()
