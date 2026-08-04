#!/usr/bin/env python3
"""
ingest_professor_zips.py
─────────────────────────
Ingests the professor's returned recording-app ZIPs into R2 + Supabase.

The recording apps export
    data.json  +  audio/e<id>_phrase.webm  /  audio/e<id>_phrase2.webm

where each entry carries
    phrase_fr / phrase_lang    -> lesson_items.french   / .dialect
    phrase_fr2 / phrase_lang2  -> lesson_items.example_french / .example_dialect
    audio_phrase               -> lesson_items.audio_url
    audio_phrase2              -> lesson_items.example_audio_url

Entries with a `db_id` update an existing row. Entries with `db_id: null` are
content the professor authored himself and become new rows.

Three stages, each safe to re-run:

    plan    read ZIPs + live DB, resolve every entry to an action, write a plan
            JSON + human report. Touches nothing.
    upload  transcode planned clips webm -> mp3 (128k mono) and push to R2.
    apply   write the planned text/audio_url changes to Supabase.

Usage:
    python3 ingest_professor_zips.py plan
    python3 ingest_professor_zips.py upload  [--dry-run]
    python3 ingest_professor_zips.py apply   [--dry-run]

Env:
    SUPABASE_SERVICE_KEY   required for `apply` (plan uses it too if present)
    R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY
    R2_BUCKET / R2_PUBLIC_BASE_URL     required for `upload`
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import unicodedata
import zipfile
from collections import defaultdict
from pathlib import Path

import requests

SUPABASE_URL = "https://haioiccujncsehadipzb.supabase.co"
LANGUAGE_ID = 1
ZIP_DIR = Path("audio_collection_html/Prof_Borgeas")
ARTIFACT_DIR = Path("artifacts/professor_ingest")
PLAN_PATH = ARTIFACT_DIR / "ingest_plan.json"
REPORT_PATH = ARTIFACT_DIR / "ingest_report.txt"
BACKUP_PATH = ARTIFACT_DIR / "rollback_lesson_items.json"
AUDIO_CACHE = ARTIFACT_DIR / "mp3"
# Sits alongside the March workbook audio at Lingala/lesson_items/course_1..4/.
# Those use the deleted 22/23/24/25 course numbering and workbook-cell filenames
# ("2.C259.mp3"); ZIP entries have no workbook cell, so they key by module code
# instead ("3.4/", "NOUVEAU-religion/") — no collision with the course_N dirs.
R2_PREFIX = "Lingala/lesson_items"

# ── ZIPs deliberately not ingested ───────────────────────────────────────────
# Superseded by a later, more complete export of the same module.
SUPERSEDED = {
    "Monoko_Audio_Lingala_1.1_Sons et alphabet_2026-05-22.zip":
        "superseded by the 2026-06-22 re-record (17/45 -> 45/45 complete)",
    "Monoko_Audio_Lingala_4.2_La nature et les animaux_2026-06-26 (1).zip":
        "byte-duplicate of the same export without the (1) suffix",
    "Monoko_Audio_Lingala_3.4_Conjugaison - futur et imperatif_2026-06-22 (1).zip":
        "byte-duplicate of the same export without the (1) suffix",
    # The June conjugation exports add audio to the old single-verb "aimer" rows,
    # which LESSON_STRUCTURE_AUDIT.md 3a replaces wholesale with the
    # parler/finir/vendre paradigm delivered in the July/August exports.
    "Monoko_Audio_Lingala_3.3_Conjugaison - present et passe_2026-06-22.zip":
        "old single-verb 'aimer' content, replaced by the 2026-07-30 rebuild",
    "Monoko_Audio_Lingala_3.4_Conjugaison - futur et imperatif_2026-06-22.zip":
        "old single-verb 'aimer' content, replaced by the 2026-08-01 rebuild",
}

# ── Hand-resolved rows the July restructure moved or merged ──────────────────
# Keyed by the db_id printed in the ZIP. The dedup/split passes deleted these
# ids; the value is the surviving canonical row, or None to drop the clip.
DBID_OVERRIDES = {
    # "Je suis perdu(e)." — L356 had this 3x, dedup kept id 7444 ("Je suis perdu").
    8495: 7444,
    # "J'apprends la langue française." — audit 2a moved it out of Présentation
    # into C6.L4 "La langue dans le monde" as id 8006 ("J'apprends la langue").
    7138: 8006,
    # "- J'aime la musique.\n- J'aime cette chanson." — one cell holding two
    # sentences, split into separate rows by split_multi_lingala_rows.py. The
    # single clip covers both, so it maps to neither.
    7543: None,
}

# ── Where the professor-authored (db_id: null) ZIPs land ─────────────────────
# Keyed by the `module` field in data.json. `lesson` is matched on the live
# lesson title so the July restructure's renumbering cannot silently misroute.
#   append         — add as new items at the end of an existing lesson
#   replace_all    — delete every existing item in the lesson, then insert
#   new_lesson     — create a lesson under `course_title` first
#   upsert         — match on French within the lesson; update if present, else
#                    insert. Used when the professor re-delivers a module he had
#                    already partly filled, correcting earlier rows in the process.
NEW_CONTENT_TARGETS = {
    "2.1-supp":         {"mode": "upsert",      "lesson": "La famille et les relations"},
    "2.3-supp":         {"mode": "upsert",      "lesson": "Manger et boire"},
    "3.1-supp":         {"mode": "append",      "lesson": "Deplacements et directions"},
    "3.3":              {"mode": "replace_all", "lesson": "Conjugaison - present et passe"},
    "3.4":              {"mode": "replace_all", "lesson": "Conjugaison - futur et imperatif"},
    "3.4-supp":         {"mode": "new_lesson",  "lesson": "Conjugaison : futur proche et imperatif negatif",
                         "course_title": "Niveau 3"},
    "4.1-supp":         {"mode": "append",      "lesson": "Le marche et l'argent"},
    "4.3":              {"mode": "replace_all", "lesson": "Proverbes et expressions idiomatiques"},
    "5.2-supp":         {"mode": "append",      "lesson": "Debats et opinions"},
    "6.4-supp":         {"mode": "append",      "lesson": "La langue dans le monde"},
    "NOUVEAU-religion": {"mode": "new_lesson",  "lesson": "Religion et spiritualite",
                         "course_title": "Niveau 6"},
    "NOUVEAU-techno":   {"mode": "new_lesson",  "lesson": "Technologie et communication",
                         "course_title": "Niveau 6"},
}


# ── Supabase ─────────────────────────────────────────────────────────────────

def service_key() -> str:
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not key:
        sys.exit("SUPABASE_SERVICE_KEY is not set.")
    return key


def headers(key: str | None = None) -> dict:
    key = key or os.environ.get(
        "SUPABASE_SERVICE_KEY", "sb_publishable_W6hYzyecMTm06Cr9siLV1A_4qtR5ect"
    )
    return {"apikey": key, "Authorization": f"Bearer {key}"}


def paginate(table: str, params: str) -> list[dict]:
    out, offset, page = [], 0, 1000
    while True:
        res = requests.get(
            f"{SUPABASE_URL}/rest/v1/{table}?{params}",
            headers={**headers(), "Range": f"{offset}-{offset + page - 1}"},
            timeout=60,
        )
        res.raise_for_status()
        batch = res.json()
        out.extend(batch)
        if len(batch) < page:
            return out
        offset += page


def fetch_db() -> tuple[dict, dict, dict]:
    courses = {c["id"]: c for c in paginate(
        "courses", f"select=id,title,language_id,course_order&language_id=eq.{LANGUAGE_ID}")}
    lessons = {l["id"]: l for l in paginate("lessons", "select=id,course_id,title,lesson_order")}
    lessons = {k: v for k, v in lessons.items() if v["course_id"] in courses}
    items = paginate(
        "lesson_items",
        "select=id,lesson_id,french,dialect,example_french,example_dialect,"
        "item_order,audio_url,example_audio_url",
    )
    items = {i["id"]: i for i in items if i["lesson_id"] in lessons}
    return courses, lessons, items


# ── Text matching ────────────────────────────────────────────────────────────

def norm(text: str | None) -> str:
    """Fold to a comparison key: no accents, no punctuation, collapsed space."""
    if not text:
        return ""
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.replace("\xa0", " ").lower()
    text = re.sub(r"[^a-z0-9 ]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def slug(text: str) -> str:
    s = norm(text).replace(" ", "_")
    return re.sub(r"_+", "_", s).strip("_")[:60] or "item"


# ── ZIP reading ──────────────────────────────────────────────────────────────

def read_zips() -> list[dict]:
    """Newest export wins when two ZIPs cover the same module."""
    found = []
    for path in sorted(ZIP_DIR.glob("*.zip")):
        if path.name in SUPERSEDED:
            continue
        with zipfile.ZipFile(path) as zf:
            data = json.loads(zf.read("data.json"))
            names = set(zf.namelist())
        found.append({
            "path": path,
            "module": data.get("module"),
            "module_name": data.get("module_name"),
            "exported_at": data.get("exported_at", ""),
            "entries": data.get("entries", []),
            "members": names,
        })

    best: dict[str, dict] = {}
    for z in found:
        cur = best.get(z["module"])
        if cur is None or z["exported_at"] > cur["exported_at"]:
            best[z["module"]] = z
    return sorted(best.values(), key=lambda z: (z["module"] or ""))


def fields(entry: dict) -> list[tuple[str, str, str, str]]:
    """(field, text_column, audio_column, zip member) per recorded slot."""
    out = []
    if entry.get("audio_phrase"):
        out.append(("phrase", "dialect", "audio_url", entry["audio_phrase"]))
    if entry.get("audio_phrase2"):
        out.append(("phrase2", "example_dialect", "example_audio_url", entry["audio_phrase2"]))
    return out


# ── Plan ─────────────────────────────────────────────────────────────────────

def build_plan() -> dict:
    courses, lessons, items = fetch_db()
    zips = read_zips()

    by_text: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for it in items.values():
        by_text[(norm(it["french"]), norm(it["dialect"]))].append(it)
        by_text[(norm(it["french"]), "")].append(it)

    lesson_by_title = {norm(l["title"]): l for l in lessons.values()}
    course_by_title = {}
    for c in courses.values():
        course_by_title[norm(c["title"])] = c
        course_by_title[norm(c["title"].split("·")[0])] = c

    actions: list[dict] = []
    problems: list[dict] = []
    per_zip: list[dict] = []

    for z in zips:
        mod = z["module"]
        stats = defaultdict(int)
        target = NEW_CONTENT_TARGETS.get(mod)
        has_dbid = any(e.get("db_id") for e in z["entries"])

        # Resolve the destination lesson for professor-authored content.
        dest_lesson = None
        if not has_dbid:
            if not target:
                problems.append({"zip": z["path"].name,
                                 "issue": f"no NEW_CONTENT_TARGETS entry for module {mod!r}"})
                continue
            dest_lesson = lesson_by_title.get(norm(target["lesson"]))
            if dest_lesson is None and target["mode"] != "new_lesson":
                problems.append({"zip": z["path"].name,
                                 "issue": f"target lesson {target['lesson']!r} not found in DB"})
                continue

        # A re-delivery reuses the same module + entry ids, so without a suffix
        # the new recording would silently overwrite the old object and the
        # unchanged DB URL could still serve a cached copy of the old audio.
        suffix = ""
        if target and target["mode"] == "upsert":
            suffix = "_" + (z["exported_at"][:10].replace("-", ""))

        max_order = 0
        if dest_lesson:
            max_order = max((it["item_order"] or 0) for it in items.values()
                            if it["lesson_id"] == dest_lesson["id"]) if any(
                it["lesson_id"] == dest_lesson["id"] for it in items.values()) else 0

        for entry in z["entries"]:
            text = (entry.get("phrase_lang") or "").strip()
            slots = fields(entry)

            if not text and not slots:
                stats["empty"] += 1
                continue
            if not text:
                stats["audio_no_text"] += 1
                problems.append({
                    "zip": z["path"].name, "entry": entry["id"],
                    "issue": "recorded but no Lingala text typed",
                    "french": entry.get("phrase_fr"),
                })
                continue

            row = None
            match = "db_id"
            # A re-delivered supplement carries no db_id, but its rows may
            # already be live from an earlier partial delivery. Match on French
            # inside the destination lesson so a correction updates rather than
            # duplicates. Hash the clip into the key: the text changed, so the
            # audio did too, and reusing the old URL would serve a stale CDN copy.
            if not entry.get("db_id") and target and target["mode"] == "upsert":
                want = norm(entry.get("phrase_fr"))
                row = next((it for it in items.values()
                            if it["lesson_id"] == dest_lesson["id"] and norm(it["french"]) == want),
                           None)
                if row is not None:
                    match = "upsert-text"

            if entry.get("db_id"):
                row = items.get(entry["db_id"])
                if row is None and entry["db_id"] in DBID_OVERRIDES:
                    replacement = DBID_OVERRIDES[entry["db_id"]]
                    if replacement is None:
                        stats["dropped"] += 1
                        continue
                    row, match = items.get(replacement), "override"
                if row is None:
                    # Deleted by the July restructure — fall back to text.
                    cands = by_text.get((norm(entry.get("phrase_fr")), norm(text))) \
                        or by_text.get((norm(entry.get("phrase_fr")), ""))
                    if cands and len({c["id"] for c in cands}) == 1:
                        row, match = cands[0], "text-fallback"
                    else:
                        stats["unresolved"] += 1
                        problems.append({
                            "zip": z["path"].name, "entry": entry["id"],
                            "issue": f"db_id {entry['db_id']} gone and text match "
                                     f"{'ambiguous' if cands else 'failed'}",
                            "french": entry.get("phrase_fr"),
                        })
                        continue

            if row is not None:
                changes = {}
                if norm(row["dialect"]) != norm(text):
                    changes["dialect"] = text
                ex2 = (entry.get("phrase_lang2") or "").strip()
                if ex2 and norm(row["example_dialect"]) != norm(ex2):
                    changes["example_dialect"] = ex2
                clips = [{
                    "member": member,
                    "column": audio_col,
                    "object_key": f"{R2_PREFIX}/{mod}/{slug(entry.get('phrase_fr'))}"
                                  f"_e{entry['id']}_{field}{suffix}.mp3",
                    "replaces": row[audio_col],
                } for field, _, audio_col, member in slots]
                actions.append({
                    "op": "update", "zip": z["path"].name, "module": mod,
                    "entry_id": entry["id"], "row_id": row["id"],
                    "lesson_id": row["lesson_id"], "match": match,
                    "french": entry.get("phrase_fr"), "changes": changes, "clips": clips,
                })
                stats["update"] += 1
                stats["text_filled"] += 1 if "dialect" in changes and not row["dialect"] else 0
                stats["audio_overwrite"] += sum(1 for c in clips if c["replaces"])
            else:
                max_order += 1
                clips = [{
                    "member": member,
                    "column": audio_col,
                    "object_key": f"{R2_PREFIX}/{mod}/{slug(entry.get('phrase_fr'))}"
                                  f"_e{entry['id']}_{field}{suffix}.mp3",
                    "replaces": None,
                } for field, _, audio_col, member in slots]
                actions.append({
                    "op": "insert", "zip": z["path"].name, "module": mod,
                    "entry_id": entry["id"],
                    "lesson_title": target["lesson"], "mode": target["mode"],
                    "course_title": target.get("course_title"),
                    "lesson_id": dest_lesson["id"] if dest_lesson else None,
                    "item_order": max_order,
                    "row": {
                        "french": entry.get("phrase_fr"),
                        "dialect": text,
                        "example_french": entry.get("phrase_fr2"),
                        "example_dialect": entry.get("phrase_lang2"),
                    },
                    "clips": clips,
                })
                stats["insert"] += 1

        per_zip.append({
            "zip": z["path"].name, "module": mod, "module_name": z["module_name"],
            "exported_at": z["exported_at"][:10], "entries": len(z["entries"]),
            **dict(stats),
        })

    return {
        "generated_from": str(ZIP_DIR),
        "zips": per_zip,
        "skipped": SUPERSEDED,
        "actions": actions,
        "problems": problems,
    }


def write_report(plan: dict) -> str:
    L = []
    a = plan["actions"]
    ups = [x for x in a if x["op"] == "update"]
    ins = [x for x in a if x["op"] == "insert"]
    clips = [c for x in a for c in x["clips"]]

    L.append("MONOKO — professor ZIP ingest plan")
    L.append("=" * 78)
    L.append("")
    L.append(f"{'module':<18}{'export':<12}{'n':>4}{'upd':>5}{'new':>5}{'txt+':>6}{'ovr':>5}{'!':>4}")
    for z in plan["zips"]:
        L.append(f"{str(z['module']):<18}{z['exported_at']:<12}{z['entries']:>4}"
                 f"{z.get('update', 0):>5}{z.get('insert', 0):>5}"
                 f"{z.get('text_filled', 0):>6}{z.get('audio_overwrite', 0):>5}"
                 f"{z.get('audio_no_text', 0) + z.get('unresolved', 0):>4}")
    L.append("")
    L.append(f"  upd  = existing rows updated        new  = rows created")
    L.append(f"  txt+ = rows gaining Lingala text    ovr  = clips replacing existing audio")
    L.append(f"  !    = entries needing the professor")
    L.append("")
    L.append("-" * 78)
    L.append(f"TOTAL   {len(ups)} updates, {len(ins)} inserts, {len(clips)} clips to transcode+upload")
    L.append(f"        {sum(1 for x in ups if 'dialect' in x['changes'] )} rows change Lingala text")
    L.append(f"        {sum(1 for c in clips if c['replaces'])} clips overwrite existing audio")
    L.append(f"        {sum(1 for x in ups if x['match'] == 'text-fallback')} rows matched by text (db_id was deleted)")
    L.append("")

    by_lesson = defaultdict(lambda: [0, 0])
    for x in ins:
        by_lesson[(x["lesson_title"], x["mode"])][0] += 1
    for x in ups:
        by_lesson[(x["lesson_id"], "update")][1] += 1
    L.append("NEW CONTENT DESTINATIONS")
    for (title, mode), (n, _) in sorted(by_lesson.items(), key=lambda kv: str(kv[0])):
        if mode == "update":
            continue
        L.append(f"  {mode:<12} {n:>3} items -> {title}")
    L.append("")

    if plan["skipped"]:
        L.append("SKIPPED ZIPS")
        for name, why in plan["skipped"].items():
            L.append(f"  {name}")
            L.append(f"      {why}")
        L.append("")

    if plan["problems"]:
        L.append(f"NEEDS THE PROFESSOR ({len(plan['problems'])})")
        for p in plan["problems"]:
            L.append(f"  [{p['zip'][:44]}] {p.get('issue')}")
            if p.get("french"):
                L.append(f"      fr: {p['french'][:70]}")
        L.append("")
    return "\n".join(L)


# ── Transcode + upload ───────────────────────────────────────────────────────

def transcode(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", str(src),
         "-ac", "1", "-b:a", "128k", "-codec:a", "libmp3lame", str(dst)],
        check=True,
    )


def stage_audio(plan: dict) -> list[dict]:
    """Extract every planned clip from its ZIP and transcode webm -> mp3."""
    AUDIO_CACHE.mkdir(parents=True, exist_ok=True)
    staged, by_zip = [], defaultdict(list)
    for action in plan["actions"]:
        for clip in action["clips"]:
            by_zip[action["zip"]].append((action, clip))

    for zip_name, pairs in by_zip.items():
        with zipfile.ZipFile(ZIP_DIR / zip_name) as zf:
            for action, clip in pairs:
                mp3 = AUDIO_CACHE / clip["object_key"].replace(f"{R2_PREFIX}/", "")
                if not mp3.exists():
                    raw = AUDIO_CACHE / "_tmp.webm"
                    raw.write_bytes(zf.read(clip["member"]))
                    transcode(raw, mp3)
                    raw.unlink(missing_ok=True)
                staged.append({"path": str(mp3), "object_key": clip["object_key"]})
    return staged


def upload(plan: dict, dry_run: bool) -> None:
    import boto3

    staged = stage_audio(plan)
    total = sum(Path(s["path"]).stat().st_size for s in staged)
    print(f"staged {len(staged)} mp3 files ({total / 1e6:.1f} MB)")
    if dry_run:
        for s in staged[:10]:
            print(f"  would upload {s['object_key']}")
        print(f"  ... {len(staged)} total")
        return

    bucket = os.environ["R2_BUCKET"]
    client = boto3.client(
        "s3",
        endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )
    for n, s in enumerate(staged, 1):
        client.upload_file(s["path"], bucket, s["object_key"],
                           ExtraArgs={"ContentType": "audio/mpeg"})
        if n % 25 == 0 or n == len(staged):
            print(f"  uploaded {n}/{len(staged)}")


# ── Apply ────────────────────────────────────────────────────────────────────

def apply(plan: dict, dry_run: bool) -> None:
    key = service_key()
    base = os.environ.get("R2_PUBLIC_BASE_URL",
                          "https://pub-78d23bf07fce46b3adc19df91148ffb8.r2.dev").rstrip("/")
    _, _, items = fetch_db()

    touched = sorted({x["row_id"] for x in plan["actions"] if x["op"] == "update"})
    BACKUP_PATH.parent.mkdir(parents=True, exist_ok=True)
    BACKUP_PATH.write_text(json.dumps([items[i] for i in touched if i in items],
                                      ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"rollback snapshot of {len(touched)} rows -> {BACKUP_PATH}")

    updates = 0
    for action in plan["actions"]:
        if action["op"] != "update":
            continue
        patch = dict(action["changes"])
        for clip in action["clips"]:
            patch[clip["column"]] = f"{base}/{clip['object_key']}"
            patch[clip["column"].replace("_url", "_key")] = clip["object_key"]
        if not patch:
            continue
        updates += 1
        if dry_run:
            continue
        res = requests.patch(
            f"{SUPABASE_URL}/rest/v1/lesson_items?id=eq.{action['row_id']}",
            headers={**headers(key), "Content-Type": "application/json",
                     "Prefer": "return=minimal"},
            json=patch, timeout=60,
        )
        res.raise_for_status()
    print(f"{'would update' if dry_run else 'updated'} {updates} rows")

    # ── inserts, grouped by destination lesson ───────────────────────────────
    inserts = [x for x in plan["actions"] if x["op"] == "insert"]
    courses, lessons, all_items = fetch_db()
    lesson_by_title = {norm(l["title"]): l for l in lessons.values()}

    def find_course(title: str):
        """Courses are titled 'Niveau 3 - Communication'; targets say 'Niveau 3'."""
        want = norm(title)
        for c in courses.values():
            if norm(c["title"]) == want or norm(c["title"]).startswith(want + " "):
                return c
        return None

    # Placeholder rows shipped to production — purge wherever content now lands.
    placeholders = defaultdict(list)
    for i in all_items.values():
        if "PLACEHOLDER" in ((i["french"] or "") + (i["dialect"] or "")):
            placeholders[i["lesson_id"]].append(i)

    groups: dict[tuple, list] = defaultdict(list)
    for x in inserts:
        groups[(x["lesson_title"], x["mode"], x.get("course_title"))].append(x)

    for (title, mode, course_title), rows in groups.items():
        lesson = lesson_by_title.get(norm(title))

        if mode == "new_lesson":
            if lesson:
                print(f"  lesson {title!r} already exists (id {lesson['id']}), appending")
            elif dry_run:
                print(f"  would create lesson {title!r} under {course_title!r}")
            else:
                course = find_course(course_title)
                if course is None:
                    sys.exit(f"course {course_title!r} not found for new lesson {title!r}")
                sibling = [l for l in lessons.values() if l["course_id"] == course["id"]]
                res = requests.post(
                    f"{SUPABASE_URL}/rest/v1/lessons",
                    headers={**headers(key), "Content-Type": "application/json",
                             "Prefer": "return=representation"},
                    json={"course_id": course["id"], "title": title,
                          "lesson_order": max((l["lesson_order"] or 0) for l in sibling) + 1
                          if sibling else 1},
                    timeout=60,
                )
                res.raise_for_status()
                lesson = res.json()[0]
                print(f"  created lesson {title!r} -> id {lesson['id']}")

        # `replace_all` clears the lesson anyway; `append` must still drop the
        # placeholder rows the professor's content is arriving to replace.
        if mode == "append" and lesson and placeholders.get(lesson["id"]):
            victims = placeholders[lesson["id"]]
            print(f"  {'would delete' if dry_run else 'deleting'} {len(victims)} "
                  f"[PLACEHOLDER] rows in {title!r}")
            if not dry_run:
                ids = ",".join(str(v["id"]) for v in victims)
                requests.delete(
                    f"{SUPABASE_URL}/rest/v1/lesson_items?id=in.({ids})",
                    headers={**headers(key), "Prefer": "return=minimal"}, timeout=60,
                ).raise_for_status()

        if mode == "replace_all" and lesson:
            victims = [i for i in _all_items(lesson["id"])]
            BACKUP_PATH.with_name(f"rollback_deleted_L{lesson['id']}.json").write_text(
                json.dumps(victims, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"  {'would delete' if dry_run else 'deleting'} {len(victims)} old rows "
                  f"in {title!r} (backed up)")
            if not dry_run:
                requests.delete(
                    f"{SUPABASE_URL}/rest/v1/lesson_items?lesson_id=eq.{lesson['id']}",
                    headers={**headers(key), "Prefer": "return=minimal"}, timeout=60,
                ).raise_for_status()

        payload = []
        for n, x in enumerate(rows, 1):
            row = dict(x["row"])
            row["lesson_id"] = lesson["id"] if lesson else None
            # append/upsert continue the lesson's existing numbering (planned);
            # replace_all and new_lesson start from 1 on an emptied lesson.
            row["item_order"] = x["item_order"] if mode in ("append", "upsert") else n
            for clip in x["clips"]:
                row[clip["column"]] = f"{base}/{clip['object_key']}"
                row[clip["column"].replace("_url", "_key")] = clip["object_key"]
            payload.append(row)

        print(f"  {'would insert' if dry_run else 'inserting'} {len(payload)} rows -> "
              f"{title!r} ({mode})")
        if dry_run or not lesson:
            continue
        res = requests.post(
            f"{SUPABASE_URL}/rest/v1/lesson_items",
            headers={**headers(key), "Content-Type": "application/json",
                     "Prefer": "return=minimal"},
            json=payload, timeout=120,
        )
        res.raise_for_status()

    print(f"\n{'would insert' if dry_run else 'inserted'} {len(inserts)} rows total")
    print("Next: re-embed the changed rows with embed_lesson_items.py")


def _all_items(lesson_id: int) -> list[dict]:
    """Everything except `embedding` — the vectors bloat the rollback file."""
    return paginate(
        "lesson_items",
        "select=id,lesson_id,french,dialect,example_french,example_dialect,item_order,"
        "audio_url,audio_key,audio_source_cell,example_audio_url,example_audio_key,"
        f"example_audio_source_cell&lesson_id=eq.{lesson_id}",
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("stage", choices=["plan", "upload", "apply"])
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--only", help="comma-separated module codes, e.g. '2.1-supp,2.3-supp'. "
                                   "Required when re-running after a delivery is already "
                                   "applied, or every other module inserts twice.")
    args = ap.parse_args()

    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

    if args.stage == "plan":
        plan = build_plan()
        if args.only:
            want = {m.strip() for m in args.only.split(",")}
            plan["actions"] = [a for a in plan["actions"] if a["module"] in want]
            plan["zips"] = [z for z in plan["zips"] if z["module"] in want]
            plan["problems"] = [p for p in plan["problems"] if True]
            print(f"restricted to modules: {sorted(want)}")
        PLAN_PATH.write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")
        report = write_report(plan)
        REPORT_PATH.write_text(report, encoding="utf-8")
        print(report)
        print(f"plan  -> {PLAN_PATH}")
        print(f"report-> {REPORT_PATH}")
        return

    if not PLAN_PATH.exists():
        sys.exit("No plan found. Run `python3 ingest_professor_zips.py plan` first.")
    plan = json.loads(PLAN_PATH.read_text(encoding="utf-8"))
    (upload if args.stage == "upload" else apply)(plan, args.dry_run)


if __name__ == "__main__":
    main()
