---
name: verify-professor-recordings
description: Verify which flagged audio recordings a professor actually redid, by byte-comparing the recording-app HTML files that were sent against the ZIP archives returned. Use when checking a professor's returned recordings, auditing re-recording requests, asking "did he redo what I flagged", investigating whether flagged items were re-recorded, or validating that HTMLs rebuilt from returned ZIPs faithfully carry the audio.
---

# Verify a professor's returned recordings

Answers: *of everything I flagged for re-recording, what did the professor
actually redo?* — and separately, *are my rebuilt HTMLs a faithful copy of what
he sent back?*

## The pipeline this covers

```
recording-app HTML (audio embedded as data: URIs, items flagged)
   → professor records in the browser
   → exports ZIP  (data.json + audio/*.webm)
   → optionally rebuilt into review HTMLs
```

## Always ask for the inputs first — never infer them

**Before running anything, ask the user for the directories.** Do not guess from
folder names, do not reuse paths from memory or from an earlier session, and do
not proceed on a single plausible candidate. The wrong `--sent` directory
silently produces a confident, entirely wrong answer, and a full run costs
minutes.

Ask for all three in one go:

1. **Sent** — which HTML files went to the professor (the flagged ones)?
2. **Returned** — which ZIPs did he send back?
3. **Rebuilt** — are there HTMLs rebuilt from those ZIPs to check as well? (optional)

If listing nearby folders helps the user answer, offer candidates as *options to
confirm* — never as a decision already made. Once they answer, echo back each
resolved path with its file count, then run.

## Run it

```bash
python3 .claude/skills/verify-professor-recordings/scripts/verify_recordings.py \
  --sent     <dir of the HTML files given to the professor> \
  --returned <dir of the ZIPs he returned> \
  --out      <dir for the reports> \
  --rebuilt  <optional: dir of HTMLs rebuilt from those ZIPs>
```

Pass `--rebuilt` whenever rebuilt files exist. **Check that result first** — if
the rebuild is broken, every conclusion about the professor is meaningless.

Five files land in `--out`:

| File | Contents |
|---|---|
| `verification_summary.md` | headline numbers, per-unit table, rebuild integrity, text edits |
| `flagged_complete.md` | every flagged clip with its status — the full list |
| `still_to_redo.md` | only what is outstanding — this is what you send back |
| `actually_recorded.md` | everything he recorded, flagged or not, with the text |
| `verification_data.json` | per-clip records for further analysis |

Runtime is a few minutes for a full A–Z set (it hashes every clip in ~600 MB of
HTML). Nothing is written outside `--out`.

## How it decides

SHA-256 over the raw bytes of each clip: the `data:audio/...;base64,…` URI in the
sent HTML (from the `PRELOADED` map, keyed `<wordId>_<senseNum>_<word|phrase|translation>`)
versus the matching `audio/*.webm` member of the ZIP.

Five outcomes, and **all five matter**:

| | Meaning | Done? |
|---|---|---|
| ✅ `refait` | bytes differ from the original | yes |
| 🆕 `nouveau` | nothing was recorded before, there is audio now | **yes** |
| ❌ `inchange` | byte-identical to the original | no |
| ⚠️ `absent` | no audio before, none now | no |
| 🗑 `supprime` | there was audio, the ZIP has none | no |

## Traps — every one of these was hit for real

**1. There are two independent flag layers, and both are yours.**

- `flagged_word` / `flagged_phrase` / `flagged_translation` — baked into the
  entry array of the sent HTML (the automatic pass).
- `manual_flag_*`, persisted as `const SAVED_FLAGS = {...}; // __SAVED_FLAGS__`
  when the "Sauvegarder HTML" button is used (the ones ticked by hand).

They barely overlap. Counting only one silently drops most of the request list.
The script unions both and tags each line `(auto)` / `(manuel)`.

**2. `needs_rerecord_*` in the returned ZIP is NOT the professor's input.**

The export writes `needs_rerecord_* = manual_flag_*` verbatim. It is your own
manual flags round-tripping back. Never describe it as "what the professor
flagged" — verify by comparing the ZIP values against `SAVED_FLAGS` in the sent
HTML; they should be identical.

**3. "No audio in the ZIP" is not the same as "not done."**

If the entry had no audio to begin with, audio in the ZIP means he recorded it
for the *first* time. That is done. Classing it as outstanding understates his
work — this alone shifted a real count by 19 clips.

**4. A hash difference only means "re-recorded" if the export is byte-stable.**

Verify it: the vast majority of untouched clips must come back byte-identical.
The summary prints this ratio. If most of the corpus differs, the export
re-encoded everything and hashing proves nothing — fall back to comparing
durations or file sizes.

**5. Don't trust the embedded unit id for pairing files.**

At least one generator writes the *language* into `const LETTER` and the letter
into `const LANGUAGE`, so all 26 files claim the same id. The script tries every
embedded id, keeps one only if it is distinct across all files, and otherwise
pairs on filename tokens. Always confirm the reported pair count matches the
number of files you expect.

**6. Re-recording spills past the flag.**

He typically redoes all three clips of an entry (mot + phrase + traduction) when
only one was flagged. Total clips recorded therefore exceeds total clips flagged,
and that is not an error.

## Reporting the result

Lead with the rebuild-integrity check, then done vs outstanding, then the
per-unit table — one weak unit is usually what created the impression that
"nothing was redone." Note text edits too: the script diffs `dialect_word`,
`phrase` and `translation` and surfaces changes, which is how genuinely wrong
translations get caught.

## Adapting to another app format

Tuned to the dictionary-review app: entries in `const WORDS` with a `senses`
array, audio in `const PRELOADED`, ZIP holding `data.json` + `audio/`. It also
accepts `ENTRIES` / `DATA` / `ITEMS` and `AUDIO` / `AUDIOS`.

The Lingala course-recording apps (`audio_collection_html/`) use a **different**
shape — `const ENTRIES` with flat `phrase_fr` / `phrase_lang` fields, no
`senses`, no `PRELOADED`, no flags. The script will not produce useful output
there without changes to `TYPES`, `ZIP_KEY` and `TEXT_KEY`. Read the actual HTML
before assuming a format.
