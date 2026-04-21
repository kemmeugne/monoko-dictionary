"""
Benchmark Monoko chat models on Lingala verified/gold sentence pairs.

This script can evaluate:
- the currently deployed Monoko chat path via Vercel (`gpt-4o-mini` today)
- one or more direct OpenAI models when OPENAI_API_KEY is set

It uses the live Vercel /api/rag-context endpoint (Supabase pgvector) and scores
outputs against known Lingala references with chrF and exact match.

Dataset source (pick one):
  --kb-path   local JSONL file (default, legacy)
  --supabase-url + --supabase-key   pull live rows from parallel_sentences

Examples:
  python3 benchmark_monoko_models.py --samples-per-quality 5 --mode proxy
  OPENAI_API_KEY=... python3 benchmark_monoko_models.py --samples-per-quality 10 --mode openai --openai-models gpt-4o-mini,gpt-5-nano,gpt-5-mini
  OPENAI_API_KEY=... python3 benchmark_monoko_models.py --samples-per-quality 10 --mode both --openai-models gpt-5-nano,gpt-5-mini \\
      --supabase-url https://haioiccujncsehadipzb.supabase.co --supabase-key YOUR_KEY
"""

from __future__ import annotations

import argparse
import json
import os
import random
import statistics
import sys
import time
import urllib.error
import urllib.request
from collections import Counter
from pathlib import Path
from typing import Dict, List, Tuple


ROOT = Path(__file__).resolve().parent
DEFAULT_KB = (
    Path("/Users/anthonykemmeugne/Documents/App dialectes/Monoko/monoko_rag")
    / "monoko_data"
    / "merged"
    / "lingala_knowledge_base.jsonl"
)
# Migrated from Railway/FAISS (decommissioned 2026-03-31) to Supabase pgvector via Vercel.
RAG_API_URL = "https://monoko-dictionary.vercel.app/api/rag-context"
MONOKO_CHAT_URL = "https://monoko-dictionary.vercel.app/api/chat"

# Current official API prices as of 2026-03-31.
MODEL_PRICING = {
    "gpt-4o-mini":  {"input_per_m": 0.15, "output_per_m": 0.60},
    "gpt-4.1-nano": {"input_per_m": 0.10, "output_per_m": 0.40},
    "gpt-5-nano":   {"input_per_m": 0.05, "output_per_m": 0.40},
    "gpt-5-mini":   {"input_per_m": 0.25, "output_per_m": 2.00},
}


def _json_post(url: str, payload: Dict, headers: Dict[str, str] | None = None) -> Dict:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json", **(headers or {})},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=90) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _char_ngrams(text: str, n: int) -> Counter:
    text = text.strip()
    return Counter(text[i : i + n] for i in range(len(text) - n + 1))


def chrf(hypothesis: str, reference: str, max_n: int = 6, beta: float = 2.0) -> float:
    if not hypothesis.strip() or not reference.strip():
        return 0.0

    f_scores = []
    for n in range(1, max_n + 1):
        hyp_ng = _char_ngrams(hypothesis, n)
        ref_ng = _char_ngrams(reference, n)
        overlap = sum((hyp_ng & ref_ng).values())
        hyp_total = sum(hyp_ng.values())
        ref_total = sum(ref_ng.values())
        if hyp_total == 0 or ref_total == 0:
            continue

        precision = overlap / hyp_total
        recall = overlap / ref_total
        if precision + recall == 0:
            f_scores.append(0.0)
        else:
            score = (1 + beta**2) * precision * recall / (beta**2 * precision + recall)
            f_scores.append(score)

    return sum(f_scores) / len(f_scores) if f_scores else 0.0


def approx_tokens(text: str) -> int:
    # Cheap approximation that is sufficient for cost planning.
    return max(1, round(len(text) / 4))


def build_system_prompt_translate_only(lang_name: str) -> str:
    return (
        f"Tu es un traducteur expert en {lang_name}. "
        f"Traduis chaque phrase en {lang_name}. "
        f"Réponds UNIQUEMENT avec la traduction — sans explication, sans ponctuation supplémentaire."
    )


