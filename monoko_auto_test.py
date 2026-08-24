#!/usr/bin/env python3
"""
monoko_auto_test.py — Automated quality test for the Monoko Lingala AI.

For each of the 200 phrase types in liste_200_phrases.docx:
  1. Generate 3 natural French sentences (present/past/future) via GPT
  2. For each sentence: fetch RAG context → call Monoko chat → evaluate with GPT
  3. If evaluation fails → insert a correction row into Supabase (status='pending')
  4. Print per-theme summary + save JSON log

Usage:
  OPENAI_API_KEY=sk-... python3 monoko_auto_test.py
  OPENAI_API_KEY=sk-... python3 monoko_auto_test.py --themes 1,3,5 --limit 10
  OPENAI_API_KEY=sk-... python3 monoko_auto_test.py --dry-run --limit 5
  OPENAI_API_KEY=sk-... python3 monoko_auto_test.py \\
      --supabase-url https://haioiccujncsehadipzb.supabase.co \\
      --supabase-key eyJ...
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import uuid
import urllib.error
import urllib.request
from pathlib import Path
from typing import Dict, List, Optional

try:
    from docx import Document
except ImportError:
    sys.exit("Missing dependency: pip install python-docx")

# ── constants ─────────────────────────────────────────────────────────────────

ROOT = Path(__file__).resolve().parent
DOCX_PATH = ROOT / "liste_200_phrases.docx"

RAG_URL  = "https://monoko-dictionary.vercel.app/api/rag-context"
CHAT_URL = "https://monoko-dictionary.vercel.app/api/chat"

OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"

GENERATE_MODEL = "gpt-4o-mini"   # cheap model to generate French sentences
EVAL_MODEL     = "gpt-5-mini"    # stronger model for Lingala evaluation

LANGUAGE_ID   = 1   # Lingala
TESTER_NAME   = "auto_test_script"

# ── helpers ───────────────────────────────────────────────────────────────────

def _post(url: str, payload: dict, headers: Optional[Dict] = None, timeout: int = 120) -> dict:
    body = json.dumps(payload, ensure_ascii=False).encode()
    req  = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json", **(headers or {})},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def openai(model: str, messages: list, response_format: str = "text", temperature: float = 0.7,
           retries: int = 3) -> str:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        sys.exit("OPENAI_API_KEY is not set")
    payload: dict = {
        "model": model,
        "messages": messages,
        "max_completion_tokens": 1024,
    }
    if response_format == "json":
        payload["response_format"] = {"type": "json_object"}
    if model.startswith("gpt-4"):
        payload["temperature"] = temperature
    else:
        payload["reasoning_effort"] = "low"

    for attempt in range(1, retries + 1):
        try:
            data = _post(OPENAI_CHAT_URL, payload, headers={"Authorization": f"Bearer {api_key}"})
            return data["choices"][0]["message"]["content"].strip()
        except Exception as e:
            if attempt == retries:
                raise
            wait = attempt * 5
            print(f"    [retry {attempt}/{retries}] OpenAI error: {e} — retrying in {wait}s")
            time.sleep(wait)
    raise RuntimeError("openai() exhausted retries")


# ── docx parsing ──────────────────────────────────────────────────────────────

THEME_NAMES = [
    "Salutations et Politesse",
    "Présentation Personnelle",
    "Famille et Relations",
    "Besoins Immédiats",
    "Maison et Vie Quotidienne",
    "Nourriture et Repas",
    "Marché et Achats",
    "Transport et Déplacement",
    "Orientation et Directions",
    "Temps et Calendrier",
    "Santé",
    "Émotions et États",
    "École et Apprentissage",
    "Travail et Activités",
    "Actions Fréquentes",
    "Questions Très Fréquentes",
    "Conversation Courante",
    "Téléphone et Messages",
    "Situations Sociales",
]


def load_phrases(docx_path: Path) -> List[Dict]:
    """Return list of {num, theme_num, theme, phrase_type}."""
    doc    = Document(str(docx_path))
    # Tables 0-18 are the 19 theme tables (the rest are footnotes/examples)
    phrase_tables = [t for t in doc.tables if len(t.columns) == 2][:19]
    phrases = []
    for theme_idx, table in enumerate(phrase_tables):
        theme_num  = theme_idx + 1
        theme_name = THEME_NAMES[theme_idx]
        for row in table.rows[1:]:   # skip header row
            num_cell   = row.cells[0].text.strip()
            type_cell  = row.cells[1].text.strip()
            if not num_cell.isdigit() or not type_cell:
                continue
            phrases.append({
                "num":        int(num_cell),
                "theme_num":  theme_num,
                "theme":      theme_name,
                "phrase_type": type_cell,
            })
    return phrases


# ── sentence generation ───────────────────────────────────────────────────────

def generate_sentences(phrase_type: str) -> List[str]:
    """Ask GPT to produce 6 natural French sentences for this phrase type."""
    prompt = (
        "Tu es un générateur de phrases françaises pour tester un traducteur français-lingala. "
        "Pour chaque type de phrase ci-dessous, génère des phrases naturelles et variées qu'une personne dirait VRAIMENT dans la vie quotidienne. "
        "NE PAS utiliser le verbe 'dire' — génère directement la phrase elle-même.\n\n"
        "Exemple: si le type est 'Dire bonjour', NE PAS générer 'Je dis bonjour'. "
        "Génère plutôt: 'Bonjour !', 'Salut, ça va ?', 'Bonjour tout le monde'.\n"
        "Autre exemple: si le type est 'Dire qu'on a faim', NE PAS générer 'Je dis que j'ai faim'. "
        "Génère plutôt: 'J'ai très faim', 'On mange bientôt ?', 'Mon ventre gronde'.\n\n"
        f"Type de phrase : « {phrase_type} »\n\n"
        "Génère exactement 6 phrases variées :\n"
        "1. Affirmative au présent\n"
        "2. Affirmative au passé\n"
        "3. Affirmative au futur\n"
        "4. Question\n"
        "5. Négative\n"
        "6. Avec une autre personne (il/elle/nous/vous/ils)\n\n"
        "Toutes les phrases doivent être courtes, naturelles et orales.\n"
        "Réponds UNIQUEMENT avec un objet JSON : {\"sentences\": [\"...\", \"...\", \"...\", \"...\", \"...\", \"...\"]}"
    )
    raw = openai(GENERATE_MODEL, [{"role": "user", "content": prompt}],
                 response_format="json", temperature=0.8)
    data = json.loads(raw)
    return [s.strip() for s in data.get("sentences", []) if s.strip()][:6]


# ── Monoko API ────────────────────────────────────────────────────────────────

def fetch_rag_context(french: str) -> str:
    try:
        data = _post(RAG_URL, {"query": french, "language_id": LANGUAGE_ID, "match_count": 20})
        return data.get("context", "")
    except Exception as e:
        print(f"    [warn] RAG fetch failed: {e}")
        return ""


def build_system_prompt(context: str) -> str:
    return f"""Tu es un traducteur expert en Lingala (variante de Kinshasa).

