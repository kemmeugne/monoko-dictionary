"""
embed_lesson_items.py
─────────────────────
One-time (and re-runnable) script that embeds every lesson_items row using
OpenAI text-embedding-3-small (384 dimensions) and writes the vectors back
to Supabase for use by the match_lesson_items pgvector RPC.

Prerequisites
─────────────
  pip install openai httpx

Environment variables
─────────────────────
  SUPABASE_URL          e.g. https://haioiccujncsehadipzb.supabase.co
  SUPABASE_SERVICE_KEY  service role key
  OPENAI_API_KEY        sk-proj-...

Usage
─────
  python3 embed_lesson_items.py

  # dry-run: print stats without writing to Supabase
  python3 embed_lesson_items.py --dry-run

  # only embed rows missing an embedding (default behaviour)
  # to re-embed everything, pass --force
  python3 embed_lesson_items.py --force
"""

import argparse
import json
import os
import sys
import time
from typing import Optional

import httpx
import openai

# ── Config ────────────────────────────────────────────────────────────────────
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://haioiccujncsehadipzb.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
OPENAI_KEY   = os.environ.get("OPENAI_API_KEY", "")

EMBED_MODEL  = "text-embedding-3-small"
EMBED_DIMS   = 384          # matches pgvector column
BATCH_SIZE   = 100          # items per OpenAI embedding call
RETRY_DELAY  = 2            # seconds between retries on rate-limit

# ── Supabase helpers ──────────────────────────────────────────────────────────
def supa_headers() -> dict:
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }


def supa_get(path: str, params: dict = None) -> list:
    """Paginated GET from Supabase REST API."""
    results = []
    limit   = 1000
    offset  = 0
    while True:
        p = {"limit": limit, "offset": offset, **(params or {})}
        r = httpx.get(f"{SUPABASE_URL}/rest/v1/{path}", headers=supa_headers(), params=p, timeout=30)
        r.raise_for_status()
        batch = r.json()
        results.extend(batch)
        if len(batch) < limit:
            break
        offset += limit
    return results


def supa_patch(table: str, match: dict, data: dict) -> None:
    params = {k: f"eq.{v}" for k, v in match.items()}
    r = httpx.patch(
        f"{SUPABASE_URL}/rest/v1/{table}",
        headers={**supa_headers(), "Prefer": "return=minimal"},
        params=params,
        content=json.dumps(data),
        timeout=30,
    )
    r.raise_for_status()


# ── Embedding ─────────────────────────────────────────────────────────────────
def embed_texts(client: openai.OpenAI, texts: list[str]) -> list[list[float]]:
    """Embed a batch of texts, retrying on rate-limit."""
    while True:
        try:
            resp = client.embeddings.create(
                model=EMBED_MODEL,
                input=texts,
                dimensions=EMBED_DIMS,
            )
            return [item.embedding for item in resp.data]
        except openai.RateLimitError:
            print(f"  Rate-limited — waiting {RETRY_DELAY}s…")
            time.sleep(RETRY_DELAY)


def make_input(item: dict) -> str:
    """Combine french + dialect into a single embedding string."""
    parts = []
    if item.get("french"):
        parts.append(item["french"])
    if item.get("dialect"):
        parts.append(item["dialect"])
    if item.get("example_french"):
        parts.append(item["example_french"])
    if item.get("example_dialect"):
        parts.append(item["example_dialect"])
    return " / ".join(parts)


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Embed lesson_items into Supabase pgvector")
    parser.add_argument("--dry-run", action="store_true", help="Print stats only, no writes")
    parser.add_argument("--force",   action="store_true", help="Re-embed rows that already have embeddings")
    args = parser.parse_args()

    if not SUPABASE_KEY:
        sys.exit("Error: SUPABASE_SERVICE_KEY is not set")
    if not OPENAI_KEY:
        sys.exit("Error: OPENAI_API_KEY is not set")

    client = openai.OpenAI(api_key=OPENAI_KEY)

    print("Fetching lesson_items from Supabase…")
    select = "id,french,dialect,example_french,example_dialect,embedding"
    items = supa_get("lesson_items", {"select": select})
    print(f"  Found {len(items)} rows total")

    if not args.force:
        items = [it for it in items if not it.get("embedding")]
        print(f"  {len(items)} rows missing embeddings (use --force to re-embed all)")

    if not items:
        print("Nothing to embed. Done.")
        return

    if args.dry_run:
        print(f"Dry-run: would embed {len(items)} rows using {EMBED_MODEL} dim={EMBED_DIMS}")
        return

    embedded = 0
    skipped  = 0

    for i in range(0, len(items), BATCH_SIZE):
        batch = items[i : i + BATCH_SIZE]
        texts = [make_input(it) for it in batch]

        # Skip items with no usable text
        valid_indices = [j for j, t in enumerate(texts) if t.strip()]
        if not valid_indices:
            skipped += len(batch)
            continue

        valid_batch = [batch[j]  for j in valid_indices]
        valid_texts = [texts[j]  for j in valid_indices]

        print(f"  Embedding rows {i+1}–{i+len(batch)} ({len(valid_batch)} valid)…")
        vectors = embed_texts(client, valid_texts)

        for item, vector in zip(valid_batch, vectors):
            supa_patch("lesson_items", {"id": item["id"]}, {"embedding": vector})

        embedded += len(valid_batch)
        skipped  += len(batch) - len(valid_batch)

    print(f"\nDone. Embedded: {embedded}  Skipped (no text): {skipped}")


if __name__ == "__main__":
    main()
