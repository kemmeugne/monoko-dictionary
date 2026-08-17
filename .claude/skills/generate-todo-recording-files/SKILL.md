---
name: generate-todo-recording-files
description: Generate slim recording HTML pages containing only the clips a professor still has to redo, so he gets a short focused file instead of the full letter. Use when asked to send back only what is missing, make a to-redo/à refaire file, regenerate HTML with just the outstanding recordings, or shrink a re-recording request after a verification pass.
---

# Generate "à refaire" recording files

Turns the outstanding items from a verification pass into small recording pages
holding **only** the entries that still need work — instead of resending a
25 MB file where the professor has to hunt for 88 items among 165 words.

## Always ask for the inputs first — never infer them

**Before running anything, ask the user for the paths.** Do not guess from
folder names, do not reuse paths from memory or an earlier session.

Ask for all of these in one go:

1. **Verification file** — the `verification_data.json` from the verification
   pass (run `verify-professor-recordings` first if there isn't one)
2. **Returned ZIPs** — the professor's last batch, source of current text and
   context audio
3. **Shell** — the original HTML files sent to him, which supply the app UI
4. **Output** — where the slim pages should go

Offer nearby folders as *candidates to confirm*, never as a decision already
made. Echo back each resolved path with its file count before running.

## What it produces

One page per unit, containing only entries with outstanding clips. Per entry:

| | |
|---|---|
| the field to redo | flagged (orange box + "⚠ À re-enregistrer") and its **audio removed**, so the recorder shows "Enregistrer" |
| the entry's other fields | keep their current audio, for context |
| the entry `id` | **preserved from the original** — this is what makes the later merge reliable |

Clearing the audio rather than leaving the rejected take is deliberate: anything
that comes back for those fields is new by construction, so the merge never has
to hash-compare new against old to tell them apart.

## Run it

```bash
python3 .claude/skills/generate-todo-recording-files/scripts/make_todo_files.py \
  --verification <path to verification_data.json> \
  --returned     <dir of the ZIPs he last returned> \
  --shell        <dir of the original HTML files sent> \
  --out          <dir for the slim pages>
```

`--suffix` controls the output filename suffix (default `_A_REFAIRE`).
Pure Python 3, no dependencies, writes only inside `--out`.

## It verifies itself

Each page is re-parsed after writing and checked on three counts: every context
clip matches the ZIP bytes, **no** audio survives on a field meant to be redone,
and the entry count matches what the verification file asked for. The total
number of generated fields is reconciled against the outstanding clip count.
The run exits non-zero on any failure — **never report success on a run that
printed anything but `OK`**.

## Traps

**1. Preserve the original `id`.** Renumbering entries 0..N makes the merge
guesswork. Safe to preserve because the app navigates by *position*
(`currentIdx`, `dot-${i}`) and only ever uses `w.id` for identity — nothing does
`WORDS[id]`. Verify that before trusting it on a new app version.

**2. Namespace the storage keys.** `loadState()` restores from IndexedDB before
`PRELOADED` is applied, and its restore loop matches by **index**. A slim file
sharing `STORE_KEY` with the full file would splice the wrong saved text into
the wrong entries and resurrect deleted audio. The script rewrites them to
`monoko_refaire_*`.

**3. Omitting a `PRELOADED` key is what clears a field.** Boot does
`if (!s['audio_'+field] && PRELOADED[key]) s['audio_'+field] = PRELOADED[key]`,
so an absent key leaves the field empty and the export writes `audio_X: null`.

**4. Keep every affected sense, not just the first.** A word can have several
senses flagged independently (Wolof "La" has two). Senses are kept with their
original `num`, and a subset starting at `num: 2` is fine.

**5. Unit ids may not match between tools.** The verification file's unit ids
can come from an embedded field while file pairing uses filename tokens. The
script resolves case-insensitively and falls back to token containment, and
refuses ambiguous matches rather than guessing.

## Merging the next batch back

When the professor returns ZIPs for these slim files, the merge is an overlay
keyed on `(id, sense num, field)` — ids were preserved precisely so this is
lookup, not matching. Any audio present in the slim ZIP is new by construction.

## Related

- `verify-professor-recordings` — run first; produces the `verification_data.json` this consumes
- `rebuild-review-html-from-zips` — turn returned ZIPs back into browsable pages
