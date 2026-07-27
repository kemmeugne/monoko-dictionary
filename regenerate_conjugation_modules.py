#!/usr/bin/env python3
"""
Regenerate the three Lingala conjugation recording modules.

Structure:
- Verbs: parler (-er), finir (-ir), vendre (-re).
- Every NON-imperative form (je -> ils/elles) is its own card = its own
  recording, carrying a full, unique example sentence (maximises corpus).
- Imperative stays grouped: one card per verb (tu/nous/vous bare forms).
- Tenses are separated into their own sections (theme strip).

Touches only the main recording apps in audio_collection_html/ and their
MONOKO_ENREGISTREMENTS_LINGALA/ copies. Leaves GROUPE_A/GROUPE_B and
review_professor/ variants untouched. Idempotent / safe to re-run.
"""
import json
import os
import re
import sys

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "audio_collection_html")

VERBS = [("parler", "-er"), ("finir", "-ir"), ("vendre", "-re")]
GROUPED_TENSES = {"imperatif", "imperatif_neg"}  # kept as bare-form grouped cards

# Bare conjugated forms — used for the breadcrumb hint (and for grouped imperatives).
CONJ = {
    ("parler", "present"):   ["je parle", "tu parles", "il/elle parle", "nous parlons", "vous parlez", "ils/elles parlent"],
    ("finir", "present"):    ["je finis", "tu finis", "il/elle finit", "nous finissons", "vous finissez", "ils/elles finissent"],
    ("vendre", "present"):   ["je vends", "tu vends", "il/elle vend", "nous vendons", "vous vendez", "ils/elles vendent"],

    ("parler", "passe"):     ["j'ai parlé", "tu as parlé", "il/elle a parlé", "nous avons parlé", "vous avez parlé", "ils/elles ont parlé"],
    ("finir", "passe"):      ["j'ai fini", "tu as fini", "il/elle a fini", "nous avons fini", "vous avez fini", "ils/elles ont fini"],
    ("vendre", "passe"):     ["j'ai vendu", "tu as vendu", "il/elle a vendu", "nous avons vendu", "vous avez vendu", "ils/elles ont vendu"],

    ("parler", "imparfait"): ["je parlais", "tu parlais", "il/elle parlait", "nous parlions", "vous parliez", "ils/elles parlaient"],
    ("finir", "imparfait"):  ["je finissais", "tu finissais", "il/elle finissait", "nous finissions", "vous finissiez", "ils/elles finissaient"],
    ("vendre", "imparfait"): ["je vendais", "tu vendais", "il/elle vendait", "nous vendions", "vous vendiez", "ils/elles vendaient"],

    ("parler", "futur"):     ["je parlerai", "tu parleras", "il/elle parlera", "nous parlerons", "vous parlerez", "ils/elles parleront"],
    ("finir", "futur"):      ["je finirai", "tu finiras", "il/elle finira", "nous finirons", "vous finirez", "ils/elles finiront"],
    ("vendre", "futur"):     ["je vendrai", "tu vendras", "il/elle vendra", "nous vendrons", "vous vendrez", "ils/elles vendront"],

    ("parler", "futur_proche"): ["je vais parler", "tu vas parler", "il/elle va parler", "nous allons parler", "vous allez parler", "ils/elles vont parler"],
    ("finir", "futur_proche"):  ["je vais finir", "tu vas finir", "il/elle va finir", "nous allons finir", "vous allez finir", "ils/elles vont finir"],
    ("vendre", "futur_proche"): ["je vais vendre", "tu vas vendre", "il/elle va vendre", "nous allons vendre", "vous allez vendre", "ils/elles vont vendre"],

    ("parler", "imperatif"): ["parle ! (tu)", "parlons ! (nous)", "parlez ! (vous)"],
    ("finir", "imperatif"):  ["finis ! (tu)", "finissons ! (nous)", "finissez ! (vous)"],
    ("vendre", "imperatif"): ["vends ! (tu)", "vendons ! (nous)", "vendez ! (vous)"],

    ("parler", "imperatif_neg"): ["ne parle pas ! (tu)", "ne parlons pas ! (nous)", "ne parlez pas ! (vous)"],
    ("finir", "imperatif_neg"):  ["ne finis pas ! (tu)", "ne finissons pas ! (nous)", "ne finissez pas ! (vous)"],
    ("vendre", "imperatif_neg"): ["ne vends pas ! (tu)", "ne vendons pas ! (nous)", "ne vendez pas ! (vous)"],
}

