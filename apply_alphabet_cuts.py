#!/usr/bin/env python3
"""
Applies the decisions from alphabet_cut_tool.html: cuts each L346 clip down to
the word, uploads to R2, and repoints lesson_pool at the new object.

    SUPABASE_SERVICE_KEY=... R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... \
    R2_SECRET_ACCESS_KEY=... python3 apply_alphabet_cuts.py alphabet_cut_decisions.json

    --dry-run   cut locally and report, upload and write nothing

WHY THE WHOLE LESSON IS RE-CUT, INCLUDING THE 21 ALREADY ON DICTIONARY AUDIO
21 of the 46 words exist in the dictionary and were repointed there by
populate_alphabet_pool.py. Those recordings are clean, but they come from a
different session than the course clips, so a lesson mixing them plays at two
different levels. Cutting all 46 from the course audio gives one consistent
take, and drops the dictionary dependency for this lesson entirely.

The new objects are stamped `_word` and keep the original in place. Reusing the
key would overwrite an object the database still points at, and serve a stale
cached copy to anyone who had already heard it -- the same rule the professor
ZIP ingest follows.
"""
import argparse, json, os, subprocess, sys, urllib.request
from datetime import datetime
from pathlib import Path

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://haioiccujncsehadipzb.supabase.co").rstrip("/")
R2_PUBLIC = "https://pub-78d23bf07fce46b3adc19df91148ffb8.r2.dev"
R2_PREFIX = "Lingala/lesson_items/1.1"
CACHE = Path(".alphabet_clips")
CUTS = Path(".alphabet_cuts")
ROLLBACK_DIR = Path("artifacts/lesson_backups")


def key() -> str:
    k = os.environ.get("SUPABASE_SERVICE_KEY")
    if not k:
        sys.exit("SUPABASE_SERVICE_KEY not set")
    return k


def patch(path, data):
    r = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{path}", data=json.dumps(data).encode(),
        headers={"apikey": key(), "Authorization": f"Bearer {key()}",
                 "Content-Type": "application/json", "Prefer": "return=minimal"},
        method="PATCH")
    urllib.request.urlopen(r).read()


def get(path):
    r = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/{path}",
                               headers={"apikey": key(), "Authorization": f"Bearer {key()}"})
    return json.load(urllib.request.urlopen(r))


def fetch(url: str, dest: Path):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    dest.write_bytes(urllib.request.urlopen(req).read())


def cut(src: Path, dst: Path, start: float, end: float):
    """Re-encode rather than stream-copy: an mp3 copy can only cut on a frame
    boundary, which slurs the first syllable of a word that starts mid-frame."""
    subprocess.run(
        ["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", str(src),
         "-ss", f"{start:.3f}", "-to", f"{end:.3f}",
         "-ac", "1", "-b:a", "128k", str(dst)], check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("decisions")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    decisions = json.loads(Path(args.decisions).read_text())
    unconfirmed = [d for d in decisions if not d.get("confirmed")]
    if unconfirmed:
        print(f"! {len(unconfirmed)} clip(s) not confirmed in the tool; they will be left alone:")
        for d in unconfirmed[:8]:
            print(f"    {d['lingala']}  ({d['file']})")

    todo = [d for d in decisions if d.get("confirmed") and not d.get("skip")]
    print(f"\n{len(todo)} clip(s) to cut, of {len(decisions)}")

    CACHE.mkdir(exist_ok=True)
    CUTS.mkdir(exist_ok=True)
    made = []
    for d in todo:
        src = CACHE / d["file"]
        if not src.exists():
            fetch(d["src"], src)
        stem = Path(d["file"]).stem
        out = CUTS / f"{stem}_word.mp3"
        cut(src, out, d["start"], d["end"])
        made.append({**d, "path": str(out), "key": f"{R2_PREFIX}/{out.name}",
                     "seconds": round(d["end"] - d["start"], 3)})
        print(f"   {d['lingala']:<20} {d['start']:5.2f}–{d['end']:5.2f}  "
              f"({d['end']-d['start']:.2f}s)  -> {out.name}")

    if args.dry_run:
        print(f"\n--dry-run: {len(made)} file(s) written to {CUTS}/, nothing uploaded or saved.")
        print("Listen to them, then re-run without --dry-run.")
        return

    missing = [v for v in ("R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY")
               if not os.environ.get(v)]
    if missing:
        sys.exit(f"missing R2 credentials: {', '.join(missing)}\n"
                 f"The cuts are in {CUTS}/ — re-run with the credentials set to upload them.")
    try:
        import boto3
    except ImportError:
        sys.exit(f"boto3 not installed (pip3 install boto3). The cuts are in {CUTS}/.")

    # Rollback BEFORE any write, like every other data script here.
    pool = {r["id"]: r for r in get(f"lesson_pool?lesson_id=eq.346&select=id,audio_url")}
    ROLLBACK_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    rb = ROLLBACK_DIR / f"alphabet_cuts_{stamp}.json"
    rb.write_text(json.dumps(
        [{"id": m["id"], "audio_url": pool.get(m["id"], {}).get("audio_url")} for m in made],
        ensure_ascii=False, indent=1))
    print(f"\nrollback written: {rb}")

    s3 = boto3.client("s3",
                      endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
                      aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
                      aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
                      region_name="auto")
    bucket = os.environ.get("R2_BUCKET", "audios")
    for m in made:
        s3.upload_file(m["path"], bucket, m["key"], ExtraArgs={"ContentType": "audio/mpeg"})
    print(f"uploaded {len(made)} object(s) to r2://{bucket}/{R2_PREFIX}/")

    for m in made:
        patch(f"lesson_pool?id=eq.{m['id']}", {"audio_url": f"{R2_PUBLIC}/{m['key']}"})
    print(f"repointed {len(made)} lesson_pool row(s) at the cut audio")

    total = sum(m["seconds"] for m in made)
    print(f"\ndone. {len(made)} words, {total:.1f}s of audio, median "
          f"{sorted(m['seconds'] for m in made)[len(made)//2]:.2f}s a word.")


if __name__ == "__main__":
    main()
