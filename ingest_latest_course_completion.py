#!/usr/bin/env python3
"""Import the professor's final curriculum delivery from ``Latest_data``.

The importer is intentionally staged and repeatable:

    python3 ingest_latest_course_completion.py plan
    python3 ingest_latest_course_completion.py stage
    python3 ingest_latest_course_completion.py upload
    python3 ingest_latest_course_completion.py apply
    python3 ingest_latest_course_completion.py verify

``plan`` reads production but writes nothing. ``stage`` trims every recording
and splits multi-answer clips at the longest pauses. ``upload`` sends those MP3
files to R2. ``apply`` updates Supabase after taking rollback snapshots.

Required environment variables are the same ones used by the existing ingest
tools: SUPABASE_URL, SUPABASE_SERVICE_KEY and the R2_* credentials.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import unicodedata
import zipfile
from collections import defaultdict
from pathlib import Path

import requests


ROOT = Path(__file__).resolve().parent
ZIP_DIR = ROOT / "audio_collection_html" / "Latest_data"
ART = ROOT / "artifacts" / "professor_completion_202609"
PLAN = ART / "ingest_plan.json"
REPORT = ART / "ingest_report.txt"
STAGED = ART / "mp3"
SUPABASE_URL = os.environ.get(
    "SUPABASE_URL", "https://haioiccujncsehadipzb.supabase.co"
).rstrip("/")
LANGUAGE_ID = 1
R2_PUBLIC = os.environ.get(
    "R2_PUBLIC_BASE_URL", "https://pub-78d23bf07fce46b3adc19df91148ffb8.r2.dev"
).rstrip("/")

SUPPLEMENT_TARGETS = {
    "2.5-comprehension-supplement": (390, "Compréhension et communication", 2),
    "3.5-sentiments-supplement": (360, "Sentiments et emotions", 3),
    "3.8-comparatifs-supplement": (380, "Comparatifs et superlatifs", 3),
}

TENSE_LESSONS = {
    "present": 358,
    "present_habituel": 358,
    "present_prog": 358,
    "imparfait": 358,
    "passe_prog": 358,
    "futur": 359,
    "imperatif_affirmatif": 359,
    "futur_proche": 393,
    "imperatif_negatif": 393,
}

PERSON_ORDER = {
    "infinitif": 0,
    "je": 1,
    "tu": 2,
    "il/elle": 3,
    "nous": 4,
    "vous": 5,
    "ils/elles": 6,
}

TONE_MARKS = "àáâǎèéëēíîóôúɔɛ"


def key() -> str:
    value = os.environ.get("SUPABASE_SERVICE_KEY")
    if not value:
        sys.exit("SUPABASE_SERVICE_KEY is not set")
    return value


def headers(prefer: str | None = None) -> dict[str, str]:
    out = {"apikey": key(), "Authorization": f"Bearer {key()}"}
    if prefer:
        out["Prefer"] = prefer
    return out


def rest(method: str, path: str, body=None, prefer: str | None = None):
    response = requests.request(
        method,
        f"{SUPABASE_URL}/rest/v1/{path}",
        headers={**headers(prefer), **({"Content-Type": "application/json"} if body is not None else {})},
        json=body,
        timeout=120,
    )
    if not response.ok:
        raise RuntimeError(f"{method} {path}: HTTP {response.status_code} {response.text[:500]}")
    return response.json() if response.text else []


def get_all(table: str, query: str) -> list[dict]:
    rows, offset = [], 0
    while True:
        response = requests.get(
            f"{SUPABASE_URL}/rest/v1/{table}?{query}",
            headers={**headers(), "Range": f"{offset}-{offset + 999}"},
            timeout=120,
        )
        response.raise_for_status()
        page = response.json()
        rows.extend(page)
        if len(page) < 1000:
            return rows
        offset += 1000


def folded(value: str | None) -> str:
    text = unicodedata.normalize("NFKD", value or "")
    text = "".join(c for c in text if not unicodedata.combining(c)).casefold()
    return re.sub(r"\s+", " ", text).strip()


def slug(value: str) -> str:
    value = folded(value)
    value = re.sub(r"[^a-z0-9]+", "_", value)
    return value.strip("_")[:70]


def variants(value: str) -> list[str]:
    """Expand professor bullet lines and explicit slash alternatives."""
    result = []
    for line in (value or "").splitlines():
        line = re.sub(r"^\s*[-•]\s*", "", line).strip()
        if not line:
            continue
        pieces = re.split(r"\s*/\s*(?=[A-ZÀ-ÖØ-Þ])", line)
        result.extend(piece.strip() for piece in pieces if piece.strip())
    return result or ([value.strip()] if value and value.strip() else [])


def duration(path: Path) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nk=1:nw=1", str(path)],
        check=True, capture_output=True, text=True,
    )
    return float(result.stdout.strip())


def split_bounds(path: Path, count: int) -> list[tuple[float, float]]:
    total = duration(path)
    if count == 1:
        return [(0.0, total)]
    result = subprocess.run(
        ["ffmpeg", "-nostdin", "-i", str(path), "-af",
         "silencedetect=noise=-24dB:d=0.60", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    starts = [float(x) for x in re.findall(r"silence_start: ([0-9.]+)", result.stderr)]
    ends = [float(x) for x in re.findall(r"silence_end: ([0-9.]+)", result.stderr)]
    pauses = []
    end_index = 0
    for start in starts:
        while end_index < len(ends) and ends[end_index] <= start:
            end_index += 1
        if end_index >= len(ends):
            break
        end = ends[end_index]
        end_index += 1
        if start > 0.25 and end < total - 0.25:
            pauses.append((end - start, (start + end) / 2))
    if len(pauses) < count - 1:
        raise RuntimeError(
            f"{path.name}: expected {count - 1} pauses, found {len(pauses)}; review manually"
        )
    cuts = sorted(point for _, point in sorted(pauses, reverse=True)[:count - 1])
    points = [0.0, *cuts, total]
    return list(zip(points, points[1:]))


def zip_records() -> tuple[list[dict], dict]:
    supplement_rows: list[dict] = []
    conjugation = None
    for path in sorted(ZIP_DIR.glob("*.zip")):
        with zipfile.ZipFile(path) as archive:
            data = json.loads(archive.read("data.json"))
        if data.get("kind") == "monoko-conjugaison-recordings":
            if conjugation is not None:
                raise RuntimeError("More than one conjugation delivery found")
            conjugation = {"zip": str(path), "data": data}
            continue
        unit = data.get("unit")
        if unit not in SUPPLEMENT_TARGETS:
            raise RuntimeError(f"No destination configured for {path.name} ({unit!r})")
        lesson_id, lesson_title, level = SUPPLEMENT_TARGETS[unit]
        export_day = (data.get("exported_at") or "")[:10].replace("-", "") or "undated"
        with tempfile.TemporaryDirectory() as temp:
            with zipfile.ZipFile(path) as archive:
                for entry in data.get("entries", []):
                    for sense in entry.get("senses", []):
                        answers = variants(sense.get("phrase", ""))
                        if not answers:
                            raise RuntimeError(f"{path.name} entry {entry.get('id')} has no Lingala")
                        member = sense.get("audio_phrase")
                        if not member:
                            raise RuntimeError(f"{path.name} entry {entry.get('id')} has no audio")
                        source = Path(temp) / Path(member).name
                        source.write_bytes(archive.read(member))
                        bounds = split_bounds(source, len(answers))
                        for index, (answer, (start, end)) in enumerate(zip(answers, bounds), 1):
                            marker = f"latest_data:{unit}:e{entry['id']}:v{index}"
                            object_key = (
                                f"Lingala/lesson_items/{unit}/{export_day}/"
                                f"e{entry['id']}_{slug(sense.get('translation', 'phrase'))}_v{index}.mp3"
                            )
                            supplement_rows.append({
                                "zip": str(path), "member": member, "unit": unit,
                                "lesson_id": lesson_id, "lesson_title": lesson_title,
                                "level": level, "french": sense.get("translation", "").strip(),
                                "dialect": answer, "variant": index,
                                "variant_count": len(answers), "start": start, "end": end,
                                "source_key": marker, "object_key": object_key,
                            })
    if conjugation is None:
        raise RuntimeError("Conjugation delivery not found")
    return supplement_rows, conjugation


def conjugation_records(delivery: dict) -> tuple[list[dict], list[dict]]:
    rows = delivery["data"]["rows"]
    tense_order = {}
    infinitives = {}
    for row in rows:
        tense_order.setdefault(row["tense_key"], len(tense_order) + 1)
        if row.get("Personne") == "infinitif":
            infinitives[(row["tense_key"], row["Verbe"])] = row["Lingala"].strip()

    forms, notes = [], []
    for row in rows:
        tense = row["tense_key"]
        if row.get("Personne") == "explication":
            explanation = (row.get("Lingala") or "").strip()
            if explanation:
                notes.append({
                    "language_id": LANGUAGE_ID,
                    "tense": tense,
                    "tense_label": row["Temps"].strip(),
                    "explanation": explanation,
                    "sort_order": tense_order[tense],
                    "source_key": f"latest_data:conjugation:{tense}",
                })
            continue
        if not row.get("Lingala") or not row.get("audio"):
            raise RuntimeError(f"Incomplete conjugation row: {row.get('id')}")
        infinitive = infinitives[(tense, row["Verbe"])]
        verb_fr = re.sub(r"\s*\([^)]*\)\s*$", "", row["Verbe"]).strip()
        forms.append({
            "zip": delivery["zip"], "member": row["audio"],
            "object_key": f"Lingala/conjugation/20260909/{row['id']}.mp3",
            "db": {
                "language_id": LANGUAGE_ID,
                "verb": infinitive.casefold(),
                "verb_fr": verb_fr,
                "tense": tense,
                "tense_label": row["Temps"].strip(),
                "tense_order": tense_order[tense],
                "person": row["Personne"],
                "person_order": PERSON_ORDER[row["Personne"]],
                "french": row["Français"].strip(),
                "lingala": row["Lingala"].strip(),
                "audio_url": f"{R2_PUBLIC}/Lingala/conjugation/20260909/{row['id']}.mp3",
                "source_cell": f"latest_data:conjugation:{row['id']}",
            },
        })
    return forms, notes


def make_plan() -> dict:
    supplements, delivery = zip_records()
    forms, notes = conjugation_records(delivery)
    lessons = {row["id"]: row for row in get_all(
        "lessons", "select=id,title,course_id,lesson_order&limit=200"
    )}
    for lesson_id, expected, _ in SUPPLEMENT_TARGETS.values():
        if lesson_id not in lessons or folded(lessons[lesson_id]["title"]) != folded(expected):
            raise RuntimeError(f"Lesson L{lesson_id} is not {expected!r}")

    existing = {
        row.get("audio_source_cell"): row
        for row in get_all(
            "lesson_items",
            "select=id,lesson_id,french,dialect,item_order,audio_url,audio_key,audio_source_cell&audio_source_cell=like.latest_data:*",
        )
        if row.get("audio_source_cell")
    }
    max_order = defaultdict(int)
    for lesson_id in {row["lesson_id"] for row in supplements}:
        current = get_all("lesson_items", f"lesson_id=eq.{lesson_id}&select=item_order")
        max_order[lesson_id] = max((row.get("item_order") or 0 for row in current), default=0)
    for row in supplements:
        match = existing.get(row["source_key"])
        if match:
            row["op"], row["row_id"], row["item_order"] = "update", match["id"], match["item_order"]
        else:
            max_order[row["lesson_id"]] += 1
            row["op"], row["row_id"], row["item_order"] = "insert", None, max_order[row["lesson_id"]]

    plan = {
        "source": str(ZIP_DIR),
        "supplements": supplements,
        "conjugation": forms,
        "notes": notes,
    }
    ART.mkdir(parents=True, exist_ok=True)
    PLAN.write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")

    by_lesson = defaultdict(lambda: {"prompts": set(), "rows": 0})
    for row in supplements:
        by_lesson[row["lesson_title"]]["prompts"].add(row["french"])
        by_lesson[row["lesson_title"]]["rows"] += 1
    lines = ["MONOKO - final professor curriculum delivery", "=" * 58, ""]
    for title, stats in by_lesson.items():
        lines.append(f"{title}: {len(stats['prompts'])} prompts -> {stats['rows']} playable forms")
    lines += ["", f"Conjugation: {len(forms)} recorded rows, {len(notes)} professor notes",
              "Météo: no returned ZIP; unchanged", "",
              f"Plan: {PLAN}"]
    REPORT.write_text("\n".join(lines), encoding="utf-8")
    print("\n".join(lines))
    return plan


TRIM_FILTER = (
    "silenceremove=start_periods=1:start_duration=0.03:start_threshold=-42dB:start_silence=0.08,"
    "areverse,silenceremove=start_periods=1:start_duration=0.03:start_threshold=-42dB:"
    "start_silence=0.12,areverse"
)


def transcode(raw: Path, output: Path, start: float | None = None, end: float | None = None):
    output.parent.mkdir(parents=True, exist_ok=True)
    command = ["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", str(raw)]
    segment = f"atrim=start={start:.3f}:end={end:.3f},asetpts=PTS-STARTPTS," if start is not None else ""
    command += ["-af", segment + TRIM_FILTER, "-ac", "1", "-b:a", "128k",
                "-codec:a", "libmp3lame", str(output)]
    subprocess.run(command, check=True)


def load_plan() -> dict:
    if not PLAN.exists():
        sys.exit("No plan found. Run the plan stage first.")
    return json.loads(PLAN.read_text(encoding="utf-8"))


def stage(plan: dict) -> list[dict]:
    jobs = []
    for row in plan["supplements"]:
        jobs.append((row["zip"], row["member"], row["object_key"], row["start"], row["end"]))
    for row in plan["conjugation"]:
        jobs.append((row["zip"], row["member"], row["object_key"], None, None))
    by_zip = defaultdict(list)
    for job in jobs:
        by_zip[job[0]].append(job)
    staged = []
    for zip_name, zip_jobs in by_zip.items():
        with zipfile.ZipFile(zip_name) as archive, tempfile.TemporaryDirectory() as temp:
            for _, member, object_key, start, end in zip_jobs:
                output = STAGED / object_key
                raw = Path(temp) / Path(member).name
                raw.write_bytes(archive.read(member))
                transcode(raw, output, start, end)
                staged.append({"path": str(output), "object_key": object_key})
    print(f"Staged {len(staged)} MP3 files ({sum(Path(x['path']).stat().st_size for x in staged) / 1e6:.1f} MB)")
    return staged


def upload(plan: dict):
    import boto3

    staged = stage(plan)
    bucket = os.environ.get("R2_BUCKET", "audios")
    client = boto3.client(
        "s3",
        endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )
    uploaded = skipped = 0
    for index, item in enumerate(staged, 1):
        try:
            client.head_object(Bucket=bucket, Key=item["object_key"])
            skipped += 1
        except Exception:
            client.upload_file(item["path"], bucket, item["object_key"], ExtraArgs={"ContentType": "audio/mpeg"})
            uploaded += 1
        if index % 50 == 0 or index == len(staged):
            print(f"  checked {index}/{len(staged)}")
    print(f"Uploaded {uploaded}; already present {skipped}")


def pool_payload(row_id: int, lesson_id: int, level: int, french: str, lingala: str, audio_url: str):
    return {
        "language_id": LANGUAGE_ID, "lesson_id": lesson_id,
        "source_table": "lesson_items", "source_id": row_id,
        "french": french, "lingala": lingala, "audio_url": audio_url,
        "tier": "native", "token_count": len(lingala.split()),
        "orthography": "toned", "level": level, "difficulty": None,
        "effective_level": level,
    }


def apply(plan: dict):
    # Fail before changing anything when the one new migration is missing.
    rest("GET", "conjugation_tense_notes?select=tense&limit=1")
    ART.mkdir(parents=True, exist_ok=True)
    touched = [row["row_id"] for row in plan["supplements"] if row["row_id"]]
    old_supplements = rest("GET", f"lesson_items?id=in.({','.join(map(str, touched))})&select=*" ) if touched else []
    old_forms = get_all("conjugation_forms", f"language_id=eq.{LANGUAGE_ID}&select=*")
    old_links = get_all("lesson_conjugation_tables", f"language_id=eq.{LANGUAGE_ID}&select=*")
    old_pool = get_all("lesson_pool", "source_table=eq.conjugation_forms&select=*")
    (ART / "rollback_before_apply.json").write_text(json.dumps({
        "supplements": old_supplements, "conjugation_forms": old_forms,
        "conjugation_links": old_links, "conjugation_pool": old_pool,
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    pool_rows = []
    for row in plan["supplements"]:
        audio_url = f"{R2_PUBLIC}/{row['object_key']}"
        body = {
            "lesson_id": row["lesson_id"], "french": row["french"], "dialect": row["dialect"],
            "item_order": row["item_order"], "audio_url": audio_url,
            "audio_key": row["object_key"], "audio_source_cell": row["source_key"],
            "embedding": None,
        }
        if row["op"] == "update":
            rest("PATCH", f"lesson_items?id=eq.{row['row_id']}", body, "return=representation")
            row_id = row["row_id"]
        else:
            made = rest("POST", "lesson_items", body, "return=representation")
            row_id = made[0]["id"]
        pool_rows.append(pool_payload(
            row_id, row["lesson_id"], row["level"], row["french"], row["dialect"], audio_url
        ))
    for start in range(0, len(pool_rows), 100):
        rest("POST", "lesson_pool?on_conflict=source_table,source_id", pool_rows[start:start + 100],
             "resolution=merge-duplicates,return=minimal")

    rest("DELETE", f"lesson_conjugation_tables?language_id=eq.{LANGUAGE_ID}")
    rest("DELETE", "lesson_pool?source_table=eq.conjugation_forms")
    rest("DELETE", f"conjugation_forms?language_id=eq.{LANGUAGE_ID}")
    db_forms = [row["db"] for row in plan["conjugation"]]
    made_forms = []
    for start in range(0, len(db_forms), 100):
        made_forms.extend(rest("POST", "conjugation_forms", db_forms[start:start + 100], "return=representation"))
    rest("POST", "conjugation_tense_notes?on_conflict=language_id,tense", plan["notes"],
         "resolution=merge-duplicates,return=minimal")

    available = defaultdict(set)
    first_seen = []
    for form in made_forms:
        available[form["verb"]].add(form["tense"])
        if form["verb"] not in first_seen:
            first_seen.append(form["verb"])
    links = []
    for sort_order, verb in enumerate(first_seen):
        by_lesson = defaultdict(list)
        for tense in sorted(available[verb], key=lambda t: next(
            f["tense_order"] for f in made_forms if f["tense"] == t
        )):
            by_lesson[TENSE_LESSONS[tense]].append(tense)
        for lesson_id, tenses in by_lesson.items():
            links.append({"lesson_id": lesson_id, "language_id": LANGUAGE_ID,
                          "verb": verb, "sort_order": sort_order, "tenses": tenses})
    rest("POST", "lesson_conjugation_tables", links, "return=minimal")

    toned_verbs = {
        verb for verb in available
        if any(any(char.casefold() in TONE_MARKS for char in form["lingala"])
               for form in made_forms if form["verb"] == verb)
    }
    conjugation_pool = []
    for form in made_forms:
        if form["person"] == "infinitif":
            continue
        conjugation_pool.append({
            "language_id": LANGUAGE_ID,
            "lesson_id": TENSE_LESSONS[form["tense"]],
            "source_table": "conjugation_forms", "source_id": form["id"],
            "french": form["french"], "lingala": form["lingala"],
            "audio_url": form["audio_url"], "tier": "native",
            "token_count": len(form["lingala"].split()),
            "orthography": "toned" if form["verb"] in toned_verbs else "untoned",
            "level": 3, "difficulty": None, "effective_level": 3,
        })
    for start in range(0, len(conjugation_pool), 100):
        rest("POST", "lesson_pool?on_conflict=source_table,source_id",
             conjugation_pool[start:start + 100], "resolution=merge-duplicates,return=minimal")
    print(f"Applied {len(plan['supplements'])} lesson rows, {len(made_forms)} conjugation rows, "
          f"{len(plan['notes'])} notes and {len(conjugation_pool)} conjugation practice rows")


def verify(plan: dict):
    problems = []
    supplement_ids = []
    for lesson_id, title, _ in SUPPLEMENT_TARGETS.values():
        rows = get_all("lesson_items", f"lesson_id=eq.{lesson_id}&select=id,audio_url,audio_source_cell")
        imported = [row for row in rows if (row.get("audio_source_cell") or "").startswith("latest_data:")]
        expected = sum(1 for row in plan["supplements"] if row["lesson_id"] == lesson_id)
        print(f"L{lesson_id} {title}: {len(rows)} total, {len(imported)}/{expected} imported")
        if len(imported) != expected:
            problems.append(f"L{lesson_id} imported {len(imported)} != {expected}")
        if any(not row.get("audio_url") for row in imported):
            problems.append(f"L{lesson_id} has an imported row without audio")
        supplement_ids.extend(row["id"] for row in imported)

    supplement_pool = get_all(
        "lesson_pool",
        "source_table=eq.lesson_items&select=source_id,audio_url,tier",
    )
    supplement_pool = [row for row in supplement_pool if row["source_id"] in supplement_ids]
    if len(supplement_pool) != len(supplement_ids):
        problems.append(
            f"supplement pool count {len(supplement_pool)} != {len(supplement_ids)}"
        )
    if any(row.get("tier") != "native" or not row.get("audio_url") for row in supplement_pool):
        problems.append("supplement practice rows must be native and recorded")

    forms = get_all("conjugation_forms", f"language_id=eq.{LANGUAGE_ID}&select=id,audio_url,person")
    notes = get_all("conjugation_tense_notes", f"language_id=eq.{LANGUAGE_ID}&select=tense")
    links = get_all("lesson_conjugation_tables", f"language_id=eq.{LANGUAGE_ID}&select=lesson_id,verb,tenses")
    conjugation_pool = get_all(
        "lesson_pool", "source_table=eq.conjugation_forms&select=source_id,audio_url,tier"
    )
    expected_finite = sum(
        1 for row in plan["conjugation"] if row["db"]["person"] != "infinitif"
    )
    expected_links = {
        (TENSE_LESSONS[row["db"]["tense"]], row["db"]["verb"])
        for row in plan["conjugation"]
    }
    print(f"Conjugation: {len(forms)} forms ({sum(1 for f in forms if f['audio_url'])} audio), "
          f"{len(notes)} notes, {len(links)} lesson/verb links, "
          f"{len(conjugation_pool)} practice rows")
    if len(forms) != len(plan["conjugation"]):
        problems.append("conjugation form count differs")
    if any(not form.get("audio_url") for form in forms):
        problems.append("a conjugation form is missing audio")
    if len(notes) != len(plan["notes"]):
        problems.append("conjugation note count differs")
    if len(links) != len(expected_links):
        problems.append(f"conjugation link count {len(links)} != {len(expected_links)}")
    if len(conjugation_pool) != expected_finite:
        problems.append(f"conjugation pool count {len(conjugation_pool)} != {expected_finite}")
    if any(row.get("tier") != "native" or not row.get("audio_url") for row in conjugation_pool):
        problems.append("conjugation practice rows must be native and recorded")
    if problems:
        raise RuntimeError("; ".join(problems))
    print("Verification passed")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("stage", choices=["plan", "stage", "upload", "apply", "verify"])
    args = parser.parse_args()
    if args.stage == "plan":
        make_plan()
        return
    plan = load_plan()
    if args.stage == "stage":
        stage(plan)
    elif args.stage == "upload":
        upload(plan)
    elif args.stage == "apply":
        apply(plan)
    else:
        verify(plan)


if __name__ == "__main__":
    main()
