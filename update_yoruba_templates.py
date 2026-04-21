#!/usr/bin/env python3
"""
update_yoruba_templates.py
──────────────────────────
Updates the Yoruba course HTML templates in the Template directory to match
the Monoko app course structure (lesson_items schema):
  - phrase_fr  / phrase_lang  = main entry   (lesson_items.french / .dialect)
  - phrase_fr2 / phrase_lang2 = example      (lesson_items.example_french / .example_dialect)

Old structure had an extra label_fr/label_lang slot for "Mot / Expression".
The transformation merges it into phrase_fr/phrase_lang, pushing the old
example sentence down into phrase_fr2/phrase_lang2.

Also adds db_id (null for now) to all entries.
"""

import re, json, os

TEMPLATE_DIR = "/Users/anthonykemmeugne/Documents/App dialectes/Collection de données/Template"
FILES = [
    "Monoko_Cours_1_Yoruba.html",
    "Monoko_Cours_2_Yoruba.html",
    "Monoko_Cours_3_Yoruba.html",
    "Monoko_Cours_4_Yoruba.html",
]

# ── Transform one entry ───────────────────────────────────────────────────────

def transform_entry(e):
    """
    If label_fr is set:
      phrase_fr  ← label_fr
      phrase_lang ← label_lang
      phrase_fr2  ← old phrase_fr
      phrase_lang2 ← old phrase_lang
    If label_fr is null:
      phrase_fr/phrase_lang stay as-is, phrase_fr2/phrase_lang2 stay null
    Add db_id: null, drop label_fr/label_lang.
    """
    if e.get("label_fr") is not None:
        new = {
            "id":          e["id"],
            "db_id":       None,
            "breadcrumb":  e["breadcrumb"],
            "phrase_fr":   e["label_fr"],
            "phrase_lang": e.get("label_lang") or "",
            "phrase_fr2":  e.get("phrase_fr"),
            "phrase_lang2": e.get("phrase_lang") or "",
            "prefilled":   e.get("prefilled", True),
        }
    else:
        new = {
            "id":          e["id"],
            "db_id":       None,
            "breadcrumb":  e["breadcrumb"],
            "phrase_fr":   e.get("phrase_fr"),
            "phrase_lang": e.get("phrase_lang") or "",
            "phrase_fr2":  None,
            "phrase_lang2": None,
            "prefilled":   e.get("prefilled", True),
        }
    return new

# ── Serialize ENTRIES back to JS ──────────────────────────────────────────────

def serialize_entries(entries):
    lines = ["const ENTRIES = ["]
    for i, e in enumerate(entries):
        comma = "" if i == len(entries) - 1 else ","
        def js(v):
            if v is None: return "null"
            if isinstance(v, bool): return "true" if v else "false"
            return json.dumps(v, ensure_ascii=False)
        block = (
            f'  {{\n'
            f'    "id": {e["id"]},\n'
            f'    "db_id": {js(e["db_id"])},\n'
            f'    "breadcrumb": {js(e["breadcrumb"])},\n'
            f'    "phrase_fr": {js(e["phrase_fr"])},\n'
            f'    "phrase_lang": {js(e["phrase_lang"])},\n'
            f'    "phrase_fr2": {js(e["phrase_fr2"])},\n'
            f'    "phrase_lang2": {js(e["phrase_lang2"])},\n'
            f'    "prefilled": {js(e["prefilled"])}\n'
            f'  }}{comma}'
        )
        lines.append(block)
    lines.append("];")
    return "\n".join(lines)

# ── JS section replacements ───────────────────────────────────────────────────

def update_state_init(html):
    """Remove label_fr/label_lang/audio_label from state, add db_id."""
    old = (
        "const state = ENTRIES.map(e => ({\n"
        "  id:           e.id,\n"
        "  breadcrumb:   e.breadcrumb,\n"
        "  label_fr:     e.label_fr,     // null = slot hidden\n"
        "  label_lang:   e.label_lang,\n"
        "  phrase_fr:    e.phrase_fr,    // null = slot hidden (rare)\n"
        "  phrase_lang:  e.phrase_lang,\n"
        "  phrase_fr2:   e.phrase_fr2,   // null = slot hidden\n"
        "  phrase_lang2: e.phrase_lang2, // null if phrase_fr2 null\n"
        "  prefilled:    e.prefilled,\n"
        "  audio_label:  null,\n"
        "  audio_phrase: null,\n"
        "  audio_phrase2:null,\n"
        "}));"
    )
    new = (
        "const state = ENTRIES.map(e => ({\n"
        "  id:           e.id,\n"
        "  db_id:        e.db_id,\n"
        "  breadcrumb:   e.breadcrumb,\n"
        "  phrase_fr:    e.phrase_fr,\n"
        "  phrase_lang:  e.phrase_lang,\n"
        "  phrase_fr2:   e.phrase_fr2,\n"
        "  phrase_lang2: e.phrase_lang2,\n"
        "  prefilled:    e.prefilled,\n"
        "  audio_phrase: null,\n"
        "  audio_phrase2:null,\n"
        "}));"
    )
    return html.replace(old, new)

