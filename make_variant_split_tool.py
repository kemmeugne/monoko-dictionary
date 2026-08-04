#!/usr/bin/env python3
"""
make_variant_split_tool.py
───────────────────────────
Builds a self-contained HTML review tool for the `lesson_items` rows whose
Lingala cell holds several dash-separated variants in one field.

The professor read *every* variant into a single audio clip (duration tracks the
combined text length), so splitting the text into separate rows also means
deciding where the clip is cut. Automatic cutting was tried and rejected: taking
the N-1 longest silences validates against expected segment length on only ~12%
of clips, because he pauses mid-sentence as often as between variants.

So the cut is a human call. This tool renders one row per screen with a waveform,
pre-placed cut suggestions, per-segment playback, and editable text, and exports
a decision JSON that `apply_variant_split.py` consumes.

Audio is embedded as data URIs: the r2.dev public bucket sends no CORS headers,
so `decodeAudioData` on a fetched URL is blocked, and the waveform needs samples.

Usage:
    SUPABASE_SERVICE_KEY=... python3 make_variant_split_tool.py
    → variant_split_tool.html
"""

from __future__ import annotations

import base64
import json
import re
import subprocess
import sys
from pathlib import Path

import ingest_professor_zips as ing

MP3_CACHE = Path("artifacts/professor_ingest/mp3")
OUT = Path("variant_split_tool.html")

# A label-only line such as "Eyélé / Motoí:" or "Proverbe :" — several label words
# may be slash-joined, so test every token rather than the line as a whole.
LABEL_WORD = re.compile(r"^(ey[ée]l[ée]|moto[ií]|proverbe|proverbes|expression|expressions)$", re.I)
# "Kondóndwa (se réjouir)" — the closing paren may be followed by punctuation.
GLOSS_RE = re.compile(r"^(?P<ln>.+?)\s*\((?P<fr>[^()]{2,})\)\s*[.!?;:]*\s*$")


def is_header(line: str) -> bool:
    line = re.sub(r"\(s\)", "", line)  # "Proverbe(s) :"
    tokens = [t.strip(" :.-—") for t in re.split(r"[/,]", line) if t.strip(" :.-—")]
    return bool(tokens) and all(LABEL_WORD.match(t) for t in tokens)


def variants(text: str | None) -> list[str]:
    if not text:
        return []
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    if not any(l.startswith(("-", "•", "*")) for l in lines):
        return []
    return [re.sub(r"^[-•*]\s*", "", l).strip() for l in lines]


def suggest_cuts(path: Path, n: int) -> list[float]:
    """N-1 longest silences, as a starting guess for the human to drag."""
    r = subprocess.run(
        ["ffmpeg", "-nostdin", "-i", str(path), "-af",
         "silencedetect=noise=-32dB:d=0.25", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", r.stderr)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", r.stderr)]
    gaps = sorted(zip(starts, ends), key=lambda g: -(g[1] - g[0]))[: n - 1]
    return sorted(round((s + e) / 2, 3) for s, e in gaps)


def build_entries() -> list[dict]:
    _, lessons, items = ing.fetch_db()
    rows = [i for i in items.values() if len(variants(i["dialect"])) > 1]
    rows.sort(key=lambda i: (i["lesson_id"], i["item_order"] or 0))

    entries = []
    for row in rows:
        vs = variants(row["dialect"])
        fr_vs = variants(row["french"])
        segments = []
        for k, v in enumerate(vs):
            gloss = GLOSS_RE.match(v)
            if is_header(v):
                seg = {"ln": v, "fr": "", "drop": True}          # "Eyélé / Motoí:" label
            elif gloss:
                seg = {"ln": gloss.group("ln").strip(),           # "Kondóndwa (se réjouir)"
                       "fr": gloss.group("fr").strip(), "drop": False}
            elif len(fr_vs) == len(vs):
                seg = {"ln": v, "fr": fr_vs[k], "drop": False}    # French listed in parallel
            else:
                seg = {"ln": v, "fr": (row["french"] or "").strip(), "drop": False}
            segments.append(seg)

        key = (row["audio_url"] or "").split("/Lingala/lesson_items/")[-1]
        mp3 = MP3_CACHE / key
        audio, cuts = "", []
        if row["audio_url"] and mp3.exists():
            audio = "data:audio/mpeg;base64," + base64.b64encode(mp3.read_bytes()).decode()
            cuts = suggest_cuts(mp3, len(vs))

        entries.append({
            "row_id": row["id"],
            "lesson": lessons[row["lesson_id"]]["title"],
            "lesson_id": row["lesson_id"],
            "french_raw": row["french"],
            "dialect_raw": row["dialect"],
            "example_french": row["example_french"],
            "example_dialect": row["example_dialect"],
            "audio_url": row["audio_url"],
            "audio": audio,
            "cuts": cuts,
            "segments": segments,
        })
    return entries


