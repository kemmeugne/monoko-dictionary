#!/usr/bin/env python3
"""
populate_professor_data.py

For each ZIP in Prof_Borgeas/, finds the matching original HTML (Group A or B),
injects the professor's Lingala text and audio, and writes a self-contained
review HTML to review_professor/ that opens in the browser ready to inspect.

Usage:
    cd audio_collection_html/
    python3 populate_professor_data.py
"""

import json
import re
import base64
import zipfile
from pathlib import Path

# ── Flag feature CSS + JS (injected into every review HTML) ──────────────────

FLAG_CSS = """<style>
.flag-section{border-top:2px solid #FFCDD2;background:#FFF5F5;padding:14px 18px;}
.flag-section .section-title{color:#C62828;}
.flag-section .section-title::before{background:#C62828;}
.flag-btn-row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;}
.flag-btn{padding:7px 14px;border:2px solid #C62828;border-radius:8px;background:white;
  color:#C62828;font-size:13px;font-weight:600;cursor:pointer;transition:all .2s;}
.flag-btn:hover{background:#FFEBEE;}
.flag-btn.flag-on{background:#C62828;color:white;}
.flag-note{width:100%;padding:8px 10px;border:1.5px solid #C62828;border-radius:8px;
  font-family:inherit;font-size:13px;resize:vertical;min-height:38px;background:white;margin-top:2px;}
.flag-note:focus{outline:none;box-shadow:0 0 0 3px rgba(198,40,40,.15);}
.flag-export-btn{padding:10px 20px;background:#C62828;color:white;border:none;
  border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;display:flex;
  align-items:center;gap:7px;transition:all .2s;}
.flag-export-btn:hover{background:#B71C1C;transform:translateY(-1px);}
.nav-dot.flagged{border-color:var(--accent)!important;background:var(--accent)!important;color:white!important;box-shadow:none!important;}
</style>"""

