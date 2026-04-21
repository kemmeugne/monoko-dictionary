"""
prefill_html_from_parallel_sentences.py
────────────────────────────────────────
Fetches verified French-Lingala pairs from Supabase parallel_sentences,
then cross-references them against Group B HTML audio collection files
(those where phrase_lang is empty). Where a match is found, pre-fills
the Lingala field so the professor only needs to record audio.

Matching:
  - Exact match (case/punctuation-normalised)
  - Fuzzy match via difflib SequenceMatcher (threshold: 0.82)

Usage:
  python3 prefill_html_from_parallel_sentences.py [--dry-run]
"""

import json
import os
import re
import sys
import urllib.request
from difflib import SequenceMatcher
from pathlib import Path

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://haioiccujncsehadipzb.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
HTML_DIR = Path(__file__).resolve().parent / "audio_collection_html"
FUZZY_THRESHOLD = 0.82

# Group B files — new content where Lingala is empty
GROUP_B_FILES = [
    "Monoko_Audio_Lingala_2.1_famille_supplement.html",
    "Monoko_Audio_Lingala_2.3_manger_supplement.html",
    "Monoko_Audio_Lingala_3.1_deplacements_supplement.html",
    "Monoko_Audio_Lingala_3.4_conjugaison_futur_supplement.html",
    "Monoko_Audio_Lingala_4.1_marche_supplement.html",
    "Monoko_Audio_Lingala_4.3_proverbes_et_expressions_idiomatiques.html",
    "Monoko_Audio_Lingala_5.2_debats_supplement.html",
    "Monoko_Audio_Lingala_6.4_langue_monde_supplement.html",
    "Monoko_Audio_Lingala_NOUVEAU_religion.html",
    "Monoko_Audio_Lingala_NOUVEAU_technologie.html",
]


def normalize(text: str) -> str:
    """Lowercase, strip punctuation for comparison."""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s]", "", text)
    text = re.sub(r"\s+", " ", text)
    return text


def fuzzy_score(a: str, b: str) -> float:
    return SequenceMatcher(None, normalize(a), normalize(b)).ratio()


def fetch_parallel_sentences():
    """Fetch all verified Lingala parallel sentences from Supabase."""
    print("Fetching verified parallel_sentences from Supabase…")
    all_rows = []
    limit = 1000
    offset = 0
    while True:
        url = (
            f"{SUPABASE_URL}/rest/v1/parallel_sentences"
            f"?language_id=eq.1"
            f"&quality=eq.verified"
            f"&french_text=not.is.null"
            f"&lingala_text=not.is.null"
            f"&select=french_text,lingala_text,source"
            f"&limit={limit}&offset={offset}"
        )
        req = urllib.request.Request(
            url,
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
            },
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            rows = json.loads(resp.read().decode("utf-8"))
        all_rows.extend(rows)
        if len(rows) < limit:
            break
        offset += limit
    print(f"  Fetched {len(all_rows)} verified pairs")
    return all_rows


def parse_entries(html: str):
    """Extract the ENTRIES array from the HTML source."""
    m = re.search(r"const ENTRIES = (\[.*?\]);", html, re.DOTALL)
    if not m:
        return None
    return json.loads(m.group(1))


def serialize_entries(entries) -> str:
    """Serialize ENTRIES back to compact-ish JSON for insertion into HTML."""
    lines = ["const ENTRIES = ["]
    for i, entry in enumerate(entries):
        comma = "," if i < len(entries) - 1 else ""
        lines.append("  " + json.dumps(entry, ensure_ascii=False) + comma)
    lines.append("];")
    return "\n".join(lines)


def replace_entries_in_html(html: str, new_entries) -> str:
    """Replace the ENTRIES block in the HTML with updated entries."""
    new_block = serialize_entries(new_entries)
    return re.sub(
        r"const ENTRIES = \[.*?\];",
        new_block,
        html,
        flags=re.DOTALL,
    )


def find_match(french: str, corpus):
    """Find the best matching parallel sentence for a French phrase."""
    norm_fr = normalize(french)

    # 1. Exact match
    for row in corpus:
        if normalize(row["french_text"]) == norm_fr:
            return {"row": row, "match_type": "exact", "score": 1.0}

    # 2. Fuzzy match
    best_score = 0.0
    best_row = None
    for row in corpus:
        score = fuzzy_score(french, row["french_text"])
        if score > best_score:
            best_score = score
            best_row = row

    if best_score >= FUZZY_THRESHOLD and best_row:
        return {"row": best_row, "match_type": "fuzzy", "score": round(best_score, 3)}

    return None


def main():
    dry_run = "--dry-run" in sys.argv

    if not SUPABASE_KEY:
        print("ERROR: SUPABASE_SERVICE_KEY not set", file=sys.stderr)
        sys.exit(1)

    corpus = fetch_parallel_sentences()

    total_filled = 0
    total_empty = 0
    report = []

    for filename in GROUP_B_FILES:
        path = HTML_DIR / filename
        if not path.exists():
            print(f"  SKIP (not found): {filename}")
            continue

        html = path.read_text(encoding="utf-8")
        entries = parse_entries(html)
        if entries is None:
            print(f"  SKIP (no ENTRIES): {filename}")
            continue

        file_filled = 0
        file_empty = 0
        file_matches = []

        for entry in entries:
            if entry.get("phrase_lang", "").strip():
                continue  # already has Lingala

            file_empty += 1
            total_empty += 1
            french = entry.get("phrase_fr", "").strip()
            if not french:
                continue

            match = find_match(french, corpus)
            if match:
                lingala = match["row"]["lingala_text"].strip()
                entry["phrase_lang"] = lingala
                entry["prefilled"] = True
                file_filled += 1
                total_filled += 1
                file_matches.append({
                    "french": french,
                    "lingala": lingala,
                    "match_type": match["match_type"],
                    "score": match["score"],
                    "matched_fr": match["row"]["french_text"],
                })

        report.append({
            "file": filename,
            "empty_items": file_empty,
            "filled": file_filled,
            "matches": file_matches,
        })

        if not dry_run and file_filled > 0:
            new_html = replace_entries_in_html(html, entries)
            path.write_text(new_html, encoding="utf-8")

        status = "DRY RUN" if dry_run else "UPDATED"
        print(f"\n[{status}] {filename}")
        print(f"  Empty items: {file_empty}  |  Pre-filled: {file_filled}")
        for m in file_matches:
            tag = "EXACT" if m["match_type"] == "exact" else f"FUZZY({m['score']})"
            print(f"  [{tag}] \"{m['french'][:60]}\"")
            print(f"         → \"{m['lingala'][:60]}\"")
            if m["match_type"] == "fuzzy":
                print(f"         matched: \"{m['matched_fr'][:60]}\"")

    print("\n" + "=" * 60)
    print(f"TOTAL  Empty: {total_empty}  |  Pre-filled: {total_filled}  |  Still empty: {total_empty - total_filled}")
    if dry_run:
        print("DRY RUN — no files were modified. Remove --dry-run to apply.")


if __name__ == "__main__":
    main()
