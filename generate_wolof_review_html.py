#!/usr/bin/env python3
"""
generate_wolof_review_html.py
──────────────────────────────
Generates one review HTML per letter (A-Z) for the Wolof corpus.
Based on the Douala professor template — same UX — but pre-populated with:
  • Wolof text (dialect_word, phrase, translation)
  • Existing audio embedded as base64 data URIs
  • Flagged items (silent/short from ffprobe audit) highlighted in orange

Output: professor_tools/templates/Wolof/Monoko_Lettre_Wolof_{X}.html
        professor_tools/templates/Wolof/Wolof_a_rerecorder.md
"""

import zipfile, json, os, re, base64
from pathlib import Path

TEMPLATE_PATH = Path("/Users/anthonykemmeugne/Documents/04_Language_Projects/professor_tools/templates/Douala/Monoko_Lettre_Douala_A.html")
WOLOF_BASE    = Path("/Users/anthonykemmeugne/Documents/04_Language_Projects/raw_data/Wolof")
OUTPUT_DIR    = Path("/Users/anthonykemmeugne/Documents/04_Language_Projects/professor_tools/templates/Wolof")
OUTPUT_DIR.mkdir(exist_ok=True)

# ── Flagged from ffprobe audit (letter, french, sense_num, field) ─────────────
FLAGGED = {
    ("A","Abandonner",1,"audio_word"), ("A","Abeille",1,"audio_word"),
    ("A","Abîmer",1,"audio_word"), ("A","Accéder",1,"audio_word"),
    ("A","Accrocher",1,"audio_word"), ("A","Affronter",1,"audio_word"),
    ("A","Agneau",1,"audio_word"), ("A","Ail",1,"audio_word"),
    ("A","Armée",1,"audio_word"), ("A","Arranger",1,"audio_word"),
    ("A","Arrogant",1,"audio_word"), ("A","Art",1,"audio_word"),
    ("B","Bandit",1,"audio_word"), ("B","Bannir",1,"audio_word"),
    ("C","Chercher",1,"audio_word"), ("C","Collier",1,"audio_word"),
    ("C","Comploter",1,"audio_word"), ("C","Con",1,"audio_phrase"),
    ("C","Consoler",1,"audio_word"), ("C","Copier",1,"audio_word"),
    ("C","Coq",1,"audio_word"), ("C","Coque / coquille",1,"audio_word"),
    ("C","Corne",1,"audio_word"), ("C","Corps",1,"audio_word"),
    ("C","Correct",1,"audio_word"), ("C","Corrompre",1,"audio_word"),
    ("C","Coucher",1,"audio_word"), ("C","Couleur",1,"audio_word"),
    ("C","Couple",1,"audio_word"), ("C","Courge",1,"audio_word"),
    ("C","Course",1,"audio_word"), ("C","Courtois",1,"audio_word"),
    ("C","Couscous",1,"audio_word"), ("C","Couteau",1,"audio_word"),
    ("C","Couverture",1,"audio_word"), ("C","Crabe",1,"audio_word"),
    ("C","Crème / crème glacée",2,"audio_word"), ("C","Cueillir",1,"audio_word"),
    ("C","Culotte (équiv. Short)",1,"audio_word"), ("C","Culotté",1,"audio_word"),
    ("C","Cultiver",1,"audio_word"),
    ("D","De",1,"audio_word"), ("D","Debout",1,"audio_word"),
    ("D","Déchirer",1,"audio_word"), ("D","Décorer",1,"audio_word"),
    ("D","Dédier",1,"audio_word"), ("D","Défendre",1,"audio_word"),
    ("D","Définition",1,"audio_word"), ("D","Déjeuner",1,"audio_word"),
    ("D","Délicieux",1,"audio_word"), ("D","Délicieux",1,"audio_phrase"),
    ("D","Dénoncer",1,"audio_word"), ("D","Dépenser",1,"audio_word"),
    ("D","Déplacer",1,"audio_word"), ("D","Déposer",1,"audio_word"),
    ("D","Déterrer",1,"audio_word"), ("D","Détester",1,"audio_word"),
    ("D","Détruire",1,"audio_word"), ("D","Diamant",1,"audio_word"),
    ("D","Dieu",1,"audio_word"), ("D","Difficile",1,"audio_word"),
    ("D","Difficile",1,"audio_phrase"), ("D","Digne / Dignité",1,"audio_word"),
    ("D","Digne / Dignité",1,"audio_phrase"), ("D","Dire",1,"audio_word"),
    ("D","Direct",1,"audio_word"), ("D","Discours",1,"audio_word"),
    ("D","Disputer (se) / Dispute",1,"audio_word"), ("D","Distrait",1,"audio_word"),
    ("D","Dix",1,"audio_word"), ("D","Donc",1,"audio_word"),
    ("D","Donner",1,"audio_word"), ("D","Dont",1,"audio_word"),
    ("D","Dormir",1,"audio_word"), ("D","Dot / Doter",1,"audio_word"),
    ("D","Double",1,"audio_word"), ("D","Doyen",1,"audio_word"),
    ("D","Drap",1,"audio_word"), ("D","Durer",1,"audio_word"),
    ("E","Eau",1,"audio_word"), ("E","Échec",1,"audio_word"),
    ("E","Échelle",1,"audio_word"), ("E","Éduquer",1,"audio_word"),
    ("E","Efficace",1,"audio_word"), ("E","Égal",1,"audio_word"),
    ("E","Élever",1,"audio_word"), ("E","Embrasser",1,"audio_word"),
    ("E","Emprunter",1,"audio_word"), ("E","Étranger",1,"audio_word"),
    ("E","Étroit",1,"audio_word"), ("E","Évanouir (s')",1,"audio_word"),
    ("E","Évènement",1,"audio_word"), ("E","Exactement",1,"audio_word"),
    ("E","Exister",1,"audio_word"),
    ("F","Fâché",1,"audio_word"), ("F","Fatigu(é)r",1,"audio_word"),
    ("F","Forgeron",1,"audio_word"), ("F","Foyer",1,"audio_word"),
    ("F","Frapper",1,"audio_word"), ("F","Frissonner",1,"audio_word"),
    ("F","Froid",1,"audio_word"), ("F","Frustrer",1,"audio_word"),
    ("F","Fumer / Fumé",1,"audio_word"),
    ("G","Gourmand",1,"audio_word"), ("G","Grandir",1,"audio_word"),
    ("G","Gratter",1,"audio_word"), ("G","Griffe",1,"audio_word"),
    ("H","Habiter",1,"audio_word"), ("H","Honnêtement",1,"audio_word"),
    ("M","Médire / Médisance",1,"audio_word"), ("M","Mutuel",1,"audio_word"),
    ("P","Poids",1,"audio_word"),
    ("R","Rideau",1,"audio_word"), ("R","Royaume",1,"audio_word"),
    ("R","Ruche",1,"audio_word"),
    ("S","Savoir",1,"audio_word"), ("S","Science",1,"audio_word"),
    ("S","Serrer",1,"audio_translation"), ("S","Situation",1,"audio_word"),
    ("S","Sombre",1,"audio_word"), ("S","Son Sa Ses",1,"audio_phrase"),
    ("S","Sorcellerie",1,"audio_word"), ("S","Stratégie",1,"audio_word"),
    ("S","Suivre",1,"audio_word"), ("S","Sujet",1,"audio_word"),
    ("S","Supposer",1,"audio_word"), ("S","Symptôme",1,"audio_word"),
    ("V","Voiture",1,"audio_word"),
}

