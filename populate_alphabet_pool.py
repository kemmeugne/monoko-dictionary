#!/usr/bin/env python3
"""
Makes "Sons et alphabet" (L346) usable as exercise material.

    SUPABASE_SERVICE_KEY=... python3 populate_alphabet_pool.py [--dry-run]

WHY THIS EXISTS
L346 stores each row as a TEACHING LABEL plus a gloss:

    french = 'Consonne B — Maladie'      lingala = 'Bokono'

and the professor's clip reads the letter before the word: "B ... Bokono".
That is right for the lesson page, which teaches the sound. It is wrong for
every exercise built from it:

  * match-pairs pairs "Consonne B" with the word starting in B. 30 of the 46
    native rows are solvable that way with no Lingala at all.
  * choose-the-audio shows the French, which names the letter, and the clip
    opens by pronouncing that letter.

Neither is a bug in the engine — the rows are well-formed and short, so every
builder happily uses them. The fix is in the material.

WHAT IT CHANGES, IN `lesson_pool` ONLY
  1. french     'Consonne B — Maladie'  ->  'Maladie'
     The gloss is the professor's own French for this lesson. Nothing is
     translated and nothing is looked up: only the label prefix is dropped, and
     with it the giveaway.
  2. audio_url  the letter-first course clip  ->  the DICTIONARY's recording of
     the bare word, where the word is in the dictionary (21 of 46).

`lesson_items` is untouched, so the lesson page keeps showing
'Consonne B — Maladie' with the letter-first clip. That is the teaching
surface; `lesson_pool` is the exercise surface. They are allowed to differ, and
here they must.

WHY ONLY THE AUDIO COMES FROM THE DICTIONARY
The dictionary's French is often a DIFFERENT SENSE of the word: Mwǎsi is
'Femme' in this lesson and 'Fiancé(e)' in the dictionary; Yango is 'Cela, Ça'
here and 'Donc' there; Ekpángba is 'Entrepôt' here and 'Atelier' there. Several
words carry 2-4 senses with no principled way to choose one. The lesson's own
gloss is what the professor wrote for this lesson, so it wins.
Audio has no such problem: every sense of a word is a recording of the same
spoken word, so any sense with audio will do.

THE TONE MARKS STAY. The dictionary is written without them and the course with
them, and L346 is the lesson that teaches 'Ton haut (accent aigu)'. Only
`french` and `audio_url` are touched; `lingala` is never overwritten.

IT ALSO CLEARS L346's ÉLARGIR POOL
The 61 routed rows are mis-routed. Élargir means "everything else the course
knows about this topic", and this lesson has no topic — it is about the writing
system. Topical routing therefore returned whatever the embeddings surfaced:
Musicien, Fourchette, Aiguille, "Cette meuf est joviale". Worse, 7 rows re-show
a word the lesson just taught with its tone marks stripped (Tólí -> Toli,
Zála -> Zala), which contradicts the lesson directly.

Re-runnable. Writes a rollback JSON before any write.
"""
import argparse, json, os, sys, unicodedata, urllib.request
from datetime import datetime

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://haioiccujncsehadipzb.supabase.co").rstrip("/")
LESSON_ID = 346
LANGUAGE_ID = 1
ROLLBACK_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "artifacts", "lesson_backups")


def key() -> str:
    k = os.environ.get("SUPABASE_SERVICE_KEY")
    if not k:
        sys.exit("SUPABASE_SERVICE_KEY not set")
    return k


def _req(path, method="GET", data=None, prefer=None):
    h = {"apikey": key(), "Authorization": f"Bearer {key()}"}
    if data is not None:
        h["Content-Type"] = "application/json"
    if prefer:
        h["Prefer"] = prefer
    return urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{path}",
        data=json.dumps(data).encode() if data is not None else None,
        headers=h, method=method)


def get(path):
    out, frm = [], 0
    while True:
        r = _req(path)
        r.add_header("Range", f"{frm}-{frm + 999}")
        chunk = json.load(urllib.request.urlopen(r))
        out += chunk
        if len(chunk) < 1000:
            return out
        frm += 1000


def patch(path, data):
    urllib.request.urlopen(_req(path, "PATCH", data, "return=minimal")).read()


def delete(path):
    urllib.request.urlopen(_req(path, "DELETE", prefer="return=minimal")).read()


