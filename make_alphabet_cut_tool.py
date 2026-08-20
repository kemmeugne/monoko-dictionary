#!/usr/bin/env python3
"""
Builds alphabet_cut_tool.html — confirm where the WORD starts in each of L346's
46 clips, so the exercise engine can play the word without the letter.

    SUPABASE_SERVICE_KEY=... python3 make_alphabet_cut_tool.py
    open alphabet_cut_tool.html
    ... review, then "Télécharger les décisions" ...
    SUPABASE_SERVICE_KEY=... python3 apply_alphabet_cuts.py alphabet_cut_decisions.json

WHY A REVIEW TOOL AND NOT A HEURISTIC
"Sons et alphabet" clips read the sound before the word -- "O ... Motóki" --
which is right for the lesson page and useless for an exercise: the answer is
announced before the question. Cutting the letter off sounds like a one-line
silence split until you measure it. Across the 46 clips:

    1 speech segment    4 clips
    2 speech segments  30 clips
    3 speech segments   9 clips
    4 speech segments   3 clips

Only the 30 are the expected [letter][word]. The rest are breaths, repeats, a
second example, or a letter and word run together with no gap at all. No
confidence score tells those apart -- the variant split learned that the hard
way, where row 8494 scored 0.97 and was 4.8 s wrong -- so the machine proposes
and a human confirms.

WHAT IT PROPOSES
The LAST speech segment, which is the word in the common two-segment case. For
a single-segment clip it proposes the whole thing and flags it, because either
the professor ran the letter into the word or he only ever said the word.

The audio is embedded as base64 rather than linked: R2 sends no CORS header, so
decodeAudioData on a fetched URL is blocked and the waveform would not draw.
"""
import base64, json, os, re, subprocess, sys, urllib.request
from pathlib import Path

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://haioiccujncsehadipzb.supabase.co").rstrip("/")
LESSON_ID = 346
CACHE = Path(".alphabet_clips")
OUT = Path("alphabet_cut_tool.html")
ROLLBACK_DIR = Path("artifacts/lesson_backups")

# silencedetect settings, same as make_variant_split_tool.py
NOISE_DB = "-32dB"
MIN_SIL = "0.20"
MIN_SEG = 0.15      # shorter than this is a click or a breath, not speech
PAD = 0.08          # keep a little air either side of the cut


def key() -> str:
    k = os.environ.get("SUPABASE_SERVICE_KEY")
    if not k:
        sys.exit("SUPABASE_SERVICE_KEY not set")
    return k


def get(path):
    r = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/{path}",
                               headers={"apikey": key(), "Authorization": f"Bearer {key()}"})
    return json.load(urllib.request.urlopen(r))


def fetch(url: str, dest: Path):
    # R2 rejects urllib's default User-Agent with a 403.
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    dest.write_bytes(urllib.request.urlopen(req).read())


