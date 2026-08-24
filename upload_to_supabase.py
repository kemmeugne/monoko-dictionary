"""
=============================================================
  Monɔkɔ — Upload Dictionary to Supabase
=============================================================
  This script reads your Excel files and uploads the data
  to your Supabase database.

  Setup:
    pip3 install pandas openpyxl supabase

  Usage:
    python upload_to_supabase.py

  Place your Excel files in an "input" folder next to this script.
=============================================================
"""

import os
import sys
import pandas as pd
from supabase import create_client

# ── CONFIGURATION ──────────────────────────────────────────
# Your Supabase credentials
SUPABASE_URL = "https://haioiccujncsehadipzb.supabase.co"

# IMPORTANT: Export the SERVICE ROLE key as SUPABASE_SERVICE_KEY.
#     The service role key bypasses RLS so we can insert data.
#     Find it in: Supabase Dashboard → Settings → API → service_role
#     NEVER share or commit this key publicly.
SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

# Language name for this upload batch
LANGUAGE_NAME = "Yoruba"

# Excel parsing settings (same as normalize script)
MAX_SENSES = 4
DATA_START_ROW = 2
FRENCH_WORD_COL = 1
FIRST_SENSE_COL = 2
COLS_PER_SENSE = 3
# ───────────────────────────────────────────────────────────


def parse_excel(filepath):
    """Parse one Excel file into words, senses, examples."""
    df = pd.read_excel(filepath, header=None)
    entries = []

    for i in range(DATA_START_ROW, len(df)):
        row = df.iloc[i]
        french_word = row[FRENCH_WORD_COL]

        if pd.isna(french_word) or str(french_word).strip() == "":
            continue

        french_word = str(french_word).strip()
        letter = french_word[0].upper()

        senses = []
        sense_num = 0
        for s in range(MAX_SENSES):
            col_start = FIRST_SENSE_COL + (s * COLS_PER_SENSE)
            dialect_word = row[col_start] if col_start < len(row) else None
            sentence_d = row[col_start + 1] if col_start + 1 < len(row) else None
            sentence_f = row[col_start + 2] if col_start + 2 < len(row) else None

            if pd.notna(dialect_word) and str(dialect_word).strip() != "":
                sense_num += 1
                sense = {
                    "sense_number": sense_num,
                    "dialect_word": str(dialect_word).strip(),
                    "example": None,
                }
                if pd.notna(sentence_d) and pd.notna(sentence_f):
                    sense["example"] = {
                        "sentence_dialect": str(sentence_d).strip(),
                        "sentence_french": str(sentence_f).strip(),
                    }
                senses.append(sense)

        entries.append({
            "french_word": french_word,
            "letter": letter,
            "senses": senses,
        })

    return entries


def upload(entries, supabase, language_id):
    """Upload parsed entries to Supabase."""
    total_words = 0
    total_senses = 0
    total_examples = 0

    # Upload in batches for reliability
    for entry in entries:
        # Insert word
        word_result = supabase.table("words").insert({
            "language_id": language_id,
            "french_word": entry["french_word"],
            "letter": entry["letter"],
        }).execute()

        word_id = word_result.data[0]["id"]
        total_words += 1

        for sense in entry["senses"]:
            # Insert sense
            sense_result = supabase.table("senses").insert({
                "word_id": word_id,
                "sense_number": sense["sense_number"],
                "dialect_word": sense["dialect_word"],
            }).execute()

            sense_id = sense_result.data[0]["id"]
            total_senses += 1

            # Insert example if present
            if sense["example"]:
                supabase.table("examples").insert({
                    "sense_id": sense_id,
                    "sentence_dialect": sense["example"]["sentence_dialect"],
                    "sentence_french": sense["example"]["sentence_french"],
                }).execute()
                total_examples += 1

    return total_words, total_senses, total_examples


def main():
    # Validate config
    if not SERVICE_ROLE_KEY:
        print("=" * 55)
        print("  ERROR: Export SUPABASE_SERVICE_KEY before running this script.")
        print()
        print("  1. Go to Supabase Dashboard → Settings → API")
        print("  2. Copy the 'service_role' key (NOT the anon key)")
        print("  3. Paste it in this script where it says")
        print("     export SUPABASE_SERVICE_KEY='...'")
        print("=" * 55)
        sys.exit(1)

    # Connect to Supabase
    print("Connecting to Supabase...")
    supabase = create_client(SUPABASE_URL, SERVICE_ROLE_KEY)

    # Create or get language
    print(f"Setting up language: {LANGUAGE_NAME}")
    existing = supabase.table("languages").select("*").eq("name", LANGUAGE_NAME).execute()

    if existing.data:
        language_id = existing.data[0]["id"]
        print(f"  Found existing language (id={language_id})")
    else:
        result = supabase.table("languages").insert({
            "name": LANGUAGE_NAME,
            "code": LANGUAGE_NAME.lower()[:3],
            "status": "active",
        }).execute()
        language_id = result.data[0]["id"]
        print(f"  Created language (id={language_id})")

    # Find Excel files
    script_dir = os.path.dirname(os.path.abspath(__file__))
    input_dir = os.path.join(script_dir, "input")
    os.makedirs(input_dir, exist_ok=True)

    excel_files = sorted([
        f for f in os.listdir(input_dir)
        if f.endswith((".xlsx", ".xls")) and not f.startswith("~")
    ])

    if not excel_files:
        print(f"\nNo Excel files found in: {input_dir}")
        print("Place your .xlsx files there and run again.")
        sys.exit(1)

    print(f"\nFound {len(excel_files)} file(s):")
    for f in excel_files:
        print(f"  • {f}")

    # Parse and upload
    grand_words = 0
    grand_senses = 0
    grand_examples = 0

    for filename in excel_files:
        filepath = os.path.join(input_dir, filename)
        print(f"\nProcessing {filename}...")

        try:
            entries = parse_excel(filepath)
            print(f"  Parsed {len(entries)} words, uploading...")

            w, s, e = upload(entries, supabase, language_id)
            grand_words += w
            grand_senses += s
            grand_examples += e

            print(f"  ✓ Uploaded: {w} words, {s} senses, {e} examples")

        except Exception as ex:
            print(f"  ✗ ERROR: {ex}")

    print()
    print("=" * 55)
    print("  UPLOAD COMPLETE!")
    print("=" * 55)
    print(f"  Language:   {LANGUAGE_NAME}")
    print(f"  Words:      {grand_words}")
    print(f"  Senses:     {grand_senses}")
    print(f"  Examples:   {grand_examples}")
    print("=" * 55)
    print()
    print("  Your dictionary is now live in Supabase!")
    print("  Anyone using the app will see the data.")
    print()


if __name__ == "__main__":
    main()
