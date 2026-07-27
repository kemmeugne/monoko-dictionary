#!/usr/bin/env python3
"""
Generic P1 lesson splitter against PRODUCTION Supabase.

Splits one oversized lesson into several focused lessons by CONTIGUOUS
item_order ranges (so headword + its example sentences stay together).

Safe / progress-preserving:
- Re-scope the source lesson IN PLACE (keeps its id -> user_progress survives),
  holding the first range; create new lessons for the rest and MOVE items
  (PATCH lesson_id + item_order). Text unchanged -> embeddings valid, NO re-embed.
- Service key from env SUPABASE_SERVICE_KEY (never committed).
- Backs up the source lesson row + all its items BEFORE any write.
- --dry-run prints the whole plan + writes the backup, applies nothing.
- Guard: aborts if the new titles already exist (prevents double-run).
- Validates the partition covers every item exactly once.

Configure via CONFIG below, then:  python3 split_lesson.py [--dry-run]
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


def rng(a, b):
    return list(range(a, b + 1))


# ---- CONFIGS: pick one via CLI arg, e.g. `python3 split_lesson.py L363` ----
# New lessons are inserted immediately AFTER the kept lesson (later lessons shift down),
# so the split siblings stay consecutive.
CONFIGS = {
    # L361 already applied (kept for reference / re-run guard will abort).
    "L361": {
        "src_lesson": 361, "course_id": 38, "parent_theme": "Niveau 3",
        "keep_title": "Conjonctions", "keep_orders": rng(1, 12),
        "new_lessons": [
            {"title": "Pronoms relatifs",                     "src_orders": rng(13, 24)},
            {"title": "Comparatifs et superlatifs",           "src_orders": rng(25, 30)},
            {"title": "Adverbes de fréquence",                "src_orders": rng(31, 40)},
            {"title": "Prépositions de lieu",                 "src_orders": rng(41, 98)},
            {"title": "Prépositions de temps",                "src_orders": rng(99, 116)},
            {"title": "Prépositions et mots de liaison",      "src_orders": rng(117, 139)},
            {"title": "Adverbes de quantité et de degré",     "src_orders": rng(140, 176)},
            {"title": "Pronoms personnels",                   "src_orders": rng(177, 212)},
            {"title": "Pronoms possessifs et démonstratifs",  "src_orders": rng(213, 237)},
        ],
        "delete_orders": [],
    },
    # L363 "Nature et animaux" (75) -> Animaux / Nature et éléments / Météo
    "L363": {
        "src_lesson": 363, "course_id": 39, "parent_theme": "Niveau 4",
        "keep_title": "Animaux", "keep_orders": rng(1, 34),
        "new_lessons": [
            {"title": "Nature et éléments", "src_orders": rng(35, 69)},
            {"title": "Météo",              "src_orders": rng(70, 75)},
        ],
        "delete_orders": [],
    },
    # L354 "Corps et santé" (50) -> La santé (+#33 injury) / Compréhension / Le corps
    # deletes #31 (duplicate of #29 "Qu'est-ce que ça veut dire ?")
    "L354": {
        "src_lesson": 354, "course_id": 37, "parent_theme": "Niveau 2",
        "keep_title": "La santé", "keep_orders": rng(1, 24) + [33],
        "new_lessons": [
            {"title": "Compréhension et communication", "src_orders": [25, 26, 27, 28, 29, 30, 32]},
            {"title": "Le corps",                       "src_orders": rng(34, 50)},
        ],
        "delete_orders": [31],
    },
}

_sel = [a for a in sys.argv[1:] if not a.startswith("-")]
CONFIG = CONFIGS[_sel[0]] if _sel else None


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

    if CONFIG is None:
        sys.exit("Select a config: " + ", ".join(CONFIGS) +
                 "   e.g. python3 split_lesson.py L363 --dry-run")
    c = CONFIG
    src = c["src_lesson"]
    items = req("GET", f"lesson_items?lesson_id=eq.{src}&order=item_order&select=id,item_order,french,dialect")
    by_order = {it["item_order"]: it for it in items}
    src_row = req("GET", f"lessons?id=eq.{src}&select=*")[0]

    # validate partition
    assigned = list(c["keep_orders"]) + list(c["delete_orders"])
    for nl in c["new_lessons"]:
        assigned += nl["src_orders"]
    present = set(by_order)
    dupes = {o for o in assigned if assigned.count(o) > 1}
    print(f"{'DRY-RUN' if DRY else 'LIVE'} — split L{src} ({len(items)} items) into "
          f"{1 + len(c['new_lessons'])} lessons\n")
    if dupes:
        sys.exit(f"ERROR: item_orders assigned more than once: {sorted(dupes)}")
    if set(assigned) != present:
        sys.exit(f"ERROR: partition mismatch. missing={sorted(present-set(assigned))} "
                 f"extra={sorted(set(assigned)-present)}")

    os.makedirs(BACKUP_DIR, exist_ok=True)
    ts = time.strftime("%Y%m%d_%H%M%S")
    bpath = os.path.join(BACKUP_DIR, f"split_L{src}_{ts}{'_dryrun' if DRY else ''}.json")
    with open(bpath, "w", encoding="utf-8") as fh:
        json.dump({"ts": ts, "lesson": src_row, "items": items}, fh, ensure_ascii=False, indent=2)

    print(f"KEEP  L{src}: {src_row['title']!r} -> {c['keep_title']!r}  ({len(c['keep_orders'])} items, #{c['keep_orders'][0]}-{c['keep_orders'][-1]})")
    for nl in c["new_lessons"]:
        o = nl["src_orders"]
        sample = by_order[o[0]]["french"][:32]
        print(f"NEW   {nl['title']!r}  ({len(o)} items, #{o[0]}-{o[-1]})   e.g. {sample!r}")
    if c["delete_orders"]:
        print(f"DELETE: {c['delete_orders']}")
    print(f"\n  backup: {bpath}")

    if DRY:
        print("\nDRY-RUN complete. Re-run without --dry-run to apply.")
        return

    existing = req("GET", f"lessons?course_id=eq.{c['course_id']}&select=id,title,lesson_order")
    clash = {l["title"] for l in existing} & {nl["title"] for nl in c["new_lessons"]}
    if clash:
        sys.exit(f"ABORT: new titles already exist (already split?): {clash}")

    kept_order = src_row["lesson_order"]
    n_new = len(c["new_lessons"])

    print("\nApplying...")
    req("PATCH", f"lessons?id=eq.{src}", {"title": c["keep_title"]})
    print(f"  renamed L{src} -> {c['keep_title']!r} (kept @order {kept_order})")
    # shift later lessons down by n_new (descending, to dodge any unique collisions)
    for l in sorted([x for x in existing if x["lesson_order"] > kept_order],
                    key=lambda x: -x["lesson_order"]):
        req("PATCH", f"lessons?id=eq.{l['id']}", {"lesson_order": l["lesson_order"] + n_new})
    # create new lessons immediately after the kept one, moving their items in
    for i, nl in enumerate(c["new_lessons"]):
        order = kept_order + 1 + i
        created = req("POST", "lessons", {"course_id": c["course_id"], "title": nl["title"],
                                          "parent_theme": c["parent_theme"], "lesson_order": order})[0]
        nid = created["id"]
        for j, o in enumerate(nl["src_orders"], 1):
            req("PATCH", f"lesson_items?id=eq.{by_order[o]['id']}", {"lesson_id": nid, "item_order": j})
        print(f"  created L{nid} {nl['title']!r} @order {order} + moved {len(nl['src_orders'])} items")
    for o in c["delete_orders"]:
        req("DELETE", f"lesson_items?id=eq.{by_order[o]['id']}", prefer="return=minimal")
        print(f"  deleted #{o}")

    print("\nVerify (course lessons):")
    for l in req("GET", f"lessons?course_id=eq.{c['course_id']}&order=lesson_order&select=id,title,lesson_order"):
        n = len(req("GET", f"lesson_items?lesson_id=eq.{l['id']}&select=id"))
        print(f"  order {l['lesson_order']:>2}: L{l['id']} {l['title']!r} ({n})")
    print("\nDone.")


if __name__ == "__main__":
    main()
