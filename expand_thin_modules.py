#!/usr/bin/env python3
"""
expand_thin_modules.py
───────────────────────
Appends new French items to thin modules so they reach the curriculum
target. Dialect is left empty — professor fills in + records audio.
Does NOT delete existing items, only appends from max(item_order)+1.

Modules expanded:
  4.1  Marché et argent          11 → ~35
  3.1  Déplacements et directions 23 → ~40
  5.1  Registres formel/informel  15 → ~30
  5.4  Écriture et composition    15 → ~25
  6.1  Musique et arts            18 → ~25
  6.3  Traditions et cérémonies   18 → ~30

Modules left to professor:
  3.3  Conjugaison présent/passé   — verb tables are language-specific
  3.4  Conjugaison futur/impératif — idem
  4.3  Proverbes                   — native speaker only
  6.4  Langue dans le monde        — culture-specific

Usage:
    SUPABASE_SERVICE_KEY=sb_secret_... python3 expand_thin_modules.py
"""

import os, json, requests, subprocess, sys

SUPABASE_URL = "https://haioiccujncsehadipzb.supabase.co"
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
HEADERS = {
    "apikey":        SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type":  "application/json",
    "Prefer":        "return=minimal",
}

# ── New content ───────────────────────────────────────────────────────────────
# (course_order, lesson_order) → list of (french, example_french or None)
# Dialect intentionally blank — professor fills in.

NEW_ITEMS = {

  (4, 1): [  # Marché et argent — 11 → ~35
    ("Combien ça coûte ?",                          None),
    ("C'est trop cher !",                           None),
    ("Vous pouvez baisser le prix ?",               None),
    ("C'est votre dernier prix ?",                  None),
    ("Je vous donne cinq cents francs.",            None),
    ("Vous me faites une réduction ?",              None),
    ("C'est bon marché.",                           None),
    ("Je paye en liquide.",                         None),
    ("Rendez-moi la monnaie, s'il vous plaît.",     None),
    ("Un billet de mille francs",                   None),
    ("Combien pour le tout ?",                      None),
    ("Je n'ai pas de monnaie.",                     None),
    ("Le prix est fixe.",                           None),
    ("C'est en solde / en promotion.",              None),
    ("Je vous dois combien ?",                      None),
    ("Avez-vous quelque chose de moins cher ?",     None),
    ("C'est de bonne qualité ?",                    None),
    ("Gardez-le pour moi, je reviens.",             None),
    ("Je cherche un vendeur.",                      None),
    ("Le marché ouvre à quelle heure ?",            None),
    ("Je prends deux kilos.",                       None),
    ("Pesez-moi ça, s'il vous plaît.",              None),
    ("Je reviendrai demain.",                       None),
    ("C'est pour offrir.",                          None),
  ],

  (3, 1): [  # Déplacements et directions — 23 → ~40
    ("Prenez la première rue à droite.",            None),
    ("Continuez tout droit pendant 500 mètres.",    None),
    ("C'est juste en face.",                        None),
    ("Traversez le pont.",                          None),
    ("Passez devant l'église.",                     None),
    ("Le taxi-moto / la moto-taxi",                 None),
    ("À quelle heure part le prochain bus ?",       None),
    ("Le bus est en retard.",                       None),
    ("Descendez au prochain arrêt.",                None),
    ("Je vais à pied.",                             None),
    ("C'est loin d'ici ?",                          None),
    ("C'est tout près, à cinq minutes.",            None),
    ("Pouvez-vous me déposer ici ?",                None),
    ("Je suis perdu(e).",                           None),
    ("Est-ce que ce chemin mène au marché ?",       None),
    ("Faites demi-tour.",                           None),
    ("C'est après le feu rouge.",                   None),
  ],

  (5, 1): [  # Registres formel vs informel — 15 → ~30
    ("[Formel] Je vous souhaite la bienvenue.",               None),
    ("[Informel] Bienvenue !",                               None),
    ("[Formel] Puis-je vous poser une question ?",           None),
    ("[Informel] Je peux te demander quelque chose ?",       None),
    ("[Formel] Je vous prie de patienter un instant.",       None),
    ("[Informel] Attends une seconde !",                     None),
    ("[Formel] Veuillez vous asseoir.",                      None),
    ("[Informel] Assieds-toi !",                             None),
    ("[Formel] Pourriez-vous répéter, s'il vous plaît ?",    None),
    ("[Informel] Tu peux répéter ?",                         None),
    ("[Respect] Formule de respect envers un aîné",          None),
    ("[Respect] Comment saluer un chef de quartier",         None),
    ("[Argot kinois] Expression de joie / d'enthousiasme",   None),
    ("[Neutre] Se présenter à quelqu'un du même âge",        None),
    ("[Formel] Je vous remercie de votre compréhension.",    None),
  ],

  (5, 4): [  # Écriture et composition — 15 → ~25
    ("Objet : [sujet de la lettre]",                                      None),
    ("Je me permets de vous contacter au sujet de...",                    None),
    ("Suite à notre entretien du...",                                     None),
    ("Je reste à votre disposition pour tout renseignement.",             None),
    ("Dans l'attente de votre réponse...",                                None),
    ("Je vous adresse mes sincères salutations.",                         None),
    ("Pièce jointe : [document]",                                         None),
    ("En ce qui concerne...",                                             None),
    ("Il convient de noter que...",                                       None),
    ("En conclusion / Pour résumer...",                                   None),
  ],

  (6, 1): [  # Musique et arts — 18 → ~25
    ("Un groupe de musique",                        None),
    ("Les paroles d'une chanson",                   None),
    ("Jouer d'un instrument",                       None),
    ("La scène / Le podium",                        None),
    ("Un enregistrement / Un studio",               None),
    ("La musique traditionnelle africaine",         None),
    ("Quelle est ta chanson préférée ?",            None),
  ],

  (6, 3): [  # Traditions et cérémonies — 18 → ~30
    ("Les habits traditionnels",                    None),
    ("Le repas de fête",                            None),
    ("Les chants traditionnels",                    None),
    ("Les danses cérémonielles",                    None),
    ("Une bénédiction / Bénir quelqu'un",           None),
    ("Le respect des aînés",                        None),
    ("Les cadeaux de mariage",                      None),
    ("Un discours de bienvenue",                    None),
    ("La réconciliation / Se réconcilier",          None),
    ("Le griot / Le conteur traditionnel",          None),
    ("Le tambour sacré",                            None),
    ("Que la fête commence !",                      None),
  ],

}