# ── Load data from zip or unzipped folder ─────────────────────────────────────

def load_letter(letter):
    """Returns (data_dict, audio_loader_fn) where audio_loader_fn(rel_path) -> bytes|None."""
    folder = WOLOF_BASE / "Monoko_Lettre_Wolof_A_2026-03-30"
    if letter == "A" and folder.exists():
        data = json.loads((folder / "data.json").read_bytes())
        def load_audio(rel_path):
            p = folder / rel_path
            return p.read_bytes() if p.exists() else None
        return data, load_audio

    zips = list(WOLOF_BASE.glob(f"Monoko_Lettre_Wolof_{letter}_*.zip"))
    if not zips:
        return None, None
    zf = zipfile.ZipFile(zips[0])
    names = zf.namelist()
    json_name = next((n for n in names if n.endswith("data.json")), None)
    if not json_name:
        return None, None
    data = json.loads(zf.read(json_name))
    base_prefix = json_name[:-len("data.json")]  # folder prefix inside zip

    def load_audio(rel_path):
        full = base_prefix + rel_path
        if full in names:
            return zf.read(full)
        # Try without prefix
        if rel_path in names:
            return zf.read(rel_path)
        return None

    return data, load_audio

# ── Base64 encode audio ───────────────────────────────────────────────────────