# One unique example sentence per (verb, tense, pronoun). Order: je, tu, il/elle, nous, vous, ils/elles.
SENTENCES = {
    # ---- PARLER ----
    ("parler", "present"): [
        "Je parle à mon ami au téléphone.",
        "Tu parles trop vite !",
        "Elle parle très bien le lingala.",
        "Nous parlons de notre projet ensemble.",
        "Vous parlez plusieurs langues ?",
        "Ils parlent avec le professeur.",
    ],
    ("parler", "passe"): [
        "Hier, j'ai parlé avec ma mère.",
        "Tu as parlé au directeur ce matin ?",
        "Il a parlé pendant deux heures.",
        "Nous avons parlé de nos vacances.",
        "Vous avez parlé trop fort en réunion.",
        "Ils ont parlé de leurs vacances l'année dernière.",
    ],
    ("parler", "imparfait"): [
        "Quand j'étais petit, je parlais souvent avec mon grand-père.",
        "Avant, tu parlais moins bien le français.",
        "Elle parlait toujours doucement.",
        "Chaque soir, nous parlions autour du feu.",
        "Vous parliez de quoi tout à l'heure ?",
        "Ils parlaient sans arrêt pendant le cours.",
    ],
    ("parler", "futur"): [
        "Demain, je parlerai au médecin.",
        "Tu parleras devant toute la classe.",
        "Elle parlera à la radio la semaine prochaine.",
        "Nous parlerons de ce problème plus tard.",
        "Vous parlerez en premier à la réunion.",
        "Ils parleront avec le chef du village.",
    ],
    ("parler", "futur_proche"): [
        "Je vais parler à mon patron cet après-midi.",
        "Tu vas parler avec elle bientôt ?",
        "Il va parler pendant la cérémonie.",
        "Nous allons parler de ton avenir.",
        "Vous allez parler devant les invités.",
        "Elles vont parler à leurs enfants ce soir.",
    ],
    # ---- FINIR ----
    ("finir", "present"): [
        "Je finis mon travail à cinq heures.",
        "Tu finis toujours ton assiette ?",
        "Il finit sa leçon avant de jouer.",
        "Nous finissons le projet cette semaine.",
        "Vous finissez à quelle heure aujourd'hui ?",
        "Elles finissent leurs devoirs ensemble.",
    ],
    ("finir", "passe"): [
        "J'ai fini de manger il y a une heure.",
        "Est-ce que tu as fini de lire le livre ?",
        "Elle a fini sa course la première.",
        "Nous avons fini la réunion très tôt.",
        "Vous avez fini le travail à temps.",
        "Ils ont fini la maison l'année dernière.",
    ],
    ("finir", "imparfait"): [
        "Autrefois, je finissais toujours en retard.",
        "Tu finissais tes journées très fatigué.",
        "Il finissait son repas en silence.",
        "Nous finissions l'école à midi quand j'étais jeune.",
        "Vous finissiez souvent avant les autres.",
        "Ils finissaient le marché à la tombée de la nuit.",
    ],
    ("finir", "futur"): [
        "Je finirai ce livre demain.",
        "Tu finiras par comprendre, ne t'inquiète pas.",
        "Elle finira ses études l'an prochain.",
        "Nous finirons la récolte avant la pluie.",
        "Vous finirez ce travail sans moi.",
        "Ils finiront la construction dans deux mois.",
    ],
    ("finir", "futur_proche"): [
        "Je vais finir mon assiette tout de suite.",
        "Tu vas finir par tomber malade.",
        "Il va finir son discours dans un instant.",
        "Nous allons finir le match ce soir.",
        "Vous allez finir en même temps.",
        "Elles vont finir leur voyage demain.",
    ],
    # ---- VENDRE ----
    ("vendre", "present"): [
        "Je vends des fruits au marché.",
        "Tu vends ta vieille voiture ?",
        "Elle vend du poisson frais chaque matin.",
        "Nous vendons nos produits au village.",
        "Vous vendez ça à quel prix ?",
        "Ils vendent des habits au grand marché.",
    ],
    ("vendre", "passe"): [
        "J'ai vendu ma maison le mois dernier.",
        "Tu as vendu tous tes légumes aujourd'hui ?",
        "Il a vendu sa moto à un ami.",
        "Nous avons vendu beaucoup de pain ce matin.",
        "Vous avez vendu votre terrain ?",
        "Elles ont vendu leurs bijoux au marché.",
    ],
    ("vendre", "imparfait"): [
        "Avant, je vendais des journaux dans la rue.",
        "Tu vendais des mangues quand tu étais jeune.",
        "Elle vendait du café devant l'église.",
        "Nous vendions nos récoltes chaque dimanche.",
        "Vous vendiez vos poulets au bord de la route.",
        "Ils vendaient de tout dans ce petit magasin.",
    ],
    ("vendre", "futur"): [
        "Je vendrai ma récolte à un bon prix.",
        "Tu vendras ta maison un jour ?",
        "Il vendra ses vaches au marché.",
        "Nous vendrons nos produits en ville.",
        "Vous vendrez tout avant midi.",
        "Elles vendront leurs paniers à la fête.",
    ],
    ("vendre", "futur_proche"): [
        "Je vais vendre mon téléphone cette semaine.",
        "Tu vas vendre ton vélo bientôt ?",
        "Elle va vendre ses gâteaux demain matin.",
        "Nous allons vendre la voiture le mois prochain.",
        "Vous allez vendre à perte comme ça.",
        "Ils vont vendre leur maison après les fêtes.",
    ],
}


