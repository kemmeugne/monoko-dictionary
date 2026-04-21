"""
split_multi_lingala_rows.py
────────────────────────────
Finds parallel_sentences rows where lingala_text contains multiple translations
separated by newlines, splits them into individual rows, deletes the originals,
and inserts the clean individual rows (with null embeddings, ready for re-embedding).

Usage:
  python3 split_multi_lingala_rows.py [--dry-run]
"""

import json
import os
import sys
import urllib.request
import urllib.error
from pathlib import Path

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://haioiccujncsehadipzb.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")


def supa_headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def fetch_multi_rows():
    """Fetch all verified Lingala rows where lingala_text contains a newline."""
    print("Fetching rows with multiple Lingala translations…")
    all_rows = []
    limit = 1000
    offset = 0
    while True:
        url = (
            f"{SUPABASE_URL}/rest/v1/parallel_sentences"
            f"?language_id=eq.1"
            f"&quality=eq.verified"
            f"&lingala_text=like.*%0A*"
            f"&select=id,french_text,lingala_text,source,quality,language_id"
            f"&limit={limit}&offset={offset}"
        )
        req = urllib.request.Request(url, headers=supa_headers())
        with urllib.request.urlopen(req, timeout=30) as resp:
            rows = json.loads(resp.read().decode("utf-8"))
        all_rows.extend(rows)
        if len(rows) < limit:
            break
        offset += limit
    print(f"  Found {len(all_rows)} rows with newline-separated translations")
    return all_rows


def split_lingala(lingala_text):
    """Split newline-separated Lingala translations, filtering empty lines."""
    parts = [line.strip() for line in lingala_text.split("\n")]
    return [p for p in parts if p]


def delete_row(row_id, dry_run):
    if dry_run:
        return
    url = f"{SUPABASE_URL}/rest/v1/parallel_sentences?id=eq.{row_id}"
    req = urllib.request.Request(url, method="DELETE", headers=supa_headers())
    with urllib.request.urlopen(req, timeout=30) as resp:
        resp.read()


def insert_rows(new_rows, dry_run):
    if dry_run:
        return
    url = f"{SUPABASE_URL}/rest/v1/parallel_sentences"
    body = json.dumps(new_rows, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST", headers=supa_headers())
    with urllib.request.urlopen(req, timeout=30) as resp:
        resp.read()


def main():
    dry_run = "--dry-run" in sys.argv

    if not SUPABASE_KEY:
        print("ERROR: SUPABASE_SERVICE_KEY not set", file=sys.stderr)
        sys.exit(1)

    rows = fetch_multi_rows()
    if not rows:
        print("Nothing to do.")
        return

    total_original = len(rows)
    total_new = 0
    total_deleted = 0

    for row in rows:
        variants = split_lingala(row["lingala_text"])
        if len(variants) <= 1:
            # Shouldn't happen but skip if only one after stripping
            continue

        print(f"\nID {row['id']} — \"{row['french_text'][:70]}\"")
        print(f"  {len(variants)} variants:")
        for v in variants:
            print(f"    → \"{v}\"")

        new_rows = [
            {
                "language_id": row["language_id"],
                "french_text": row["french_text"],
                "lingala_text": variant,
                "source": row["source"],
                "quality": row["quality"],
                # embedding left null — will be picked up by embed_parallel_sentences.py
            }
            for variant in variants
        ]

        if not dry_run:
            delete_row(row["id"], dry_run)
            insert_rows(new_rows, dry_run)

        total_new += len(new_rows)
        total_deleted += 1

    print("\n" + "=" * 60)
    print(f"Original rows processed : {total_original}")
    print(f"Rows deleted            : {total_deleted}")
    print(f"New rows inserted       : {total_new}")
    print(f"Net change              : +{total_new - total_deleted} rows")
    if dry_run:
        print("\nDRY RUN — no changes made. Remove --dry-run to apply.")
    else:
        print("\nDone. Run embed_parallel_sentences.py to embed the new rows.")


if __name__ == "__main__":
    main()