def to_data_uri(raw_bytes):
    if raw_bytes is None:
        return None
    b64 = base64.b64encode(raw_bytes).decode("ascii")
    return f"data:audio/webm;base64,{b64}"

# ── JS string escaping ────────────────────────────────────────────────────────

def js_str(v):
    if v is None:
        return "null"
    return json.dumps(str(v), ensure_ascii=False)

# ── Build WORDS JS + PRELOADED object ────────────────────────────────────────

def build_js_data(letter, data, load_audio):
    words = data.get("words", [])
    words_list = []
    preloaded = {}
    flagged_items = []

    for word in words:
        word_id = word["id"]
        french  = word.get("french", "")
        senses_list = []

        for sense in word.get("senses", []):
            num = sense.get("num", 1)
            dw  = sense.get("dialect_word", "") or ""
            ph  = sense.get("phrase", "") or ""
            tr  = sense.get("translation", "") or ""
            aw  = sense.get("audio_word", "")
            aph = sense.get("audio_phrase", "")
            atr = sense.get("audio_translation", "")

            fw  = (letter, french, num, "audio_word")        in FLAGGED
            fp  = (letter, french, num, "audio_phrase")      in FLAGGED
            ftr = (letter, french, num, "audio_translation") in FLAGGED

            if fw:  flagged_items.append((french, num, "Mot",        dw,  aw))
            if fp:  flagged_items.append((french, num, "Phrase",     ph,  aph))
            if ftr: flagged_items.append((french, num, "Traduction", tr,  atr))

            for field_key, rel_path in [("word", aw), ("phrase", aph), ("translation", atr)]:
                if rel_path:
                    raw = load_audio(rel_path)
                    uri = to_data_uri(raw)
                    if uri:
                        preloaded[f"{word_id}_{num}_{field_key}"] = uri

            senses_list.append({
                "num": num,
                "dialect_word": dw,
                "phrase": ph,
                "translation": tr,
                "prefilled": True,
                "flagged_word": fw,
                "flagged_phrase": fp,
                "flagged_translation": ftr,
            })

        words_list.append({"id": word_id, "french": french, "senses": senses_list})

    words_js     = "const WORDS = " + json.dumps(words_list, ensure_ascii=False, indent=2) + ";"
    preloaded_js = "const PRELOADED = " + json.dumps(preloaded, ensure_ascii=False) + ";"
    return words_js, preloaded_js, flagged_items, len(words)

# ── Template patching ─────────────────────────────────────────────────────────

TEMPLATE = TEMPLATE_PATH.read_text(encoding="utf-8")

# Patch: showAudioPlayer — handle data URI strings
OLD_SHOW = """function showAudioPlayer(si, field, blob) {
  const pb = document.getElementById(`playback-${si}-${field}`);
  const el = document.getElementById(`audio-el-${si}-${field}`);
  if (pb && el && blob) {
    pb.classList.remove('hidden');
    el.src = URL.createObjectURL(blob);
  }
}"""

NEW_SHOW = """function showAudioPlayer(si, field, audio) {
  const pb = document.getElementById(`playback-${si}-${field}`);
  const el = document.getElementById(`audio-el-${si}-${field}`);
  if (pb && el && audio) {
    pb.classList.remove('hidden');
    el.src = (typeof audio === 'string') ? audio : URL.createObjectURL(audio);
  }
}"""