# ── Supabase helpers ──────────────────────────────────────────────────────────

def get_lesson(course_order, lesson_order):
    """Return (lesson_id, max_item_order) for the given module."""
    res = requests.get(
        f"{SUPABASE_URL}/rest/v1/lessons"
        f"?select=id,lesson_order,courses!inner(id,course_order,language_id)"
        f"&lesson_order=eq.{lesson_order}",
        headers=HEADERS,
    )
    res.raise_for_status()
    for row in res.json():
        c = row["courses"]
        if c["language_id"] == 1 and c["course_order"] == course_order and c["id"] not in (22, 23, 24, 25):
            return row["id"]
    return None

def get_max_item_order(lesson_id):
    res = requests.get(
        f"{SUPABASE_URL}/rest/v1/lesson_items"
        f"?select=item_order&lesson_id=eq.{lesson_id}&order=item_order.desc&limit=1",
        headers=HEADERS,
    )
    res.raise_for_status()
    data = res.json()
    return data[0]["item_order"] if data else 0

def insert_items(lesson_id, items, start_order):
    rows = []
    for idx, (french, example_french) in enumerate(items):
        row = {
            "lesson_id":      lesson_id,
            "french":         french,
            "dialect":        "",
            "item_order":     start_order + idx,
        }
        if example_french:
            row["example_french"]  = example_french
            row["example_dialect"] = ""
        rows.append(row)

    res = requests.post(
        f"{SUPABASE_URL}/rest/v1/lesson_items",
        headers=HEADERS,
        json=rows,
    )
    if not res.ok:
        print(f"  Insert error: {res.status_code} {res.text}")
    res.raise_for_status()

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    for (co, lo), items in NEW_ITEMS.items():
        print(f"Module {co}.{lo}...", end=" ")

        lesson_id = get_lesson(co, lo)
        if not lesson_id:
            print(f"ERROR: lesson not found (course_order={co}, lesson_order={lo})")
            continue

        max_order = get_max_item_order(lesson_id)
        insert_items(lesson_id, items, start_order=max_order + 1)
        print(f"✓ +{len(items)} items appended (item_order {max_order+1}–{max_order+len(items)}, lesson_id={lesson_id})")

    print("\nAll modules expanded. Re-generating course templates...")
    result = subprocess.run(
        [sys.executable, "generate_course_templates.py"],
        env={**os.environ, "SUPABASE_SERVICE_KEY": SUPABASE_KEY},
    )
    if result.returncode != 0:
        print("ERROR: Template generation failed.")
    else:
        print("Done. Check Template/general/ for updated files.")

if __name__ == "__main__":
    main()