def build_entries(sections):
    """sections: list of (section_label, tense_key). Returns list of entry dicts."""
    entries = []
    eid = 0

    def new_entry(breadcrumb, phrase_fr):
        nonlocal eid
        e = {
            "id": eid, "db_id": None, "breadcrumb": breadcrumb,
            "label_fr": None, "label_lang": "",
            "phrase_fr": phrase_fr, "phrase_lang": "",
            "phrase_fr2": None, "phrase_lang2": None, "prefilled": False,
        }
        eid += 1
        return e

    for section_label, tense in sections:
        for verb, group in VERBS:
            if tense in GROUPED_TENSES:
                # one grouped card per verb: bare forms, one recording
                bc = f"{section_label} > {verb} ({group})"
                entries.append(new_entry(bc, "\n".join(CONJ[(verb, tense)])))
            else:
                # one card per pronoun: full example sentence, one recording each
                forms = CONJ[(verb, tense)]
                sents = SENTENCES[(verb, tense)]
                for i in range(6):
                    bc = f"{section_label} > {verb} ({group}) · {forms[i]}"
                    entries.append(new_entry(bc, sents[i]))
    return entries


MODULES = {
    "3.3_conjugaison_present_et_passe": {
        "sections": [("Présent", "present"), ("Passé composé", "passe"), ("Imparfait", "imparfait")],
        "subtitle": "Audio Lingala — 3.3 Conjugaison : présent et passé",
        "splash_h2": "Module 3.3 — Conjugaison : présent et passé",
        "splash_p": (
            "Enregistrez des phrases d'exemple pour 3 verbes réguliers — "
            "<strong>parler</strong> (-er), <strong>finir</strong> (-ir), <strong>vendre</strong> (-re) — "
            "au <strong>présent</strong>, au <strong>passé composé</strong> et à l'<strong>imparfait</strong>."
            "<br><br>Chaque personne (je → ils/elles) a sa propre phrase et son propre enregistrement. "
            "Traduisez chaque phrase en Lingala, puis enregistrez l'audio."
            "<br><br>À la fin, exportez le tout en fichier ZIP à nous envoyer."
        ),
    },
    "3.4_conjugaison_futur_et_imperatif": {
        "sections": [("Futur simple", "futur"), ("Impératif affirmatif", "imperatif")],
        "subtitle": "Audio Lingala — 3.4 Conjugaison : futur et impératif",
        "splash_h2": "Module 3.4 — Conjugaison : futur et impératif",
        "splash_p": (
            "Enregistrez des phrases d'exemple pour 3 verbes réguliers — "
            "<strong>parler</strong> (-er), <strong>finir</strong> (-ir), <strong>vendre</strong> (-re) — "
            "au <strong>futur simple</strong> (une phrase par personne), puis l'<strong>impératif affirmatif</strong> "
            "(tu, nous, vous, regroupés par verbe)."
            "<br><br>Traduisez chaque carte en Lingala, puis enregistrez l'audio."
            "<br><br>À la fin, exportez le tout en fichier ZIP à nous envoyer."
        ),
    },
    "3.4_conjugaison_futur_supplement": {
        "sections": [("Futur proche", "futur_proche"), ("Impératif négatif", "imperatif_neg")],
        "subtitle": "Audio Lingala — 3.4 Conjugaison : futur proche et impératif négatif (supplément)",
        "splash_h2": "Module 3.4 (supplément) — Futur proche et impératif négatif",
        "splash_p": (
            "Enregistrez des phrases d'exemple pour 3 verbes réguliers — "
            "<strong>parler</strong> (-er), <strong>finir</strong> (-ir), <strong>vendre</strong> (-re) — "
            "au <strong>futur proche</strong> (aller + infinitif, une phrase par personne), puis l'<strong>impératif négatif</strong> "
            "(tu, nous, vous, regroupés par verbe)."
            "<br><br>Traduisez chaque carte en Lingala, puis enregistrez l'audio."
            "<br><br>À la fin, exportez le tout en fichier ZIP à nous envoyer."
        ),
    },
}