def build_system_prompt(lang_name: str, context: str) -> str:
    return f"""Tu es Monoko, un assistant IA dédié à la langue {lang_name}.

RÈGLE SUJET: Tu ne parles QUE de la langue {lang_name}. Pour tout autre sujet, réponds poliment que tu ne traites que le {lang_name}.

TON RÔLE:
Tu aides les gens à apprendre et utiliser le {lang_name}. Tu traduis, expliques la grammaire, enseignes du vocabulaire, et tiens des conversations en {lang_name}.

COMMENT RÉPONDRE:
1. Le corpus ci-dessous est ta SEULE source de vérité pour le {lang_name}.
   Utilise UNIQUEMENT les mots et structures qui apparaissent dans le corpus.
2. Indique ✓ UNIQUEMENT pour des mots/phrases copiés directement depuis le corpus.
3. Tu peux assembler des éléments vérifiés pour construire une réponse. Indique ~ pour ces assemblages.
4. Si un mot clé est absent du corpus, dis-le clairement et invite l'utilisateur à contribuer via Corriger.
   Ne propose JAMAIS une traduction inventée.
5. Réponses courtes, naturelles et chaleureuses.
6. Donne la traduction, puis décompose les mots clés avec leur source dans le corpus.

EXEMPLE DE BONNE RÉPONSE:
Question: "Comment dit-on comment va ton père ?"
Réponse: En {lang_name}, tu peux dire : "Tata azali malamu?" ~
- Tata = père ✓ (corpus : "Tata = père")
- Azali malamu = il va bien ~ (assemblage de "azali" + "malamu" vérifiés)

CE QU'IL FAUT ÉVITER:
- N'invente JAMAIS un mot en {lang_name} — si ce n'est pas dans le corpus ci-dessus, ne le propose pas
- Ne marque JAMAIS ✓ sur un mot que tu n'as pas lu mot pour mot dans le corpus
- Ne dis pas "je ne sais pas" si des éléments de réponse sont dans le corpus — utilise ce que tu as

=== CORPUS DE RÉFÉRENCE (SOURCE PRIORITAIRE) ===
{context or "(Aucune donnée trouvée pour cette requête)"}
=== FIN DU CORPUS ==="""


def load_dataset(path: Path, samples_per_quality: int, seed: int) -> List[Dict]:
    rows: Dict[str, List] = {"verified": [], "gold": []}
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            row = json.loads(line)
            quality = row.get("quality")
            if quality not in rows:
                continue
            if not row.get("french") or not row.get("lingala"):
                continue
            if row.get("type") == "word":
                continue
            rows[quality].append(
                {
                    "quality": quality,
                    "source": row.get("source"),
                    "french": row["french"].strip(),
                    "lingala": row["lingala"].strip(),
                }
            )

    rng = random.Random(seed)
    picked = []
    for quality, items in rows.items():
        if len(items) < samples_per_quality:
            raise ValueError(f"Not enough {quality} samples in {path}")
        picked.extend(rng.sample(items, samples_per_quality))
    return picked


