#!/usr/bin/env python3
"""
Monɔkɔ Course Uploader
======================
Parses course Excel files and uploads them directly to Supabase.

SETUP:
  pip3 install pandas openpyxl supabase

USAGE:
  1. Put your 4 course Excel files in an 'input/' folder next to this script
     The files should be named like:
       - Lingala_Cours_1_Construction_phrasique.xlsx
       - Lingala_Cours_2_Grammaire-Conjugaison.xlsx
       - Lingala_Cours_3_Phrases_utiles.xlsx
       - Lingala_Cours_4_Dictionnaire_mots_par_the_me.xlsx

  2. Update LANGUAGE_NAME below

  3. Run:  python3 upload_courses_from_excel.py
"""

import pandas as pd
import os
import sys

from supabase import create_client

# ══════════════════════════════════════════
# CONFIGURATION — Update these values
# ══════════════════════════════════════════
SUPABASE_URL = "https://haioiccujncsehadipzb.supabase.co"
SERVICE_ROLE_KEY = "REDACTED_SERVICE_KEY"
LANGUAGE_NAME = "Yoruba"  # <-- Change this for each language
INPUT_DIR = "input"  # Folder containing the Excel files
# ══════════════════════════════════════════


def parse_cours_1(filepath):
    """Construction phrasique — sentence types (affirmatif, négatif, etc.)"""
    df = pd.read_excel(filepath, header=None)
    course = {
        "title": "Construction phrasique",
        "description": "Apprenez à construire des phrases affirmatives, négatives, interrogatives et passives",
        "order": 1,
        "icon": "🏗️",
        "lessons": []
    }

    # Auto-detect phrase columns: find columns with "Phrase" or "français" in header row
    # and their adjacent translation columns
    num_cols = len(df.columns)
    # Find header row (row with "Type de phrase" or similar)
    header_row = None
    for i in range(min(5, len(df))):
        for c in range(num_cols):
            val = df.iloc[i, c]
            if pd.notna(val) and 'type de phrase' in str(val).lower():
                header_row = i
                break
        if header_row is not None:
            break
    if header_row is None:
        header_row = 1  # fallback

    # Find French phrase columns and their translation columns
    phrase_pairs = []  # list of (french_col, translation_col)
    for c in range(num_cols):
        val = df.iloc[header_row, c] if pd.notna(df.iloc[header_row, c]) else ""
        val_str = str(val).lower()
        if ('phrase' in val_str and 'français' in val_str) or ('phrase exemple' in val_str):
            # Next column should be the translation
            if c + 1 < num_cols:
                phrase_pairs.append((c, c + 1))

    # Fallback: if no pairs found, try cols 3-4, 5-6 then 4-5, 6-7
    if not phrase_pairs:
        if num_cols >= 7:
            phrase_pairs = [(3, 4), (5, 6)]
        if num_cols >= 8:
            phrase_pairs = [(4, 5), (6, 7)]

    current_lesson = None
    for i in range(header_row + 1, len(df)):
        row = df.iloc[i]
        sentence_type = row[1] if len(row) > 1 and pd.notna(row[1]) else None

        if sentence_type and str(sentence_type).strip() and str(sentence_type).strip() != 'Type de phrase':
            if current_lesson and len(current_lesson["items"]) > 0:
                course["lessons"].append(current_lesson)
            current_lesson = {"title": str(sentence_type).strip(), "items": []}
            continue

        if current_lesson:
            for fr_col, tr_col in phrase_pairs:
                fr = row[fr_col] if len(row) > fr_col and pd.notna(row[fr_col]) else None
                tr = row[tr_col] if len(row) > tr_col and pd.notna(row[tr_col]) else None
                if fr and tr:
                    current_lesson["items"].append({
                        "french": str(fr).strip(),
                        "dialect": str(tr).strip(),
                    })

    if current_lesson and len(current_lesson["items"]) > 0:
        course["lessons"].append(current_lesson)

    return course


def parse_cours_2(filepath):
    """Grammaire & Conjugaison — pronouns, conjunctions, prepositions, conjugation"""
    df = pd.read_excel(filepath, header=None)
    course = {
        "title": "Grammaire & Conjugaison",
        "description": "Pronoms, possessifs, conjonctions, prépositions, comparatifs et conjugaison",
        "order": 2,
        "icon": "📐",
        "lessons": []
    }
    current_lesson = None
    current_theme = ""

    for i in range(2, len(df)):
        row = df.iloc[i]
        theme = str(row[1]).strip() if len(row) > 1 and pd.notna(row[1]) else ""
        word_fr = str(row[3]).strip() if len(row) > 3 and pd.notna(row[3]) else ""
        translation = str(row[4]).strip() if len(row) > 4 and pd.notna(row[4]) else ""
        phrase_fr = str(row[5]).strip() if len(row) > 5 and pd.notna(row[5]) else ""
        phrase_dialect = str(row[6]).strip() if len(row) > 6 and pd.notna(row[6]) else ""

        if theme and theme != current_theme:
            if current_lesson and len(current_lesson["items"]) > 0:
                course["lessons"].append(current_lesson)
            current_theme = theme
            current_lesson = {"title": theme, "items": []}

        if current_lesson:
            if word_fr and translation:
                item = {"french": word_fr, "dialect": translation}
                if phrase_fr:
                    item["example_french"] = phrase_fr
                if phrase_dialect:
                    item["example_dialect"] = phrase_dialect
                current_lesson["items"].append(item)
            elif phrase_fr and phrase_dialect and not word_fr:
                current_lesson["items"].append({
                    "french": phrase_fr,
                    "dialect": phrase_dialect,
                })

    if current_lesson and len(current_lesson["items"]) > 0:
        course["lessons"].append(current_lesson)

    # Merge tiny lessons (< 2 items) into previous
    merged = []
    for l in course["lessons"]:
        if len(l["items"]) < 2 and merged:
            merged[-1]["items"].extend(l["items"])
        else:
            merged.append(l)
    course["lessons"] = merged

    return course


