#!/usr/bin/env python3
"""
translate_examples_to_parallel_sentences.py — Translate approved Lingala example sentences
to French and insert them into parallel_sentences as verified corpus entries.

For each approved correction with a non-null, non-bad example_sentence:
  1. Filter out LLM refusal messages (corpus-not-found, Je ne peux pas traduire, etc.)
  2. Call GPT to translate the Lingala example to French
  3. Insert the (french, lingala) pair into parallel_sentences
     with source='correction', quality='verified', language_id=1

Usage:
  OPENAI_API_KEY=sk-... python3 translate_examples_to_parallel_sentences.py \\
      --supabase-key eyJ...
  OPENAI_API_KEY=sk-... python3 translate_examples_to_parallel_sentences.py \\
      --supabase-key eyJ... --dry-run
  OPENAI_API_KEY=sk-... python3 translate_examples_to_parallel_sentences.py \\
      --supabase-key eyJ... --output artifacts/examples_log.json
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Dict, List, Optional

# ── constants ─────────────────────────────────────────────────────────────────

ROOT = Path(__file__).resolve().parent

SUPABASE_URL  = "https://haioiccujncsehadipzb.supabase.co"
LANGUAGE_ID   = 1  # Lingala

OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"
TRANSLATE_MODEL = "gpt-5-mini"

# Patterns that indicate a bad (LLM refusal) example sentence — skip these
BAD_PATTERNS = [
    "corpus",
    "je ne peux pas",
    "mot clé",
    "n'est pas présent",
    "désolé",
    "cannot translate",
    "not in the corpus",
]

# ── helpers ───────────────────────────────────────────────────────────────────

def _post(url: str, payload: dict, headers: Optional[Dict] = None, timeout: int = 60) -> dict:
    body = json.dumps(payload, ensure_ascii=False).encode()
    req  = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json", **(headers or {})},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def _get(url: str, headers: Optional[Dict] = None, timeout: int = 30) -> list:
    req = urllib.request.Request(url, headers=headers or {}, method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def openai(model: str, messages: list, temperature: float = 0.3, retries: int = 3) -> str:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        sys.exit("OPENAI_API_KEY is not set")
    payload: dict = {
        "model": model,
        "messages": messages,
        "max_completion_tokens": 1024,
    }
    if model.startswith("gpt-4"):
        payload["temperature"] = temperature
    else:
        payload["reasoning_effort"] = "low"

    for attempt in range(1, retries + 1):
        try:
            data = _post(OPENAI_CHAT_URL, payload, headers={"Authorization": f"Bearer {api_key}"})
            return data["choices"][0]["message"]["content"].strip()
        except Exception as e:
            if attempt == retries:
                raise
            wait = attempt * 5
            print(f"    [retry {attempt}/{retries}] OpenAI error: {e} — retrying in {wait}s")
            time.sleep(wait)
    raise RuntimeError("openai() exhausted retries")


# ── filtering ─────────────────────────────────────────────────────────────────

def is_bad_example(text: str) -> bool:
    """Return True if the example sentence looks like an LLM refusal message."""
    lower = text.lower()
    return any(pat in lower for pat in BAD_PATTERNS)


# ── Supabase helpers ──────────────────────────────────────────────────────────

def fetch_approved_corrections(supabase_url: str, supabase_key: str) -> list:
    """Fetch all approved corrections that have a non-null example_sentence."""
    url = (
        f"{supabase_url}/rest/v1/corrections"
        "?status=eq.approved"
        "&example_sentence=not.is.null"
        "&select=id,correct_french,correct_lingala,example_sentence"
        "&order=id.asc"
    )
    headers = {
        "apikey":        supabase_key,
        "Authorization": f"Bearer {supabase_key}",
    }
    try:
        return _get(url, headers=headers)
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        sys.exit(f"Supabase fetch failed ({e.code}): {body[:300]}")


def insert_parallel_sentence(
    supabase_url: str,
    supabase_key: str,
    french_text: str,
    lingala_text: str,
    source_correction_id: int,
) -> bool:
    """Insert a (french, lingala) pair into parallel_sentences."""
    url = f"{supabase_url}/rest/v1/parallel_sentences"
    payload = {
        "language_id":  LANGUAGE_ID,
        "french_text":  french_text,
        "lingala_text": lingala_text,
        "source":       "correction",
        "quality":      "verified",
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode(),
        headers={
            "Content-Type":  "application/json",
            "apikey":        supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Prefer":        "return=minimal",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status in (200, 201)
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        # 409 = duplicate (already inserted) — treat as success
        if e.code == 409:
            return True
        print(f"    [warn] Supabase insert failed ({e.code}): {body[:200]}")
        return False


# ── translation ───────────────────────────────────────────────────────────────

import re

TRANSLATE_SYSTEM = """Tu es un traducteur expert en langue Lingala (variante de Kinshasa).
On te donne une phrase en Lingala. Traduis-la en français naturel et correct.
Réponds UNIQUEMENT avec la traduction française — aucune explication, aucune ponctuation supplémentaire."""

FRENCH_MARKERS = ["bonjour", "comment", "merci", "oui", "non", "je ", "tu ", "il ", "nous", "vous",
                   "est-ce", "s'il", "pourquoi", "demain", "aujourd", "monsieur", "madame"]


def looks_french(text: str) -> bool:
    lower = text.lower()
    return sum(1 for m in FRENCH_MARKERS if m in lower) >= 2


def parse_example(text: str) -> Optional[tuple]:
    """
    Parse an example sentence written by the professor.

    Returns (french, lingala) where french may be None if translation must be generated.
    Returns None if the example has no usable Lingala content.

    Formats handled:
      1. "French sentence\\n(Lingala translation)"  → french=extracted, lingala=extracted
      2. "Pure Lingala"                              → french=None, lingala=text
      3. "French only (no Lingala detectable)"       → None (skip)
    """
    text = text.strip()

    # Format 1: parenthesised Lingala — "French\n(Lingala)"
    paren_match = re.search(r'\(([^)]{5,})\)', text, re.DOTALL)
    if paren_match:
        lingala = paren_match.group(1).strip()
        # Everything before the opening paren is the French
        french_raw = text[:paren_match.start()].strip().rstrip('-–').strip()
        french = french_raw if french_raw else None
        return (french, lingala)

    # Format 2: no parens — if it looks French, we can't use it
    if looks_french(text):
        return None

    # Format 3: pure Lingala
    return (None, text)


def translate_lingala_to_french(lingala_text: str) -> str:
    return openai(
        TRANSLATE_MODEL,
        [
            {"role": "system", "content": TRANSLATE_SYSTEM},
            {"role": "user",   "content": lingala_text},
        ],
        temperature=0.2,
    )


# ── main ──────────────────────────────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(
        description="Translate approved Lingala examples to French and add to parallel_sentences"
    )
    parser.add_argument("--supabase-url", default=SUPABASE_URL)
    parser.add_argument("--supabase-key", default=None,
                        help="Supabase service key (required for inserts)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Translate but do not insert into Supabase")
    parser.add_argument("--from-log", action="store_true",
                        help="Skip GPT — read translations from existing log and insert directly")
    parser.add_argument("--delay", type=float, default=0.5,
                        help="Seconds to wait between OpenAI calls (default 0.5)")
    parser.add_argument("--output", type=Path,
                        default=ROOT / "artifacts" / "examples_translation_log.json")
    args = parser.parse_args()

    if not args.from_log and not os.environ.get("OPENAI_API_KEY"):
        sys.exit("OPENAI_API_KEY is not set")

    # Fall back to SUPABASE_SERVICE_KEY env var if --supabase-key not provided
    supabase_key = args.supabase_key or os.environ.get("SUPABASE_SERVICE_KEY")
    if not args.dry_run and not supabase_key:
        sys.exit("Provide --supabase-key or set SUPABASE_SERVICE_KEY env var")

    # ── --from-log mode: insert directly from existing log, no GPT ──────────────
    if args.from_log:
        if not args.output.exists():
            sys.exit(f"Log file not found: {args.output}")
        with open(args.output) as f:
            log = json.load(f)
        candidates = [e for e in log if e.get("status") == "dry_run" and e.get("french_translation") and e.get("lingala_extracted")]
        print(f"Found {len(candidates)} dry-run entries to insert")
        inserted = failed = 0
        for e in candidates:
            ok = insert_parallel_sentence(
                args.supabase_url, supabase_key,
                french_text=e["french_translation"],
                lingala_text=e["lingala_extracted"],
                source_correction_id=e["correction_id"],
            )
            e["status"] = "inserted" if ok else "insert_failed"
            e["inserted"] = ok
            if ok:
                inserted += 1
                print(f"  ✓ #{e['correction_id']}: {e['lingala_extracted'][:50]}")
            else:
                failed += 1
                print(f"  ✗ #{e['correction_id']}: insert failed")
            with open(args.output, "w") as f:
                json.dump(log, f, ensure_ascii=False, indent=2)
        print(f"\nDone — {inserted} inserted, {failed} failed")
        return 0 if failed == 0 else 1

    # Load existing log (resume-safe)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    log: List[dict] = []
    processed_ids: set = set()
    if args.output.exists():
        with open(args.output) as f:
            log = json.load(f)
        processed_ids = {entry["correction_id"] for entry in log if entry.get("status") != "dry_run"}
        print(f"Resuming — {len(processed_ids)} corrections already processed")

    # Fetch corrections
    print(f"Fetching approved corrections from Supabase…")
    corrections = fetch_approved_corrections(args.supabase_url, supabase_key or "")
    print(f"Found {len(corrections)} corrections with example_sentence")

    # Filter
    to_process = []
    skipped_bad = 0
    skipped_done = 0
    for row in corrections:
        cid = row["id"]
        example = (row.get("example_sentence") or "").strip()
        if cid in processed_ids:
            skipped_done += 1
            continue
        if not example or is_bad_example(example):
            skipped_bad += 1
            log.append({
                "correction_id": cid,
                "example_sentence": example,
                "status": "skipped_bad",
                "french_translation": None,
                "inserted": False,
            })
            processed_ids.add(cid)
            continue
        to_process.append(row)

    print(f"  Already processed: {skipped_done}")
    print(f"  Skipped (bad/refusal): {skipped_bad}")
    print(f"  To translate: {len(to_process)}")

    if not to_process:
        print("Nothing to do.")
        with open(args.output, "w") as f:
            json.dump(log, f, ensure_ascii=False, indent=2)
        return 0

    # Process
    inserted = 0
    failed   = 0

    for i, row in enumerate(to_process, 1):
        cid     = row["id"]
        example = row["example_sentence"].strip()
        print(f"[{i}/{len(to_process)}] correction #{cid}: {example[:60]}…")

        # Parse the example — extract French + Lingala if both present
        parsed = parse_example(example)
        if parsed is None:
            print(f"    [skip] No Lingala content detected (French-only example)")
            log.append({
                "correction_id": cid,
                "example_sentence": example,
                "status": "skipped_no_lingala",
                "french_translation": None,
                "inserted": False,
            })
            processed_ids.add(cid)
            with open(args.output, "w") as f:
                json.dump(log, f, ensure_ascii=False, indent=2)
            continue

        french_existing, lingala = parsed

        if french_existing:
            # French already provided by professor — use it directly, no GPT call
            french = french_existing
            print(f"    LN: {lingala[:70]}")
            print(f"    FR: {french[:70]} [from professor]")
        else:
            # Only Lingala — translate via GPT
            try:
                french = translate_lingala_to_french(lingala)
                print(f"    LN: {lingala[:70]}")
                print(f"    FR: {french[:70]} [GPT]")
                if not french:
                    raise ValueError("GPT returned empty translation")
            except Exception as e:
                print(f"    [error] Translation failed: {e}")
                log.append({
                    "correction_id": cid,
                    "example_sentence": example,
                    "lingala_extracted": lingala,
                    "status": "translation_error",
                    "french_translation": None,
                    "inserted": False,
                    "error": str(e),
                })
                failed += 1
                processed_ids.add(cid)
                with open(args.output, "w") as f:
                    json.dump(log, f, ensure_ascii=False, indent=2)
                time.sleep(args.delay)
                continue

        # Insert
        ok = False
        if args.dry_run:
            print(f"    [dry-run] would insert: FR={french[:60]} | LN={lingala[:60]}")
            ok = True
        else:
            ok = insert_parallel_sentence(
                args.supabase_url,
                supabase_key,
                french_text=french,
                lingala_text=lingala,
                source_correction_id=cid,
            )
            if ok:
                inserted += 1
            else:
                failed += 1

        log.append({
            "correction_id": cid,
            "example_sentence": example,
            "lingala_extracted": lingala,
            "french_source": "professor" if french_existing else "gpt",
            "status": "dry_run" if args.dry_run else ("inserted" if ok else "insert_failed"),
            "french_translation": french,
            "inserted": ok and not args.dry_run,
        })
        processed_ids.add(cid)

        # Save after each row (resume-safe)
        with open(args.output, "w") as f:
            json.dump(log, f, ensure_ascii=False, indent=2)

        time.sleep(args.delay)

    # Summary
    print()
    print("─" * 50)
    if args.dry_run:
        print(f"DRY RUN — {len(to_process)} translations generated, nothing inserted")
    else:
        print(f"Done — {inserted} inserted, {failed} failed")
    print(f"Log saved to {args.output}")

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