def load_dataset_supabase(
    supabase_url: str,
    supabase_key: str,
    samples_per_quality: int,
    seed: int,
    language_id: int = 1,
) -> List[Dict]:
    """Pull verified + gold sentence pairs directly from Supabase parallel_sentences."""
    rows: Dict[str, List] = {"verified": [], "gold": []}
    for quality in ("verified", "gold"):
        url = (
            f"{supabase_url}/rest/v1/parallel_sentences"
            f"?language_id=eq.{language_id}"
            f"&quality=eq.{quality}"
            f"&french_text=not.is.null"
            f"&lingala_text=not.is.null"
            f"&select=french_text,lingala_text,quality,source"
        )
        req = urllib.request.Request(
            url,
            headers={
                "apikey": supabase_key,
                "Authorization": f"Bearer {supabase_key}",
            },
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        for r in data:
            if r.get("french_text") and r.get("lingala_text"):
                rows[quality].append(
                    {
                        "quality": r["quality"],
                        "source": r.get("source"),
                        "french": r["french_text"].strip(),
                        "lingala": r["lingala_text"].strip(),
                    }
                )

    rng = random.Random(seed)
    picked = []
    for quality, items in rows.items():
        if len(items) < samples_per_quality:
            raise ValueError(f"Not enough {quality} rows in Supabase (found {len(items)})")
        picked.extend(rng.sample(items, samples_per_quality))
    print(f"Loaded {len(picked)} samples from Supabase parallel_sentences")
    return picked


def fetch_context(query: str) -> str:
    data = _json_post(RAG_API_URL, {"query": query, "language_id": 1, "match_count": 30})
    return data.get("context", "")


def call_monoko_proxy(system_prompt: str, user_message: str) -> Tuple[str, Dict]:
    started = time.perf_counter()
    data = _json_post(
        MONOKO_CHAT_URL,
        {
            "systemPrompt": system_prompt,
            "messages": [{"role": "user", "content": user_message}],
        },
    )
    elapsed_ms = round((time.perf_counter() - started) * 1000, 1)
    content = (data.get("content") or "").strip()
    usage = {
        "input_tokens_est": approx_tokens(system_prompt) + approx_tokens(user_message),
        "output_tokens_est": approx_tokens(content),
        "latency_ms": elapsed_ms,
    }
    return content, usage


def call_openai_chat(model: str, system_prompt: str, user_message: str) -> Tuple[str, Dict]:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is required for --mode openai or --mode both")

    payload = {
        "model": model,
        "max_completion_tokens": 512,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
    }
    if model.startswith("gpt-5"):
        payload["reasoning_effort"] = "minimal"
    else:
        payload["temperature"] = 0.2
    started = time.perf_counter()
    data = _json_post(
        "https://api.openai.com/v1/chat/completions",
        payload,
        headers={"Authorization": f"Bearer {api_key}"},
    )
    elapsed_ms = round((time.perf_counter() - started) * 1000, 1)
    content = data["choices"][0]["message"]["content"].strip()
    usage = data.get("usage") or {}
    return content, {
        "input_tokens": usage.get("prompt_tokens"),
        "output_tokens": usage.get("completion_tokens"),
        "total_tokens": usage.get("total_tokens"),
        "latency_ms": elapsed_ms,
    }


def estimate_cost(model: str, input_tokens: int | None, output_tokens: int | None) -> float | None:
    pricing = MODEL_PRICING.get(model)
    if not pricing or input_tokens is None or output_tokens is None:
        return None
    return (
        input_tokens / 1_000_000 * pricing["input_per_m"]
        + output_tokens / 1_000_000 * pricing["output_per_m"]
    )


def exact_match(a: str, b: str) -> bool:
    norm = lambda s: " ".join((s or "").strip().lower().split())
    return norm(a) == norm(b)


def evaluate_model(
    name: str,
    dataset: List[Dict],
    mode: str,
    openai_model: str | None,
    prompt_mode: str = "full",
) -> Dict:
    rows = []
    for idx, item in enumerate(dataset, start=1):
        query = f'Traduis en Lingala: "{item["french"]}"'
        if prompt_mode == "translate-only":
            system_prompt = build_system_prompt_translate_only("Lingala")
        else:
            context = fetch_context(item["french"])
            system_prompt = build_system_prompt("Lingala", context)

        try:
            if mode == "proxy":
                answer, usage = call_monoko_proxy(system_prompt, query)
                model_name = "gpt-4o-mini"
                input_tokens = usage["input_tokens_est"]
                output_tokens = usage["output_tokens_est"]
            else:
                assert openai_model is not None
                answer, usage = call_openai_chat(openai_model, system_prompt, query)
                model_name = openai_model
                input_tokens = usage.get("input_tokens")
                output_tokens = usage.get("output_tokens")
        except urllib.error.HTTPError as exc:
            raise RuntimeError(f"{name} failed on sample {idx}: HTTP {exc.code}") from exc

        row = {
            "quality": item["quality"],
            "source": item["source"],
            "french": item["french"],
            "reference": item["lingala"],
            "answer": answer,
            "exact_match": exact_match(answer, item["lingala"]),
            "chrf": round(chrf(answer, item["lingala"]), 4),
            "latency_ms": usage["latency_ms"],
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cost_usd": estimate_cost(model_name, input_tokens, output_tokens),
        }
        rows.append(row)
        print(
            f"[{name}] {idx}/{len(dataset)} {item['quality']} "
            f"chrF={row['chrf']:.4f} latency={row['latency_ms']}ms"
        )

    chrf_scores = [r["chrf"] for r in rows]
    exact_scores = [1 if r["exact_match"] else 0 for r in rows]
    latencies = [r["latency_ms"] for r in rows]
    costs = [r["cost_usd"] for r in rows if r["cost_usd"] is not None]
    inputs = [r["input_tokens"] for r in rows if r["input_tokens"] is not None]
    outputs = [r["output_tokens"] for r in rows if r["output_tokens"] is not None]

    return {
        "name": name,
        "sample_count": len(rows),
        "mean_chrf": round(statistics.mean(chrf_scores), 4),
        "median_chrf": round(statistics.median(chrf_scores), 4),
        "exact_match_rate": round(statistics.mean(exact_scores), 4),
        "mean_latency_ms": round(statistics.mean(latencies), 1),
        "mean_input_tokens": round(statistics.mean(inputs), 1) if inputs else None,
        "mean_output_tokens": round(statistics.mean(outputs), 1) if outputs else None,
        "mean_cost_usd": round(statistics.mean(costs), 6) if costs else None,
        "projected_cost_per_1000_usd": round(statistics.mean(costs) * 1000, 3) if costs else None,
        "rows": rows,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--kb-path", type=Path, default=DEFAULT_KB)
    parser.add_argument("--supabase-url", default=None, help="Load dataset from Supabase instead of local JSONL")
    parser.add_argument("--supabase-key", default=None)
    parser.add_argument("--samples-per-quality", type=int, default=5)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--mode",
        choices=["proxy", "openai", "both"],
        default="both",
        help="proxy = current Monoko deployed path, openai = direct OpenAI models, both = both paths",
    )
    parser.add_argument(
        "--openai-models",
        default="gpt-4o-mini,gpt-5-nano,gpt-5-mini",
        help="Comma-separated list of OpenAI model IDs to evaluate (used in openai/both modes)",
    )
    # Legacy alias kept for backwards compat
    parser.add_argument("--openai-model", default=None, help=argparse.SUPPRESS)
    parser.add_argument(
        "--prompt-mode",
        choices=["full", "translate-only"],
        default="full",
        help="full = Monoko RAG+format prompt; translate-only = bare translation, no RAG",
    )
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts" / "model_benchmark_results.json")
    args = parser.parse_args()

    # Resolve model list (--openai-model overrides for single-model compat)
    if args.openai_model:
        model_list = [args.openai_model]
    else:
        model_list = [m.strip() for m in args.openai_models.split(",") if m.strip()]

    # Load dataset — prefer explicit args, then env vars, then local file
    supabase_url = args.supabase_url or os.environ.get("SUPABASE_URL")
    supabase_key = args.supabase_key or os.environ.get("SUPABASE_SERVICE_KEY")
    if supabase_url and supabase_key:
        dataset = load_dataset_supabase(
            supabase_url, supabase_key, args.samples_per_quality, args.seed
        )
        dataset_label = f"supabase:{supabase_url}"
    else:
        dataset = load_dataset(args.kb_path, args.samples_per_quality, args.seed)
        dataset_label = str(args.kb_path)

    results = {
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "dataset_size": len(dataset),
        "samples_per_quality": args.samples_per_quality,
        "seed": args.seed,
        "dataset_source": dataset_label,
        "pricing_reference_date": "2026-03-31",
        "results": [],
    }

    if args.mode in ("proxy", "both"):
        results["results"].append(evaluate_model("monoko_proxy", dataset, "proxy", None, args.prompt_mode))
    if args.mode in ("openai", "both"):
        for model in model_list:
            results["results"].append(evaluate_model(model, dataset, "openai", model, args.prompt_mode))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nSaved results to {args.output}")

    print(f"\n{'Model':<20} {'chrF':>8} {'exact':>7} {'latency':>10} {'cost/1k':>10}")
    print("-" * 60)
    for summary in results["results"]:
        cost = f"${summary['projected_cost_per_1000_usd']:.3f}" if summary["projected_cost_per_1000_usd"] else "n/a"
        print(
            f"{summary['name']:<20} {summary['mean_chrf']:>8.4f} {summary['exact_match_rate']:>7.4f} "
            f"{summary['mean_latency_ms']:>9.0f}ms {cost:>10}"
        )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(130)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
