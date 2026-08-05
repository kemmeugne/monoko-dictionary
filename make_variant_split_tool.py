#!/usr/bin/env python3
"""
make_variant_split_tool.py
───────────────────────────
Builds a self-contained HTML review tool for the `lesson_items` rows whose
Lingala cell holds several dash-separated variants in one field.

The professor read *every* variant into a single audio clip (duration tracks the
combined text length), so splitting the text into separate rows also means
deciding where the clip is cut.

Cutting on the N-1 *longest* pauses alone is wrong ~88% of the time — he pauses
mid-sentence as often as between variants. Weighting each candidate pause by how
close it sits to the position the text predicts (see `suggest_cuts`) agrees with
the text on 98% of clips, so the tool pre-places cuts and reports a per-row
confidence rather than asking for every cut by hand.

That confidence is only a self-consistency check between two signals, not ground
truth, so a human still confirms. This tool renders one row per screen with a
waveform, the pre-placed cuts, per-segment playback and editable text, and
exports a decision JSON that `apply_variant_split.py` consumes.

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


def expand_slash(v: str) -> list[str]:
    """'Bokoki/okoki kokitisa ngai awa ?' -> two full sentences.

    Only an unspaced slash joining word-forms is expanded. A spaced slash
    ('Yaya / Ya', 'Teká ! / Tekisá !') is left alone: sometimes it is one
    concept the course should keep together, and that is a human call.
    """
    words = re.split(r"(\s+)", v)
    for i, w in enumerate(words):
        if "/" in w and len(w) > 2 and not w.startswith("/") and not w.endswith("/"):
            alts = [a for a in w.split("/") if a]
            if len(alts) < 2:
                continue
            out = []
            for a in alts:
                copy = words[:]
                copy[i] = a[0].upper() + a[1:] if i == 0 else a
                out.append("".join(copy))
            return out
    return [v]


def variants(text: str | None) -> list[str]:
    if not text:
        return []
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    if not any(l.startswith(("-", "•", "*")) for l in lines):
        return []
    return [re.sub(r"^[-•*]\s*", "", l).strip() for l in lines]


ALPHA = 8.0  # weight of the text-position prior against raw pause length


def probe_silence(path: Path) -> tuple[list[tuple[float, float]], float]:
    r = subprocess.run(
        ["ffmpeg", "-nostdin", "-i", str(path), "-af",
         "silencedetect=noise=-32dB:d=0.20", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    starts = [float(x) for x in re.findall(r"silence_start: ([-\d.]+)", r.stderr)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", r.stderr)]
    d = re.search(r"Duration: (\d+):(\d+):([\d.]+)", r.stderr)
    total = int(d.group(2)) * 60 + float(d.group(3)) if d else 0.0
    return sorted(zip(starts, ends)), total


def speech_before(t: float, silences: list[tuple[float, float]]) -> float:
    """Seconds of actual speech between 0 and t, discounting silence."""
    s = t
    for a, b in silences:
        if b <= t:
            s -= (b - a)
        elif a < t:
            s -= (t - a)
    return max(s, 0.0)


def suggest_cuts(path: Path, texts: list[str]) -> tuple[list[float], float]:
    """Cut points, plus a 0-1 confidence.

    Picking the N-1 *longest* pauses alone is wrong ~88% of the time — the
    professor pauses mid-sentence as often as between variants. Scoring each
    candidate pause by `duration - ALPHA * position_error`, where the expected
    position comes from each variant's share of the total characters (measured
    in speech seconds, not wall-clock), makes two independent signals agree.

    Confidence is how well the resulting speech shares match the text shares;
    a low value means no real pause sits where the text says the break is, and
    the row needs a careful human listen.
    """
    n = len(texts)
    sil, total = probe_silence(path)
    if total <= 0 or n < 2:
        return [], 0.0
    chars = [max(len(t), 1) for t in texts]
    tc = sum(chars)
    speech_total = speech_before(total, sil) or total
    cands = [((a + b) / 2, b - a) for a, b in sil if b - a >= 0.20]

    picks: list[float] = []
    prev = 0.0
    for i in range(1, n):
        target = speech_total * sum(chars[:i]) / tc
        best = None
        for mid, dur in cands:
            if mid <= prev + 0.15:
                continue
            err = abs(speech_before(mid, sil) - target) / speech_total
            score = dur - ALPHA * err
            if best is None or score > best[0]:
                best = (score, mid)
        if best is None:
            return [], 0.0
        picks.append(round(best[1], 3))
        prev = best[1]

    bounds = [0.0] + picks + [total]
    shares = [speech_before(bounds[k + 1], sil) - speech_before(bounds[k], sil) for k in range(n)]
    s = sum(shares) or 1.0
    worst = max(abs(shares[k] / s - chars[k] / tc) for k in range(n))
    return picks, round(max(0.0, 1.0 - worst / 0.25), 2)


def build_entries() -> list[dict]:
    _, lessons, items = ing.fetch_db()
    rows = [i for i in items.values() if len(variants(i["dialect"])) > 1]
    rows.sort(key=lambda i: (i["lesson_id"], i["item_order"] or 0))

    entries = []
    for row in rows:
        vs = variants(row["dialect"])
        fr_vs = variants(row["french"])
        # "[Formel]" / "[Argot kinois]" is the register of the whole row, not of
        # one variant, so it rides along onto every split — including glosses,
        # where the parent French is a stub note the reviewer replaces outright.
        tag = re.match(r"^\s*(\[[^\]]+\])", row["french"] or "")
        prefix = tag.group(1) + " " if tag else ""
        segments = []
        for k, v in enumerate(vs):
            if is_header(v):                                     # "Eyélé / Motoí:" label
                segments.append({"ln": v, "fr": "", "drop": True})
                continue

            # Resolve the French BEFORE expanding slashes. A gloss carries its
            # own slashes inside the parentheses ("Douter/discuter avec
            # quelqu'un"), and those are alternative French senses, not extra
            # Lingala utterances — expanding them shreds the entry.
            gloss = GLOSS_RE.match(v)
            if gloss:
                ln_text = gloss.group("ln").strip()
                fr = gloss.group("fr").strip()
                fr_text = prefix + (fr[0].upper() + fr[1:]) if fr else prefix.strip()
            else:
                ln_text = v
                fr_text = fr_vs[k] if len(fr_vs) == len(vs) else (row["french"] or "").strip()

            # He reads every combination, so a dash-variant holding an unspaced
            # slash accounts for several utterances in the one clip.
            alts = expand_slash(ln_text)
            for a in alts:
                segments.append({"ln": a, "fr": fr_text, "drop": False,
                                 **({"from_slash": True} if len(alts) > 1 else {})})

        key = (row["audio_url"] or "").split("/Lingala/lesson_items/")[-1]
        mp3 = MP3_CACHE / key
        audio, cuts, conf, sil, total = "", [], 0.0, [], 0.0
        if row["audio_url"] and mp3.exists():
            audio = "data:audio/mpeg;base64," + base64.b64encode(mp3.read_bytes()).decode()
            cuts, conf = suggest_cuts(mp3, [s["ln"] for s in segments])
            raw, total = probe_silence(mp3)
            sil = [[round(a, 3), round(b, 3)] for a, b in raw]

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
            "confidence": conf,
            "sil": sil,
            "total": round(total, 3),
            # A slash inside a variant is itself an alternative ("Bokoki/okoki"),
            # so he read more utterances than there are variants and the cut
            # cannot be trusted however high the confidence looks. Verified on
            # row 8494: confidence 0.97, cut wrong by 4.8s.
            "has_slash": any("/" in s["ln"] for s in segments),
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
     déplacer la coupe la plus proche.<br>
     Si vous entendez <b>plus d'énoncés que de variantes</b> (fréquent quand le texte
     contient « / »), utilisez <b>＋ variante</b> : les coupes sont recalculées pour
     le nouveau nombre.</p>
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
function speechBefore(t, sil){
  let s = t;
  for (const [a,b] of sil){ if (b <= t) s -= (b-a); else if (a < t) s -= (t-a); }
  return Math.max(s, 0);
}
// Same scoring as suggest_cuts() in make_variant_split_tool.py: pause length
// penalised by how far it sits from where the text says the break belongs,
// measured in speech seconds. Re-run whenever the segment count changes.
function suggestCuts(segs){
  const e = cur(), sil = e.sil || [], total = e.total || dur;
  const n = segs.length;
  if (n < 2 || !total || !sil.length) return [];
  const chars = segs.map(s => Math.max((s.ln||'').length, 1));
  const tc = chars.reduce((a,b) => a+b, 0);
  const ST = speechBefore(total, sil) || total;
  const cands = sil.filter(([a,b]) => b-a >= 0.20).map(([a,b]) => [(a+b)/2, b-a]);
  const picks = []; let prev = 0;
  for (let i = 1; i < n; i++){
    const target = ST * chars.slice(0,i).reduce((a,b)=>a+b,0) / tc;
    let best = null;
    for (const [mid,d] of cands){
      if (mid <= prev + 0.15) continue;
      const sc = d - 8 * Math.abs(speechBefore(mid,sil) - target) / ST;
      if (!best || sc > best[0]) best = [sc, mid];
    }
    if (!best) break;
    picks.push(+best[1].toFixed(3)); prev = best[1];
  }
  return picks;
}
function addSeg(k){
  const s = st(cur());
  s.segments.splice(k+1, 0, {...s.segments[k], ln: s.segments[k].ln});
  s.cuts = suggestCuts(s.segments); save(); render();
}
function delSeg(k){
  const s = st(cur());
  if (s.segments.length < 2) return;
  s.segments.splice(k, 1);
  s.cuts = suggestCuts(s.segments); save(); render();
}
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
    <div class="meta">${esc(e.lesson)} · row ${e.row_id} · ${s.segments.length} variantes ·
       <b style="color:${e.confidence>=0.8?'var(--ok)':e.confidence>=0.5?'var(--acc)':'var(--warn)'}">
       coupe auto ${Math.round(e.confidence*100)}%</b>
       ${e.has_slash?'<b style="color:var(--warn)"> · ⚠ contient « / » — plus d\'énoncés que de variantes, vérifier à l\'oreille</b>':''}</div>
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
          <button onclick="toggleDrop(${k})">${sg.drop ? 'Réintégrer' : 'Ignorer'}</button>
          <button onclick="playSeg(${k})">▶ écouter</button>
          <button onclick="addSeg(${k})" title="le clip contient un énoncé de plus">＋ variante</button>
          <button onclick="delSeg(${k})" title="supprimer cette variante">✕</button></div>
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