# Patch: audioRow — add flagged param + orange highlight + badge
OLD_AUDIO_ROW = """function audioRow(si, field, blob) {
  const hasAudio = !!blob;
  return `<div class="audio-row" id="audio-row-${si}-${field}">
    <button class="rec-btn" id="rec-btn-${si}-${field}"
      onclick="toggleRecording(${si},'${field}')">
      <span class="rec-dot"></span>
      <span class="rec-label">${hasAudio ? 'Ré-enregistrer' : 'Enregistrer'}</span>
    </button>
    <span class="rec-timer hidden" id="timer-${si}-${field}">0:00</span>
    <div class="audio-playback ${hasAudio ? '' : 'hidden'}" id="playback-${si}-${field}">
      <audio controls id="audio-el-${si}-${field}"></audio>
    </div>
    ${hasAudio ? `<button class="delete-audio" onclick="deleteAudio(${si},'${field}')" title="Supprimer">✕</button>` : ''}
    <span class="audio-status ${hasAudio ? '' : 'none'}" id="status-${si}-${field}">
      ${hasAudio ? '✓ Enregistré' : ''}
    </span>
  </div>`;
}"""

NEW_AUDIO_ROW = """function audioRow(si, field, audio, flagged) {
  const hasAudio = !!audio;
  const rowStyle = flagged ? ' style="border:2px solid #D4740E;border-radius:8px;padding:6px;background:#FFF3E0"' : '';
  const flagBadge = flagged ? '<span style="font-size:11px;color:#D4740E;font-weight:700;margin-left:4px">⚠ À re-enregistrer</span>' : '';
  return `<div class="audio-row" id="audio-row-${si}-${field}"${rowStyle}>
    <button class="rec-btn" id="rec-btn-${si}-${field}"
      onclick="toggleRecording(${si},'${field}')">
      <span class="rec-dot"></span>
      <span class="rec-label">${hasAudio ? 'Ré-enregistrer' : 'Enregistrer'}</span>
    </button>
    <span class="rec-timer hidden" id="timer-${si}-${field}">0:00</span>
    <div class="audio-playback ${hasAudio ? '' : 'hidden'}" id="playback-${si}-${field}">
      <audio controls id="audio-el-${si}-${field}"></audio>
    </div>
    ${hasAudio ? `<button class="delete-audio" onclick="deleteAudio(${si},'${field}')" title="Supprimer">✕</button>` : ''}
    <span class="audio-status ${hasAudio ? '' : 'none'}" id="status-${si}-${field}">
      ${hasAudio ? '✓ Enregistré' : ''}
    </span>
    ${flagBadge}
  </div>`;
}"""

# Patch: renderWord audioRow calls — pass flagged fields
OLD_ROW_WORD  = "${audioRow(si, 'word', sense.audio_word)}"
NEW_ROW_WORD  = "${audioRow(si, 'word', sense.audio_word, sense.flagged_word)}"
OLD_ROW_PH    = "${audioRow(si, 'phrase', sense.audio_phrase)}"
NEW_ROW_PH    = "${audioRow(si, 'phrase', sense.audio_phrase, sense.flagged_phrase)}"
OLD_ROW_TR    = "${audioRow(si, 'translation', sense.audio_translation)}"
NEW_ROW_TR    = "${audioRow(si, 'translation', sense.audio_translation, sense.flagged_translation)}"

# Patch: state init — add flagged fields
OLD_STATE = """const state = WORDS.map(w => ({
  id: w.id,
  french: w.french,
  senses: w.senses.map(s => ({
    num: s.num,
    dialect_word: s.dialect_word || '',
    phrase: s.phrase || '',
    translation: s.translation || '',
    audio_word: null,     // Blob
    audio_phrase: null,    // Blob
    audio_translation: null // Blob
  }))
}));"""

NEW_STATE = """const state = WORDS.map(w => ({
  id: w.id,
  french: w.french,
  senses: w.senses.map(s => ({
    num: s.num,
    dialect_word: s.dialect_word || '',
    phrase: s.phrase || '',
    translation: s.translation || '',
    flagged_word: s.flagged_word || false,
    flagged_phrase: s.flagged_phrase || false,
    flagged_translation: s.flagged_translation || false,
    audio_word: null,
    audio_phrase: null,
    audio_translation: null
  }))
}));"""

# Patch: updateNav — add orange dot for flagged words
OLD_NAV_UPDATE = """function updateNav() {
  WORDS.forEach((_, i) => {
    const dot = document.getElementById(`dot-${i}`);
    if (!dot) return;
    dot.className = 'nav-dot';
    if (i === currentIdx) dot.classList.add('current');
    if (isWordComplete(i)) dot.classList.add('complete');
    if (hasAnyAudio(i)) dot.classList.add('has-audio');
  });"""