HTML = r"""<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Monoko — découpage des variantes</title>
<style>
:root{--bg:#faf8f5;--card:#fff;--ink:#2b2b2b;--mut:#6b6b6b;--acc:#6b4ea8;--ok:#2e7d32;--warn:#c62828;--line:#e5e0d8}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
header{position:sticky;top:0;background:var(--card);border-bottom:1px solid var(--line);padding:10px 16px;z-index:9}
.bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
h1{font-size:15px;margin:0;font-weight:700}
.prog{flex:1;min-width:120px;height:7px;background:var(--line);border-radius:4px;overflow:hidden}
.prog i{display:block;height:100%;background:var(--acc);width:0}
.count{font-size:13px;color:var(--mut);font-variant-numeric:tabular-nums}
main{max-width:860px;margin:0 auto;padding:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:16px}
.meta{font-size:12px;color:var(--mut);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px}
.fr{font-size:19px;font-weight:600;margin-bottom:4px;white-space:pre-wrap}
canvas{width:100%;height:120px;background:#f4f1ec;border-radius:10px;display:block;cursor:crosshair;touch-action:none}
.tools{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}
button{min-height:44px;padding:9px 15px;border:1.5px solid var(--line);background:#fff;color:var(--ink);
  border-radius:10px;font-size:14px;font-weight:600;cursor:pointer}
button:hover{border-color:var(--acc)}
button.pri{background:var(--acc);border-color:var(--acc);color:#fff}
button.on{background:var(--ok);border-color:var(--ok);color:#fff}
button.no{background:var(--warn);border-color:var(--warn);color:#fff}
.seg{border:1.5px solid var(--line);border-radius:11px;padding:12px;margin-bottom:10px;background:#fdfcfa}
.seg.dropped{opacity:.45}
.seg .row{display:flex;gap:8px;align-items:center;margin-bottom:7px;flex-wrap:wrap}
.tag{background:var(--acc);color:#fff;font-size:12px;font-weight:700;border-radius:6px;padding:3px 8px}
label{display:block;font-size:12px;color:var(--mut);margin:6px 0 3px}
textarea{width:100%;font:16px/1.45 inherit;padding:9px 11px;border:1.5px solid var(--line);
  border-radius:9px;resize:vertical;min-height:44px;background:#fff;color:var(--ink)}
textarea:focus{outline:none;border-color:var(--acc)}
.hint{font-size:13px;color:var(--mut);margin:8px 0}
.nav{display:flex;gap:8px;justify-content:space-between;align-items:center;margin-top:14px}
.dots{display:flex;flex-wrap:wrap;gap:4px;margin-top:12px}
.dot{width:19px;height:19px;border-radius:5px;border:1.5px solid var(--line);background:#fff;
  font-size:10px;cursor:pointer;padding:0;min-height:0;display:flex;align-items:center;justify-content:center}
.dot.done{background:var(--ok);border-color:var(--ok);color:#fff}
.dot.skip{background:var(--warn);border-color:var(--warn);color:#fff}
.dot.here{outline:2.5px solid var(--acc);outline-offset:1px}
@media(prefers-color-scheme:dark){:root{--bg:#191818;--card:#232222;--ink:#ece8e3;--mut:#a09a93;--line:#383533}
canvas{background:#2c2a28}textarea,button{background:#2a2827;color:var(--ink)}.seg{background:#262423}}
</style>
<header><div class="bar">
  <h1>Découpage des variantes</h1>
  <div class="prog"><i id="pi"></i></div>
  <span class="count" id="pc">0/0</span>
  <button onclick="exportJson()" class="pri">Exporter</button>
</div></header>
<main>
  <div class="card" id="card"></div>
  <div class="nav">
    <button onclick="go(-1)">← Précédent</button>
    <span class="count" id="pos"></span>
    <button onclick="go(1)" class="pri">Suivant →</button>
  </div>
  <div class="dots" id="dots"></div>
  <p class="hint">Raccourcis — <b>espace</b> écouter tout · <b>1…9</b> écouter un segment ·
     <b>←/→</b> naviguer · <b>Entrée</b> valider et suivant. Cliquez sur la forme d'onde pour
     déplacer la coupe la plus proche.</p>
</main>
<script>
const ENTRIES = __ENTRIES__;
const KEY = 'monoko_variant_split_v1';
let state = {}, idx = 0, ac = null, buf = null, src = null, dur = 0, cuts = [];

try { state = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch(e) { state = {}; }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch(e){} };
const cur  = () => ENTRIES[idx];
const st   = (e) => state[e.row_id] || (state[e.row_id] = {
  decision: null,
  cuts: e.cuts.slice(),
  segments: e.segments.map(s => ({...s}))
});

/* ── audio ───────────────────────────────────────────────────────────────── */
async function loadAudio(e){
  buf = null; dur = 0;
  if (!e.audio) return;
  ac = ac || new (window.AudioContext || window.webkitAudioContext)();
  const bin = atob(e.audio.split(',')[1]);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  buf = await ac.decodeAudioData(arr.buffer);
  dur = buf.duration;
  draw();
}
function stop(){ if (src) { try { src.stop(); } catch(e){} src = null; } }
function play(from, to){
  if (!buf) return;
  stop();
  src = ac.createBufferSource();
  src.buffer = buf; src.connect(ac.destination);
  src.start(0, from, Math.max(0.05, (to ?? dur) - from));
}
const playSeg = (k) => { const b = bounds(); play(b[k], b[k+1]); };
function bounds(){
  const c = st(cur()).cuts.slice().sort((a,b) => a-b);
  return [0, ...c, dur];
}

/* ── waveform ────────────────────────────────────────────────────────────── */
function draw(){
  const cv = document.getElementById('wave'); if (!cv || !buf) return;
  const r = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
  cv.width = W * r; cv.height = H * r;
  const g = cv.getContext('2d'); g.scale(r, r); g.clearRect(0, 0, W, H);
  const d = buf.getChannelData(0), step = Math.floor(d.length / W) || 1;
  const css = getComputedStyle(document.documentElement);
  g.fillStyle = css.getPropertyValue('--mut').trim() || '#888';
  for (let x = 0; x < W; x++){
    let lo = 1, hi = -1;
    for (let j = 0; j < step; j++){ const v = d[x*step+j] || 0; if (v < lo) lo = v; if (v > hi) hi = v; }
    g.fillRect(x, (1+lo)*H/2, 1, Math.max(1, (hi-lo)*H/2));
  }
  const b = bounds(), acc = css.getPropertyValue('--acc').trim() || '#6b4ea8';
  b.slice(1, -1).forEach(t => {
    const x = t / dur * W;
    g.fillStyle = acc; g.fillRect(x-1.5, 0, 3, H);
    g.beginPath(); g.arc(x, 9, 8, 0, 7); g.fill();
  });
  g.font = '600 11px sans-serif';
  for (let k = 0; k < b.length-1; k++){
    g.fillStyle = acc;
    g.fillText(String(k+1), (b[k]/dur)*W + 5, H - 7);
  }
}
function onWave(ev){
  if (!buf) return;
  const cv = ev.currentTarget, r = cv.getBoundingClientRect();
  const x = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left) / r.width;
  const t = x * dur, s = st(cur());
  if (!s.cuts.length) { play(t); return; }
  let best = 0;
  s.cuts.forEach((c, i) => { if (Math.abs(c-t) < Math.abs(s.cuts[best]-t)) best = i; });
  s.cuts[best] = Math.max(0.05, Math.min(dur-0.05, t));
  save(); draw();
}

/* ── render ──────────────────────────────────────────────────────────────── */
function render(){
  const e = cur(), s = st(e);
  document.getElementById('card').innerHTML = `
    <div class="meta">${esc(e.lesson)} · row ${e.row_id} · ${s.segments.length} variantes</div>
    <div class="fr">${esc(e.french_raw || '')}</div>
    ${e.audio ? '<canvas id="wave"></canvas>' : '<p class="hint">⚠ pas d\'audio pour cette ligne</p>'}
    <div class="tools">
      <button onclick="play(0)">▶ Tout</button>
      ${s.segments.map((_, k) => `<button onclick="playSeg(${k})">▶ ${k+1}</button>`).join('')}
      <button onclick="resetCuts()">↺ Coupes suggérées</button>
    </div>
    ${s.segments.map((sg, k) => `
      <div class="seg ${sg.drop ? 'dropped' : ''}">
        <div class="row"><span class="tag">${k+1}</span>
          <button onclick="toggleDrop(${k})">${sg.drop ? 'Réintégrer' : 'Supprimer'}</button>
          <button onclick="playSeg(${k})">▶ écouter</button></div>
        <label>Français</label>
        <textarea oninput="edit(${k},'fr',this.value)">${esc(sg.fr)}</textarea>
        <label>Lingala</label>
        <textarea oninput="edit(${k},'ln',this.value)">${esc(sg.ln)}</textarea>
      </div>`).join('')}
    <div class="tools">
      <button class="${s.decision === 'split' ? 'on' : ''}" onclick="decide('split')">✓ Séparer</button>
      <button class="${s.decision === 'keep'  ? 'on' : ''}" onclick="decide('keep')">Garder groupé</button>
      <button class="${s.decision === 'rerecord' ? 'no' : ''}" onclick="decide('rerecord')">À réenregistrer</button>
    </div>`;
  const cv = document.getElementById('wave');
  if (cv){ cv.addEventListener('click', onWave); cv.addEventListener('touchstart', onWave, {passive:true}); }
  loadAudio(e);
  document.getElementById('pos').textContent = `${idx+1} / ${ENTRIES.length}`;
  const done = ENTRIES.filter(x => state[x.row_id]?.decision).length;
  document.getElementById('pc').textContent = `${done}/${ENTRIES.length}`;
  document.getElementById('pi').style.width = (100*done/ENTRIES.length) + '%';
  document.getElementById('dots').innerHTML = ENTRIES.map((x, i) => {
    const d = state[x.row_id]?.decision;
    return `<button class="dot ${d === 'rerecord' ? 'skip' : d ? 'done' : ''} ${i === idx ? 'here' : ''}"
             onclick="jump(${i})" title="${esc(x.lesson)}">${d ? '' : ''}</button>`;
  }).join('');
}
const esc = (t) => (t ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function edit(k, f, v){ st(cur()).segments[k][f] = v; save(); }
function toggleDrop(k){ const s = st(cur()); s.segments[k].drop = !s.segments[k].drop; save(); render(); }
function resetCuts(){ st(cur()).cuts = cur().cuts.slice(); save(); draw(); }
function decide(d){ st(cur()).decision = d; save(); render(); if (d) setTimeout(() => go(1), 180); }
function go(n){ stop(); idx = Math.max(0, Math.min(ENTRIES.length-1, idx+n)); render(); }
function jump(i){ stop(); idx = i; render(); }

addEventListener('keydown', ev => {
  if (ev.target.tagName === 'TEXTAREA') return;
  if (ev.key === ' ') { ev.preventDefault(); play(0); }
  else if (ev.key === 'ArrowRight') go(1);
  else if (ev.key === 'ArrowLeft') go(-1);
  else if (ev.key === 'Enter') decide('split');
  else if (/^[1-9]$/.test(ev.key)) playSeg(+ev.key - 1);
});

function exportJson(){
  const out = ENTRIES.map(e => ({
    row_id: e.row_id, lesson_id: e.lesson_id, audio_url: e.audio_url,
    example_french: e.example_french, example_dialect: e.example_dialect,
    ...(state[e.row_id] || {decision: null})
  })).filter(x => x.decision);
  const b = new Blob([JSON.stringify({exported_at: new Date().toISOString(), rows: out}, null, 2)],
                     {type: 'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b);
  a.download = 'variant_split_decisions.json';
  a.click();
}
render();
</script>
"""


def main() -> None:
    entries = build_entries()
    if not entries:
        sys.exit("No multi-variant rows found.")
    html = HTML.replace("__ENTRIES__", json.dumps(entries, ensure_ascii=False))
    OUT.write_text(html, encoding="utf-8")
    with_audio = sum(1 for e in entries if e["audio"])
    print(f"{len(entries)} rows ({with_audio} with audio) -> {OUT}  "
          f"[{OUT.stat().st_size / 1e6:.1f} MB]")
    print(f"open {OUT}")


if __name__ == "__main__":
    main()
