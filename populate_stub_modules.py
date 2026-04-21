#!/usr/bin/env python3
"""
populate_stub_modules.py
─────────────────────────
Replaces the 3-item placeholders in stub modules with real content,
then re-runs the HTML audio collection generator.

Modules populated here (professor writes Lingala + records audio):
  1.1  Sons et alphabet
  4.4  Raconter une histoire
  5.1  Registres formel vs informel
  5.3  Médias et actualités
  5.4  Écriture et composition
  6.1  Musique et arts
  6.3  Traditions et cérémonies

Modules left for professor only (native-speaker required):
  4.3  Proverbes et expressions idiomatiques

Usage:
    SUPABASE_SERVICE_KEY=sb_secret_... python3 populate_stub_modules.py
"""

import os, json, requests, subprocess, sys

SUPABASE_URL = "https://haioiccujncsehadipzb.supabase.co"
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
HEADERS      = {
    "apikey":        SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type":  "application/json",
    "Prefer":        "return=minimal",
}

# ── Content definitions ───────────────────────────────────────────────────────
# (course_order, lesson_order) → list of (french, dialect)
# dialect = "" where professor must fill in; pre-filled where we're confident.

STUB_CONTENT = {

  (1, 1): [  # Sons et alphabet — Voyelles (items 1-7)
    ("Voyelle A — Décision",   "Bokáni"),
    ("Voyelle E — Genre",      "Emétu"),
    ("Voyelle I — Discours",   "Lisakolí"),
    ("Voyelle O — Sueur",      "Motóki"),
    ("Voyelle U — Déformer",   "Kozúza"),
    ("Voyelle Ɛ — Timbre",     "Tɛmbɛlɛ"),
    ("Voyelle Ɔ — Pour",       "Mpɔ"),
    # Consonnes simples (items 8-22)
    ("Consonne B — Maladie",      "Bokono"),
    ("Consonne D — Panier",       "Dangu"),
    ("Consonne F — Poubelle",     "Fúlu"),
    ("Consonne G — Jardin",       "Gádi"),
    ("Consonne K — Autrefois",    "Kala"),
    ("Consonne L — Noix de cola", "Likásu"),
    ("Consonne M — Pluie",        "Mbúla"),
    ("Consonne N — Python",       "Ngúma"),
    ("Consonne P — Lumière",      "Pépélé"),
    ("Consonne S — Lune",         "Sánzá"),
    ("Consonne T — Fragile",      "Taú"),
    ("Consonne V — Vin",          "Víno"),
    ("Consonne W — Sésame",       "Wangíla"),
    ("Consonne Y — Bienvenue",    "Yambí"),
    ("Consonne Z — Nid",          "Zála"),
    # Sons composés — digraphes (items 23-38)
    ("Son composé GB — Pont",       "Gbagba"),
    ("Son composé KP — Entrepôt",   "Ekpángba"),
    ("Son composé KW — Vénus",      "Mokwéte"),
    ("Son composé MB — Récompense", "Mbano"),
    ("Son composé MF — Taxe",       "Mfúti"),
    ("Son composé MP — Respirer",   "Mpéma"),
    ("Son composé MV — Frange",     "Litamvula"),
    ("Son composé MW — Huit",       "Mwambe"),
    ("Son composé ND — Maison",     "Ndáko"),
    ("Son composé NG — Cochon",     "Ngúlu"),
    ("Son composé NK — Cent",       "Nkámá"),
    ("Son composé NS — Fil",        "Nsinga"),
    ("Son composé NT — Chèvre",     "Ntaba"),
    ("Son composé NY — Animal",     "Nyama"),
    ("Son composé NZ — Buffle",     "Nzále"),
    ("Son composé TS — Grammaire",  "Etsúséláká"),
    # Sons composés — trigraphes (items 39-41)
    ("Son composé NGB — Hachette",  "Ngbá"),
    ("Son composé NGW — Brillant",  "Ngwaa"),
    ("Son composé TSH — Tchad",     "Tshádi"),
    # Tons (items 42-45)
    ("Ton bas (aucun accent) — Donner",               "Kopésa"),
    ("Ton haut (accent aigu ´) — Père",               "Tatá"),
    ("Ton descendant (accent circonflexe ^) — Énigme","Sâmbóle"),
    ("Ton montant (caron ˇ) — Femme",                 "Mwǎsi"),
  ],

  (4, 4): [  # Raconter une histoire
    ("Il était une fois...",                  ""),
    ("D'abord / Premièrement",                ""),
    ("Ensuite / Puis",                        ""),
    ("Après ça / Après cela",                 ""),
    ("Finalement / À la fin",                 ""),
    ("Soudain / Tout à coup",                 ""),
    ("Pendant ce temps",                      ""),
    ("Donc / Alors",                          ""),
    ("Mais / Cependant",                      ""),
    ("C'est pourquoi",                        ""),
    ("Il y a longtemps",                      ""),
    ("Le lendemain",                          ""),
    ("Depuis ce jour-là",                     ""),
    ("Quelqu'un dit que...",                  ""),
    ("Dans un village lointain",              ""),
    ("Le chef du village",                    ""),
    ("Écoute bien cette histoire !",          ""),
    ("Et c'est ainsi que se termine l'histoire.", ""),
  ],

  (5, 1): [  # Registres : formel vs informel
    ("[Formel] Bonjour, comment allez-vous ?",              ""),
    ("[Informel] Salut, ça va ?",                            ""),
    ("[Formel] Je vous remercie beaucoup.",                  ""),
    ("[Informel] Merci ! / Merci beaucoup !",               "Matondo ! / Matondo mingi !"),
    ("[Formel] Pourriez-vous m'aider, s'il vous plaît ?",   ""),
    ("[Informel] Aide-moi stp !",                           ""),
    ("[Formel] Je vous prie de m'excuser.",                  ""),
    ("[Informel] Désolé ! / Pardon !",                      "Limbisa !"),
    ("[Formel] Permettez-moi de me présenter.",             ""),
    ("[Informel] Moi c'est... / Je m'appelle...",           ""),
    ("[Respect] S'adresser à un aîné (vouvoiement)",        ""),
    ("[Respect] S'adresser à un chef / patron",             ""),
    ("[Argot kinois] Expression de rue courante à Kinshasa",""),
    ("[Code-switching] Mélanger lingala et français",       ""),
    ("[Neutre] Parler à quelqu'un qu'on ne connaît pas",   ""),
  ],

  (5, 3): [  # Médias et actualités
    ("Les nouvelles / L'actualité",                ""),
    ("Un événement important",                     ""),
    ("La guerre",                                  ""),
    ("La paix",                                    ""),
    ("Les élections",                              ""),
    ("Le gouvernement",                            ""),
    ("La loi / Un décret",                         ""),
    ("La radio",                                   ""),
    ("La télévision",                              ""),
    ("Un journal / Les informations",              ""),
    ("Une annonce officielle",                     ""),
    ("Un accord / Un traité",                      ""),
    ("La politique",                               ""),
    ("Un discours",                                ""),
    ("Rapporter ce que quelqu'un a dit",           ""),
    ("La vérité / Un mensonge",                    ""),
    ("Une crise / Un problème grave",              ""),
    ("Selon les informations...",                  ""),
    ("Il paraît que...",                           ""),
    ("La communauté / Le quartier",                ""),
  ],

  (5, 4): [  # Écriture et composition
    ("Cher / Chère [nom] — ouverture d'une lettre",          ""),
    ("Je vous écris pour vous informer que...",              ""),
    ("En réponse à votre message...",                        ""),
    ("Je vous prie de bien vouloir...",                      ""),
    ("Veuillez agréer mes salutations respectueuses.",       ""),
    ("Cordialement / Bien à vous",                           ""),
    ("Avec tout mon respect",                                ""),
    ("Comme suite à notre conversation...",                  ""),
    ("J'ai l'honneur de vous informer...",                   ""),
    ("Je souhaiterais vous demander...",                     ""),
    ("Un paragraphe / Une phrase",                           ""),
    ("Le début / L'introduction",                           ""),
    ("La conclusion / Pour conclure",                        ""),
    ("D'une part... d'autre part...",                        ""),
    ("À mon avis / Selon moi",                               ""),
  ],

  (6, 1): [  # Musique et arts
    ("La musique",                                     ""),
    ("Une chanson / Chanter",                          ""),
    ("La danse / Danser",                              ""),
    ("Un instrument de musique",                       ""),
    ("La rumba congolaise",                            ""),
    ("Un artiste / Une artiste",                       ""),
    ("La guitare",                                     ""),
    ("Les percussions / Le tambour",                   ""),
    ("Un concert",                                     ""),
    ("Le rythme",                                      ""),
    ("La mélodie",                                     ""),
    ("Applaudir / Les applaudissements",               ""),
    ("Une fête / Célébrer",                            ""),
    ("J'aime beaucoup cette chanson !",                ""),
    ("Quelle belle danse !",                           ""),
    ("Il/elle chante très bien.",                      ""),
    ("La musique touche le cœur.",                     ""),
    ("La tradition musicale lingala",                  ""),
  ],

  (6, 3): [  # Traditions et cérémonies
    ("Un mariage / Se marier",                         ""),
    ("La dot — cadeaux offerts à la famille de la mariée", ""),
    ("Une cérémonie de nommage d'un enfant",           ""),
    ("Donner un nom à un nouveau-né",                  ""),
    ("Un enterrement / Les funérailles",               ""),
    ("Exprimer ses condoléances",                      ""),
    ("La prière / Prier",                              ""),
    ("Une fête traditionnelle",                        ""),
    ("Un rite de passage",                             ""),
    ("Les ancêtres",                                   ""),
    ("Honorer les ancêtres",                           ""),
    ("Le chef traditionnel",                           ""),
    ("La communauté / Le clan",                        ""),
    ("Une célébration religieuse",                     ""),
    ("Bienvenue à la cérémonie !",                     ""),
    ("Que la bénédiction soit sur vous !",             ""),
    ("Nous sommes réunis aujourd'hui pour...",         ""),
    ("La tradition nous enseigne que...",              ""),
  ],
}

