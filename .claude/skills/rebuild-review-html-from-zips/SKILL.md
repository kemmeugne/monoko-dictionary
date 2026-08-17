---
name: rebuild-review-html-from-zips
description: Rebuild playable review HTML pages from the ZIP archives a professor returned, by splicing his data.json and audio into the original recording-app HTML as a shell. Use when asked to rebuild review files from received ZIPs, turn returned ZIPs back into browsable HTML, regenerate review_from_zip / rebuilt_from_zips pages, or make a professor's returned recordings listenable in a browser.
---

# Rebuild review HTML from returned ZIPs

Turns the ZIPs a professor sends back into pages you can open in a browser and
listen to: his text, his audio, his flags.

## Always ask for the inputs first — never infer them

**Before running anything, ask the user for the directories.** Do not guess from
folder names, do not reuse paths from memory or from an earlier session, and do
not proceed on a single plausible candidate. The wrong `--shell` directory
produces pages that look right and are wrong.

Ask for both in one go:

1. **ZIPs** — which archives did the professor return?
2. **Shell** — which HTML files were originally sent to him? (these supply the
   app UI; the ZIP contains only data and audio)

Then ask where the output should go. If listing nearby folders helps the user
answer, offer candidates as *options to confirm* — never as a decision already
made. Echo back each resolved path with its file count before running.

## Why a shell is needed

The ZIP holds `data.json` + `audio/*.webm` and nothing else — no HTML, no
recorder UI. The page is rebuilt by taking the HTML that was sent out and
swapping its three data blocks:

| Block | Replaced with |
|---|---|
| `const WORDS` | entries from `data.json`; `flagged_*` ← `needs_rerecord_*` |
| `const PRELOADED` | base64 data URI per audio member, keyed `<id>_<num>_<field>` |
| `const SAVED_FLAGS` | `{}` — the reviewer starts clean |

localStorage / IndexedDB keys are also namespaced (`monoko_review_*`) so a
rebuilt page can never resurrect audio cached by the original page. Skipping
that step is how a rebuilt file ends up silently playing the *old* recordings.

## Run it

```bash
python3 .claude/skills/rebuild-review-html-from-zips/scripts/rebuild_from_zips.py \
  --zips  <dir of the returned ZIPs> \
  --shell <dir of the HTML files originally sent> \
  --out   <dir for the rebuilt pages>
```

Options:

- `--suffix _REVIEW` — appended to each output filename (default `_REVIEW`)
- `--no-flags` — do not carry `needs_rerecord_*` into `flagged_*`; use when the
  reviewer should not see the previous round's flags

Pure Python 3, no dependencies. A full A–Z set takes a few minutes and writes
only inside `--out`.

## It verifies itself

After writing each page the script re-parses it and compares every clip's
SHA-256 against the ZIP member it came from. The `vérif` column reads `OK` only
when all clips match; the run exits non-zero otherwise. **Do not report success
on a run that printed anything other than `OK`** — a rebuilt page that does not
match its ZIP invalidates any later analysis of it.

For an independent check, run the `verify-professor-recordings` skill with
`--rebuilt` pointing at the output.

## Traps

**1. Don't pair files on the embedded unit id.** At least one generator writes
the language into `const LETTER` and the letter into `const LANGUAGE`, so every
file claims the same id and all 26 collapse onto one. The script pairs on
distinguishing filename tokens instead, and refuses ambiguous matches rather
than guessing. Always check the reported pair count against the file count.

**2. Replace `PRELOADED` before `WORDS`.** `PRELOADED` sits later in the file,
so doing it first keeps the earlier offsets valid. The script brace-matches the
literals rather than searching for `};`.

**3. `SAVED_FLAGS` appears twice.** Once as the real declaration, once as a
string literal inside `saveHtml()` that rewrites it. Only the declaration —
anchored on the `// __SAVED_FLAGS__` marker at line start — may be touched.

**4. `needs_rerecord_*` in the ZIP is not professor input.** It is the sender's
own manual flags round-tripping through the export. Carrying it into `flagged_*`
is fine, but never describe those flags as the professor's.

## Format assumptions

Tuned to the dictionary-review app: `const WORDS` with a `senses` array,
`const PRELOADED`, ZIP holding `data.json` + `audio/`. Audio may be `.webm`,
`.ogg`, `.m4a`, `.mp3` or `.wav` — the data URI mime type follows the extension.

The Lingala course-recording apps (`audio_collection_html/`) use a different
shape — `const ENTRIES` with flat `phrase_fr` / `phrase_lang` fields and no
`senses` — and will not work here without changes. Read the actual HTML before
assuming a format.

## Related

`verify-professor-recordings` — once pages are rebuilt, that skill answers which
flagged items the professor actually redid.
