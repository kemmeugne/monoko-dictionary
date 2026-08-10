#!/usr/bin/env python3
"""
llm_route_judge.py
──────────────────
Asks gpt-4o-mini the same question the human reviewer answered — "does this
sentence have its place in this lesson?" — so the two can be compared directly.

Cosine routing measured 77% precision and, worse, was FLAT across similarity
bands: distance to the nearest lesson_item does not predict lesson membership,
because embeddings capture topic while a third of the lessons are defined by
grammar. An LLM reading the French can judge topical fit directly.

--validate runs against `artifacts/professor_ingest/routing_qa_verdicts.json`
and reports agreement with the human labels. The number that matters is not raw
accuracy but the PRECISION OF WHAT SURVIVES: of the rows the model keeps, how
many did the human also accept. That is what the exercise pool would contain.

The model is shown real items from the target lesson, never just its title. We
learned from the human reviewer that "Construction de phrases 1" or "Registres :
formel vs informel" carry no usable meaning on their own.

Measured 2026-08-10 against 101 human labels: precision of what survives 96%
(vs 77% for cosine), 91% of bad rows removed, 64% of good rows retained. It is
strict — it discards about a third of usable material to get there — which is the
right side to err on while there is volume to spare.

Usage:
    python3 llm_route_judge.py --validate     # score against the human labels
    python3 llm_route_judge.py --run          # judge every routed row (resumable)
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import threading
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

# openai is imported lazily in make_client() so the script runs without it

ART = Path("artifacts/professor_ingest")
ROUTING = ART / "corpus_routing.json"
VERDICTS = ART / "routing_qa_verdicts.json"
OUT = ART / "llm_route_validation.json"

_HEAD = """Tu aides à construire un cours de lingala pour francophones.

On te donne une phrase et une leçon (avec des exemples RÉELS de son contenu).
Question : cette phrase a-t-elle sa place dans un exercice de cette leçon ?
"""
_TAIL = """
Réponds uniquement par un objet JSON : {"verdict": "oui"} ou {"verdict": "non"}."""

# Three calibrations of the same question. The strict one measured 96% precision
# but kept only 64% of the rows the human accepted — it throws away usable
# material. The others loosen the bar progressively; --compare scores all three
# against the human labels so the choice is made on numbers, not taste.
PROMPTS = {
    "strict": _HEAD + """
Règles :
- Réponds « oui » si la phrase convient, MÊME SI une autre leçon conviendrait
  peut-être mieux. On ne cherche pas la meilleure leçon possible.
- Réponds « non » seulement si la phrase détonne : un apprenant serait surpris
  de la trouver là.
- Juge le THÈME, pas la qualité du lingala ni la traduction.
- Certaines leçons portent sur un point de GRAMMAIRE (prépositions, pronoms,
  conjugaison) et non sur un thème. Pour celles-là, demande-toi si la phrase
  illustre vraiment ce point de grammaire, pas seulement si elle est plausible.
""" + _TAIL,

    "open": _HEAD + """
Une leçon est un RÉSERVOIR d'exercices, pas une liste thématique stricte. Une
phrase un peu à côté du sujet reste utile : l'apprenant révise du vocabulaire et
des structures de son niveau.

Règles :
- Réponds « oui » dès que la phrase peut servir d'exercice dans cette leçon,
  même si une autre leçon conviendrait mieux.
- Réponds « non » seulement si le sujet n'a manifestement rien à voir avec la
  leçon — au point que l'apprenant se demanderait ce que la phrase fait là.
- Pour les leçons de GRAMMAIRE (prépositions, pronoms, conjugaison), une phrase
  convient si elle est du bon niveau et se prête à l'exercice ; elle n'a pas
  besoin d'illustrer parfaitement le point de grammaire.
- Juge le THÈME, pas la qualité du lingala ni la traduction.
- EN CAS DE DOUTE, RÉPONDS « OUI ».
""" + _TAIL,

    "wide": _HEAD + """
Le but est de garder un maximum de phrases utilisables. Une leçon fournit de la
matière d'exercice ; la correspondance thématique n'a pas à être parfaite.

Règles :
- Réponds « non » UNIQUEMENT si la phrase relève d'un domaine clairement étranger
  à la leçon (par exemple une phrase sur la banque dans une leçon sur les
  animaux).
- Dans tous les autres cas, réponds « oui » — y compris pour les leçons de
  grammaire, où toute phrase de niveau adapté peut servir d'exercice.
