# Recording app HTML — format contract

**Status: applies to every recording-app HTML built from 2026-08-04 onward.**

Existing files predate this contract and are deliberately **not** retrofitted —
the Wolof dictionary set and the Lingala course set each use their own older
shape, and files are in flight with the professor. A full unification plus
regeneration is planned for the next data-collection round; until then, old
files keep their old format and new files follow this document.

## Why this exists

Two divergent formats grew independently:

| | Format A — dictionnaire (Wolof) | Format B — cours (Lingala) |
|---|---|---|
| Data array | `const WORDS` → `senses[]` | `const ENTRIES` (flat) |
| Fields | `dialect_word`, `phrase`, `translation` | `phrase_lang`, `phrase_lang2` |
| Audio in page | `const PRELOADED` data-URI map | none — IndexedDB only |
| Audio key | `<id>_<num>_<field>` | `e<id>_<field>` |
| Flags | in-band, exported in `data.json` | bolted on after the fact, exported separately |
| Unit id | `LETTER` / `LANGUAGE` (**swapped**) | `COURSE_NUM` / `COURSE_NAME` |
| Supabase link | none | `db_id` |

Each divergence independently breaks the tooling. The flag model is the worst:
in Format B a flag never reaches `data.json`, so a verification pass has nothing
to compare against.

The contract below is Format A — proven end to end by the three skills —
generalised to cover the course case, with the known bugs fixed.

## 1. Identity

```js
const LANGUAGE = "Wolof";      // the language being recorded — never the unit
const UNIT     = "A";          // letter, module number ("3.4"), or other id
const UNIT_NAME = "Lettre A";  // human label for the page header
const KIND     = "dictionary"; // or "course"
```

`LANGUAGE` holds the language and `UNIT` holds the unit. The old Wolof generator
writes these swapped (`LETTER = "Wolof"`, `LANGUAGE = "A"`), which makes every
file in a set claim the same id — never pair files on an embedded id without
checking it actually discriminates.

`UNIT` must be unique within a set and stable across rebuilds.

## 2. Data array

```js
const ENTRIES = [
  {
    id: 0,                      // stable; see invariants
    db_id: 8309,                // Supabase id, or null when not yet linked
    label: "Abeille",           // heading shown to the professor
    group: "Sons et alphabet",  // optional breadcrumb / section
    senses: [
      {
        num: 1,
        dialect_word: "Yàmb",
        phrase: "Yamb yi deñuy defar lem…",
        translation: "Les abeilles fabriquent le miel…",
        flagged_word: false,
        flagged_phrase: true,
        flagged_translation: false
      }
    ]
  }
];
```

- Course lines are a single sense with `num: 1`; a second example line becomes
  `num: 2`. There is no separate flat shape.
- Every entry has `senses`, even when there is exactly one.
- The three fields are always named `dialect_word` / `phrase` / `translation`.
  A page may leave a field blank; it may not rename it.

## 3. Audio

Recorded audio is embedded in the page, never left implicit:

```js
const PRELOADED = {
  "<id>_<num>_<field>": "data:audio/webm;base64,…"
};
```

- `<field>` is `word`, `phrase` or `translation`.
- **An absent key means the field has no recording** and the UI must show
  "Enregistrer". This is the mechanism used to request a re-recording — the
  boot loop is `if (!s['audio_'+f] && PRELOADED[key]) s['audio_'+f] = PRELOADED[key]`,
  so omitting a key leaves the field empty and the export writes `audio_X: null`.
- The mime type in the data URI follows the file extension.
- Do not seed audio into IndexedDB from a separate injected block; that path
  makes the audio invisible to any static analysis of the page.

## 4. Flags

Two layers, both authored by us, both surviving the round trip:

| Layer | Where | Meaning |
|---|---|---|
| `flagged_*` | inside `ENTRIES[].senses[]` | flagged when the page was generated |
| `manual_flag_*` | runtime state, persisted as `const SAVED_FLAGS = {...}; // __SAVED_FLAGS__` | ticked by hand, saved via "Sauvegarder HTML" |

`SAVED_FLAGS` is keyed `"<id>_<num>"` → `{word, phrase, translation}` and is
rewritten by `saveHtml()`. Two rules:

- The declaration must be a single line ending in the `// __SAVED_FLAGS__`
  marker, so it can be located unambiguously — the same text also appears as a
  string literal inside `saveHtml()`.
- **Both layers must reach `data.json`** (see §5). A flag that only lives in
  localStorage cannot be verified later.

`needs_rerecord_*` in an exported ZIP is `manual_flag_*` round-tripping. It is
**our** flag coming back, never professor input. Never present it as his.

## 5. Export (ZIP)

```
data.json
audio/<sanitised label>_sens<num>_<mot|phrase|traduction>.<ext>
```

```jsonc
{
  "language": "Wolof",
  "unit": "A",
  "unit_name": "Lettre A",
  "kind": "dictionary",
  "exported_at": "2026-08-04T16:46:04.829Z",
  "entries": [
    {
      "id": 0,
      "db_id": 8309,
      "label": "Abeille",
      "senses": [
        {
          "num": 1,
          "dialect_word": "Yàmb",
          "phrase": "…",
          "translation": "…",
          "audio_word": "audio/Abeille_sens1_mot.webm",
          "audio_phrase": null,
          "audio_translation": "audio/Abeille_sens1_traduction.webm",
          "flagged_word": false,
          "flagged_phrase": true,
          "flagged_translation": false,
          "needs_rerecord_word": false,
          "needs_rerecord_phrase": true,
          "needs_rerecord_translation": false
        }
      ]
    }
  ]
}
```

- `id` and `db_id` are echoed verbatim so a merge is a lookup on
  `(id, num, field)` rather than fuzzy text matching.
- `audio_*` is `null` when there is no recording — never omitted.
- Export must **not** silently drop entries. The old Wolof exporter filters on
  `s.dialect_word.trim()`, so an entry the professor never filled disappears
  from `data.json` entirely; that is a bug, not the contract.

## 6. Storage namespacing

```js
const STORE_KEY = 'monoko_' + PURPOSE + '_state_' + LANGUAGE + '_' + UNIT;
const DB_NAME   = 'monoko_' + PURPOSE + '_audio_' + LANGUAGE + '_' + UNIT;
```

`PURPOSE` distinguishes pages built over the same unit: `collect`, `review`,
`refaire`. Two pages covering the same unit must never share these keys.
`loadState()` restores from IndexedDB **before** `PRELOADED` is applied and its
restore loop matches by **index**, so a key collision splices saved text into
the wrong entries and resurrects deleted audio.

## 7. Invariants

1. **`id` is stable and never renumbered.** A filtered subset keeps the original
   ids, non-contiguous. This is what makes merges reliable.
2. **Navigation is positional, identity is by `id`.** `currentIdx`, `dot-${i}`
   and `state[i]` are positional; `w.id` is identity. Nothing may do
   `ENTRIES[id]`.
3. **Every sense is kept**, including a subset starting at `num: 2`.
4. **The export preserves untouched audio byte for byte.** Verification relies
   on a hash difference meaning "re-recorded"; re-encoding on export would
   destroy that signal.

## Tooling that depends on this

- `.claude/skills/verify-professor-recordings` — which flagged clips were redone
- `.claude/skills/rebuild-review-html-from-zips` — ZIPs back into browsable pages
- `.claude/skills/generate-todo-recording-files` — slim "à refaire" pages

All three currently speak Format A. Any new page built to this contract works
with them unchanged.
