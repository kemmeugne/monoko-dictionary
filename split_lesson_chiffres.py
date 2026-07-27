#!/usr/bin/env python3
"""
P1 — Split lesson 350 "Chiffres, jours et temps" (92 items) into 5 focused
lessons, against PRODUCTION Supabase.

Approach (safe / progress-preserving):
- Re-scope L350 IN PLACE  -> "Les nombres" (keeps id 350, keeps cardinals #1-55,
  so any user_progress on this lesson survives).
- Create 4 NEW lessons in the same course (Niveau 1, id 36) at lesson_order 6-9.
- MOVE the other items to the new lessons (PATCH lesson_id + item_order).
  Text is unchanged -> embeddings stay valid, NO re-embedding needed.
- DELETE the in-lesson duplicate "Saison sèche" (item_order 63; identical to 85).

Safety:
- Service key from env SUPABASE_SERVICE_KEY (never committed).
- Full backup of L350 lesson row + all 92 items BEFORE any write.
- --dry-run shows the whole plan + writes the backup, applies nothing.
- Guard: aborts if the new lesson titles already exist (prevents double-run).
- Verifies counts after applying.
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
COURSE_ID = 36            # Niveau 1 - Fondations
SRC_LESSON = 350
PARENT_THEME = "Niveau 1"
BACKUP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "artifacts", "lesson_backups")

# New/renamed lesson layout. Groups reference SOURCE item_order values.
RENAME_SRC_TITLE = "Les nombres"                 # L350 kept, holds cardinals #1-55
KEEP_ORDERS = list(range(1, 56))                 # cardinals stay in L350
NEW_LESSONS = [
    {"title": "Les nombres ordinaux",      "lesson_order": 6, "src_orders": [56, 57, 58]},
    {"title": "Jours et unités de temps",  "lesson_order": 7, "src_orders": [59, 60, 61, 64, 65, 66, 67, 68, 69, 70, 71]},
    {"title": "Les mois",                  "lesson_order": 8, "src_orders": list(range(72, 84))},
    {"title": "Saisons et l'heure",        "lesson_order": 9, "src_orders": [62, 84, 85, 86, 87, 88, 89, 90, 91, 92]},
]
DELETE_ORDERS = [63]     # duplicate "Saison sèche" (== #85)


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

    items = req("GET", f"lesson_items?lesson_id=eq.{SRC_LESSON}&order=item_order&select=id,item_order,french,dialect")
    by_order = {it["item_order"]: it for it in items}
    src_lesson = req("GET", f"lessons?id=eq.{SRC_LESSON}&select=*")[0]

    # sanity: every referenced order must exist, and the partition must be complete
    referenced = set(KEEP_ORDERS) | set(DELETE_ORDERS)
    for nl in NEW_LESSONS:
        referenced |= set(nl["src_orders"])
    present = set(by_order)
    missing = referenced - present
    unassigned = present - referenced
    print(f"{'DRY-RUN' if DRY else 'LIVE'} — split L{SRC_LESSON} ({len(items)} items)\n")
    if missing:
        sys.exit(f"ERROR: plan references item_orders not present: {sorted(missing)}")
    if unassigned:
        sys.exit(f"ERROR: some items are unassigned by the plan: {sorted(unassigned)}")

    # backup first (always)
    os.makedirs(BACKUP_DIR, exist_ok=True)
    ts = time.strftime("%Y%m%d_%H%M%S")
    bpath = os.path.join(BACKUP_DIR, f"split_L350_{ts}{'_dryrun' if DRY else ''}.json")
    with open(bpath, "w", encoding="utf-8") as fh:
        json.dump({"ts": ts, "lesson": src_lesson, "items": items}, fh, ensure_ascii=False, indent=2)

    def show(order, dst_order):
        it = by_order[order]
        return f"      [{dst_order:>2}] {it['french'][:34]!r:36} -> {it['dialect']}"

    print(f"KEEP  L{SRC_LESSON}  title: {src_lesson['title']!r} -> {RENAME_SRC_TITLE!r}")
    print(f"        cardinals #1-55 stay (item_order unchanged)")
    for nl in NEW_LESSONS:
        print(f"\nNEW   course {COURSE_ID} · order {nl['lesson_order']} · {nl['title']!r}  ({len(nl['src_orders'])} items)")
        for i, o in enumerate(nl["src_orders"], 1):
            print(show(o, i))
    print(f"\nDELETE (in-lesson duplicate):")
    for o in DELETE_ORDERS:
        it = by_order[o]
        print(f"      #{o} {it['french']!r} -> {it['dialect']}  (== #85)")
    print(f"\n  backup: {bpath}")

    if DRY:
        print("\nDRY-RUN complete. Re-run without --dry-run to apply.")
        return

    # guard against double-run
    existing = req("GET", f"lessons?course_id=eq.{COURSE_ID}&select=title")
    titles = {l["title"] for l in existing}
    clash = titles & {nl["title"] for nl in NEW_LESSONS}
    if clash:
        sys.exit(f"ABORT: new titles already exist (already split?): {clash}")

    print("\nApplying...")
    # 1) rename source lesson
    req("PATCH", f"lessons?id=eq.{SRC_LESSON}", {"title": RENAME_SRC_TITLE})
    print(f"  renamed L{SRC_LESSON} -> {RENAME_SRC_TITLE!r}")
    # 2) create new lessons + move their items
    for nl in NEW_LESSONS:
        created = req("POST", "lessons", {"course_id": COURSE_ID, "title": nl["title"],
                                          "parent_theme": PARENT_THEME, "lesson_order": nl["lesson_order"]})[0]
        nid = created["id"]
        for i, o in enumerate(nl["src_orders"], 1):
            req("PATCH", f"lesson_items?id=eq.{by_order[o]['id']}", {"lesson_id": nid, "item_order": i})
        print(f"  created L{nid} {nl['title']!r} + moved {len(nl['src_orders'])} items")
    # 3) delete duplicate(s)
    for o in DELETE_ORDERS:
        req("DELETE", f"lesson_items?id=eq.{by_order[o]['id']}", prefer="return=minimal")
        print(f"  deleted dup item #{o} ({by_order[o]['id']})")

    # verify
    print("\nVerify:")
    for lid_title in [(SRC_LESSON, RENAME_SRC_TITLE)]:
        n = len(req("GET", f"lesson_items?lesson_id=eq.{lid_title[0]}&select=id"))
        print(f"  L{lid_title[0]} {lid_title[1]!r}: {n} items")
    for l in req("GET", f"lessons?course_id=eq.{COURSE_ID}&order=lesson_order&select=id,title,lesson_order"):
        n = len(req("GET", f"lesson_items?lesson_id=eq.{l['id']}&select=id"))
        print(f"  order {l['lesson_order']}: L{l['id']} {l['title']!r} ({n} items)")
    print("\nDone.")


if __name__ == "__main__":
    main()
