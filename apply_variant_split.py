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
    touched = sorted({r["lesson_id"] for r in splits} | {r["lesson_id"] for r in keeps})
    snap = {lid: ing._all_items(lid) for lid in touched}
    ART.mkdir(parents=True, exist_ok=True)
    (ART / "rollback_variant_split.json").write_text(
        json.dumps(snap, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"snapshot of {sum(len(v) for v in snap.values())} rows across "
          f"{len(touched)} lessons -> {ART/'rollback_variant_split.json'}")

    if rerec:
        (ART / "rerecord.json").write_text(
            json.dumps([{"row_id": r["row_id"], "lesson_id": r["lesson_id"],
                         "audio_url": r["audio_url"]} for r in rerec],
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
                "lesson_id": r["lesson_id"],
                "french": seg["fr"].strip(),
                "dialect": seg["ln"].strip(),
                # the example belongs to the row as a whole; keep it on the first only
                "example_french": r.get("example_french") if n == 0 else None,
                "example_dialect": r.get("example_dialect") if n == 0 else None,
                "audio_url": f"{base}/{obj}" if obj else None,
                "audio_key": obj,
            })
        r["_new_rows"] = new_rows

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

    # ── 3. text-only edits on kept rows ─────────────────────────────────────
    for r in keeps:
        body = {"french": "\n".join(f"- {s['fr']}" for s in r["segments"] if not s.get("drop"))
                if len({s["fr"] for s in r["segments"]}) > 1 else r["segments"][0]["fr"],
                "dialect": "\n".join(f"- {s['ln']}" for s in r["segments"] if not s.get("drop"))}
        if args.dry_run:
            continue
        requests.patch(f"{ing.SUPABASE_URL}/rest/v1/lesson_items?id=eq.{r['row_id']}",
                       headers=H, json=body, timeout=60).raise_for_status()
    print(f"{'would rewrite' if args.dry_run else 'rewrote'} {len(keeps)} kept rows in place")

    # ── 4. replace split rows ───────────────────────────────────────────────
    made = 0
    for r in splits:
        if not args.dry_run:
            requests.delete(f"{ing.SUPABASE_URL}/rest/v1/lesson_items?id=eq.{r['row_id']}",
                            headers=H, timeout=60).raise_for_status()
            requests.post(f"{ing.SUPABASE_URL}/rest/v1/lesson_items",
                          headers=H, json=r["_new_rows"], timeout=60).raise_for_status()
        made += len(r["_new_rows"])
    print(f"{'would replace' if args.dry_run else 'replaced'} {len(splits)} rows "
          f"with {made} rows (+{made - len(splits)})")

    # ── 5. renumber item_order per touched lesson ───────────────────────────
    if not args.dry_run:
        for lid in touched:
            live = sorted(ing._all_items(lid), key=lambda x: (x["item_order"] or 0, x["id"]))
            for n, row in enumerate(live, 1):
                if row["item_order"] != n:
                    requests.patch(
                        f"{ing.SUPABASE_URL}/rest/v1/lesson_items?id=eq.{row['id']}",
                        headers=H, json={"item_order": n}, timeout=60).raise_for_status()
        print(f"renumbered item_order across {len(touched)} lessons")

    print("\nNext: python3 embed_lesson_items.py --force   (new + edited rows need vectors)")


if __name__ == "__main__":
    main()