def update_is_complete(html):
    """Remove audio_label check from isComplete."""
    old = (
        "// ─── Completeness ───\n"
        "function isComplete(idx) {\n"
        "  const e = state[idx];\n"
        "  if (e.label_fr  !== null && !e.audio_label)   return false;\n"
        "  if (e.phrase_fr !== null && !e.audio_phrase)   return false;\n"
        "  if (e.phrase_fr2!== null && !e.audio_phrase2)  return false;\n"
        "  return true;\n"
        "}\n"
        "function audioCount(idx) {\n"
        "  const e = state[idx];\n"
        "  return (e.audio_label ? 1:0) + (e.audio_phrase ? 1:0) + (e.audio_phrase2 ? 1:0);\n"
        "}"
    )
    new = (
        "// ─── Completeness ───\n"
        "function isComplete(idx) {\n"
        "  const e = state[idx];\n"
        "  if (e.phrase_fr  !== null && !e.audio_phrase)   return false;\n"
        "  if (e.phrase_fr2 !== null && !e.audio_phrase2)  return false;\n"
        "  return true;\n"
        "}\n"
        "function audioCount(idx) {\n"
        "  const e = state[idx];\n"
        "  return (e.audio_phrase ? 1:0) + (e.audio_phrase2 ? 1:0);\n"
        "}"
    )
    return html.replace(old, new)

def update_render_entry(html):
    """
    Remove the label section ("Mot / Expression").
    Rename phrase section title from "Phrase exemple" to "Entrée principale".
    Keep phrase2 section as "Phrase exemple".
    """
    old_label_section = (
        "  // Label section (word / expression)\n"
        "  if (e.label_fr !== null) {\n"
        "    html += `<div class=\"entry-section\">\n"
        "      <div class=\"section-title\">Mot / Expression</div>\n"
        "      <div class=\"ref-label\">Référence française</div>\n"
        "      <div class=\"ref-box\">${escHtml(e.label_fr)}</div>\n"
        "      <div class=\"field-group\">\n"
        "        <label>En ${LANGUAGE}</label>\n"
        "        <textarea id=\"fl-label\"\n"
        "          placeholder=\"Traduction en ${LANGUAGE}…\"\n"
        "          class=\"${e.label_lang ? 'prefilled' : ''}\"\n"
        "          oninput=\"onField('label_lang',this.value)\">${escHtml(e.label_lang)}</textarea>\n"
        "      </div>\n"
        "      ${audioRow('label', e.audio_label)}\n"
        "    </div>`;\n"
        "  }\n"
        "\n"
        "  // Phrase 1 section\n"
        "  if (e.phrase_fr !== null) {\n"
        "    html += `<div class=\"entry-section\">\n"
        "      <div class=\"section-title\">Phrase exemple</div>\n"
    )
    new_label_section = (
        "  // Phrase principale\n"
        "  if (e.phrase_fr !== null) {\n"
        "    html += `<div class=\"entry-section\">\n"
        "      <div class=\"section-title\">Entrée principale</div>\n"
    )
    html = html.replace(old_label_section, new_label_section)

    # Update audio restore loop to remove 'label'
    old_restore = "  ['label','phrase','phrase2'].forEach(f => {"
    new_restore = "  ['phrase','phrase2'].forEach(f => {"
    html = html.replace(old_restore, new_restore)

    return html

def update_export(html):
    """Update exportZip to include db_id, remove label fields."""
    old_export_entries = (
        "        entries: state.map(e => ({\n"
        "          id: e.id, breadcrumb: e.breadcrumb,\n"
        "          label_fr:   e.label_fr,   label_lang:   e.label_lang,\n"
        "          phrase_fr:  e.phrase_fr,  phrase_lang:  e.phrase_lang,\n"
        "          phrase_fr2: e.phrase_fr2, phrase_lang2: e.phrase_lang2,\n"
        "          audio_label:   e.audio_label   ? `audio/e${e.id}_label.${getAudioExt()}`   : null,\n"
        "          audio_phrase:  e.audio_phrase  ? `audio/e${e.id}_phrase.${getAudioExt()}`  : null,\n"
        "          audio_phrase2: e.audio_phrase2 ? `audio/e${e.id}_phrase2.${getAudioExt()}` : null,\n"
        "        }))\n"
    )
    new_export_entries = (
        "        entries: state.map(e => ({\n"
        "          id: e.id, db_id: e.db_id, breadcrumb: e.breadcrumb,\n"
        "          phrase_fr:  e.phrase_fr,  phrase_lang:  e.phrase_lang,\n"
        "          phrase_fr2: e.phrase_fr2, phrase_lang2: e.phrase_lang2,\n"
        "          audio_phrase:  e.audio_phrase  ? `audio/e${e.id}_phrase.${getAudioExt()}`  : null,\n"
        "          audio_phrase2: e.audio_phrase2 ? `audio/e${e.id}_phrase2.${getAudioExt()}` : null,\n"
        "        }))\n"
    )
    html = html.replace(old_export_entries, new_export_entries)

    old_audio_loop = (
        "      for (const e of state) {\n"
        "        for (const f of ['label','phrase','phrase2']) {\n"
    )
    new_audio_loop = (
        "      for (const e of state) {\n"
        "        for (const f of ['phrase','phrase2']) {\n"
    )
    html = html.replace(old_audio_loop, new_audio_loop)

    return html