def transform(html, cfg, count):
    def sub_once(pattern, repl, s, flags=0, label=""):
        new, n = re.subn(pattern, repl, s, flags=flags)
        if n != 1:
            raise RuntimeError(f"[{label}] expected 1 replacement, got {n}")
        return new

    # 1. ENTRIES array
    entries_js = "const ENTRIES = " + json.dumps(cfg["_entries"], indent=2, ensure_ascii=False) + ";\nconst LANGUAGE"
    html = sub_once(r'const ENTRIES = \[.*?\];\nconst LANGUAGE',
                    lambda m: entries_js, html, flags=re.DOTALL, label="ENTRIES")

    # 2. subtitle line
    html = sub_once(r'<div class="subtitle">Audio Lingala[^<]*</div>',
                    lambda m: f'<div class="subtitle">{cfg["subtitle"]} — {count} entrées</div>',
                    html, label="subtitle")

    # 3. splash block (h2 + intro), replaced wholesale up to the start button
    splash_repl = (
        '<div id="splashScreen" class="splash-screen">\n'
        '  <div style="font-size:52px;margin-bottom:16px;">🎙️</div>\n'
        f'  <h2>{cfg["splash_h2"]}</h2>\n'
        f'  <p>{cfg["splash_p"]}</p>\n'
        '  <button class="start-btn" onclick="startWork()">Commencer →</button>\n'
        '</div>'
    )
    html = sub_once(r'<div id="splashScreen".*?<button class="start-btn"[^>]*>[^<]*</button>\s*</div>',
                    lambda m: splash_repl, html, flags=re.DOTALL, label="splash")

    # 4. initial progress text (avoids a flash of the wrong count before boot)
    html = sub_once(r'Entrée 0 / \d+', lambda m: f'Entrée 0 / {count}', html, label="progressText")

    # 5. render tweaks — tolerant of the original OR a previously-transformed file
    def lit_any(olds, new, label):
        nonlocal html
        for old in olds:
            c = html.count(old)
            if c == 1:
                html = html.replace(old, new)
                return
            if c > 1:
                raise RuntimeError(f"[{label}] {c} occurrences of a variant")
        if new in html:
            return  # already applied
        raise RuntimeError(f"[{label}] no known variant found")

    lit_any(['<div class="section-title">Phrase principale</div>',
             '<div class="section-title">Conjugaison — toutes les personnes</div>'],
            '<div class="section-title">Phrase d\'exemple</div>', "section-title")
    lit_any(['<textarea class="ref-box ref-editable" rows="2" oninput="onField(\'phrase_fr\',this.value)">',
             '<textarea class="ref-box ref-editable" rows="7" oninput="onField(\'phrase_fr\',this.value)">'],
            '<textarea class="ref-box ref-editable" rows="3" oninput="onField(\'phrase_fr\',this.value)">', "ref-rows")
    lit_any(['<textarea id="fl-phrase" placeholder="Traduction en ${LANGUAGE}…"',
             '<textarea id="fl-phrase" rows="7" placeholder="Traduction en ${LANGUAGE}…"'],
            '<textarea id="fl-phrase" rows="3" placeholder="Traduction en ${LANGUAGE}…"', "fl-rows")

    return html


def main():
    copies_dirs = [BASE, os.path.join(BASE, "MONOKO_ENREGISTREMENTS_LINGALA")]
    for slug, cfg in MODULES.items():
        entries = build_entries(cfg["sections"])
        cfg["_entries"] = entries
        count = len(entries)
        fname = f"Monoko_Audio_Lingala_{slug}.html"
        for d in copies_dirs:
            path = os.path.join(d, fname)
            if not os.path.exists(path):
                print(f"  SKIP (missing): {path}")
                continue
            with open(path, encoding="utf-8") as fh:
                html = fh.read()
            try:
                html = transform(html, cfg, count)
            except RuntimeError as e:
                print(f"  ERROR {path}: {e}")
                sys.exit(1)
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(html)
            print(f"  OK ({count} cards): {os.path.relpath(path, BASE)}")


if __name__ == "__main__":
    main()