NEW_NAV_UPDATE = """function updateNav() {
  WORDS.forEach((_, i) => {
    const dot = document.getElementById(`dot-${i}`);
    if (!dot) return;
    dot.className = 'nav-dot';
    if (i === currentIdx) dot.classList.add('current');
    if (isWordComplete(i)) dot.classList.add('complete');
    if (hasAnyAudio(i)) dot.classList.add('has-audio');
    const hasFlagged = state[i].senses.some(s => s.flagged_word || s.flagged_phrase || s.flagged_translation);
    if (hasFlagged && i !== currentIdx) { dot.style.borderColor='#D4740E'; dot.style.color='#D4740E'; }
  });"""

# Patch: boot — preload audio from PRELOADED after loadState
OLD_BOOT = """async function boot() {
  try {
    await loadState();
  } catch(e) {
    console.warn('Could not restore saved data:', e);
    storageAvailable = false;
  }"""

NEW_BOOT = """async function boot() {
  try {
    await loadState();
    // Pre-load professor audio from embedded data
    for (const w of state) {
      for (const s of w.senses) {
        const key = w.id + '_' + s.num;
        for (const field of ['word', 'phrase', 'translation']) {
          if (!s['audio_' + field] && PRELOADED[key + '_' + field]) {
            s['audio_' + field] = PRELOADED[key + '_' + field];
          }
        }
      }
    }
  } catch(e) {
    console.warn('Could not restore saved data:', e);
    storageAvailable = false;
  }"""

# Patch: loadState — preserve pre-filled WORDS data when saved value is empty
OLD_LOAD_STATE_EXISTING = """          state[i].senses[si].dialect_word = sw.senses[si].dialect_word || '';
          state[i].senses[si].phrase = sw.senses[si].phrase || '';
          state[i].senses[si].translation = sw.senses[si].translation || '';"""

NEW_LOAD_STATE_EXISTING = """          state[i].senses[si].dialect_word = sw.senses[si].dialect_word || state[i].senses[si].dialect_word;
          state[i].senses[si].phrase = sw.senses[si].phrase || state[i].senses[si].phrase;
          state[i].senses[si].translation = sw.senses[si].translation || state[i].senses[si].translation;"""

OLD_LOAD_STATE_NEW = """            dialect_word: sw.senses[si].dialect_word || '',
            phrase: sw.senses[si].phrase || '',
            translation: sw.senses[si].translation || '',"""

NEW_LOAD_STATE_NEW = """            dialect_word: sw.senses[si].dialect_word || '',
            phrase: sw.senses[si].phrase || '',
            translation: sw.senses[si].translation || '',
            flagged_word: false, flagged_phrase: false, flagged_translation: false,"""

# CSS addition for flagged nav dot
OLD_CSS_LAST = """.nav-dot.complete.has-audio {
  background: var(--primary);
  color: white;
  border-color: var(--primary-dark);
  box-shadow: 0 0 0 2px var(--accent);
}"""

NEW_CSS_LAST = """.nav-dot.complete.has-audio {
  background: var(--primary);
  color: white;
  border-color: var(--primary-dark);
  box-shadow: 0 0 0 2px var(--accent);
}
.nav-dot.flagged {
  border-color: #D4740E !important;
  color: #D4740E !important;
}"""

