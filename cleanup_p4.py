#!/usr/bin/env python3
"""
P4 — Minor cleanup deletions against PRODUCTION Supabase.

Deletes duplicate rows whose translated twin survives in the canonical lesson.
Every row deleted here is an UNTRANSLATED (empty-dialect) or exact duplicate.

- Déplacements (L356): #37 "Je suis perdu(e)" (dup of #14)
- Marché (L362): #12/#13/#18 (untranslated dups of #1/#2/#3)
- Nature et éléments (L388): #15 Jour (dup Jours&unités), #26/#27 seasons (dup
  Saisons et l'heure), #35 Verre (dup Maison)

Safety: env service key; full backup of deleted rows first; --dry-run applies nothing.
(The Salutations split is handled by split_lesson.py L347.)
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

DELETES = {
    356: [37],
    362: [12, 13, 18],
    388: [15, 26, 27, 35],
}


def req(method, path, body=None, prefer="return=representation"):
    r = urllib.request.Request(
        f"{URL}/rest/v1/{path}", method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"apikey": KEY, "Authorization": f"Bearer {KEY}",
                 "Content-Type": "application/json", "Prefer": prefer})
    with urllib.request.urlopen(r) as resp:
        raw = resp.read().decode()
        return json.loads(raw) if raw else []


def main():
    if not KEY:
        sys.exit("ERROR: set SUPABASE_SERVICE_KEY.")
    if PROD_REF not in URL:
        sys.exit("ERROR: non-production URL.")

    print(f"{'DRY-RUN' if DRY else 'LIVE'} — P4 cleanup\n")
    rows = []
    for lid, orders in DELETES.items():
        m = {it["item_order"]: it for it in
             req("GET", f"lesson_items?lesson_id=eq.{lid}&order=item_order&select=id,item_order,french,dialect")}
        print(f"DELETE from L{lid}:")
        for o in orders:
            if o not in m:
                sys.exit(f"  ERROR: L{lid} item_order {o} not found (data shifted?)")
            r = m[o]
            rows.append((lid, r))
            print(f"   #{o:>3} {r['french'][:40]!r:42} -> {r['dialect'] or '(empty)'}")
        print()

    os.makedirs(BACKUP_DIR, exist_ok=True)
    ts = time.strftime("%Y%m%d_%H%M%S")
    bpath = os.path.join(BACKUP_DIR, f"cleanup_p4_{ts}{'_dryrun' if DRY else ''}.json")
    with open(bpath, "w", encoding="utf-8") as fh:
        json.dump({"ts": ts, "deleted": [{"lesson_id": lid, **r} for lid, r in rows]}, fh, ensure_ascii=False, indent=2)
    print(f"  backup: {bpath}\n  total: delete {len(rows)} rows")

    if DRY:
        print("\nDRY-RUN complete. Re-run without --dry-run to apply.")
        return

    print("\nApplying...")
    for lid, r in rows:
        req("DELETE", f"lesson_items?id=eq.{r['id']}", prefer="return=minimal")
    print(f"  deleted {len(rows)} rows")
    for lid in DELETES:
        t = req("GET", f"lessons?id=eq.{lid}&select=title")[0]["title"]
        n = len(req("GET", f"lesson_items?lesson_id=eq.{lid}&select=id"))
        print(f"  L{lid} {t!r}: {n} items")
    print("\nDone.")


if __name__ == "__main__":
    main()
