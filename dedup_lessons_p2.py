#!/usr/bin/env python3
"""
P2 — Deduplicate lesson content against PRODUCTION Supabase.

Operations (selected by (lesson_id, item_order), validated by showing french):
- DELETE duplicates whose identical twin survives in the canonical lesson.
- MOVE the unique family kin-terms from Présentation into Famille.

Decisions (approved 2026-07-27):
1. Kitchen objects -> keep in Maison (L352); delete 11 dups from Cuisine (L372 #56-66).
2. Opinions        -> keep in Débats (L368); delete 22 dups from Sentiments (L360 #9-30).
3. Family          -> move kin+Ancêtre from Présentation (L348) to Famille (L351);
                      delete 6 exact dups from L348 (fixes Fille/Fils swap);
                      leave Ami/Femme/Homme/Mariage/Grossesse/Bénédiction/Malédiction/
                      La vie/La mort in Présentation.
4. Langue phrases  -> keep in LangueMonde (L374); delete 3 dups from Présentation (L348 #31-33).

Safety: service key from env; full backup of every affected row before writing;
--dry-run shows exactly which french rows are deleted/moved and applies nothing.
Deleting a lesson_items row does NOT touch the Cloudflare R2 audio file.
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

# DELETE: {lesson_id: [item_orders]}  (dups with a surviving twin elsewhere)
DELETES = {
    372: list(range(56, 67)),                       # Cuisine: 11 kitchen objects (keep Maison)
    360: list(range(9, 31)),                         # Sentiments: 22 opinions (keep Débats)
    348: [10, 11, 13, 15, 16, 22, 31, 32, 33],       # Présentation: 6 family dups + 3 langue dups
}
# MOVE: (src_lesson, [item_orders], dst_lesson)
MOVES = [
    (348, [12, 14, 18, 19, 20, 26], 351),            # Présentation kin+Ancêtre -> Famille
]


def req(method, path, body=None, prefer="return=representation"):
    r = urllib.request.Request(
        f"{URL}/rest/v1/{path}", method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"apikey": KEY, "Authorization": f"Bearer {KEY}",
                 "Content-Type": "application/json", "Prefer": prefer})
    with urllib.request.urlopen(r) as resp:
        raw = resp.read().decode()
        return json.loads(raw) if raw else []


def fetch(lid):
    return {it["item_order"]: it for it in
            req("GET", f"lesson_items?lesson_id=eq.{lid}&order=item_order&select=id,item_order,french,dialect,audio_url")}


def main():
    if not KEY:
        sys.exit("ERROR: set SUPABASE_SERVICE_KEY.")
    if PROD_REF not in URL:
        sys.exit("ERROR: non-production URL.")

    print(f"{'DRY-RUN' if DRY else 'LIVE'} — P2 dedup\n")
    backup = {"ts": time.strftime("%Y%m%d_%H%M%S"), "deletes": [], "moves": []}

    # resolve + validate DELETES
    del_rows = []   # (lesson_id, row)
    for lid, orders in DELETES.items():
        m = fetch(lid)
        print(f"DELETE from L{lid}:")
        for o in orders:
            if o not in m:
                sys.exit(f"  ERROR: L{lid} item_order {o} not found (data shifted?)")
            row = m[o]
            del_rows.append((lid, row))
            backup["deletes"].append({"lesson_id": lid, **row})
            print(f"   #{o:>3} {row['french'][:40]!r:42} -> {row['dialect']}")
        print()

    # resolve + validate MOVES
    move_ops = []   # (row, dst, new_order)
    for src, orders, dst in MOVES:
        m = fetch(src)
        dst_items = fetch(dst)
        base = max(dst_items) if dst_items else 0
        print(f"MOVE L{src} -> L{dst} (append from item_order {base+1}):")
        for i, o in enumerate(orders, 1):
            if o not in m:
                sys.exit(f"  ERROR: L{src} item_order {o} not found")
            row = m[o]
            move_ops.append((row, dst, base + i))
            backup["moves"].append({"src_lesson": src, "dst_lesson": dst, "new_order": base + i, **row})
            print(f"   #{o:>3} {row['french'][:40]!r:42} -> L{dst} #{base+i}")
        print()

    os.makedirs(BACKUP_DIR, exist_ok=True)
    bpath = os.path.join(BACKUP_DIR, f"dedup_p2_{backup['ts']}{'_dryrun' if DRY else ''}.json")
    with open(bpath, "w", encoding="utf-8") as fh:
        json.dump(backup, fh, ensure_ascii=False, indent=2)
    print(f"  backup: {bpath}")
    print(f"  totals: delete {len(del_rows)} rows, move {len(move_ops)} rows")

    if DRY:
        print("\nDRY-RUN complete. Re-run without --dry-run to apply.")
        return

    print("\nApplying...")
    for row, dst, new_order in move_ops:
        req("PATCH", f"lesson_items?id=eq.{row['id']}", {"lesson_id": dst, "item_order": new_order}, prefer="return=minimal")
    print(f"  moved {len(move_ops)} rows")
    for lid, row in del_rows:
        req("DELETE", f"lesson_items?id=eq.{row['id']}", prefer="return=minimal")
    print(f"  deleted {len(del_rows)} rows")

    print("\nVerify affected lessons:")
    for lid in sorted(set(DELETES) | {d for _, _, d in MOVES} | {s for s, _, _ in MOVES}):
        n = len(req("GET", f"lesson_items?lesson_id=eq.{lid}&select=id"))
        t = req("GET", f"lessons?id=eq.{lid}&select=title")[0]["title"]
        print(f"  L{lid} {t!r}: {n} items")
    print("\nDone.")


if __name__ == "__main__":
    main()
