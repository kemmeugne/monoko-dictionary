#!/usr/bin/env python3
"""
Loads the first professor's conjugation paradigm into `conjugation_forms`.

    SUPABASE_SERVICE_KEY=... python3 populate_conjugation_forms.py [--dry-run]

WHY THIS EXISTS AS A SCRIPT
The source is a MATRIX in the original workbook -- rows 259-264 are the six
persons, columns B-F the five tenses -- and reading it row-wise is what lost it
the first time round. This reads it as the grid it is, so a re-run reproduces
exactly the same 30 forms.

THE FRENCH IS GENERATED, NOT COPIED
The workbook's French column carries typos ("Tu aimess", "Ils aimes", "Nous
avons aimés") and mislabels the passé progressif as a present ("Il/Elle est en
train d'aimer"). There is exactly one verb here and its French conjugation is
regular, so the glosses are generated from (tense, person) and cannot drift.
The LINGALA is copied verbatim -- it is the professor's, and not mine to fix.

AUDIO
Clips are addressed by the workbook cell they were cut from: 2.C259.mp3 is
column C, row 259 = "Na lingaki". Already on R2. The présent column (B) was
never recorded, so those six forms carry no audio.
"""
import argparse, json, os, sys, urllib.request

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://haioiccujncsehadipzb.supabase.co").rstrip("/")
LANGUAGE_ID = 1
XLSX = ("/Users/anthonykemmeugne/Documents/04_Language_Projects/raw_data/Lingala/"
        "courses/Partie Cours Lingala/Cours 2 Grammaire-Conjugaison_252 (1).xlsx")
R2 = "https://pub-78d23bf07fce46b3adc19df91148ffb8.r2.dev/Lingala/lesson_items/course_2"

# (workbook row, person key, display order)
PERSONS = [(259, "je", 1), (260, "tu", 2), (261, "il", 3),
           (262, "nous", 4), (263, "vous", 5), (264, "ils", 6)]
# (0-based column index, key, label, audio column letter, display order)
TENSES = [(1, "present",      "Présent / passé composé", None, 1),
          (2, "imparfait",    "Imparfait",               "C",  2),
          (3, "futur",        "Futur",                   "D",  3),
          (4, "present_prog", "Présent progressif",      "E",  4),
          (5, "passe_prog",   "Passé progressif",        "F",  5)]

FRENCH = {
 "present":      {"je":"J'aime / j'ai aimé","tu":"Tu aimes / tu as aimé","il":"Il/elle aime / il a aimé",
                  "nous":"Nous aimons / nous avons aimé","vous":"Vous aimez / vous avez aimé",
                  "ils":"Ils/elles aiment / ils ont aimé"},
 "imparfait":    {"je":"J'aimais","tu":"Tu aimais","il":"Il/elle aimait",
                  "nous":"Nous aimions","vous":"Vous aimiez","ils":"Ils/elles aimaient"},
 "futur":        {"je":"J'aimerai","tu":"Tu aimeras","il":"Il/elle aimera",
                  "nous":"Nous aimerons","vous":"Vous aimerez","ils":"Ils/elles aimeront"},
 "present_prog": {"je":"Je suis en train d'aimer","tu":"Tu es en train d'aimer","il":"Il/elle est en train d'aimer",
                  "nous":"Nous sommes en train d'aimer","vous":"Vous êtes en train d'aimer",
                  "ils":"Ils/elles sont en train d'aimer"},
 "passe_prog":   {"je":"J'étais en train d'aimer","tu":"Tu étais en train d'aimer","il":"Il/elle était en train d'aimer",
                  "nous":"Nous étions en train d'aimer","vous":"Vous étiez en train d'aimer",
                  "ils":"Ils/elles étaient en train d'aimer"},
}

# Every conjugation lesson shows this table at the top.
CONJUGATION_LESSONS = [358, 359, 393]


def key() -> str:
    k = os.environ.get("SUPABASE_SERVICE_KEY")
    if not k:
        sys.exit("SUPABASE_SERVICE_KEY not set")
    return k


def post(path: str, rows: list, prefer: str) -> None:
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{path}",
        data=json.dumps(rows).encode(),
        headers={"apikey": key(), "Authorization": f"Bearer {key()}",
                 "Content-Type": "application/json", "Prefer": prefer},
        method="POST")
    urllib.request.urlopen(req).read()


def build() -> list:
    import openpyxl
    ws = openpyxl.load_workbook(XLSX, data_only=True).worksheets[0]
    rows = list(ws.iter_rows(values_only=True))
    out = []
    for rownum, person, p_ord in PERSONS:
        r = rows[rownum - 1]
        for col, tense, label, audio_col, t_ord in TENSES:
            cell = r[col]
            if cell is None:
                continue
            # The first row of each column carries a parenthetical gloss:
            # "Na lingi (= j'aime / j'ai aimé)". The gloss is not part of the form.
            lingala = str(cell).split("(")[0].strip()
            if not lingala:
                continue
            out.append({
                "language_id": LANGUAGE_ID,
                "verb": "ko linga", "verb_fr": "aimer",
                "tense": tense, "tense_label": label, "tense_order": t_ord,
                "person": person, "person_order": p_ord,
                "french": FRENCH[tense][person], "lingala": lingala,
                "audio_url": f"{R2}/2.{audio_col}{rownum}.mp3" if audio_col else None,
                "source_cell": f"2.{chr(ord('A') + col)}{rownum}",
            })
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    forms = build()
    have_audio = sum(1 for f in forms if f["audio_url"])
    print(f"{len(forms)} forms · {have_audio} with audio · "
          f"{len({f['tense'] for f in forms})} tenses × {len({f['person'] for f in forms})} persons")
    for f in forms[:3]:
        print(f"   {f['french']:34} {f['lingala']:22} {f['source_cell']}")

    if args.dry_run:
        print("\n--dry-run: nothing written")
        return

    post("conjugation_forms", forms,
         "resolution=merge-duplicates,return=minimal")
    post("lesson_conjugation_tables",
         [{"lesson_id": lid, "language_id": LANGUAGE_ID, "verb": "ko linga", "sort_order": 0}
          for lid in CONJUGATION_LESSONS],
         "resolution=merge-duplicates,return=minimal")
    print(f"\nwritten. Table attached to lessons {CONJUGATION_LESSONS}.")


if __name__ == "__main__":
    main()