FLAG_JS = """
// === FLAG FEATURE (populate_professor_data.py) ===
(function(){
  const FLAG_KEY = STORE_KEY + '_flags';
  let flagState = {};

  try{ const s=localStorage.getItem(FLAG_KEY); if(s) flagState=JSON.parse(s); }catch(e){}

  function saveFlags(){ try{localStorage.setItem(FLAG_KEY,JSON.stringify(flagState));}catch(e){} }

  function getF(id){ return flagState[id]||{audio:false,text:false,note:''}; }

  function updateFlagStats(){
    const count=Object.values(flagState).filter(f=>f.audio||f.text).length;
    let badge=document.getElementById('statFlag');
    if(!badge){
      badge=document.createElement('span');
      badge.id='statFlag';
      badge.className='stat-badge';
      badge.style.background='#C62828';
      const stats=document.querySelector('.stats');
      if(stats) stats.appendChild(badge);
    }
    badge.textContent=count+' à refaire';
    badge.style.display=count>0?'':'none';
  }

  function refreshDot(id){
    const dot=document.getElementById('dot-'+id);
    if(!dot) return;
    const f=getF(id);
    if(f.audio||f.text) dot.classList.add('flagged');
    else dot.classList.remove('flagged');
  }

  // updateNav() resets dot classes on every navigation — wrap it to re-apply flags after
  const _origNav=updateNav;
  window.updateNav=updateNav=function(){
    _origNav();
    state.forEach((_,i)=>refreshDot(i));
  };

  window._flagToggle=function(id,type){
    if(!flagState[id]) flagState[id]={audio:false,text:false,note:''};
    flagState[id][type]=!flagState[id][type];
    saveFlags(); updateFlagStats(); refreshDot(id);
    const btn=document.getElementById('flag-'+type+'-'+id);
    if(btn){
      const on=flagState[id][type];
      btn.classList.toggle('flag-on',on);
      if(type==='audio') btn.textContent=on?'🔴 Audio à refaire':'🎙️ Audio à refaire';
      else               btn.textContent=on?'🔴 Traduction à refaire':'✏️ Traduction à refaire';
    }
  };

  window._flagNote=function(id,val){
    if(!flagState[id]) flagState[id]={audio:false,text:false,note:''};
    flagState[id].note=val; saveFlags();
  };

  function buildFlagSection(id){
    const f=getF(id);
    const div=document.createElement('div');
    div.className='entry-section flag-section';
    div.id='flag-section-'+id;
    div.innerHTML=`
      <div class="section-title">🚩 Signalement</div>
      <div class="flag-btn-row">
        <button id="flag-audio-${id}" class="flag-btn ${f.audio?'flag-on':''}"
          onclick="window._flagToggle(${id},'audio')">${f.audio?'🔴 Audio à refaire':'🎙️ Audio à refaire'}</button>
        <button id="flag-text-${id}" class="flag-btn ${f.text?'flag-on':''}"
          onclick="window._flagToggle(${id},'text')">${f.text?'🔴 Traduction à refaire':'✏️ Traduction à refaire'}</button>
      </div>
      <textarea class="flag-note" placeholder="Note pour le professeur (facultatif)…"
        oninput="window._flagNote(${id},this.value)">${f.note||''}</textarea>`;
    return div;
  }

  // Wrap renderEntry to append flag section
  const _orig=renderEntry;
  window.renderEntry=renderEntry=function(){
    _orig();
    const card=document.querySelector('.entry-card');
    if(!card) return;
    const id=state[currentIdx].id;
    if(!document.getElementById('flag-section-'+id)) card.appendChild(buildFlagSection(id));
  };

  // Export flagged entries
  function exportFlags(){
    const flagged=state
      .filter(e=>{ const f=flagState[e.id]; return f&&(f.audio||f.text); })
      .map(e=>{ const f=flagState[e.id]; return {
        id:e.id, phrase_fr:e.phrase_fr, phrase_lang:e.phrase_lang,
        audio_a_refaire:f.audio, traduction_a_refaire:f.text, note:f.note||''
      };});
    if(!flagged.length){ alert('Aucun signalement pour le moment.'); return; }
    const blob=new Blob([JSON.stringify(flagged,null,2)],{type:'application/json'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='signalements_'+DB_NAME.replace('monoko_audio_db_','')+'_'+new Date().toISOString().slice(0,10)+'.json';
    a.click();
  }

  // Add export-flags button + refresh stats/dots after boot
  setTimeout(()=>{
    const bar=document.querySelector('.export-bar');
    if(bar){
      const btn=document.createElement('button');
      btn.className='flag-export-btn';
      btn.innerHTML='🚩 Exporter signalements';
      btn.onclick=exportFlags;
      bar.insertBefore(btn,bar.firstChild);
    }
    updateFlagStats();
    state.forEach(e=>refreshDot(e.id));
  }, 800);

})();"""

PROF_DIR   = Path("Prof_Borgeas")
GROUPE_A   = Path("GROUPE_A_Enregistrement_seulement")
GROUPE_B   = Path("GROUPE_B_Traduction_et_enregistrement")
OUTPUT_DIR = Path("review_professor")

# ── Helpers ──────────────────────────────────────────────────────────────────

def _slug(s: str) -> str:
    """Lowercase, collapse non-alphanumeric to underscore, strip edges."""
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", "_", s)
    return s.strip("_")


def _zip_to_slug(stem: str) -> str:
    """
    'Monoko_Audio_Lingala_2.1-supp_Famille_supplement_2026-06-22'
    → '2_1_supp_famille_supplement'
    """
    s = re.sub(r"(?i)^Monoko_Audio_Lingala_", "", stem)
    s = re.sub(r"_\d{4}-\d{2}-\d{2}.*$", "", s)   # strip date suffix
    return _slug(s)


def _html_to_slug(stem: str) -> str:
    """
    'Monoko_Audio_Lingala_2.1_famille_supplement'
    → '2_1_famille_supplement'
    """
    s = re.sub(r"(?i)^Monoko_Audio_Lingala_", "", stem)
    return _slug(s)


