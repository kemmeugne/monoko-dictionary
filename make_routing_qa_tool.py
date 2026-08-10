#!/usr/bin/env python3
"""
make_routing_qa_tool.py
───────────────────────
Builds `routing_qa_tool.html` — a review page for measuring how often
`route_corpus_to_lessons.py` puts a sentence in the right lesson.

Why this exists: 4,382 of the 5,729 pool rows are auto-routed, so they become the
backbone of every exercise. Precision has been eyeballed on a handful of samples,
which is not a measurement. If it is really 70%, one exercise in three is
off-topic and we would find out from users rather than from a spreadsheet.

The sample is STRATIFIED BY SIMILARITY, not uniform. A uniform sample of accepted
rows measures precision at the current threshold but says nothing about where the
threshold *should* be. Sampling evenly across bands — including a band below the
current cut — lets us plot precision against similarity and choose the knee.
Rows below 0.55 are included on purpose: if they turn out to be mostly fine, the
threshold is too strict and we are discarding usable material.

Usage:
    python3 make_routing_qa_tool.py                 # 100 items, 4 bands
    python3 make_routing_qa_tool.py --n 160 --seed 7
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

ROUTING = Path("artifacts/professor_ingest/corpus_routing.json")
OUT = Path("routing_qa_tool.html")

# The lowest band sits under the 0.55 threshold deliberately — see the docstring.
BANDS = [(0.45, 0.55), (0.55, 0.65), (0.65, 0.75), (0.75, 1.01)]

HTML = """<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Monoko — Contrôle du routage</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
         background:#14161a; color:#e8e6e3; }
  header { position:sticky; top:0; background:#1b1e24; border-bottom:1px solid #2c313a;
           padding:12px 20px; display:flex; align-items:center; gap:16px; z-index:5; }
  h1 { font-size:15px; margin:0; font-weight:600; }
  .bar { flex:1; height:6px; background:#2c313a; border-radius:3px; overflow:hidden; }
  .bar i { display:block; height:100%; background:#7c5cff; width:0; transition:width .2s; }
  .count { font-size:13px; color:#9aa0aa; font-variant-numeric:tabular-nums; }
  button { font:inherit; cursor:pointer; border-radius:9px; border:1px solid #333944;
           background:#232833; color:#e8e6e3; padding:9px 14px; }
  button:hover { border-color:#4a5364; }
  .export { background:#7c5cff; border-color:#7c5cff; color:#fff; font-weight:600; }
  main { max-width:720px; margin:0 auto; padding:28px 20px 80px; }
  .card { background:#1b1e24; border:1px solid #2c313a; border-radius:16px; padding:24px; }
  .meta { font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:#7c8595;
          margin-bottom:18px; display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
  .tag { background:#232833; border-radius:5px; padding:2px 7px; }
  .tag.untoned { background:#4a2c14; color:#ffb37a; }
  .lesson { font-size:22px; font-weight:700; margin:0 0 4px; }
  .level { font-size:13px; color:#9aa0aa; margin-bottom:22px; }
  .pair { background:#14161a; border:1px solid #2c313a; border-radius:12px;
          padding:16px 18px; margin-bottom:14px; }
  .fr { font-size:16px; margin-bottom:6px; }
  .ln { font-size:16px; color:#8fd6a0; font-weight:600; }
  .why { font-size:12px; color:#7c8595; margin-bottom:22px; line-height:1.5; }
  .why b { color:#9aa0aa; font-weight:600; }
  .actions { display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; }
  .yes { border-color:#2f7d4f; } .yes:hover { background:#1d3d2a; }
  .no  { border-color:#8c3b3b; } .no:hover  { background:#3d1d1d; }
  audio { width:100%; margin-top:12px; height:34px; }
  .hint { margin-top:22px; font-size:12px; color:#6b7280; line-height:1.6; }
  .done { text-align:center; padding:70px 20px; }
  .done h2 { font-size:26px; margin:0 0 12px; }
  kbd { background:#232833; border:1px solid #333944; border-radius:4px;
        padding:1px 6px; font-size:11px; font-family:ui-monospace,monospace; }
</style></head><body>
<header>
  <h1>Contrôle du routage</h1>
  <div class="bar"><i id="bar"></i></div>
  <span class="count" id="count">0 / 0</span>
  <button class="export" onclick="exportJson()">Exporter</button>
</header>
<main id="main"></main>
<script>
const ITEMS = __ITEMS__;
const answers = {};
let i = 0;

function render() {
  const main = document.getElementById('main');
  document.getElementById('count').textContent = Object.keys(answers).length + ' / ' + ITEMS.length;
  document.getElementById('bar').style.width = (100 * Object.keys(answers).length / ITEMS.length) + '%';

  if (i >= ITEMS.length) {
    main.innerHTML = '<div class="done"><h2>Terminé</h2>' +
      '<p style="color:#9aa0aa">Cliquez sur Exporter et renvoyez le fichier.</p></div>';
    return;
  }
  const it = ITEMS[i];
  const orth = it.orthography === 'untoned'
    ? '<span class="tag untoned">sans accents</span>' : '';
  main.innerHTML = `
    <div class="card">
      <div class="meta">
        <span>${i + 1} / ${ITEMS.length}</span>
        <span class="tag">similarité ${it.similarity.toFixed(2)}</span>
        <span class="tag">${it.source_table}</span>
        ${orth}
      </div>
      <p class="lesson">${esc(it.lesson)}</p>
      <p class="level">Cette phrase a-t-elle sa place dans cette leçon&nbsp;?</p>
      <div class="pair">
        <div class="fr">${esc(it.french)}</div>
        <div class="ln">${esc(it.lingala)}</div>
        ${it.audio_url ? `<audio controls preload="none" src="${it.audio_url}"></audio>` : ''}
      </div>
      <p class="why"><b>Rapprochée de&nbsp;:</b> ${esc(it.matched_item || '—')}</p>
      <div class="actions">
        <button class="yes" onclick="mark('yes')">Oui, sa place ✓</button>
        <button class="no"  onclick="mark('no')">Non ✗</button>
        <button onclick="mark('unsure')">Incertain</button>
      </div>
      <p class="hint">Raccourcis&nbsp;: <kbd>1</kbd> oui · <kbd>2</kbd> non ·
        <kbd>3</kbd> incertain · <kbd>←</kbd> revenir<br>
        Jugez seulement le <b>thème</b>&nbsp;: la phrase pourrait-elle apparaître dans un
        exercice de cette leçon&nbsp;? La qualité du lingala n'est pas en cause ici.</p>
    </div>`;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g,
    c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}
function mark(v) { answers[ITEMS[i].idx] = v; i++; render(); }
document.addEventListener('keydown', e => {
  if (e.key === '1') mark('yes');
  else if (e.key === '2') mark('no');
  else if (e.key === '3') mark('unsure');
  else if (e.key === 'ArrowLeft' && i > 0) { i--; render(); }
});
function exportJson() {
  const rows = ITEMS.map(it => ({
    idx: it.idx, verdict: answers[it.idx] || null, similarity: it.similarity,
    source_table: it.source_table, lesson_id: it.lesson_id, lesson: it.lesson,
    french: it.french, lingala: it.lingala,
  }));
  const blob = new Blob([JSON.stringify({ reviewed_at: new Date().toISOString(), rows }, null, 1)],
    { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'routing_qa_verdicts.json';
  a.click();
}
render();
</script></body></html>
"""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=100, help="total items to review (default 100)")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    if not ROUTING.exists():
        raise SystemExit(f"{ROUTING} missing — run route_corpus_to_lessons.py first")
    data = json.loads(ROUTING.read_text(encoding="utf-8"))
    routed = [r for r in data["rows"] if not r["is_native"]]

    # The routing file only holds rows at or above its own threshold, so the
    # sub-threshold band is empty unless it was generated with a lower one.
    rng = random.Random(args.seed)
    per = max(1, args.n // len(BANDS))
    sample, idx = [], 0
    for lo, hi in BANDS:
        band = [r for r in routed if lo <= r["similarity"] < hi]
        if not band:
            print(f"  band {lo:.2f}-{hi:.2f}: empty (re-run routing with --threshold {lo} to include it)")
            continue
        for r in rng.sample(band, min(per, len(band))):
            sample.append({**r, "idx": idx})
            idx += 1
        print(f"  band {lo:.2f}-{hi:.2f}: {min(per, len(band))} sampled of {len(band)}")

    rng.shuffle(sample)  # so the reviewer cannot infer the band from position
    OUT.write_text(HTML.replace("__ITEMS__", json.dumps(sample, ensure_ascii=False)),
                   encoding="utf-8")
    print(f"\n{len(sample)} items -> {OUT}  [{OUT.stat().st_size/1024:.0f} KB]")
    print(f"open {OUT}")


if __name__ == "__main__":
    main()
