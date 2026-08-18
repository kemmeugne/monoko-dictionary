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

# Which lesson shows which tenses. A lesson displays what it teaches: the
# présent/passé lesson has no business showing the futur.
#
# L393 is futur PROCHE ("je vais parler") and gets nothing, because this
# paradigm has no futur proche column -- the first professor never wrote one.
# Showing it the futur simple would teach the wrong tense on that page, so it
# shows no table until someone writes the missing six forms.
CONJUGATION_LESSONS = {
    358: ["present", "imparfait", "present_prog", "passe_prog"],   # présent et passé
    359: ["futur"],                                                # futur simple
}


def key() -> str:
    k = os.environ.get("SUPABASE_SERVICE_KEY")
    if not k:
        sys.exit("SUPABASE_SERVICE_KEY not set")
    return k


def delete(path: str) -> None:
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{path}",
        headers={"apikey": key(), "Authorization": f"Bearer {key()}",
                 "Prefer": "return=minimal"},
        method="DELETE")
    urllib.request.urlopen(req).read()


def post(path: str, rows: list, prefer: str) -> None:
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{path}",
        data=json.dumps(rows).encode(),
        headers={"apikey": key(), "Authorization": f"Bearer {key()}",
                 "Content-Type": "application/json", "Prefer": prefer},
        method="POST")
    urllib.request.urlopen(req).read()


def get(path: str) -> list:
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{path}",
        headers={"apikey": key(), "Authorization": f"Bearer {key()}"})
    return json.load(urllib.request.urlopen(req))


def tokens(s: str) -> int:
    """Same rule the engine tokenises with: whitespace or slash, punctuation off
    the edges, parenthesised glosses dropped."""
    import re
    s = re.sub(r"\([^)]*\)", " ", s or "")
    parts = [re.sub(r"^[^\w]+|[^\w]+$", "", t) for t in re.split(r"[\s/]+", s)]
    return len([t for t in parts if t])


TONE_MARKS = "àáâǎèéëēíîóôúɔɛ"


def pool_rows(forms_in_db: list, links: list, levels: dict) -> list:
    """Turn conjugation forms into exercise material.

    A paradigm is the best match-pairs material the course has: six forms of one
    tense share an orthography, a shape and a topic BY CONSTRUCTION, which is the
    homogeneity the bucket rules work so hard to find in ordinary sentences.

    Rows are assigned by the SAME link table that decides what each lesson
    displays, so a lesson is never drilled on a tense it does not teach, and a
    newly added verb becomes exercise material the moment it is attached to a
    lesson -- no code change, no list to maintain here.
    """
    rows = []
    for link in links:
        lesson_id = link["lesson_id"]
        tenses = link.get("tenses")
        level = levels.get(lesson_id, 1)
        for f in forms_in_db:
            if f["verb"] != link["verb"]:
                continue
            if tenses and f["tense"] not in tenses:
                continue
            # Orthography is a property of the SOURCE, decided per verb rather
            # than per word: sniffing an individual form would call every
            # legitimately toneless word "untoned". If any form of this verb
            # carries a tone mark, the whole paradigm is toned.
            verb_forms = [x["lingala"] for x in forms_in_db if x["verb"] == f["verb"]]
            toned = any(any(c in TONE_MARKS for c in v) for v in verb_forms)
            rows.append({
                "language_id": LANGUAGE_ID,
                "lesson_id": lesson_id,
                "source_table": "conjugation_forms",
                "source_id": f["id"],
                "french": f["french"],
                "lingala": f["lingala"],
                "audio_url": f["audio_url"],
                "tier": "native",              # the professor wrote it into this lesson
                "token_count": tokens(f["lingala"]),
                "orthography": "toned" if toned else "untoned",
                "level": level,
                "difficulty": None,
                "effective_level": level,
            })
    return rows


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

    print()
    for lid, tenses in CONJUGATION_LESSONS.items():
        n = sum(1 for f in forms if f["tense"] in tenses)
        print(f"   L{lid} -> {n} forms ({', '.join(tenses)})")

    if args.dry_run:
        print("\n--dry-run: nothing written")
        return

    # on_conflict must name the composite unique explicitly: with both a
    # bigserial PK and unique(language_id, verb, tense, person), PostgREST
    # cannot infer which one an upsert targets and answers 409.
    post("conjugation_forms?on_conflict=language_id,verb,tense,person", forms,
         "resolution=merge-duplicates,return=minimal")
    # A lesson that no longer shows a table must lose its link, or it keeps
    # rendering the paradigm it was detached from.
    keep = ",".join(str(l) for l in CONJUGATION_LESSONS)
    delete(f"lesson_conjugation_tables?language_id=eq.{LANGUAGE_ID}&lesson_id=not.in.({keep})")

    post("lesson_conjugation_tables?on_conflict=lesson_id,verb",
         [{"lesson_id": lid, "language_id": LANGUAGE_ID, "verb": "ko linga",
           "sort_order": 0, "tenses": tenses}
          for lid, tenses in CONJUGATION_LESSONS.items()],
         "resolution=merge-duplicates,return=minimal")
    # Read the forms back for their ids, then mirror them into lesson_pool so
    # the exercise engine can draw on them.
    in_db = get(f"conjugation_forms?language_id=eq.{LANGUAGE_ID}&select=id,verb,tense,french,lingala,audio_url")
    links = get("lesson_conjugation_tables?select=lesson_id,verb,tenses")
    lessons = get("lessons?select=id,course_id")
    courses = get(f"courses?language_id=eq.{LANGUAGE_ID}&select=id,course_order")
    order = {c["id"]: c["course_order"] for c in courses}
    levels = {l["id"]: order.get(l["course_id"], 1) for l in lessons}

    rows = pool_rows(in_db, links, levels)

    # lesson_pool is unique on (source_table, source_id), so one form can belong
    # to exactly one lesson. Today L358 and L359 carry disjoint tenses so this
    # cannot bite -- but two lessons sharing a tense would silently drop one,
    # and silently is the part that matters.
    seen = {}
    for r in rows:
        prev = seen.get(r["source_id"])
        if prev and prev != r["lesson_id"]:
            print(f"   ! form {r['source_id']} is claimed by lessons {prev} and "
                  f"{r['lesson_id']}; keeping {prev}. Split the tenses between them.")
        seen.setdefault(r["source_id"], r["lesson_id"])
    rows = [r for r in rows if seen[r["source_id"]] == r["lesson_id"]]

    if rows:
        post("lesson_pool?on_conflict=source_table,source_id", rows,
             "resolution=merge-duplicates,return=minimal")

    print("\nwritten.")
    for lid, tenses in CONJUGATION_LESSONS.items():
        n = sum(1 for r in rows if r["lesson_id"] == lid)
        print(f"   L{lid} shows: {', '.join(tenses)}  ({n} rows added to lesson_pool)")


if __name__ == "__main__":
    main()
