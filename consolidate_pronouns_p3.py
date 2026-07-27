#!/usr/bin/env python3
"""
P3 — Consolidate pronouns against PRODUCTION Supabase.

Brings the foundational pronouns into Niveau 1 (L349) and leaves the advanced
ones in Niveau 3. Uses only existing translated + audio rows (no professor input).

- MOVE subject pronouns  Je/Tu/Il/Nous/Vous/Ils  (L386 #1-6) -> L349
- MOVE possessive adj    Mon/Ma/Mes              (L387 #1-3) -> L349
- REORDER L349: subjects, then Mon/Ma/Mes, then Ton…Leurs  (21 items)
- RENAME L349 -> "Pronoms sujets et adjectifs possessifs"
- RENAME L386 -> "Pronoms compléments et toniques" (30 remaining), renumber 1..N
- L387 keeps possessive pronouns + demonstratives (22 remaining), renumber 1..N

Safety: env service key; full backup of L349/L386/L387 before writing;
--dry-run applies nothing; item_order updated in two phases (temp then final)
so no unique-constraint collision is possible.
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

L349, L386, L387 = 349, 386, 387
SUBJ_ORDERS = [1, 2, 3, 4, 5, 6]          # in L386: Je,Tu,Il/Elle,Nous,Vous,Ils/Elles
MON_ORDERS = [1, 2, 3]                     # in L387: Mon,Ma,Mes
EXPECT_SUBJ = ["Je", "Tu", "Il/Elle", "Nous", "Vous", "Ils/Elles"]
EXPECT_MON = ["Mon", "Ma", "Mes"]
RENAME = {L349: "Pronoms sujets et adjectifs possessifs",
          L386: "Pronoms compléments et toniques"}


def req(method, path, body=None, prefer="return=minimal"):
    r = urllib.request.Request(
        f"{URL}/rest/v1/{path}", method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"apikey": KEY, "Authorization": f"Bearer {KEY}",
                 "Content-Type": "application/json", "Prefer": prefer})
    with urllib.request.urlopen(r) as resp:
        raw = resp.read().decode()
        return json.loads(raw) if raw else []


def fetch(lid):
    return req("GET", f"lesson_items?lesson_id=eq.{lid}&order=item_order&select=id,item_order,french,dialect,audio_url",
               prefer="return=representation")


def two_phase(rows_in_order, lesson_id=None):
    """Set rows to final item_order 1..N (and optional new lesson_id) collision-free."""
    for i, r in enumerate(rows_in_order, 1):
        body = {"item_order": 100000 + i}
        if lesson_id is not None:
            body["lesson_id"] = lesson_id
        req("PATCH", f"lesson_items?id=eq.{r['id']}", body)
    for i, r in enumerate(rows_in_order, 1):
        req("PATCH", f"lesson_items?id=eq.{r['id']}", {"item_order": i})


def main():
    if not KEY:
        sys.exit("ERROR: set SUPABASE_SERVICE_KEY.")
    if PROD_REF not in URL:
        sys.exit("ERROR: non-production URL.")

    a, b, c = fetch(L349), fetch(L386), fetch(L387)
    bymo = {L386: {x["item_order"]: x for x in b}, L387: {x["item_order"]: x for x in c}}

    subj = [bymo[L386][o] for o in SUBJ_ORDERS]
    mon = [bymo[L387][o] for o in MON_ORDERS]
    # validate we're grabbing the right rows
    if [x["french"] for x in subj] != EXPECT_SUBJ:
        sys.exit(f"ERROR: subject rows mismatch: {[x['french'] for x in subj]}")
    if [x["french"] for x in mon] != EXPECT_MON:
        sys.exit(f"ERROR: mon/ma/mes rows mismatch: {[x['french'] for x in mon]}")

    l349_final = subj + mon + a                     # a = existing Ton…Leurs, in order
    l386_rest = [x for x in b if x["item_order"] not in SUBJ_ORDERS]
    l387_rest = [x for x in c if x["item_order"] not in MON_ORDERS]

    print(f"{'DRY-RUN' if DRY else 'LIVE'} — P3 pronoun consolidation\n")
    print(f"L349 -> {RENAME[L349]!r}  ({len(l349_final)} items):")
    for i, r in enumerate(l349_final, 1):
        src = "L386" if r in subj else "L387" if r in mon else "L349"
        print(f"   {i:>2}. {r['french'][:22]:24} -> {r['dialect']:14} [{src}]")
    print(f"\nL386 -> {RENAME[L386]!r}  ({len(l386_rest)} items, renumbered 1..{len(l386_rest)})")
    print(f"L387 -> keeps name  ({len(l387_rest)} items, renumbered 1..{len(l387_rest)})")

    os.makedirs(BACKUP_DIR, exist_ok=True)
    ts = time.strftime("%Y%m%d_%H%M%S")
    bpath = os.path.join(BACKUP_DIR, f"pronouns_p3_{ts}{'_dryrun' if DRY else ''}.json")
    with open(bpath, "w", encoding="utf-8") as fh:
        json.dump({"ts": ts, "L349": a, "L386": b, "L387": c}, fh, ensure_ascii=False, indent=2)
    print(f"\n  backup: {bpath}")

    if DRY:
        print("\nDRY-RUN complete. Re-run without --dry-run to apply.")
        return

    print("\nApplying...")
    two_phase(l349_final, lesson_id=L349)   # move subj+mon into L349 and order all 21
    print(f"  L349: consolidated + reordered ({len(l349_final)})")
    two_phase(l386_rest)                     # renumber remaining L386
    print(f"  L386: renumbered ({len(l386_rest)})")
    two_phase(l387_rest)                     # renumber remaining L387
    print(f"  L387: renumbered ({len(l387_rest)})")
    for lid, title in RENAME.items():
        req("PATCH", f"lessons?id=eq.{lid}", {"title": title})
    print(f"  renamed L349, L386")

    print("\nVerify:")
    for lid in (L349, L386, L387):
        t = req("GET", f"lessons?id=eq.{lid}&select=title", prefer="return=representation")[0]["title"]
        n = len(fetch(lid))
        print(f"  L{lid} {t!r}: {n} items")
    print("\nDone.")


if __name__ == "__main__":
    main()