TON RÔLE:
Traduire chaque phrase française en Lingala naturel. Tu dois TOUJOURS fournir une traduction — jamais refuser.

COMMENT RÉPONDRE:
1. Utilise le corpus ci-dessous en priorité — ce sont des paires vérifiées par des experts.
2. Si le corpus contient des éléments utiles, appuie-toi dessus pour construire ta traduction.
3. Si un mot est absent du corpus, utilise tes connaissances du Lingala pour compléter — tu as le droit de deviner.
4. Réponds UNIQUEMENT avec la traduction Lingala. Pas d'explication, pas de commentaire.

=== CORPUS DE RÉFÉRENCE (paires vérifiées FR↔Lingala) ===
{context or "(Aucune donnée trouvée pour cette requête)"}
=== FIN DU CORPUS ==="""


def call_monoko(french: str) -> str:
    context       = fetch_rag_context(french)
    system_prompt = build_system_prompt(context)
    user_msg      = f'Traduis en Lingala: "{french}"'
    try:
        data = _post(CHAT_URL, {
            "systemPrompt": system_prompt,
            "messages":     [{"role": "user", "content": user_msg}],
            "tester_name":  TESTER_NAME,
        })
        return (data.get("content") or "").strip()
    except Exception as e:
        print(f"    [warn] Monoko chat failed: {e}")
        return ""


# ── evaluation ────────────────────────────────────────────────────────────────

EVAL_SYSTEM = """Tu es un expert en langue Lingala (variante de Kinshasa).
On te donne une phrase française et la réponse d'un assistant IA en Lingala.
Évalue si la traduction Lingala est correcte et naturelle.

Réponds UNIQUEMENT avec un objet JSON :
{
  "pass": true|false,
  "score": 0-10,
  "issues": ["liste des problèmes, vide si aucun"],
  "correct_lingala": "la meilleure traduction Lingala de la phrase française (juste la phrase, sans explication)",
  "correction_type": "wrong_translation|unnatural|grammatical_error|incomplete|off_topic|none"
}

