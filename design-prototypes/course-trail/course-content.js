(() => {
  const draftSource = "Validation professorale prévue";

  function capsule(id, title, region, short, body, art, icon, sourceLabel = draftSource, sourceUrl = "") {
    return { id, title, region, short, body, art, icon, sourceLabel, sourceUrl, reviewStatus: "Brouillon éditorial" };
  }

  function lesson(id, level, title, icon, minutes, copy) {
    // Lesson 346 intentionally has no routed Aller plus loin pool in production.
    return { id, level, title, icon, minutes, copy, capsule: null, hasElargir: id !== 346 };
  }

  const levels = [
    { number: 1, title: "Fondations", cefr: "A1", description: "Comprendre les sons et mener ses premiers échanges en lingala.", badgeIcon: "sprout", medalTitle: "Médaille des fondations" },
    { number: 2, title: "Vie quotidienne", cefr: "A2", description: "Parler de ses proches, de la maison et des besoins de tous les jours.", badgeIcon: "house", medalTitle: "Médaille du quotidien" },
    { number: 3, title: "Communication", cefr: "B1", description: "Tenir une conversation, se déplacer et maîtriser le système verbal.", badgeIcon: "messages-square", medalTitle: "Médaille de la communication" },
    { number: 4, title: "Approfondissement", cefr: "B1+", description: "Raconter, négocier et comprendre les images culturelles de la langue.", badgeIcon: "book-open", medalTitle: "Médaille de l'approfondissement" },
    { number: 5, title: "Maîtrise", cefr: "B2", description: "Adapter son registre et construire une parole nuancée et structurée.", badgeIcon: "award", medalTitle: "Médaille de maîtrise" },
    { number: 6, title: "Culture vivante", cefr: "B2+", description: "Explorer les arts, les pratiques et les usages contemporains du lingala.", badgeIcon: "crown", medalTitle: "Médaille de la culture vivante" },
  ];

  const lessons = [
    lesson(346, 1, "Sons et alphabet", "volume-2", 9, "Reconnaître les sons, les tons et les premières graphies."),
    lesson(347, 1, "Salutations et politesse", "messages-square", 8, "Saluer, remercier et prendre congé naturellement."),
    lesson(392, 1, "Vœux et compliments", "sparkles", 7, "Accompagner les moments importants avec les bonnes expressions."),
    lesson(348, 1, "Présentation personnelle", "user-round", 10, "Dire son nom, parler de soi et poser des questions simples."),
    lesson(349, 1, "Pronoms sujets et adjectifs possessifs", "users-round", 11, "Parler des personnes et de ce qui leur appartient."),
    lesson(350, 1, "Les nombres", "hash", 10, "Compter et reconnaître les nombres dans une conversation."),
    lesson(376, 1, "Jours et unités de temps", "calendar-days", 9, "Situer une action dans la semaine et dans le temps."),
    lesson(377, 1, "Les mois", "calendar-range", 8, "Nommer les mois et parler des dates importantes."),
    lesson(378, 1, "Saisons et l'heure", "cloud-sun", 10, "Parler du climat, des saisons et donner l'heure."),
    lesson(351, 2, "La famille et les relations", "heart-handshake", 10, "Nommer ses proches et décrire les liens familiaux."),
    lesson(352, 2, "La maison et les objets", "house", 10, "Décrire les espaces de la maison et les objets utiles."),
    lesson(353, 2, "Manger et boire", "utensils", 11, "Commander, décrire un repas et parler de ses goûts."),
    lesson(354, 2, "La santé", "heart-pulse", 10, "Décrire un symptôme et demander de l'aide."),
    lesson(390, 2, "Compréhension et communication", "message-circle-question", 8, "Faire répéter, ralentir et réparer un malentendu."),
    lesson(391, 2, "Le corps", "person-standing", 9, "Nommer les parties du corps et décrire une sensation."),
    lesson(355, 2, "Construction de phrases 1", "blocks", 12, "Construire des affirmations, négations et questions simples."),
    lesson(356, 3, "Déplacements et directions", "signpost", 10, "Demander son chemin et se déplacer avec des repères clairs."),
    lesson(357, 3, "Le travail et les métiers", "briefcase-business", 10, "Parler de son métier, de son activité et de son lieu de travail."),
    lesson(358, 3, "Conjugaison - présent et passé", "history", 13, "Situer une action en cours, habituelle ou déjà accomplie."),
    lesson(359, 3, "Conjugaison - futur et impératif", "fast-forward", 12, "Parler de l'avenir, donner une consigne et faire une demande."),
    lesson(360, 3, "Sentiments et émotions", "smile-plus", 10, "Exprimer une émotion, un goût et un désaccord."),
    lesson(361, 3, "Conjonctions", "git-branch", 9, "Relier des idées avec cause, opposition et conséquence."),
    lesson(379, 3, "Pronoms relatifs", "brackets", 10, "Préciser une personne ou une chose dans une phrase complexe."),
    lesson(380, 3, "Comparatifs et superlatifs", "scale", 9, "Comparer des personnes, des objets et des situations."),
    lesson(381, 3, "Adverbes de fréquence", "repeat", 9, "Dire ce qui arrive toujours, parfois, souvent ou jamais."),
    lesson(382, 3, "Prépositions de lieu", "map-pin", 9, "Situer une personne ou un objet depuis un repère partagé."),
    lesson(383, 3, "Prépositions de temps", "clock-3", 9, "Ordonner des événements dans le temps."),
    lesson(384, 3, "Prépositions et mots de liaison", "waypoints", 10, "Expliquer une cause, une condition et une exception."),
    lesson(385, 3, "Adverbes de quantité et de degré", "gauge", 9, "Nuancer une quantité, une intensité ou un jugement."),
    lesson(386, 3, "Pronoms compléments et toniques", "at-sign", 10, "Mettre en valeur les participants d'une action."),
    lesson(387, 3, "Pronoms possessifs et démonstratifs", "mouse-pointer-2", 10, "Désigner et distinguer ce qui appartient à chacun."),
    lesson(393, 3, "Conjugaison : futur proche et impératif négatif", "circle-slash-2", 12, "Annoncer une action imminente et dire ce qu'il ne faut pas faire."),
    lesson(362, 4, "Le marché et l'argent", "shopping-basket", 11, "Négocier, préciser une quantité et parler de paiement."),
    lesson(363, 4, "Animaux", "paw-print", 9, "Nommer les animaux et décrire leurs comportements."),
    lesson(388, 4, "Nature et éléments", "trees", 10, "Décrire le fleuve, la forêt, la terre et le ciel."),
    lesson(389, 4, "Météo", "cloud-sun-rain", 8, "Décrire le temps présent et anticiper un changement."),
    lesson(364, 4, "Proverbes et expressions idiomatiques", "quote", 12, "Comprendre les images et employer une sagesse concise."),
    lesson(365, 4, "Raconter une histoire", "book-open-text", 12, "Construire un récit avec rythme, détails et dialogue."),
    lesson(366, 4, "Couleurs et vêtements", "shirt", 9, "Décrire les couleurs, les vêtements et l'apparence."),
    lesson(367, 5, "Registres : formel vs informel", "messages-square", 11, "Adapter sa manière de parler à la relation et à la situation."),
    lesson(368, 5, "Débats et opinions", "message-square-more", 12, "Présenter une opinion et répondre avec nuance."),
    lesson(369, 5, "Médias et actualités", "radio", 11, "Comprendre une information et identifier son point de vue."),
    lesson(370, 5, "Écriture et composition", "pen-line", 12, "Écrire un message, une lettre et un texte structuré."),
    lesson(371, 6, "Musique et arts", "music-2", 12, "Parler des sons, des danses et des œuvres artistiques."),
    lesson(372, 6, "Cuisine et gastronomie", "cooking-pot", 12, "Expliquer une recette, une technique et un goût."),
    lesson(373, 6, "Traditions et cérémonies", "party-popper", 12, "Décrire les étapes, les rôles et les paroles d'une cérémonie."),
    lesson(374, 6, "La langue dans le monde", "globe-2", 11, "Comprendre comment le lingala voyage et évolue."),
    lesson(394, 6, "Religion et spiritualité", "landmark", 11, "Comprendre les formules de foi, de bénédiction et de rassemblement."),
    lesson(395, 6, "Technologie et communication", "smartphone", 10, "Parler du téléphone, des messages, des réseaux et du paiement mobile."),
  ];

  const curatedCapsules = {
    346: capsule("locuteurs-lingala-monde", "40 à 45 millions de locuteurs", "Le lingala dans le monde", "Environ 20 millions de personnes parlent le lingala comme langue maternelle et 20 à 25 millions comme seconde langue.", "Le lingala est surtout parlé en RDC et en République du Congo, mais aussi dans les communautés congolaises ailleurs dans le monde. Les chiffres restent des estimations : une encyclopédie rédigée par un professeur de linguistique compte environ 40 à 45 millions de locuteurs au total.", "art-conversation", "users-round", "Store norske leksikon · Rolf Theil", "https://snl.no/lingala"),
    350: capsule("fleuve-congo-en-nombres", "Le fleuve Congo en nombres", "Géographie de la RDC", "Environ 4 700 km de longueur, au moins 220 m de profondeur et un débit moyen de 45 000 m³/s.", "Le ministère congolais de l'Environnement présente le Congo comme le deuxième plus long fleuve d'Afrique après le Nil. Son débit moyen est le deuxième au monde après l'Amazone, et des mesures dépassant 220 mètres en font le fleuve le plus profond mesuré.", "art-river", "ruler", "Ministère de l'Environnement de la RDC", "https://medd.gouv.cd/wp-content/uploads/2022/07/magazine_COP_env_anglais1.pdf"),
    378: capsule("foret-fabrique-pluie", "La forêt fabrique une partie de sa pluie", "Bassin du Congo", "Plus de la moitié de la pluie du bassin central provient de l'eau recyclée par la forêt.", "Un rapport de l'UNESCO explique que plus de 50 % de la pluie qui tombe sur le bassin central du Congo vient de l'évaporation et de l'évapotranspiration de la forêt elle-même. La forêt participe donc directement au rythme des saisons et du climat régional.", "art-river", "cloud-rain-wind", "UNESCO · Patrimoine mondial dans le bassin du Congo", "https://whc.unesco.org/uploads/activities/documents/activity-43-10.pdf"),
    353: capsule("mikate-kinshasa", "Le mikate, une douceur de rue", "Cuisine kinoise", "Ces petits beignets sucrés sont populaires au petit-déjeuner ou comme collation à Kinshasa.", "Le mikate est préparé avec une pâte à base de farine, puis frit. Le ministère congolais de la Culture le présente comme une spécialité de rue très appréciée à Kinshasa, consommée au petit-déjeuner ou au cours de la journée.", "art-liboke", "donut", "Ministère de la Culture, Arts et Patrimoine de la RDC", "https://www.culture.gouv.cd/discover.html"),
    356: capsule("deux-capitales-face-a-face", "Deux capitales face à face", "Kinshasa · Brazzaville", "Séparées par le fleuve Congo, Kinshasa et Brazzaville sont les capitales de deux pays distincts les plus proches au monde.", "La capitale de la RDC et celle de la République du Congo se font face de part et d'autre du Pool Malebo. Elles sont généralement présentées comme les capitales de deux pays distincts les plus proches au monde ; seule la paire Rome–Cité du Vatican est plus rapprochée si l'on compte le Vatican. Le fleuve forme ici une frontière internationale, mais aussi un lien essentiel pour les déplacements, les échanges et la vie des deux villes.", "art-river", "map-pinned", "Ambassade de la République du Congo · Géographie", "https://ambacongo-us.org/en/about-congo/geography"),
    362: capsule("combat-ali-foreman-kinshasa", "Le combat à 10 millions de dollars", "Kinshasa · 1974", "Mobutu fit garantir une bourse de 10 millions de dollars pour attirer Muhammad Ali et George Foreman à Kinshasa.", "Le 30 octobre 1974, Kinshasa accueille le premier championnat du monde des poids lourds jamais organisé en Afrique. Mobutu veut placer le Zaïre sous les projecteurs et fait garantir une bourse record de 10 millions de dollars, soit 5 millions pour chaque boxeur. Devant environ 60 000 personnes, Muhammad Ali met George Foreman KO au huitième round et reprend le titre mondial.", "art-rumble", "trophy", "TIME · The Rumble in the Jungle", "https://time.com/4637842/muhammed-ali-george-foreman/"),
    363: capsule("okapi-ituri", "L'okapi, girafe de la forêt", "Forêt de l'Ituri · RDC", "La Réserve de faune à okapis abrite environ 5 000 individus de cette espèce endémique.", "L'okapi est une girafe forestière propre à la RDC. La réserve qui porte son nom protège une partie de la forêt de l'Ituri et abrite aussi 101 espèces de mammifères et 376 espèces d'oiseaux documentées.", "art-okapi", "paw-print", "UNESCO · Réserve de faune à okapis", "https://whc.unesco.org/en/list/718/"),
    388: capsule("biodiversite-bassin-congo", "Une forêt que l'on ne trouve nulle part ailleurs", "Bassin du Congo", "Les forêts de basse altitude comptent environ 10 000 plantes supérieures, dont 30 % sont endémiques.", "Le bassin du Congo est l'une des dernières régions où de vastes forêts tropicales restent interconnectées. L'UNESCO souligne qu'une part importante de sa flore et de sa faune n'existe nulle part ailleurs dans le monde.", "art-river", "trees", "UNESCO · Patrimoine mondial dans le bassin du Congo", "https://whc.unesco.org/uploads/activities/documents/activity-43-10.pdf"),
    366: capsule("textiles-kuba", "Les motifs des textiles kuba", "Arts textiles · RDC", "Les textiles kuba associent fibres de raphia, teinture et broderie dans des compositions géométriques.", "Le Smithsonian décrit un tissu Shoowa composé d'une base en raphia tissée, puis brodée avec du fil de raphia teint. Hexagones, triangles et losanges couvrent la surface et créent un langage visuel immédiatement reconnaissable.", "art-textile", "palette", "Smithsonian National Museum of African Art", "https://www.si.edu/object/nmafa_88-6-11"),
    367: capsule("lingala-langue-rencontres", "Une langue née de rencontres", "Histoire du lingala", "Le lingala s'est développé au contact du bobangi, du kikongo et de plusieurs langues africaines et européennes.", "APiCS décrit une base bobangi transformée par des contacts multiples le long du fleuve et dans les centres urbains. Cette histoire aide à comprendre la diversité du vocabulaire et des usages du lingala.", "art-conversation", "languages", "Atlas of Pidgin and Creole Language Structures", "https://apics-online.info/surveys/60"),
    365: capsule("patrice-lumumba-independance", "Patrice Lumumba, voix de l'indépendance", "Histoire de la RDC", "En juin 1960, Patrice Lumumba devient le premier Premier ministre du Congo indépendant.", "Après la victoire de son mouvement aux élections de mai 1960, Patrice Lumumba forme un gouvernement de coalition. Le 24 juin, il obtient la confiance de la Chambre et du Sénat. Six jours plus tard, il représente le Congo lors de l'indépendance et devient l'une des grandes figures de la souveraineté congolaise.", "art-lumumba", "landmark", "AfricaMuseum · Indépendance", "https://independance.africamuseum.be/en/exhibition/independance/independance-30juin"),
    369: capsule("radio-okapi", "Radio Okapi, la radio de la paix", "Médias · RDC", "Radio Okapi émet depuis 2002 et diffuse notamment des journaux en lingala.", "Créée par la mission des Nations unies en RDC avec la Fondation Hirondelle, Radio Okapi a diffusé pour la première fois le 25 février 2002. Ses programmes sont proposés en français et dans les quatre langues nationales : lingala, swahili, kikongo et tshiluba.", "art-radio", "radio-tower", "Radio Okapi", "https://www.radiookapi.net/2026/02/25/actualite/societe/24-ans-apres-sa-creation-radio-okapi-diffuse-une-information-verifiee"),
    371: capsule("rumba-congolaise", "La rumba congolaise", "Patrimoine des deux Congo", "Cette musique et cette danse urbaines sont partagées par la RDC et la République du Congo.", "La rumba accompagne les célébrations comme les moments de deuil et transmet des valeurs sociales entre générations. Elle a été inscrite en 2021 sur la Liste représentative du patrimoine culturel immatériel de l'humanité.", "art-rumba", "music", "UNESCO · Patrimoine culturel immatériel", "https://ich.unesco.org/fr/RL/la-rumba-congolaise-01711"),
    372: capsule("liboke", "Le liboke", "Cuisine du bassin du Congo", "Poisson ou viande est assaisonné, enveloppé dans des feuilles puis cuit à la vapeur.", "Le ministère congolais de la Culture présente le liboke comme un plat particulièrement populaire près des cours d'eau, notamment dans l'Équateur et à Kinshasa. Les feuilles retiennent la chaleur, la vapeur et les parfums pendant la cuisson.", "art-liboke", "cooking-pot", "Ministère de la Culture, Arts et Patrimoine de la RDC", "https://www.culture.gouv.cd/discover.html"),
    374: capsule("lingala-brazzaville", "Le lingala à Brazzaville et dans le nord", "République du Congo", "En République du Congo, le lingala est particulièrement présent à Brazzaville et dans le nord du pays.", "Un bulletin régional de l'Organisation mondiale de la Santé présente le lingala et le kituba comme les deux langues locales les plus parlées du pays : le lingala à Brazzaville et dans le nord, et le kituba à Pointe-Noire et dans le sud.", "art-conversation", "globe-2", "Organisation mondiale de la Santé · Bureau régional Afrique", "https://www.afro.who.int/sites/default/files/2024-07/AFR-RC74-INF-01%20Information%20Bulletin_V3%20-%2024%20June.pdf"),
    395: capsule("mobile-money-rdc", "Le téléphone est aussi un portefeuille", "Économie numérique · RDC", "En 2020, les transactions de mobile money en RDC ont atteint 10 milliards de dollars.", "Selon la Banque mondiale, les transactions de mobile money ont augmenté de 67 % en 2020 pour atteindre l'équivalent de 21,6 % du PIB. Le téléphone sert ainsi à envoyer, recevoir, retirer et payer, en plus de communiquer.", "art-conversation", "smartphone", "Banque mondiale · Économie numérique en RDC", "https://thedocs.worldbank.org/en/doc/61714f214ed04bcd6e9623ad0e215897-0400012021/related/P1715680ca8d5f0240a0e006d4be3b0e45f.pdf"),
  };

  const curatedCapsuleImages = {
    346: "assets/culture/locuteurs-lingala-monde.jpg",
    350: "assets/culture/fleuve-congo-en-nombres.jpg",
    378: "assets/culture/foret-fabrique-pluie.jpg",
    353: "assets/culture/mikate-kinshasa.jpg",
    356: "assets/culture/deux-capitales-face-a-face.jpg",
    363: "assets/culture/okapi-ituri.jpg",
    388: "assets/culture/biodiversite-bassin-congo.jpg",
    366: "assets/culture/textiles-kuba.jpg",
    367: "assets/culture/lingala-langue-rencontres.jpg",
    369: "assets/culture/radio-okapi.jpg",
    371: "assets/culture/rumba-congolaise.jpg",
    395: "assets/culture/mobile-money-rdc.jpg",
  };

  lessons.forEach(item => {
    item.capsule = curatedCapsules[item.id] || null;
    if (item.capsule) item.capsule.imageUrl = curatedCapsuleImages[item.id] || null;
  });

  const lessonCountByLevel = lessons.reduce((counts, item) => {
    counts[item.level] = (counts[item.level] || 0) + 1;
    return counts;
  }, {});

  levels.forEach(level => { level.lessons = lessonCountByLevel[level.number] || 0; });
  window.MONOKO_COURSE_CONTENT = { levels, lessons };
})();