- Ne juge ni la qualité du lingala ni la traduction.
""" + _TAIL,
}
SYSTEM = PROMPTS["strict"]


def _fmt_duration(seconds: float) -> str:
    seconds = int(max(0, seconds))
    if seconds >= 3600:
        return f"{seconds // 3600}h{(seconds % 3600) // 60:02d}"
    return f"{seconds // 60}m{seconds % 60:02d}"


class Progress:
    """Live one-line progress meter, drawn on stderr.

    A full pass is thousands of calls over many minutes. Without this the
    terminal stays silent the whole time and a run throttled to a standstill
    looks exactly like a run that is working — which is how an earlier
    comparison went unnoticed while 60% of its calls were failing (see `ask`).
    Counting failures on screen makes that visible while it happens.
    """

    def __init__(self, total: int, label: str = "") -> None:
        self.total, self.label = total, label
        self.done = self.kept = self.dropped = self.failed = 0
        self.t0 = time.time()
        self._lock = threading.Lock()
        self._last_draw = 0.0
        self._width = 0
        # A \r-redrawn meter is right for a terminal and useless in a captured
        # log or a piped run, where it collapses into one unreadable line. When
        # stderr is not a TTY, emit plain newline-separated lines instead so the
        # run is followable in logs and CI output.
        self._tty = sys.stderr.isatty()

    def tick(self, verdict: str | None) -> None:
        with self._lock:
            self.done += 1
            if verdict == "yes":
                self.kept += 1
            elif verdict == "no":
                self.dropped += 1
            else:
                self.failed += 1
            now = time.time()
            # Throttled so the redraw never becomes the bottleneck itself.
            interval = 0.25 if self._tty else 2.0
            if now - self._last_draw > interval or self.done == self.total:
                self._last_draw = now
                self._draw()

    def _draw(self) -> None:
        elapsed = time.time() - self.t0
        rate = self.done / elapsed if elapsed else 0.0
        eta = (self.total - self.done) / rate if rate else 0.0
        filled = int(24 * self.done / max(1, self.total))
        line = (f"\r{self.label}[{'█' * filled}{'·' * (24 - filled)}] "
                f"{self.done}/{self.total} {100 * self.done / max(1, self.total):3.0f}%  "
                f"gardés {self.kept} · rejetés {self.dropped}"
                + (f" · ÉCHECS {self.failed}" if self.failed else "")
                + f"  {rate:.1f}/s  ETA {_fmt_duration(eta)}")
        if not self._tty:
            sys.stderr.write(line.lstrip("\r") + "\n")
            sys.stderr.flush()
            return
        self._width = max(self._width, len(line))
        sys.stderr.write(line.ljust(self._width))
        sys.stderr.flush()

    def log(self, msg: str) -> None:
        """Print a normal line without leaving the progress bar half-erased."""
        with self._lock:
            sys.stderr.write("\r" + " " * self._width + "\r")
            print(msg, flush=True)
            self._draw()

    def close(self) -> None:
        with self._lock:
            self._draw()
            if self._tty:
                sys.stderr.write("\n")
            sys.stderr.flush()


def build_prompt(sentence_fr: str, lesson: str, samples: list[str]) -> str:
    listing = "\n".join(f"- {s}" for s in samples)
    return (f"LEÇON : {lesson}\n\n"
            f"Exemples réels du contenu de cette leçon :\n{listing}\n\n"
            f"PHRASE À JUGER : {sentence_fr}")


def judged_path(prompt: str) -> Path:
    """One file per prompt: verdicts from different calibrations must never mix."""
    return ART / f"llm_route_verdicts_{prompt}.json"


def make_client(provider: str):
    """OpenAI or Anthropic. The judge is a short prompt with a binary answer —
    exactly what a small fast model is for — so either provider's cheap tier
    does the job. Anthropic is the default because OpenAI's 10,000-requests-per-
    DAY cap makes a 6,397-row pass impossible in one sitting, while Anthropic
    meters per minute."""
    if provider == "anthropic":
        import anthropic
        return anthropic.Anthropic()
    import openai
    return openai.OpenAI(api_key=os.environ["OPENAI_API_KEY"])


def _is_retryable(exc: Exception) -> bool:
    """Only back off on failures that can actually succeed later.

    Retrying a permanent error is worse than failing: with 5 attempts and
    exponential backoff, a missing API key costs ~30s of sleeping PER ROW and
    turns an instant, obvious failure into a 12-minute crawl that looks like
    slow progress. Auth, permission, and malformed-request errors are final.
    """
    name = type(exc).__name__
    if name in {"AuthenticationError", "PermissionDeniedError", "BadRequestError",
                "NotFoundError", "UnprocessableEntityError", "TypeError", "KeyError"}:
        return False
    status = getattr(exc, "status_code", None)
    if isinstance(status, int):
        return status == 429 or status >= 500
    return True


def preflight(client, provider, model) -> None:
    """One call before the run so a bad key fails in a second, not in minutes."""
    try:
        _call(client, provider, model,
              'Réponds uniquement par un objet JSON : {"verdict": "oui"}.',
              "test", 30)
    except Exception as e:
        if _is_retryable(e):
            return  # transient at startup; let the run proceed and retry properly
        sys.exit(
            f"\n{type(e).__name__}: {str(e)[:200]}\n\n"
            + ("ANTHROPIC_API_KEY is not set in this shell. Run:\n"
               "    export ANTHROPIC_API_KEY='sk-ant-...'\n"
               "in the SAME terminal, then re-run this command.\n"
               if provider == "anthropic" else
               "OPENAI_API_KEY is not set in this shell.\n"))


def _call_raw(client, provider, model, system, user, timeout, max_tokens=20):
    """One request, returning the raw response text. Shared with
    reassign_discarded.py so both scripts use the same SDK handling and the same
    retry classification."""
    if provider == "anthropic":
        resp = client.messages.create(
            model=model, max_tokens=max_tokens, timeout=timeout,
            system=system, messages=[{"role": "user", "content": user}])
        return resp.content[0].text if resp.content else ""
    resp = client.chat.completions.create(
        model=model, temperature=0, max_tokens=max_tokens, timeout=timeout,
        response_format={"type": "json_object"},
        messages=[{"role": "system", "content": system},
                  {"role": "user", "content": user}])
    return resp.choices[0].message.content


def _call(client, provider, model, system, user, timeout):
    """One request, normalised to the verdict string across both SDKs."""
    text = _call_raw(client, provider, model, system, user, timeout)
    v = json.loads(text).get("verdict", "").strip().lower()
    return "yes" if v.startswith("oui") else "no"


def ask(client, model, r, native, system=None, provider="anthropic",
        progress: "Progress | None" = None) -> str | None:
    """Retries with exponential backoff.

    An earlier version retried three times with no delay, which is useless
    against rate limiting — the retries land inside the same throttle window and
    fail together. Roughly 60% of a comparison run silently returned None that
    way, and because the caller dropped None rows without counting them, the
    resulting table looked plausible while being computed on a third of the data.
    """
    system = system or SYSTEM
    samples = native.get(r["lesson_id"], [])[:8]
    user = build_prompt(r["french"], r["lesson"], samples)
    verdict, delay = None, 2.0
    for attempt in range(5):
        try:
            verdict = _call(client, provider, model, system, user, 60)
            break
        except Exception as e:
            if attempt == 4:
                if progress:
                    progress.log(f"  abandon après 5 essais : {type(e).__name__}: {e}")
                break
            time.sleep(delay)
            delay *= 2
    if progress:
        progress.tick(verdict)
    return verdict


def run_all(client, args, routing, native) -> None:
    """Judge every routed row. Native rows are never judged — the professor placed
    them, and second-guessing that with a model would be backwards."""
    JUDGED = judged_path(args.prompt)
    system = PROMPTS[args.prompt]
    done = json.loads(JUDGED.read_text(encoding="utf-8"))["verdicts"] if JUDGED.exists() else {}
    routed = [r for r in routing if not r["is_native"]]
    todo = [r for r in routed if f"{r['source_table']}:{r['source_id']}" not in done]
    print(f"{len(routed)} routed rows · {len(done)} already judged · {len(todo)} to do")
    print(f"prompt « {args.prompt} » · {args.provider}/{args.model} · {args.workers} workers")
    if not todo:
        print("rien à faire")
        return

    def save() -> None:
        JUDGED.write_text(json.dumps({"model": args.model, "prompt": args.prompt,
                                      "verdicts": done}, ensure_ascii=False),
                          encoding="utf-8")

    progress = Progress(len(todo))
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        for n, (r, v) in enumerate(zip(todo, ex.map(
                lambda r: ask(client, args.model, r, native, system, args.provider, progress), todo)), 1):
            if v:
                done[f"{r['source_table']}:{r['source_id']}"] = v
            # Checkpoint often: the pass is resumable only as far as the last save.
            if n % 200 == 0:
                save()
                progress.log(f"  ✓ sauvegardé {len(done)} verdicts -> {JUDGED.name}")
    progress.close()

    save()
    kept = sum(1 for v in done.values() if v == "yes")
    print(f"\n{len(done)} judged · kept {kept} · dropped {len(done)-kept} "
          f"({100*kept//max(1,len(done))}% kept)")
    print(f"-> {JUDGED}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--validate", action="store_true", help="score against the human verdicts")
    ap.add_argument("--run", action="store_true", help="judge every routed row (resumable)")
    ap.add_argument("--compare", action="store_true", help="score every prompt variant against the human labels")
    ap.add_argument("--prompt", default="strict", choices=sorted(PROMPTS))
    ap.add_argument("--provider", default="anthropic", choices=["anthropic","openai"])
    ap.add_argument("--model", default=None, help="defaults per provider")
    ap.add_argument("--workers", type=int, default=16)
    args = ap.parse_args()
    if args.model is None:
        args.model = "claude-haiku-4-5" if args.provider == "anthropic" else "gpt-4o-mini"

    if not (args.validate or args.run or args.compare):
        sys.exit("pass --validate, --compare or --run")

    routing = json.loads(ROUTING.read_text(encoding="utf-8"))["rows"]
    native = defaultdict(list)
    for r in routing:
        if r["is_native"]:
            native[r["lesson_id"]].append(r["french"])

    client = make_client(args.provider)
    preflight(client, args.provider, args.model)

    if args.run:
        run_all(client, args, routing, native)
        return

    human = {(r["french"], r["lingala"]): r["verdict"]
             for r in json.loads(VERDICTS.read_text(encoding="utf-8"))["rows"]
             if r["verdict"] in ("yes", "no")}
    rows = [r for r in routing if (r["french"], r["lingala"]) in human]
    print(f"{len(rows)} labelled rows · model {args.model}")

    if args.compare:
        print(f"\n{'prompt':<10}{'gardés':>9}{'précision':>12}{'rappel':>9}"
              f"{'mauvais gardés':>16}")
        print("-" * 56)
        print(f"{'(cosine)':<10}{len(rows):>9}{'77%':>12}{'100%':>9}"
              f"{sum(1 for r in rows if human[(r['french'], r['lingala'])] == 'no'):>16}")
        for name in ("strict", "open", "wide"):
            sys_prompt = PROMPTS[name]
            progress = Progress(len(rows), label=f"{name:<8}")
            with ThreadPoolExecutor(max_workers=args.workers) as ex:
                preds = list(ex.map(
                    lambda r: ask(client, args.model, r, native, sys_prompt, args.provider, progress), rows))
            progress.close()
            missing = sum(1 for p in preds if p is None)
            if missing:
                # Never quietly score a partial sample: different variants would
                # lose different rows and the comparison would be meaningless.
                print(f"{name:<10}  ABANDONNÉ — {missing}/{len(rows)} appels sans réponse")
                continue
            pairs = [(human[(r["french"], r["lingala"])], p) for r, p in zip(rows, preds)]
            tp = sum(1 for h, p in pairs if h == "yes" and p == "yes")
            fp = sum(1 for h, p in pairs if h == "no" and p == "yes")
            fn = sum(1 for h, p in pairs if h == "yes" and p == "no")
            kept = tp + fp
            print(f"{name:<10}{kept:>9}{tp/kept:>11.0%}{tp/(tp+fn):>9.0%}{fp:>16}", flush=True)
        print("\nprécision = part des gardés que l'humain acceptait aussi")
        print("rappel    = part des bons que le modèle conserve")
        return

    progress = Progress(len(rows), label=f"{args.prompt:<8}")

    def judge(r):
        return ask(client, args.model, r, native, PROMPTS[args.prompt], args.provider, progress)

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        preds = list(ex.map(judge, rows))
    progress.close()

    pairs = [(human[(r["french"], r["lingala"])], p)
             for r, p in zip(rows, preds) if p is not None]
    tp = sum(1 for h, p in pairs if h == "yes" and p == "yes")
    fp = sum(1 for h, p in pairs if h == "no" and p == "yes")
    fn = sum(1 for h, p in pairs if h == "yes" and p == "no")
    tn = sum(1 for h, p in pairs if h == "no" and p == "no")

    print(f"\n{'':>18}{'model: garde':>14}{'model: rejette':>16}")
    print(f"{'humain: oui':<18}{tp:>14}{fn:>16}")
    print(f"{'humain: non':<18}{fp:>14}{tn:>16}")
    kept = tp + fp
    print(f"\nagreement with the human      : {(tp+tn)/len(pairs):.0%}")
    print(f"precision of what SURVIVES    : {tp/kept:.0%}   ({tp}/{kept})   <- baseline was 77%")
    print(f"share of good rows kept       : {tp/(tp+fn):.0%}   ({tp}/{tp+fn})")
    print(f"bad rows correctly removed    : {tn/(tn+fp):.0%}   ({tn}/{tn+fp})")

    OUT.write_text(json.dumps({"model": args.model, "n": len(pairs),
                               "tp": tp, "fp": fp, "fn": fn, "tn": tn,
                               "rows": [{"french": r["french"], "lesson": r["lesson"],
                                         "human": human[(r["french"], r["lingala"])], "llm": p}
                                        for r, p in zip(rows, preds)]},
                              ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n-> {OUT}")


if __name__ == "__main__":
    main()