def fold(s: str) -> str:
    """Match the course's toned spelling against the dictionary's untoned one.

    ɛ and ɔ are distinct LETTERS, not accented vowels, so Unicode decomposition
    does not touch them — they are mapped explicitly, exactly as the frontend's
    fold() does."""
    s = (s or "").strip().lower().replace("ɛ", "e").replace("ɔ", "o")
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def gloss_of(french: str) -> str:
    """'Consonne B — Maladie' -> 'Maladie'.

    Splits on the em dash the workbook uses. A row without one is left alone
    rather than guessed at."""
    return french.split("—", 1)[1].strip() if "—" in (french or "") else (french or "").strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    native = get(f"lesson_pool?lesson_id=eq.{LESSON_ID}&tier=eq.native"
                 f"&select=id,french,lingala,audio_url&order=id")
    routed = get(f"lesson_pool?lesson_id=eq.{LESSON_ID}&tier=in.(approved,reassigned)"
                 f"&select=id,tier,french,lingala,audio_url,source_table,source_id&order=id")

    # Dictionary index: folded Lingala -> first sense that carries a recording.
    words = {w["id"] for w in get(f"words?language_id=eq.{LANGUAGE_ID}&select=id")}
    audio_by_word = {}
    for s in get("senses?select=word_id,dialect_word,audio_url"):
        if s["word_id"] not in words or not s.get("audio_url"):
            continue
        audio_by_word.setdefault(fold(s["dialect_word"]), s["audio_url"])

    updates, unchanged, got_audio = [], 0, 0
    for r in native:
        new_fr = gloss_of(r["french"])
        new_audio = audio_by_word.get(fold(r["lingala"])) or r["audio_url"]
        if new_fr == r["french"] and new_audio == r["audio_url"]:
            unchanged += 1
            continue
        if new_audio != r["audio_url"]:
            got_audio += 1
        updates.append({"id": r["id"], "french": new_fr, "audio_url": new_audio,
                        "_was": {"french": r["french"], "audio_url": r["audio_url"]},
                        "_ln": r["lingala"]})

    print(f"L346 native rows       : {len(native)}")
    print(f"  labels -> gloss      : {sum(1 for u in updates if u['french'] != u['_was']['french'])}")
    print(f"  audio from dictionary: {got_audio}")
    print(f"  already correct      : {unchanged}")
    print(f"L346 routed rows to delete (Élargir): {len(routed)}\n")

    for u in updates[:8]:
        swapped = "dict audio" if u["audio_url"] != u["_was"]["audio_url"] else "kept clip"
        print(f"   {u['_ln']:<20} {u['_was']['french'][:30]:<32} -> {u['french'][:22]:<24} {swapped}")
    if len(updates) > 8:
        print(f"   … and {len(updates) - 8} more")

    # A duplicate French would make two tiles on one match-pairs screen
    # indistinguishable. The bucket builder already dedupes, so this is a
    # warning about lost material rather than a broken screen.
    seen = {}
    for u in updates:
        seen.setdefault(u["french"].lower(), []).append(u["_ln"])
    dupes = {k: v for k, v in seen.items() if len(v) > 1}
    if dupes:
        print("\n   ! glosses shared by more than one row (one will be dropped from a pairs screen):")
        for k, v in dupes.items():
            print(f"     {k!r}: {', '.join(v)}")

    if args.dry_run:
        print("\n--dry-run: nothing written")
        return

    os.makedirs(ROLLBACK_DIR, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = os.path.join(ROLLBACK_DIR, f"alphabet_pool_{stamp}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"lesson_id": LESSON_ID,
                   "updated": [{"id": u["id"], **u["_was"]} for u in updates],
                   "deleted": routed}, f, ensure_ascii=False, indent=2)
    print(f"\nrollback written: {path}")

    for u in updates:
        patch(f"lesson_pool?id=eq.{u['id']}",
              {"french": u["french"], "audio_url": u["audio_url"]})
    print(f"updated {len(updates)} native rows")

    if routed:
        delete(f"lesson_pool?lesson_id=eq.{LESSON_ID}&tier=in.(approved,reassigned)")
        print(f"deleted {len(routed)} routed rows — L346 now has no Élargir material,"
              f" and the lesson screen hides the stage when a lesson has none")


if __name__ == "__main__":
    main()
