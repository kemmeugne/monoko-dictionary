#!/usr/bin/env python3
"""
apply_variant_split.py
───────────────────────
Consumes `variant_split_decisions.json` exported by `variant_split_tool.html`
and applies it: cuts each parent clip at the confirmed boundaries, uploads the
segments to R2, replaces the multi-variant row with one row per variant, and
renumbers `item_order` for the affected lessons.

Decisions:
    split     -> N rows (minus any segment marked drop), each with its own clip
    keep      -> left alone, but the edited text is written back
    rerecord  -> left alone; listed in artifacts/professor_ingest/rerecord.json
                 so `generate-todo-recording-files` can build an "à refaire" page

Every touched lesson is snapshotted first. Safe to re-run: rows already split are
no longer multi-variant, so a second pass over the same file is a no-op.

Usage:
    python3 apply_variant_split.py --decisions variant_split_decisions.json --dry-run
    python3 apply_variant_split.py --decisions variant_split_decisions.json
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

import requests

import ingest_professor_zips as ing

MP3_CACHE = Path("artifacts/professor_ingest/mp3")
SPLIT_CACHE = Path("artifacts/professor_ingest/mp3_split")
ART = Path("artifacts/professor_ingest")


def cut(src: Path, dst: Path, start: float, end: float | None) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    cmd = ["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", str(src), "-ss", f"{start:.3f}"]
    if end is not None:
        cmd += ["-to", f"{end:.3f}"]
    cmd += ["-ac", "1", "-b:a", "128k", "-codec:a", "libmp3lame", str(dst)]
    subprocess.run(cmd, check=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--decisions", default="variant_split_decisions.json")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    key = ing.service_key()
    base = "https://pub-78d23bf07fce46b3adc19df91148ffb8.r2.dev"
    doc = json.loads(Path(args.decisions).read_text(encoding="utf-8"))
    rows = doc["rows"]

    _, lessons, items = ing.fetch_db()
    splits = [r for r in rows if r["decision"] == "split"]
    keeps = [r for r in rows if r["decision"] == "keep"]
    rerec = [r for r in rows if r["decision"] == "rerecord"]

    print(f"decisions: {len(splits)} split, {len(keeps)} keep, {len(rerec)} re-record")

    # snapshot every lesson we are about to touch
    touched = sorted({r["lesson_id"] for r in splits + keeps + rerec})
    snap = {lid: ing._all_items(lid) for lid in touched}
    ART.mkdir(parents=True, exist_ok=True)
    (ART / "rollback_variant_split.json").write_text(
        json.dumps(snap, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"snapshot of {sum(len(v) for v in snap.values())} rows across "
          f"{len(touched)} lessons -> {ART/'rollback_variant_split.json'}")

    if rerec:
        # Carry the corrected text through, so the "à refaire" page shows the
        # professor the sentence he should actually be reading.
        (ART / "rerecord.json").write_text(
            json.dumps([{"row_id": r["row_id"], "lesson_id": r["lesson_id"],
                         "lesson": lessons[r["lesson_id"]]["title"],
                         "audio_url": r["audio_url"],
                         "variants": [{"fr": s["fr"], "ln": s["ln"]}
                                      for s in r["segments"] if not s.get("drop")]}
                        for r in rerec],
                       ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"{len(rerec)} rows flagged for re-record -> {ART/'rerecord.json'}")

    # ── 1. cut audio ────────────────────────────────────────────────────────
    planned: list[dict] = []
    for r in splits:
        keep_segs = [(k, s) for k, s in enumerate(r["segments"]) if not s.get("drop")]
        src_key = (r["audio_url"] or "").split("/Lingala/lesson_items/")[-1]
        src = MP3_CACHE / src_key
        cuts = sorted(r.get("cuts") or [])
        bounds = [0.0] + cuts + [None]
        new_rows = []
        for n, (k, seg) in enumerate(keep_segs):
            obj = None
            if r["audio_url"] and src.exists() and len(bounds) > k + 1:
                stem = src_key.rsplit(".", 1)[0]
                obj = f"Lingala/lesson_items/{stem}_v{k+1}.mp3"
                dst = SPLIT_CACHE / obj.split("/Lingala/lesson_items/")[-1]
                if not args.dry_run and not dst.exists():
                    cut(src, dst, bounds[k], bounds[k + 1])
                planned.append({"path": dst, "object_key": obj})
            new_rows.append({
                "french": seg["fr"].strip(),
                "dialect": seg["ln"].strip(),
                "audio_url": f"{base}/{obj}" if obj else None,
                "audio_key": obj,
            })
        # The course shows ONE way to say a thing; the alternatives still teach
        # the model, so they go to parallel_sentences instead of cluttering the
        # lesson. The first surviving variant keeps the existing lesson_items
        # row — updating in place means no delete/reinsert, so item_order,
        # user_progress and every FK stay intact.
        r["_course_row"] = new_rows[0] if new_rows else None
        r["_corpus_rows"] = new_rows[1:]

    print(f"\n{'would cut' if args.dry_run else 'cut'} {len(planned)} audio segments")
    if args.dry_run:
        for p in planned[:5]:
            print(f"   {p['object_key']}")
        print(f"   ... {len(planned)} total")

    # ── 2. upload ───────────────────────────────────────────────────────────
    if not args.dry_run and planned:
        import boto3, os
        s3 = boto3.client(
            "s3", endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
            aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
            aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"], region_name="auto")
        for n, p in enumerate(planned, 1):
            s3.upload_file(str(p["path"]), os.environ.get("R2_BUCKET", "audios"),
                           p["object_key"], ExtraArgs={"ContentType": "audio/mpeg"})
            if n % 25 == 0 or n == len(planned):
                print(f"   uploaded {n}/{len(planned)}")

    H = {**ing.headers(key), "Content-Type": "application/json", "Prefer": "return=minimal"}

    # ── 3. text edits on rows that keep their single row ────────────────────
    # `rerecord` rows are included: the audio needs redoing, but the French was
    # often a stub prompt ("Proverbe sur l'union qui fait la force") that gets
    # replaced with the real sentence during review. That edit must survive even
    # though the clip is being sent back.
    rewritten = 0
    for r in keeps + rerec:
        live = [s for s in r["segments"] if not s.get("drop")]
        if not live:
            continue
        frs = {s["fr"].strip() for s in live}
        body = {
            "french": "\n".join(f"- {s['fr'].strip()}" for s in live)
                      if len(frs) > 1 else live[0]["fr"].strip(),
            "dialect": "\n".join(f"- {s['ln'].strip()}" for s in live),
        }
        rewritten += 1
        if args.dry_run:
            continue
        requests.patch(f"{ing.SUPABASE_URL}/rest/v1/lesson_items?id=eq.{r['row_id']}",
                       headers=H, json=body, timeout=60).raise_for_status()
    print(f"{'would rewrite' if args.dry_run else 'rewrote'} {rewritten} rows in place "
          f"({len(keeps)} kept + {len(rerec)} flagged for re-record)")

    # ── 4. course keeps variant 1, in place ─────────────────────────────────
    updated = 0
    for r in splits:
        cr = r.get("_course_row")
        if not cr:
            continue
        updated += 1
        if args.dry_run:
            continue
        requests.patch(f"{ing.SUPABASE_URL}/rest/v1/lesson_items?id=eq.{r['row_id']}",
                       headers=H, json={**cr, "embedding": None}, timeout=60).raise_for_status()
    print(f"{'would update' if args.dry_run else 'updated'} {updated} lesson rows "
          f"to their first variant (row ids preserved, no renumbering)")

    # ── 5. alternatives -> RAG corpus ───────────────────────────────────────
    existing = {
        (ing.norm(p["french_text"]), ing.norm(p["lingala_text"]))
        for p in ing.paginate("parallel_sentences",
                              "select=french_text,lingala_text&language_id=eq.1")
    }
    corpus, dupes = [], 0
    for r in splits:
        for cr in r.get("_corpus_rows", []):
            fr, ln = cr["french"], cr["dialect"]
            if not fr or not ln:
                continue
            if (ing.norm(fr), ing.norm(ln)) in existing:
                dupes += 1
                continue
            existing.add((ing.norm(fr), ing.norm(ln)))
            corpus.append({"language_id": 1, "french_text": fr, "lingala_text": ln,
                           "source": "course_variant", "quality": "verified"})
    print(f"{'would add' if args.dry_run else 'adding'} {len(corpus)} alternatives to "
          f"parallel_sentences (skipped {dupes} already present)")
    if corpus and not args.dry_run:
        for i in range(0, len(corpus), 200):
            requests.post(f"{ing.SUPABASE_URL}/rest/v1/parallel_sentences",
                          headers=H, json=corpus[i:i + 200], timeout=120).raise_for_status()

    # parallel_sentences has no audio column, but the cut clips are real
    # (audio, transcript) pairs — exactly what the professor-voice TTS
    # fine-tune consumes. Record the mapping so they are not lost.
    tts = [{"object_key": cr["audio_key"], "url": cr["audio_url"], "dialect": cr["dialect"],
            "french": cr["french"]}
           for r in splits for cr in r.get("_corpus_rows", []) if cr.get("audio_key")]
    (ART / "variant_clips_for_tts.json").write_text(
        json.dumps(tts, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{len(tts)} extra clips recorded for TTS fine-tuning -> "
          f"{ART/'variant_clips_for_tts.json'}")

    print("\nNext:")
    print("  python3 embed_lesson_items.py --force      # edited lesson rows")
    print("  python3 embed_parallel_sentences.py        # the new corpus rows")


if __name__ == "__main__":
    main()
