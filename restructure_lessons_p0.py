#!/usr/bin/env python3
"""
P0 lesson-structure fixes against PRODUCTION Supabase.

Safety:
- Reads the service key from env var SUPABASE_SERVICE_KEY (never hardcoded/committed).
- Backs up every affected row to artifacts/lesson_backups/ BEFORE any write.
- --dry-run shows the diff and writes the backup, but applies nothing.
- Verifies each change by re-reading after the write.

Current P0 scope (approved 2026-07-27):
- Retitle lesson 366  "La ville et les lieux" -> "Couleurs et vêtements"
  (content is actually colours + clothing; pure metadata fix).
Deferred by decision: conjugation rebuild (waits on professor recordings);
placeholders left visible.
"""
import json
import os
import sys
import time
import urllib.request

URL = "https://haioiccujncsehadipzb.supabase.co"
PROD_REF = "haioiccujncsehadipzb"
KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
DRY = "--dry-run" in sys.argv

BACKUP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "artifacts", "lesson_backups")

# --- operations: each is a PATCH to one row, with a human-readable summary ---
OPS = [
    {
        "table": "lessons",
        "id": 366,
        "patch": {"title": "Couleurs et vêtements"},
        "why": "Mislabeled: content is colours (#1-10) + clothing (#11-29), no city/places.",
    },
]


def req(method, path, body=None):
    r = urllib.request.Request(
        f"{URL}/rest/v1/{path}",
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            "apikey": KEY,
            "Authorization": f"Bearer {KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
    )
    with urllib.request.urlopen(r) as resp:
        raw = resp.read().decode()
        return json.loads(raw) if raw else []


def main():
    if not KEY:
        sys.exit("ERROR: set SUPABASE_SERVICE_KEY in the environment.")
    if PROD_REF not in URL:
        sys.exit("ERROR: refusing to run against a non-production URL.")

    os.makedirs(BACKUP_DIR, exist_ok=True)
    ts = time.strftime("%Y%m%d_%H%M%S")
    backup = {"ts": ts, "url": URL, "rows": []}

    print(f"{'DRY-RUN' if DRY else 'LIVE'} — {len(OPS)} operation(s)\n")

    for op in OPS:
        table, rid, patch = op["table"], op["id"], op["patch"]
        before = req("GET", f"{table}?id=eq.{rid}&select=*")
        if not before:
            print(f"  ! {table} id={rid}: NOT FOUND — skipping")
            continue
        before = before[0]
        # keep only the columns we touch (plus id) in the backup for clarity
        backup["rows"].append({"table": table, "id": rid, "before": before})
        print(f"  {table} id={rid}")
        print(f"    why : {op['why']}")
        for k, v in patch.items():
            print(f"    {k}: {before.get(k)!r}  ->  {v!r}")

    # always write the backup (even in dry-run) so we have a pre-change snapshot
    bpath = os.path.join(BACKUP_DIR, f"p0_{ts}{'_dryrun' if DRY else ''}.json")
    with open(bpath, "w", encoding="utf-8") as fh:
        json.dump(backup, fh, ensure_ascii=False, indent=2)
    print(f"\n  backup written: {os.path.relpath(bpath, os.path.dirname(bpath))}  -> {bpath}")

    if DRY:
        print("\nDRY-RUN complete. Re-run without --dry-run to apply.")
        return

    print("\nApplying...")
    for op in OPS:
        table, rid, patch = op["table"], op["id"], op["patch"]
        req("PATCH", f"{table}?id=eq.{rid}", patch)
        after = req("GET", f"{table}?id=eq.{rid}&select=*")[0]
        ok = all(after.get(k) == v for k, v in patch.items())
        print(f"  {table} id={rid}: {'✓ verified' if ok else '✗ MISMATCH'} -> "
              + ", ".join(f"{k}={after.get(k)!r}" for k in patch))
    print("\nDone.")


if __name__ == "__main__":
    main()
