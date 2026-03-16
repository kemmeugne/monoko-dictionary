"""
fetch_supabase_for_rag.py
─────────────────────────
Fetches dictionary (words/senses/examples) and lesson_items from Supabase
and saves them as data/supabase_verified.jsonl for inclusion in the FAISS index.

Run this BEFORE step2_process_and_merge.py when rebuilding the index.

Usage:
    SUPABASE_SERVICE_KEY=your_key python fetch_supabase_for_rag.py
"""

import os
import json
import requests
from tqdm import tqdm

SUPABASE_URL = "https://haioiccujncsehadipzb.supabase.co"
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
}

LANGUAGE_NAMES = {
    1: "lingala",
    2: "yoruba",
}


def paginate(table, params, page_size=1000):
    """Fetch all rows using Supabase range pagination."""
    results = []
    offset = 0
    while True:
        headers = {**HEADERS, "Range": f"{offset}-{offset + page_size - 1}"}
        res = requests.get(
            f"{SUPABASE_URL}/rest/v1/{table}?{params}",
            headers=headers,
        )
        res.raise_for_status()
        batch = res.json()
        if not batch:
            break
        results.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return results


def fetch_dictionary():
    """Fetch words/senses/examples — the professor-verified dictionary."""
    print("Fetching dictionary (words → senses → examples)...")
    entries = []

    words = paginate(
        "words",
        "select=id,french_word,language_id,senses(dialect_word,examples(sentence_french,sentence_dialect))",
    )

    for word in tqdm(words, desc="  words"):
        lang = LANGUAGE_NAMES.get(word["language_id"], "unknown")
        for sense in word.get("senses") or []:
            if not sense.get("dialect_word"):
                continue

            # The word pair itself
            entries.append({
                "french":      word["french_word"],
                "dialect":     sense["dialect_word"],
                "source":      "dictionary",
                "quality":     "verified",
                "language":    lang,
                "language_id": word["language_id"],
                "meta":        "",
            })

            # Each example sentence as a separate entry (richer semantic match)
            for ex in sense.get("examples") or []:
                if ex.get("sentence_french") and ex.get("sentence_dialect"):
                    entries.append({
                        "french":      ex["sentence_french"],
                        "dialect":     ex["sentence_dialect"],
                        "source":      "dictionary_example",
                        "quality":     "verified",
                        "language":    lang,
                        "language_id": word["language_id"],
                        "meta":        f"{word['french_word']} ({sense['dialect_word']})",
                    })

    print(f"  → {len(entries)} dictionary entries")
    return entries


def fetch_lessons():
    """Fetch lesson_items with their course/lesson context."""
    print("Fetching lesson_items...")
    entries = []

    items = paginate(
        "lesson_items",
        "select=french,dialect,example_french,example_dialect,"
        "lessons!inner(title,courses!inner(language_id,title))",
    )

    for item in tqdm(items, desc="  items"):
        if not item.get("french") or not item.get("dialect"):
            continue
        lang_id    = item["lessons"]["courses"]["language_id"]
        lang       = LANGUAGE_NAMES.get(lang_id, "unknown")
        course     = item["lessons"]["courses"]["title"] or ""
        lesson     = item["lessons"]["title"] or ""
        meta       = f"{course} > {lesson}"

        entries.append({
            "french":      item["french"],
            "dialect":     item["dialect"],
            "source":      "lesson",
            "quality":     "verified",
            "language":    lang,
            "language_id": lang_id,
            "meta":        meta,
        })

        if item.get("example_french") and item.get("example_dialect"):
            entries.append({
                "french":      item["example_french"],
                "dialect":     item["example_dialect"],
                "source":      "lesson_example",
                "quality":     "verified",
                "language":    lang,
                "language_id": lang_id,
                "meta":        meta,
            })

    print(f"  → {len(entries)} lesson entries")
    return entries


def main():
    os.makedirs("data", exist_ok=True)

    dict_entries   = fetch_dictionary()
    lesson_entries = fetch_lessons()
    all_entries    = dict_entries + lesson_entries

    output_path = "data/supabase_verified.jsonl"
    with open(output_path, "w", encoding="utf-8") as f:
        for entry in all_entries:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    print(f"\n✓ Saved {len(all_entries)} entries to {output_path}")
    print(f"  Dictionary words/examples : {len(dict_entries)}")
    print(f"  Lesson items/examples     : {len(lesson_entries)}")


if __name__ == "__main__":
    main()
