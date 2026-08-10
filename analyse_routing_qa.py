#!/usr/bin/env python3
"""
analyse_routing_qa.py
─────────────────────
Reads `routing_qa_verdicts.json` exported by `routing_qa_tool.html` and reports
precision per similarity band, so the routing threshold is chosen from data
rather than taste.

Read the output as follows:
  - Precision should fall as similarity falls. If it does not, similarity is not
    measuring what we think it is and the whole routing approach needs a rethink.
  - Set the threshold at the lowest band still above the target precision. Every
    band you accept below that is material you keep at the cost of noise.
  - "Incertain" verdicts are excluded from the ratio and reported separately: a
    high rate of them means the question was ambiguous, not that routing is bad.

Usage:
    python3 analyse_routing_qa.py ~/Downloads/routing_qa_verdicts.json
    python3 analyse_routing_qa.py <file> --target 0.85
"""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path

BANDS = [(0.45, 0.55), (0.55, 0.65), (0.65, 0.75), (0.75, 1.01)]
ROUTING = Path("artifacts/professor_ingest/corpus_routing.json")


def band_of(sim: float):
    for lo, hi in BANDS:
        if lo <= sim < hi:
            return (lo, hi)
    return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("verdicts")
    ap.add_argument("--target", type=float, default=0.85,
                    help="precision required to accept a band (default 0.85)")
    args = ap.parse_args()

    rows = json.loads(Path(args.verdicts).read_text(encoding="utf-8"))["rows"]
    judged = [r for r in rows if r.get("verdict")]
    if not judged:
        raise SystemExit("no verdicts in that file")
    if len(judged) < len(rows):
        print(f"note: {len(rows) - len(judged)} of {len(rows)} items were left unanswered\n")

    by_band = defaultdict(list)
    for r in judged:
        b = band_of(r["similarity"])
        if b:
            by_band[b].append(r)

    print(f"{'band':<14}{'n':>4}{'oui':>6}{'non':>6}{'?':>4}{'précision':>11}")
    print("-" * 45)
    keep = None
    for lo, hi in BANDS:
        rs = by_band.get((lo, hi), [])
        if not rs:
            continue
        c = Counter(r["verdict"] for r in rs)
        decided = c["yes"] + c["no"]
        p = c["yes"] / decided if decided else 0.0
        flag = "  ✓" if p >= args.target else "  ✗"
        print(f"{lo:.2f}–{hi:.2f}   {len(rs):>4}{c['yes']:>6}{c['no']:>6}{c['unsure']:>4}"
              f"{p:>10.0%}{flag}")
        if p >= args.target:
            keep = lo if keep is None else min(keep, lo)

    allc = Counter(r["verdict"] for r in judged)
    decided = allc["yes"] + allc["no"]
    print("-" * 45)
    print(f"{'overall':<14}{len(judged):>4}{allc['yes']:>6}{allc['no']:>6}{allc['unsure']:>4}"
          f"{(allc['yes']/decided if decided else 0):>10.0%}")

    # Which sources are dragging precision down?
    print("\nby source table:")
    by_src = defaultdict(Counter)
    for r in judged:
        by_src[r["source_table"]][r["verdict"]] += 1
    for src, c in sorted(by_src.items()):
        d = c["yes"] + c["no"]
        print(f"   {src:<22}{c['yes']:>4} oui /{d:>4} jugés = {(c['yes']/d if d else 0):.0%}")

    print()
    if keep is None:
        print(f"No band reaches {args.target:.0%}. Do not build on this routing as it stands —")
        print("either raise the threshold beyond the bands sampled, or reconsider the approach.")
    else:
        print(f"Recommended threshold: {keep:.2f}  (lowest band at or above {args.target:.0%})")
        if ROUTING.exists():
            data = json.loads(ROUTING.read_text(encoding="utf-8"))
            kept = [r for r in data["rows"] if r["is_native"] or r["similarity"] >= keep]
            routed = sum(1 for r in kept if not r["is_native"])
            print(f"That keeps {len(kept)} pool rows ({routed} routed + "
                  f"{len(kept)-routed} native) out of {len(data['rows'])}.")


if __name__ == "__main__":
    main()