def build_html_map() -> dict[str, Path]:
    """Map slug → Path for every HTML in Group A and B."""
    m = {}
    for folder in (GROUPE_A, GROUPE_B):
        for p in sorted(folder.glob("*.html")):
            m[_html_to_slug(p.stem)] = p
    return m


def best_html_match(zip_stem: str, html_map: dict):
    """Return the HTML whose slug best matches this ZIP stem."""
    z_slug = _zip_to_slug(zip_stem)
    z_tokens = set(z_slug.split("_"))

    # 1. exact
    if z_slug in html_map:
        return html_map[z_slug]

    # 2. prefix containment
    for h_slug, path in html_map.items():
        if z_slug.startswith(h_slug) or h_slug.startswith(z_slug):
            return path

    # 3. score by shared tokens, prefer best score
    # expand abbreviations so "supp" matches "supplement"
    def expand(tokens):
        return {("supplement" if t == "supp" else t) for t in tokens}

    z_prefix = "_".join(z_slug.split("_")[:2])
    candidates = {h: p for h, p in html_map.items() if h.startswith(z_prefix)}
    if len(candidates) == 1:
        return next(iter(candidates.values()))
    if len(candidates) > 1:
        z_exp = expand(z_tokens)
        def jaccard(h_slug):
            h = expand(set(h_slug.split("_")))
            inter = len(h & z_exp)
            union = len(h | z_exp)
            return inter / union if union else 0
        scored = sorted(candidates.items(), key=lambda kv: jaccard(kv[0]), reverse=True)
        return scored[0][1]

    return None


def pick_latest_zips(prof_dir: Path) -> list[Path]:
    """
    For each logical module, keep only the ZIP with the latest date suffix.
    Returns a sorted list of winner ZIPs.
    """
    by_module: dict[str, list[Path]] = {}
    for z in sorted(prof_dir.glob("*.zip")):
        slug = _zip_to_slug(z.stem)
        by_module.setdefault(slug, []).append(z)

    winners = []
    for slug, zips in by_module.items():
        # Sort by the date string embedded in the stem (ISO format sorts lexically)
        winners.append(sorted(zips, key=lambda p: p.stem)[-1])
    return sorted(winners)


# ── HTML injection ────────────────────────────────────────────────────────────