# ── Supabase helpers ──────────────────────────────────────────────────────────

def get_lesson_id(course_order, lesson_order):
    res = requests.get(
        f"{SUPABASE_URL}/rest/v1/lessons"
        f"?select=id,courses!inner(id,course_order,language_id)"
        f"&courses.language_id=eq.1"
        f"&lesson_order=eq.{lesson_order}",
        headers=HEADERS,
    )
    res.raise_for_status()
    for row in res.json():
        c = row["courses"]
        if c["language_id"] == 1 and c["course_order"] == course_order and c["id"] not in (22, 23, 24, 25):
            return row["id"]
    return None

def delete_lesson_items(lesson_id):
    res = requests.delete(
        f"{SUPABASE_URL}/rest/v1/lesson_items?lesson_id=eq.{lesson_id}",
        headers=HEADERS,
    )
    if not res.ok:
        print(f"  Delete error: {res.status_code} {res.text}")
    res.raise_for_status()

def insert_items(lesson_id, items):
    rows = [
        {"lesson_id": lesson_id, "french": fr, "dialect": dia, "item_order": idx + 1}
        for idx, (fr, dia) in enumerate(items)
    ]
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
    for (co, lo), items in STUB_CONTENT.items():
        print(f"Processing module {co}.{lo}...", end=" ")
        lesson_id = get_lesson_id(co, lo)
        if not lesson_id:
            print(f"ERROR: lesson not found for course_order={co}, lesson_order={lo}")
            continue
        delete_lesson_items(lesson_id)
        insert_items(lesson_id, items)
        print(f"✓ {len(items)} items inserted (lesson_id={lesson_id})")

    print("\nAll stub modules populated. Re-generating HTML files...")
    result = subprocess.run(
        [sys.executable, "generate_audio_collection_html.py"],
        env={**os.environ, "SUPABASE_SERVICE_KEY": SUPABASE_KEY},
    )
    if result.returncode != 0:
        print("ERROR: HTML generation failed.")
    else:
        print("Done. Check audio_collection_html/ for updated files.")

if __name__ == "__main__":
    main()