def parse_cours_3(filepath):
    """Phrases utiles — practical phrases organized by situation"""
    # Try to find the right sheet
    xl = pd.ExcelFile(filepath)
    sheet = None
    for s in xl.sheet_names:
        df_test = pd.read_excel(filepath, sheet_name=s, header=None)
        if len(df_test) > 5:
            sheet = s
            break
    if not sheet:
        print(f"  WARNING: No data found in {filepath}")
        return {"title": "Phrases utiles", "description": "", "order": 3, "icon": "💬", "lessons": []}

    df = pd.read_excel(filepath, sheet_name=sheet, header=None)
    course = {
        "title": "Phrases utiles",
        "description": "Expressions pratiques pour la vie quotidienne : se présenter, demander son chemin, faire des achats...",
        "order": 3,
        "icon": "💬",
        "lessons": []
    }
    current_lesson = None
    current_key = ""

    for i in range(2, len(df)):
        row = df.iloc[i]
        theme = str(row[1]).strip() if len(row) > 1 and pd.notna(row[1]) else ""
        sub = str(row[2]).strip() if len(row) > 2 and pd.notna(row[2]) else ""
        phrase_fr = str(row[4]).strip() if len(row) > 4 and pd.notna(row[4]) else ""
        phrase_dialect = str(row[5]).strip() if len(row) > 5 and pd.notna(row[5]) else ""
        example_fr = str(row[6]).strip() if len(row) > 6 and pd.notna(row[6]) else ""
        example_dialect = str(row[7]).strip() if len(row) > 7 and pd.notna(row[7]) else ""

        lesson_key = sub if sub else theme
        if lesson_key and lesson_key != current_key:
            if current_lesson and len(current_lesson["items"]) > 0:
                course["lessons"].append(current_lesson)
            current_key = lesson_key
            current_lesson = {"title": lesson_key, "items": []}

        if current_lesson and phrase_fr and phrase_dialect:
            item = {"french": phrase_fr, "dialect": phrase_dialect}
            if example_fr:
                item["example_french"] = example_fr
            if example_dialect:
                item["example_dialect"] = example_dialect
            current_lesson["items"].append(item)

    if current_lesson and len(current_lesson["items"]) > 0:
        course["lessons"].append(current_lesson)

    return course


def parse_cours_4(filepath):
    """Dictionnaire par thème — vocabulary organized by topic"""
    df = pd.read_excel(filepath, header=None)
    course = {
        "title": "Vocabulaire par thème",
        "description": "Mots organisés par thème : anatomie, nature, animaux, métiers, couleurs...",
        "order": 4,
        "icon": "🏷️",
        "lessons": []
    }
    current_lesson = None

    for i in range(2, len(df)):
        row = df.iloc[i]
        theme = str(row[1]).strip() if len(row) > 1 and pd.notna(row[1]) else ""
        word_fr = str(row[2]).strip() if len(row) > 2 and pd.notna(row[2]) else ""
        word_dialect = str(row[3]).strip() if len(row) > 3 and pd.notna(row[3]) else ""
        phrase_fr = str(row[4]).strip() if len(row) > 4 and pd.notna(row[4]) else ""
        phrase_dialect = str(row[5]).strip() if len(row) > 5 and pd.notna(row[5]) else ""

        if theme and ('thème' in theme.lower() or 'theme' in theme.lower()):
            if current_lesson and len(current_lesson["items"]) > 0:
                course["lessons"].append(current_lesson)
            clean = theme.replace("Thème : ", "").replace("Thème :", "").replace("Theme : ", "").replace("Theme:", "").strip()
            current_lesson = {"title": clean, "items": []}
            continue

        if current_lesson and word_fr and word_dialect:
            item = {"french": word_fr, "dialect": word_dialect}
            if phrase_fr:
                item["example_french"] = phrase_fr
            if phrase_dialect:
                item["example_dialect"] = phrase_dialect
            current_lesson["items"].append(item)

    if current_lesson and len(current_lesson["items"]) > 0:
        course["lessons"].append(current_lesson)

    return course