def patch_template(letter, n_words, words_js, preloaded_js):
    html = TEMPLATE

    # WORDS array: replace from `const WORDS = [` to the matching `];`
    start = html.index("const WORDS = [")
    # Find the closing ];\n at top level
    depth = 0
    i = start + len("const WORDS = ")
    while i < len(html):
        if html[i] == '[':
            depth += 1
        elif html[i] == ']':
            depth -= 1
            if depth == 0:
                end = i + 2  # include ];
                break
        i += 1
    html = html[:start] + words_js + "\n" + preloaded_js + "\n" + html[end:]

    # LETTER / LANGUAGE vars
    html = html.replace('const LETTER = "Douala";', 'const LETTER = "Wolof";')
    html = html.replace('const LANGUAGE = "A";', f'const LANGUAGE = "{letter}";')

    # Title
    html = html.replace(
        "<title>Monoko — Lettre Douala</title>",
        f"<title>Monoko — Revue Wolof — {letter}</title>"
    )

    # Header subtitle
    html = re.sub(
        r'Lettre Douala — \w+ — \d+ mots',
        f"Revue Wolof — {letter} — {n_words} mots",
        html
    )

    # Splash screen
    html = html.replace("<h2>Lettre Douala</h2>", f"<h2>Revue audio Wolof — {letter}</h2>")
    html = re.sub(
        r'Vous allez traduire \d+ mots en \w+ et enregistrer leur prononciation\.\s*<br><br>\s*Pour chaque mot.*?à nous envoyer\.',
        f"Revue qualité audio — {n_words} mots en {letter}.<br><br>"
        "Les entrées avec <strong style='color:#D4740E'>⚠ À re-enregistrer</strong> ont été détectées comme silencieuses ou trop courtes.<br><br>"
        "Écoutez l'audio, puis re-enregistrez les mauvaises prises. Exportez le ZIP à la fin.",
        html,
        flags=re.DOTALL
    )

    # All other patches
    html = html.replace(OLD_SHOW,         NEW_SHOW)
    html = html.replace(OLD_AUDIO_ROW,    NEW_AUDIO_ROW)
    html = html.replace(OLD_ROW_WORD,     NEW_ROW_WORD)
    html = html.replace(OLD_ROW_PH,       NEW_ROW_PH)
    html = html.replace(OLD_ROW_TR,       NEW_ROW_TR)
    html = html.replace(OLD_STATE,        NEW_STATE)
    html = html.replace(OLD_NAV_UPDATE,   NEW_NAV_UPDATE)
    html = html.replace(OLD_BOOT,               NEW_BOOT)
    html = html.replace(OLD_LOAD_STATE_EXISTING, NEW_LOAD_STATE_EXISTING)
    html = html.replace(OLD_LOAD_STATE_NEW,      NEW_LOAD_STATE_NEW)
    html = html.replace(OLD_CSS_LAST,            NEW_CSS_LAST)

    return html

# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    all_flagged = []

    for letter in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
        print(f"Generating {letter}...", flush=True)
        data, load_audio = load_letter(letter)
        if data is None:
            print(f"  ⚠ No data found for {letter}, skipping")
            continue

        words_js, preloaded_js, flagged_items, n_words = build_js_data(letter, data, load_audio)
        html = patch_template(letter, n_words, words_js, preloaded_js)

        out_path = OUTPUT_DIR / f"Monoko_Lettre_Wolof_{letter}.html"
        out_path.write_text(html, encoding="utf-8")

        mb = out_path.stat().st_size / 1_000_000
        n_flagged = len(flagged_items)
        flag_note = f" ({n_flagged} signalés)" if n_flagged else ""
        print(f"  ✓ {out_path.name}  {n_words} mots · {mb:.1f} MB{flag_note}")

        for french, num, field_label, wolof_text, audio_path in flagged_items:
            all_flagged.append((letter, french, num, field_label, wolof_text, audio_path))

    # ── Re-record list ────────────────────────────────────────────────────────
    md_lines = [
        "# Wolof — Liste des enregistrements à refaire\n",
        f"Total : **{len(all_flagged)} enregistrements signalés** (silencieux ou trop courts)\n",
        "_Critère : volume moyen < -40 dBFS ou durée < seuil minimum_\n",
        ""
    ]
    cur_letter = None
    for letter, french, num, field_label, wolof_text, audio_path in sorted(all_flagged):
        if letter != cur_letter:
            md_lines.append(f"\n## Lettre {letter}\n")
            md_lines.append("| Mot français | Sens | Champ | Texte Wolof | Fichier audio |")
            md_lines.append("|---|---|---|---|---|")
            cur_letter = letter
        wolof_short = (wolof_text[:50] + "…") if len(wolof_text) > 50 else wolof_text
        md_lines.append(f"| {french} | {num} | {field_label} | {wolof_short} | `{audio_path}` |")

    md_path = OUTPUT_DIR / "Wolof_a_rerecorder.md"
    md_path.write_text("\n".join(md_lines), encoding="utf-8")
    print(f"\n✓ Re-record list: {md_path}")
    print(f"\n{'='*52}")
    print(f"  26 HTML files in {OUTPUT_DIR}")
    print(f"  {len(all_flagged)} items flagged for re-recording")
    print(f"{'='*52}")

if __name__ == "__main__":
    main()