def speech_segments(p: Path):
    """(duration, [(start, end), ...]) of everything that is not silence."""
    out = subprocess.run(
        ["ffmpeg", "-nostdin", "-i", str(p),
         "-af", f"silencedetect=noise={NOISE_DB}:d={MIN_SIL}", "-f", "null", "-"],
        capture_output=True, text=True).stderr
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", out)
    dur = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
    starts = [max(0.0, float(x)) for x in re.findall(r"silence_start: ([-\d.]+)", out)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", out)]
    segs, cur = [], 0.0
    for a, b in sorted(zip(starts, ends)):
        if a > cur + 0.12:
            segs.append((round(cur, 3), round(a, 3)))
        cur = max(cur, b)
    if dur > cur + 0.12:
        segs.append((round(cur, 3), round(dur, 3)))
    return dur, [s for s in segs if s[1] - s[0] >= MIN_SEG]


def main():
    CACHE.mkdir(exist_ok=True)

    # The pool's audio_url now points at the dictionary for 21 rows, so the
    # ORIGINAL course clip comes from the most recent rollback file. That file
    # is the only record of what each row pointed at before.
    backups = sorted(ROLLBACK_DIR.glob("alphabet_pool_*.json"))
    if not backups:
        sys.exit(f"no alphabet_pool_*.json in {ROLLBACK_DIR} — run populate_alphabet_pool.py first")
    was = {r["id"]: r for r in json.loads(backups[-1].read_text())["updated"]}
    print(f"original clips from {backups[-1].name}")

    pool = get(f"lesson_pool?lesson_id=eq.{LESSON_ID}&select=id,french,lingala,audio_url&order=id")

    entries, counts = [], {}
    for r in pool:
        src = (was.get(r["id"]) or {}).get("audio_url") or r["audio_url"]
        if not src:
            continue
        name = src.split("/")[-1]
        p = CACHE / name
        if not p.exists():
            fetch(src, p)
        dur, segs = speech_segments(p)
        counts[len(segs)] = counts.get(len(segs), 0) + 1
        # The word is the last thing said, in the common case.
        sel = segs[-1] if segs else (0.0, dur)
        entries.append({
            "id": r["id"], "french": r["french"], "lingala": r["lingala"],
            "file": name, "src": src, "dur": round(dur, 3),
            "segments": [list(s) for s in segs],
            "start": round(max(0.0, sel[0] - PAD), 3),
            "end": round(min(dur, sel[1] + PAD), 3),
            "lone": len(segs) <= 1,
            "audio": "data:audio/mpeg;base64," + base64.b64encode(p.read_bytes()).decode(),
        })

    print(f"{len(entries)} clips · segments per clip: {dict(sorted(counts.items()))}")
    OUT.write_text(HTML.replace("__ENTRIES__", json.dumps(entries, ensure_ascii=False)),
                   encoding="utf-8")
    print(f"wrote {OUT}  ({OUT.stat().st_size/1024/1024:.1f} MB)  — open it in a browser")


HTML = r"""<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sons et alphabet — couper la lettre</title>
<style>
 body{font:15px/1.5 -apple-system,system-ui,sans-serif;margin:0;background:#FDFBF7;color:#2D2118}
 header{position:sticky;top:0;background:#fff;border-bottom:1px solid #E8E0D4;padding:12px 20px;z-index:5;
        display:flex;align-items:center;gap:16px;flex-wrap:wrap}
 h1{font-size:16px;margin:0;font-weight:800}
 .count{font-family:ui-monospace,monospace;font-size:13px;color:#9B8A6E}
 button{font:inherit;border:1px solid #E8E0D4;background:#fff;border-radius:10px;padding:8px 14px;cursor:pointer}
 button.primary{background:#6B21A8;color:#fff;border-color:#6B21A8;font-weight:700}
 button:disabled{opacity:.45;cursor:default}
 main{padding:20px;max-width:900px;margin:0 auto}
 .card{background:#fff;border:1px solid #E8E0D4;border-radius:16px;padding:18px;margin-bottom:16px}
 .card.done{border-color:#16A34A;background:#F6FCF8}
 .card.lone{border-color:#D4A843;background:#FFFDF5}
 .top{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:4px}
 .fr{font-weight:700}
 .ln{font-family:Georgia,serif;font-size:20px;font-weight:700;color:#2C5F2D}
 .meta{font-family:ui-monospace,monospace;font-size:12px;color:#9B8A6E;margin-bottom:10px}
 canvas{width:100%;height:96px;display:block;border-radius:10px;background:#F7F3ED;cursor:crosshair}
 .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}
 .seg{font-family:ui-monospace,monospace;font-size:12px}
 .warn{color:#B45309;font-weight:700}
 .ok{color:#16A34A;font-weight:700}
</style>
<header>
  <h1>Sons et alphabet — garder le mot, couper la lettre</h1>
  <span class="count" id="count"></span>
  <button class="primary" id="dl">Télécharger les décisions</button>
</header>
<main id="list"></main>
<script>
const E = __ENTRIES__;
const ac = new (window.AudioContext||window.webkitAudioContext)();
const bufs = {}, peaks = {};
let playing = null;

async function load(i){
  if (bufs[i]) return bufs[i];
  const arr = await (await fetch(E[i].audio)).arrayBuffer();
  const b = await ac.decodeAudioData(arr);
  bufs[i] = b;
  const ch = b.getChannelData(0), N = 900, step = Math.floor(ch.length/N), pk = [];
  for (let k=0;k<N;k++){ let m=0; for(let j=0;j<step;j++){const v=Math.abs(ch[k*step+j]||0); if(v>m)m=v;} pk.push(m); }
  peaks[i] = pk;
  return b;
}
function draw(i){
  const c = document.getElementById('c'+i); if(!c||!peaks[i]) return;
  const w = c.width = c.clientWidth*2, h = c.height = 192, pk = peaks[i], e = E[i];
  const x = t => t/e.dur*w;
  const g = c.getContext('2d'); g.clearRect(0,0,w,h);
  // every detected segment, faint
  g.fillStyle='#E8E0D4';
  for(const [a,b] of e.segments) g.fillRect(x(a),0,x(b)-x(a),h);
  // the chosen region
  g.fillStyle='#EAD9FA'; g.fillRect(x(e.start),0,x(e.end)-x(e.start),h);
  // waveform
  g.fillStyle='#6B5B45';
  for(let k=0;k<pk.length;k++){ const hh=Math.max(1,pk[k]*h*0.92); g.fillRect(k/pk.length*w,(h-hh)/2,w/pk.length,hh); }
  // handles
  g.fillStyle='#6B21A8'; g.fillRect(x(e.start)-2,0,4,h); g.fillRect(x(e.end)-2,0,4,h);
}
function play(i,from,to){
  if(playing){try{playing.stop()}catch(_){ }}
  const s = ac.createBufferSource(); s.buffer = bufs[i]; s.connect(ac.destination);
  s.start(0, from, Math.max(0.05,to-from)); playing = s;
}
function render(){
  document.getElementById('list').innerHTML = E.map((e,i)=>`
    <div class="card ${e.done?'done':''} ${e.lone&&!e.done?'lone':''}" id="card${i}">
      <div class="top"><span class="fr">${e.french}</span><span class="ln">${e.lingala}</span></div>
      <div class="meta">${e.file} · ${e.dur.toFixed(2)}s ·
        ${e.segments.length} segment(s)
        ${e.lone?'<span class="warn">— un seul segment, vérifier si la lettre est collée au mot</span>':''}
        ${e.done?'<span class="ok">— confirmé</span>':''}</div>
      <canvas id="c${i}"></canvas>
      <div class="row">
        <button onclick="play(${i},0,E[${i}].dur)">▶ tout</button>
        <button onclick="play(${i},E[${i}].start,E[${i}].end)">▶ la coupe</button>
        ${e.segments.map(([a,b],k)=>`<button onclick="pick(${i},${k})">segment ${k+1} <span class="seg">${a.toFixed(2)}–${b.toFixed(2)}</span></button>`).join('')}
        <button onclick="nudge(${i},'start',-0.05)">◀ début</button>
        <button onclick="nudge(${i},'start',0.05)">début ▶</button>
        <button onclick="nudge(${i},'end',-0.05)">◀ fin</button>
        <button onclick="nudge(${i},'end',0.05)">fin ▶</button>
        <button onclick="skip(${i})">${e.skip?'annuler « ne pas couper »':'ne pas couper'}</button>
        <button class="primary" onclick="confirm_(${i})">confirmer</button>
      </div>
    </div>`).join('');
  E.forEach((_,i)=>load(i).then(()=>draw(i)));
  const done = E.filter(x=>x.done).length;
  document.getElementById('count').textContent = `${done}/${E.length} confirmés`;
}
function pick(i,k){ const [a,b]=E[i].segments[k];
  E[i].start=Math.max(0,+(a-0.08).toFixed(3)); E[i].end=Math.min(E[i].dur,+(b+0.08).toFixed(3));
  draw(i); play(i,E[i].start,E[i].end); }
function nudge(i,which,d){ E[i][which]=Math.max(0,Math.min(E[i].dur,+(E[i][which]+d).toFixed(3)));
  draw(i); play(i,E[i].start,E[i].end); }
function skip(i){ E[i].skip=!E[i].skip; E[i].done=true; render(); }
function confirm_(i){ E[i].done=true; E[i].skip=false; render();
  const n=document.getElementById('card'+(i+1)); if(n) n.scrollIntoView({behavior:'smooth',block:'center'}); }
document.getElementById('dl').onclick = ()=>{
  const out = E.map(e=>({id:e.id, file:e.file, src:e.src, lingala:e.lingala,
                         start:e.start, end:e.end, skip:!!e.skip, confirmed:!!e.done}));
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(out,null,1)],{type:'application/json'}));
  a.download='alphabet_cut_decisions.json'; a.click();
};
render();
</script>
"""

if __name__ == "__main__":
    main()