def find_course_files(input_dir):
    """Find and match course files by their number (1-4)"""
    files = sorted([f for f in os.listdir(input_dir) if f.endswith('.xlsx')])
    matched = {1: None, 2: None, 3: None, 4: None}

    for f in files:
        fl = f.lower()
        if 'cours_1' in fl or 'cours1' in fl or 'construction' in fl:
            matched[1] = os.path.join(input_dir, f)
        elif 'cours_2' in fl or 'cours2' in fl or 'grammaire' in fl or 'conjugaison' in fl:
            matched[2] = os.path.join(input_dir, f)
        elif 'cours_3' in fl or 'cours3' in fl or 'phrases' in fl:
            matched[3] = os.path.join(input_dir, f)
        elif 'cours_4' in fl or 'cours4' in fl or 'dictionnaire' in fl or 'th' in fl:
            matched[4] = os.path.join(input_dir, f)

    return matched


def upload_course(supabase, language_id, course_data):
    """Upload a single course with all its lessons and items"""
    # Insert course
    course = supabase.table("courses").insert({
        "language_id": language_id,
        "title": course_data["title"],
        "description": course_data["description"],
        "course_order": course_data["order"],
        "icon": course_data.get("icon", "📚"),
    }).execute()
    course_id = course.data[0]["id"]

    total_lessons = 0
    total_items = 0

    for lesson_idx, lesson_data in enumerate(course_data["lessons"]):
        # Insert lesson
        lesson = supabase.table("lessons").insert({
            "course_id": course_id,
            "title": lesson_data["title"],
            "lesson_order": lesson_idx + 1,
        }).execute()
        lesson_id = lesson.data[0]["id"]
        total_lessons += 1

        # Insert items in batches of 50
        items = []
        for item_idx, item in enumerate(lesson_data["items"]):
            row = {
                "lesson_id": lesson_id,
                "french": item["french"],
                "dialect": item["dialect"],
                "item_order": item_idx + 1,
            }
            if "example_french" in item:
                row["example_french"] = item["example_french"]
            if "example_dialect" in item:
                row["example_dialect"] = item["example_dialect"]
            items.append(row)

        for i in range(0, len(items), 50):
            batch = items[i:i + 50]
            supabase.table("lesson_items").insert(batch).execute()

        total_items += len(items)
        print(f"    ✓ {lesson_data['title']}: {len(items)} items")

    return total_lessons, total_items


def main():
    if SERVICE_ROLE_KEY == "YOUR_SERVICE_ROLE_KEY_HERE":
        print("ERROR: Please set your SERVICE_ROLE_KEY in the script!")
        sys.exit(1)

    # Find course files
    matched = find_course_files(INPUT_DIR)
    found = {k: v for k, v in matched.items() if v}

    if not found:
        print(f"ERROR: No course files found in '{INPUT_DIR}/' folder!")
        print("Place your Excel files there and try again.")
        sys.exit(1)

    print(f"Found {len(found)} course file(s):")
    for num, path in sorted(found.items()):
        print(f"  Cours {num}: {os.path.basename(path)}")

    # Parse files
    parsers = {1: parse_cours_1, 2: parse_cours_2, 3: parse_cours_3, 4: parse_cours_4}
    courses = []
    for num, path in sorted(found.items()):
        print(f"\nParsing Cours {num}...")
        course = parsers[num](path)
        total_items = sum(len(l["items"]) for l in course["lessons"])
        print(f"  {len(course['lessons'])} lessons, {total_items} items")
        if total_items > 0:
            courses.append(course)

    if not courses:
        print("\nERROR: No data parsed from files!")
        sys.exit(1)

    # Connect and upload
    print(f"\nConnecting to Supabase...")
    supabase = create_client(SUPABASE_URL, SERVICE_ROLE_KEY)

    # Find language
    lang = supabase.table("languages").select("id").eq("name", LANGUAGE_NAME).execute()
    if not lang.data:
        print(f"ERROR: Language '{LANGUAGE_NAME}' not found! Upload dictionary data first.")
        sys.exit(1)
    language_id = lang.data[0]["id"]
    print(f"Language: {LANGUAGE_NAME} (id={language_id})")

    # Check for existing courses
    existing = supabase.table("courses").select("id").eq("language_id", language_id).execute()
    if existing.data:
        print(f"\nWARNING: {len(existing.data)} course(s) already exist for {LANGUAGE_NAME}.")
        response = input("Delete existing and re-upload? (y/n): ").strip().lower()
        if response == 'y':
            for c in existing.data:
                supabase.table("courses").delete().eq("id", c["id"]).execute()
            print("Existing courses deleted.")
        else:
            print("Aborting.")
            sys.exit(0)

    # Upload
    grand_total_lessons = 0
    grand_total_items = 0

    for course in courses:
        print(f"\nUploading: {course['title']}...")
        lessons, items = upload_course(supabase, language_id, course)
        grand_total_lessons += lessons
        grand_total_items += items

    print(f"""
=======================================================
  COURSES UPLOAD COMPLETE!
=======================================================
  Language:   {LANGUAGE_NAME}
  Courses:    {len(courses)}
  Lessons:    {grand_total_lessons}
  Items:      {grand_total_items}
=======================================================
  Open your app to see the courses!
""")


if __name__ == "__main__":
    main()
