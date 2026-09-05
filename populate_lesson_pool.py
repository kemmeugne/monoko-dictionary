#!/usr/bin/env python3
"""
populate_lesson_pool.py
───────────────────────
Assembles `lesson_pool` — the material the exercise engine draws on — from the
professor's own content plus everything the two LLM passes salvaged.

Three tiers, each with a measured precision, kept distinct per row so the engine
can prefer the trustworthy material where a lesson has enough of it:

    native      1,337   unambiguous professor lesson material     100%
    approved    3,063   cosine proposed, `llm_route_judge` confirmed  ~96%
    reassigned  1,786   cosine was wrong, `reassign_discarded` re-placed  ~90%

Rows the judge rejected AND the reassigner could not place are deliberately
absent: 1,548 mostly-bare verbs and adjectives with no topical home. They are not
lost — they remain in the dictionary and stay reachable to word exercises through
the difficulty level that actually governs them.

Idempotent: upserts on (source_table, source_id), so re-running after a re-route
updates rows in place rather than doubling a lesson's material.

Usage:
    python3 populate_lesson_pool.py --dry-run
    python3 populate_lesson_pool.py
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import unicodedata
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

ART = Path("artifacts/professor_ingest")
ROUTING = ART / "corpus_routing.json"
VERDICTS = ART / "llm_route_verdicts_strict.json"
REASSIGN = ART / "lesson_reassignments.json"
DIFFICULTY = ART / "word_difficulty.json"

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://haioiccujncsehadipzb.supabase.co").rstrip("/")
LANGUAGE_ID = 1
CHUNK = 500

# Lessons merged into another after the routing artifacts were written.
#
# The artifacts in artifacts/professor_ingest/ still name the lesson each row was
# routed to, and those ids are frozen at the time the routing ran. When a lesson
# is merged away, `level_of` has no entry for the old id, the row is counted as
# skipped_no_level and DISAPPEARS from the pool — silently, because a skip is a
# normal outcome for genuinely unplaceable rows.
#
#   375 -> 350  "Les nombres ordinaux" folded into "Les nombres" (2026-08-17,
#               sql/merge_ordinals_into_numbers.sql). Three items could not build
#               a session, so 80% of that lesson meant 3/3.
LESSON_MERGES = {375: 350}

# The lesson page is a teaching surface; the pool is an exercise surface. A few
# professor rows are useful in the lesson but cannot form one unambiguous
# French-Lingala question. Keep the source rows intact and curate only their pool
# representation. See sql/native_content_cleanup.sql.
NATIVE_POOL_EXCLUSIONS = {
    7093,  # exact duplicate of 7084: A bientôt -> Ba kala te
    7747,  # duplicate headword; its example duplicates 7746's example
    7770,  # exact duplicate of 7764, including its example
    8384,  # six argot expressions in one row; waiting on professor re-record
    8642, 8643,  # one French imperative with two Lingala variants in one clip
    8688, 8689, 8690,  # metadata rows ('Intelligence'), not translation pairs
    8692,  # four French proverbs and two Lingala variants in one malformed row
}

# These rows repeat a headword already present in the same lesson but carry a
# different professor-recorded example. Use that example in Pratiquer so the
# source contributes new material instead of asking the same word twice.
NATIVE_POOL_USE_EXAMPLE = {7746, 7751, 7754, 7755}

# Mechanical prompt cleanup only: no Lingala is invented. The imperative rows
# retain the first audio segment, so the French prompt must retain the matching
# first person. Parentheses around Oyo marked optional notation, not speech.
NATIVE_POOL_TEXT_OVERRIDES = {
    7775: {"lingala": "Oyo"},
    8641: {"french": "Parle ! (tu)"},
    8662: {"french": "Ne parle pas ! (tu)"},
    8663: {"french": "Ne finis pas ! (tu)"},
    8664: {"french": "Ne vends pas ! (tu)"},
}


def merged(lesson_id):
    """The lesson a row belongs to today, following any merge."""
    return LESSON_MERGES.get(lesson_id, lesson_id)


def key() -> str:
    k = os.environ.get("SUPABASE_SERVICE_KEY")
    if not k:
        sys.exit("SUPABASE_SERVICE_KEY not set")
    return k


def supa(path: str) -> list[dict]:
    req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/{path}",
                                 headers={"apikey": key(), "Authorization": f"Bearer {key()}"})
    return json.load(urllib.request.urlopen(req))


def norm_word(s: str) -> str:
    return re.sub(r"\s+", " ", str(s).replace("\xa0", " ")).strip().casefold()


def tokens(s: str) -> int:
    return len([t for t in re.split(r"\s+", (s or "").strip()) if t])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    routing = json.loads(ROUTING.read_text(encoding="utf-8"))["rows"]
    verdicts = json.loads(VERDICTS.read_text(encoding="utf-8"))["verdicts"]
    reassign = json.loads(REASSIGN.read_text(encoding="utf-8"))["assignments"]
    difficulty = json.loads(DIFFICULTY.read_text(encoding="utf-8"))["levels"]
    diff_by_word = {norm_word(w): lv for w, lv in difficulty.items()}

    courses = {c["id"]: c for c in supa(f"courses?select=id,course_order&language_id=eq.{LANGUAGE_ID}")}
    level_of = {l["id"]: courses[l["course_id"]]["course_order"]
                for l in supa("lessons?select=id,course_id&limit=200")
                if l["course_id"] in courses}
    example_ids = ",".join(str(i) for i in sorted(NATIVE_POOL_USE_EXAMPLE))
    example_rows = {
        r["id"]: r for r in supa(
            "lesson_items?select=id,example_french,example_dialect,example_audio_url"
            f"&id=in.({example_ids})"
        )
    }
    missing_examples = NATIVE_POOL_USE_EXAMPLE - example_rows.keys()
    if missing_examples:
        sys.exit(f"Native cleanup source rows missing: {sorted(missing_examples)}")

    def row_key(r):
        return f'{r["source_table"]}:{r["source_id"]}'

    rows, skipped_no_level, skipped_native_cleanup = [], 0, 0
    for r in routing:
        if r["is_native"]:
            if r["source_table"] == "lesson_items" and r["source_id"] in NATIVE_POOL_EXCLUSIONS:
                skipped_native_cleanup += 1
                continue
            r = dict(r)
            if r["source_table"] == "lesson_items" and r["source_id"] in NATIVE_POOL_USE_EXAMPLE:
                example = example_rows[r["source_id"]]
                if not (example.get("example_french") or "").strip() or not (example.get("example_dialect") or "").strip():
                    sys.exit(f'Native cleanup example is blank: lesson_items:{r["source_id"]}')
                r["french"] = example["example_french"]
                r["lingala"] = example["example_dialect"]
                r["audio_url"] = example.get("example_audio_url")
            for field, value in NATIVE_POOL_TEXT_OVERRIDES.get(r["source_id"], {}).items():
                r[field] = value
            lesson_id, tier = merged(r["lesson_id"]), "native"
        else:
            k = row_key(r)
            if verdicts.get(k) == "yes":
                lesson_id, tier = merged(r["lesson_id"]), "approved"
            elif reassign.get(k):
                lesson_id, tier = merged(reassign[k]), "reassigned"
            else:
                continue  # rejected and unplaceable — see the module docstring

        level = level_of.get(lesson_id)
        if level is None:
            skipped_no_level += 1
            continue

        # Difficulty applies to single words only. A sentence is already graded
        # by its length; a word is one token, so length says nothing about it.
        n = tokens(r["lingala"])
        diff = diff_by_word.get(norm_word(r["french"])) if n == 1 else None

        rows.append({
            "language_id": LANGUAGE_ID,
            "lesson_id": lesson_id,
            "source_table": r["source_table"],
            "source_id": r["source_id"],
            "french": r["french"].strip(),
            "lingala": r["lingala"].strip(),
            "audio_url": r["audio_url"],
            "tier": tier,
            "token_count": n,
            "orthography": r["orthography"],
            "level": level,
            "difficulty": diff,
            # Difficulty only ever restricts — never promotes a row to an easier level.
            "effective_level": max(level, diff) if diff else level,
        })

    by_tier = Counter(x["tier"] for x in rows)
    per_lesson = Counter(x["lesson_id"] for x in rows)
    print(f"{len(rows)} pool rows")
    for t in ("native", "approved", "reassigned"):
        print(f"   {t:<12}{by_tier[t]:>6}")
    print(f"   with audio  {sum(1 for x in rows if x['audio_url']):>6}")
    print(f"   word rows carrying a difficulty  {sum(1 for x in rows if x['difficulty']):>6}"
          f"  (of {sum(1 for x in rows if x['token_count'] == 1)} single-word rows)")
    print(f"   raised above their lesson's level by difficulty  "
          f"{sum(1 for x in rows if x['effective_level'] > x['level']):>6}")
    print(f"   lessons covered  {len(per_lesson)}/{len(level_of)}")
    if skipped_no_level:
        print(f"   !! {skipped_no_level} rows skipped: lesson not in this language")
    print(f"   native exercise-only exclusions  {skipped_native_cleanup:>6}")
    print(f"   native duplicate headwords replaced by examples  {len(NATIVE_POOL_USE_EXAMPLE):>6}")

    if args.dry_run:
        print("\ndry run — nothing written")
        return

    k = key()
    headers = {"apikey": k, "Authorization": f"Bearer {k}",
               "Content-Type": "application/json",
               # Re-runnable: update the existing row rather than erroring or
               # inserting a duplicate.
               "Prefer": "resolution=merge-duplicates,return=minimal"}
    written = 0
    for i in range(0, len(rows), CHUNK):
        chunk = rows[i:i + CHUNK]
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/lesson_pool?on_conflict=source_table,source_id",
            data=json.dumps(chunk).encode(), headers=headers, method="POST")
        urllib.request.urlopen(req)
        written += len(chunk)
        print(f"   {written}/{len(rows)}", flush=True)

    total = supa("lesson_pool?select=id&limit=1")
    print(f"\ndone — {written} rows upserted into lesson_pool")


if __name__ == "__main__":
    main()