Règles :
- "pass" = true si le Lingala est correct et naturel (score >= 6)
- "correct_lingala" doit toujours contenir la meilleure traduction, même si pass=true
- "correction_type" = "none" si pass=true
- Sois strict : une traduction approximative ou inventée doit échouer"""


def evaluate(french: str, monoko_response: str) -> dict:
    user_msg = (
        f"Phrase française : {french}\n\n"
        f"Réponse Monoko (contient la traduction Lingala) :\n{monoko_response}"
    )
    raw = openai(EVAL_MODEL, [
        {"role": "system", "content": EVAL_SYSTEM},
        {"role": "user",   "content": user_msg},
    ], response_format="json", temperature=0.2)
    return json.loads(raw)


# ── Supabase corrections insert ───────────────────────────────────────────────

def insert_correction(
    supabase_url: str,
    supabase_key: str,
    french: str,
    correct_lingala: str,
    ai_response: str,
    correction_type: str,
    session_id: str,
) -> bool:
    url = f"{supabase_url}/rest/v1/corrections"
    payload = {
        "language_id":      LANGUAGE_ID,
        "correct_french":   french,
        "correct_lingala":  correct_lingala,
        "example_sentence": ai_response[:500],   # store AI response for admin context
        "status":           "pending",
        "tester_name":      TESTER_NAME,
        "session_id":       session_id,
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode(),
        headers={
            "Content-Type":  "application/json",
            "apikey":        supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Prefer":        "return=minimal",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status in (200, 201)
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"    [warn] Supabase insert failed ({e.code}): {body[:200]}")
        return False


# ── main ──────────────────────────────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(description="Monoko automated quality test")
    parser.add_argument("--docx",        type=Path, default=DOCX_PATH)
    parser.add_argument("--themes",      default=None,
                        help="Comma-separated theme numbers to test, e.g. 1,3,11")
    parser.add_argument("--limit",       type=int, default=None,
                        help="Max phrase types to process (for quick tests)")
    parser.add_argument("--delay",       type=float, default=0.6,
                        help="Seconds to wait between Monoko API calls (default 0.6)")
    parser.add_argument("--supabase-url", default="https://haioiccujncsehadipzb.supabase.co")
    parser.add_argument("--supabase-key", default=None,
                        help="Supabase service key for inserting automated corrections")
    parser.add_argument("--dry-run",     action="store_true",
                        help="Skip Supabase inserts — only log failures")
    parser.add_argument("--output",      type=Path,
                        default=ROOT / "artifacts" / "auto_test_log.json")
    args = parser.parse_args()

    if not os.environ.get("OPENAI_API_KEY"):
        sys.exit("OPENAI_API_KEY is not set")

    # Load phrases
    phrases = load_phrases(args.docx)
    print(f"Loaded {len(phrases)} phrase types from {args.docx.name}")

    # Filter themes
    if args.themes:
        wanted = {int(t.strip()) for t in args.themes.split(",")}
        phrases = [p for p in phrases if p["theme_num"] in wanted]
        print(f"Filtered to {len(phrases)} phrase types in themes {sorted(wanted)}")

    if args.limit:
        phrases = phrases[: args.limit]
        print(f"Limited to {len(phrases)} phrase types")

    # Resume from existing log if present
    already_done: set = set()
    if args.output.exists():
        try:
            existing = json.loads(args.output.read_text(encoding="utf-8"))
            session_id = existing.get("session_id", str(uuid.uuid4()))
            log = existing
            log.pop("summary", None)  # will be recomputed
            for theme_data in log.get("themes", {}).values():
                for p in theme_data.get("phrases", []):
                    already_done.add(p["num"])
            print(f"Resuming — {len(already_done)} phrase types already done")
        except Exception:
            session_id = str(uuid.uuid4())
            log = {"session_id": session_id, "run_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                   "dry_run": args.dry_run, "generate_model": GENERATE_MODEL,
                   "eval_model": EVAL_MODEL, "themes": {}}
    else:
        session_id = str(uuid.uuid4())
        log = {
            "session_id":    session_id,
            "run_at":        time.strftime("%Y-%m-%d %H:%M:%S"),
            "dry_run":       args.dry_run,
            "generate_model": GENERATE_MODEL,
            "eval_model":    EVAL_MODEL,
            "themes":        {},
        }

    # Recount totals from any already-logged data
    total_sentences = sum(
        len(p["sentences"])
        for td in log["themes"].values()
        for p in td.get("phrases", [])
    )
    total_pass = sum(
        1 for td in log["themes"].values()
        for p in td.get("phrases", [])
        for s in p.get("sentences", []) if s.get("pass")
    )
    total_fail      = total_sentences - total_pass
    total_inserted  = sum(
        1 for td in log["themes"].values()
        for p in td.get("phrases", [])
        for s in p.get("sentences", []) if s.get("inserted")
    )

    for p_idx, phrase in enumerate(phrases, start=1):
        if phrase["num"] in already_done:
            continue
        theme_key  = f"{phrase['theme_num']}. {phrase['theme']}"
        phrase_num = phrase["num"]
        phrase_type = phrase["phrase_type"]

        print(f"\n[{p_idx}/{len(phrases)}] #{phrase_num} — {phrase_type}")

        if theme_key not in log["themes"]:
            log["themes"][theme_key] = {"pass": 0, "fail": 0, "inserted": 0, "phrases": []}

        # 1. Generate French sentences
        try:
            sentences = generate_sentences(phrase_type)
        except Exception as e:
            print(f"  [error] Generation failed: {e}")
            continue

        if not sentences:
            print("  [warn] No sentences generated, skipping")
            continue

        phrase_log = {
            "num":         phrase_num,
            "phrase_type": phrase_type,
            "sentences":   [],
        }

        for sentence in sentences:
            total_sentences += 1
            print(f"  FR: {sentence}")
            time.sleep(args.delay)

            # 2. Call Monoko
            monoko_response = call_monoko(sentence)
            if not monoko_response:
                print("  [warn] Empty Monoko response, skipping")
                total_sentences -= 1
                continue

            # 3. Evaluate
            try:
                eval_result = evaluate(sentence, monoko_response)
            except Exception as e:
                print(f"  [error] Evaluation failed: {e}")
                total_sentences -= 1
                continue

            passed          = eval_result.get("pass", False)
            score           = eval_result.get("score", 0)
            issues          = eval_result.get("issues", [])
            correct_lingala = eval_result.get("correct_lingala", "")
            correction_type = eval_result.get("correction_type", "other")

            status_icon = "✓" if passed else "✗"
            print(f"  {status_icon} score={score}/10  {', '.join(issues) if issues else 'OK'}")
            if not passed and correct_lingala:
                print(f"  → correct: {correct_lingala}")

            sentence_log = {
                "french":          sentence,
                "monoko_response": monoko_response,
                "pass":            passed,
                "score":           score,
                "issues":          issues,
                "correct_lingala": correct_lingala,
                "correction_type": correction_type,
                "inserted":        False,
            }

            if passed:
                total_pass += 1
                log["themes"][theme_key]["pass"] += 1
            else:
                total_fail += 1
                log["themes"][theme_key]["fail"] += 1

                # 4. Insert correction if we have a suggestion
                if correct_lingala and not args.dry_run and args.supabase_key:
                    ok = insert_correction(
                        args.supabase_url,
                        args.supabase_key,
                        sentence,
                        correct_lingala,
                        monoko_response,
                        correction_type,
                        session_id,
                    )
                    if ok:
                        sentence_log["inserted"] = True
                        total_inserted += 1
                        log["themes"][theme_key]["inserted"] += 1
                        print("  ↑ correction inserted into Supabase")
                elif not passed and args.dry_run:
                    print("  [dry-run] would insert correction")

            phrase_log["sentences"].append(sentence_log)

        log["themes"][theme_key]["phrases"].append(phrase_log)

        # Save after every phrase so a crash doesn't lose progress
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(log, ensure_ascii=False, indent=2), encoding="utf-8")

    # ── summary ───────────────────────────────────────────────────────────────
    print("\n" + "═" * 60)
    print("RESULTS BY THEME")
    print("═" * 60)
    print(f"{'Theme':<40} {'Pass':>5} {'Fail':>5} {'Rate':>7}")
    print("-" * 60)

    for theme_key, data in log["themes"].items():
        p = data["pass"]
        f = data["fail"]
        total = p + f
        rate  = f"{p/total*100:.0f}%" if total else "—"
        print(f"{theme_key:<40} {p:>5} {f:>5} {rate:>7}")

    print("-" * 60)
    total = total_pass + total_fail
    overall_rate = f"{total_pass/total*100:.1f}%" if total else "—"
    print(f"{'TOTAL':<40} {total_pass:>5} {total_fail:>5} {overall_rate:>7}")
    print()
    print(f"Sentences tested : {total}")
    print(f"Corrections inserted : {total_inserted}" + (" (dry-run)" if args.dry_run else ""))

    # ── save log ──────────────────────────────────────────────────────────────
    log["summary"] = {
        "total_sentences": total,
        "total_pass":      total_pass,
        "total_fail":      total_fail,
        "pass_rate":       round(total_pass / total, 4) if total else 0,
        "total_inserted":  total_inserted,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(log, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nLog saved to {args.output}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(130)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        raise SystemExit(1)