def inject(html: str, data_json: dict, audio_files: dict[str, bytes]) -> str:
    """
    1. Override phrase_lang / phrase_lang2 in ENTRIES[] from data.json.
    2. Base64-encode all audio blobs and seed IndexedDB before boot().
    """

    # — Text overrides —
    overrides = {}
    for entry in data_json.get("entries", []):
        idx = entry.get("id")
        if idx is None:
            continue
        pl  = entry.get("phrase_lang") or ""
        pl2 = entry.get("phrase_lang2") or ""
        if pl or pl2:
            overrides[idx] = {"phrase_lang": pl, "phrase_lang2": pl2}

    text_block = f"""
// === PROF TEXT (populate_professor_data.py) ===
(function(){{
  const OV={json.dumps(overrides, ensure_ascii=False)};
  for(const[i,v]of Object.entries(OV)){{
    const n=parseInt(i);
    if(n<ENTRIES.length){{
      if(v.phrase_lang)  ENTRIES[n].phrase_lang =v.phrase_lang;
      if(v.phrase_lang2) ENTRIES[n].phrase_lang2=v.phrase_lang2;
    }}
  }}
}})();
"""

    # Insert right after the closing ]; of the ENTRIES array
    m = re.search(r"(const ENTRIES\s*=\s*\[.*?\];)", html, re.DOTALL)
    if m:
        pos = m.end()
        html = html[:pos] + text_block + html[pos:]
    else:
        print("    ⚠  ENTRIES array not found — text not injected")

    # — Audio seed —
    audio_b64 = {k: base64.b64encode(v).decode() for k, v in audio_files.items()}
    audio_json = json.dumps(audio_b64)

    seed_block = f"""
// === PROF AUDIO (populate_professor_data.py) ===
const PROF_AUDIO={audio_json};

async function seedProfAudio(){{
  if(!Object.keys(PROF_AUDIO).length)return;
  await openDB();
  // Check if audio is already in IndexedDB — if yes, text edits are also user's, skip entirely
  const firstKey=Object.keys(PROF_AUDIO)[0];
  const alreadySeeded=await dbGet(firstKey);
  if(alreadySeeded) return;
  // Seed audio
  for(const[key,b64]of Object.entries(PROF_AUDIO)){{
    if(!b64)continue;
    try{{
      const bytes=atob(b64),arr=new Uint8Array(bytes.length);
      for(let j=0;j<bytes.length;j++)arr[j]=bytes.charCodeAt(j);
      await dbPut(key,new Blob([arr],{{type:'audio/webm'}}));
    }}catch(e){{console.warn('audio seed',key,e);}}
  }}
  // Seed text (only on first open — audio missing means this is a fresh start)
  const ts=state.map(e=>({{label_fr:e.label_fr,phrase_fr:e.phrase_fr,phrase_fr2:e.phrase_fr2,
    phrase_lang:e.phrase_lang,phrase_lang2:e.phrase_lang2,extra_examples:[]}}));
  const pay=JSON.stringify({{data:ts,currentIdx:0}});
  try{{localStorage.setItem(STORE_KEY,pay);}}catch(_){{}}
  if(db){{try{{const tx=db.transaction(DB_STORE,'readwrite');
    tx.objectStore(DB_STORE).put(pay,'__text_state__');}}catch(_){{}}}}
}}

"""

    # Replace the final boot().catch(... line with seedProfAudio().then(boot)
    boot_pat = re.compile(r"boot\(\)\.catch\(.*?\}\);", re.DOTALL)
    m2 = boot_pat.search(html)
    if m2:
        original = m2.group(0)
        replacement = seed_block + f"seedProfAudio().then(()=>{{\n  {original}\n}});"
        html = html[:m2.start()] + replacement + html[m2.end():]
    else:
        print("    ⚠  boot().catch() not found — audio seed not wired")

    # — Flag feature —
    flag_block = FLAG_JS
    # Inject CSS into <head> (before </head>)
    html = html.replace("</head>", FLAG_CSS + "\n</head>", 1)
    # Inject JS just before closing </script>
    html = html.replace("</script>\n</body>", flag_block + "\n</script>\n</body>", 1)

    return html


# ── Main ─────────────────────────────────────────────────────────────────────

def process_zip(zip_path: Path, html_map: dict, output_dir: Path):
    with zipfile.ZipFile(zip_path) as zf:
        names = zf.namelist()

        if "data.json" not in names:
            print(f"  ⚠  No data.json in {zip_path.name} — skipped")
            return

        data_json = json.loads(zf.read("data.json"))

        audio_files: dict[str, bytes] = {}
        for n in names:
            if n.startswith("audio/") and "." in n:
                key = Path(n).stem          # e.g. "e0_phrase"
                audio_files[key] = zf.read(n)

    html_path = best_html_match(zip_path.stem, html_map)
    if not html_path:
        print(f"  ⚠  No HTML match for {zip_path.name} — skipped")
        return

    n_entries = len(data_json.get("entries", []))
    n_audio   = len(audio_files)
    print(f"  {zip_path.name}")
    print(f"    HTML : {html_path.name}")
    print(f"    Data : {n_entries} entries, {n_audio} audio clips")

    html = inject(html_path.read_text(encoding="utf-8"), data_json, audio_files)

    output_dir.mkdir(parents=True, exist_ok=True)
    out = output_dir / (html_path.stem + "_REVIEW.html")
    out.write_text(html, encoding="utf-8")
    print(f"    → {out}")


def main():
    html_map = build_html_map()
    print(f"Loaded {len(html_map)} HTML templates\n")

    zips = pick_latest_zips(PROF_DIR)
    print(f"Processing {len(zips)} ZIPs (latest per module):\n")

    for z in zips:
        process_zip(z, html_map, OUTPUT_DIR)

    print(f"\nDone. Open files in: {OUTPUT_DIR}/")


if __name__ == "__main__":
    main()