def update_persistence(html):
    """Update save/load/clear functions to remove label_lang/audio_label."""

    # saveTextState
    old_save = (
        "function saveTextState(){\n"
        "  const ts=state.map(e=>({id:e.id,label_lang:e.label_lang,phrase_lang:e.phrase_lang,phrase_lang2:e.phrase_lang2,\n"
        "    has_audio_label:!!e.audio_label,has_audio_phrase:!!e.audio_phrase,has_audio_phrase2:!!e.audio_phrase2}));\n"
    )
    new_save = (
        "function saveTextState(){\n"
        "  const ts=state.map(e=>({id:e.id,phrase_lang:e.phrase_lang,phrase_lang2:e.phrase_lang2,\n"
        "    has_audio_phrase:!!e.audio_phrase,has_audio_phrase2:!!e.audio_phrase2}));\n"
    )
    html = html.replace(old_save, new_save)

    # loadState audio fields
    old_load_audio = "      for(const f of ['label','phrase','phrase2']){"
    new_load_audio = "      for(const f of ['phrase','phrase2']){"
    html = html.replace(old_load_audio, new_load_audio)

    # loadState label_lang restore
    old_load_label = "      state[i].label_lang   = parsed[i].label_lang  || state[i].label_lang;\n"
    html = html.replace(old_load_label, "")

    # clearAllData
    old_clear = (
        "  state.forEach((e,i)=>{\n"
        "    e.label_lang   = ENTRIES[i].label_lang;\n"
        "    e.phrase_lang  = ENTRIES[i].phrase_lang;\n"
        "    e.phrase_lang2 = ENTRIES[i].phrase_lang2;\n"
        "    e.audio_label=null;e.audio_phrase=null;e.audio_phrase2=null;\n"
        "  });"
    )
    new_clear = (
        "  state.forEach((e,i)=>{\n"
        "    e.phrase_lang  = ENTRIES[i].phrase_lang;\n"
        "    e.phrase_lang2 = ENTRIES[i].phrase_lang2;\n"
        "    e.audio_phrase=null;e.audio_phrase2=null;\n"
        "  });"
    )
    html = html.replace(old_clear, new_clear)

    # boot hasSaved
    old_has_saved = "  const hasSaved=state.some(e=>e.audio_label||e.audio_phrase||e.audio_phrase2);"
    new_has_saved = "  const hasSaved=state.some(e=>e.audio_phrase||e.audio_phrase2);"
    html = html.replace(old_has_saved, new_has_saved)

    return html

# ── Extract and replace ENTRIES in HTML ──────────────────────────────────────

def process_file(path):
    with open(path, encoding="utf-8") as f:
        html = f.read()

    # Extract ENTRIES block
    m = re.search(r'(const ENTRIES = \[)(.*?)(\];)', html, re.DOTALL)
    if not m:
        print(f"  ERROR: Could not find ENTRIES in {os.path.basename(path)}")
        return False

    raw_entries = m.group(1) + m.group(2) + m.group(3)

    # Parse JSON from the entries array body
    entries_json_str = "[" + m.group(2) + "]"
    try:
        entries = json.loads(entries_json_str)
    except json.JSONDecodeError as e:
        print(f"  ERROR parsing ENTRIES JSON in {os.path.basename(path)}: {e}")
        return False

    # Transform entries
    transformed = [transform_entry(e) for e in entries]
    new_entries_block = serialize_entries(transformed)

    # Replace ENTRIES block
    html = html[:m.start()] + new_entries_block + html[m.end():]

    # Apply JS section updates
    html = update_state_init(html)
    html = update_is_complete(html)
    html = update_render_entry(html)
    html = update_export(html)
    html = update_persistence(html)

    with open(path, "w", encoding="utf-8") as f:
        f.write(html)

    return True


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    for fname in FILES:
        path = os.path.join(TEMPLATE_DIR, fname)
        if not os.path.exists(path):
            print(f"SKIP (not found): {fname}")
            continue
        print(f"Processing {fname}...", end=" ")
        ok = process_file(path)
        if ok:
            print("✓")

    print("\nDone. All Yoruba templates updated.")


if __name__ == "__main__":
    main()
