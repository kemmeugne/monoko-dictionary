-- =====================================================================
-- MONOKO - LINGALA CURRICULUM RESTRUCTURE MIGRATION
-- Generated: 2026-04-06
-- Language: Lingala (language_id = 1)
-- =====================================================================
-- PURPOSE: Replace 4 topic-based courses with a 6-level CEFR-aligned curriculum.
--
-- OLD STRUCTURE (preserved until you drop manually):
--   id=22  Construction phrasique    (4 lessons,  62 items)
--   id=23  Grammaire & Conjugaison  (17 lessons, 279 items)
--   id=24  Phrases utiles           (18 lessons, 283 items)
--   id=25  Vocabulaire par theme     (8 lessons, 214 items)
--
-- SAFETY: Does NOT delete old courses. After verifying in the app:
--   DELETE FROM courses WHERE id IN (22, 23, 24, 25);
--
-- GAPS (professor input required):
--   1.1  Sons et alphabet, 4.3 Proverbes, 4.4 Histoire
--   5.1  Registres, 5.3 Medias, 5.4 Ecriture
--   6.1  Musique, 6.3 Traditions, 6.4 Langue dans le monde
-- =====================================================================

DO $$
DECLARE
  c1 int; c2 int; c3 int; c4 int; c5 int; c6 int;
  l1_1 int; l1_2 int; l1_3 int; l1_3b int; l1_4 int;
  l2_1 int; l2_2 int; l2_3 int; l2_4 int; l2_5 int;
  l3_1 int; l3_2 int; l3_3 int; l3_4 int; l3_5 int; l3_6 int;
  l4_1 int; l4_2 int; l4_3 int; l4_4 int; l4_5 int;
  l5_1 int; l5_2 int; l5_3 int; l5_4 int;
  l6_1 int; l6_2 int; l6_3 int; l6_4 int;
BEGIN

-- STEP 1: COURSES
  INSERT INTO courses (language_id, title, description, course_order, icon)
  VALUES (1, 'Niveau 1 - Fondations', 'Survivre aux interactions sociales de base. Comprendre le systeme sonore du Lingala. (A1)', 1, '🌱') RETURNING id INTO c1;
  INSERT INTO courses (language_id, title, description, course_order, icon)
  VALUES (1, 'Niveau 2 - Vie quotidienne', 'Gerer les situations du quotidien. Construction de phrases de base. (A2)', 2, '🏠') RETURNING id INTO c2;
  INSERT INTO courses (language_id, title, description, course_order, icon)
  VALUES (1, 'Niveau 3 - Communication', 'Tenir de vraies conversations. Maitriser le systeme verbal. (B1)', 3, '💬') RETURNING id INTO c3;
  INSERT INTO courses (language_id, title, description, course_order, icon)
  VALUES (1, 'Niveau 4 - Approfondissement', 'Developper la fluidite et la comprehension culturelle. (B1+)', 4, '📚') RETURNING id INTO c4;
  INSERT INTO courses (language_id, title, description, course_order, icon)
  VALUES (1, 'Niveau 5 - Maitrise', 'Gerer les nuances, registres et discours etendus. (B2)', 5, '🎓') RETURNING id INTO c5;
  INSERT INTO courses (language_id, title, description, course_order, icon)
  VALUES (1, 'Niveau 6 - Culture vivante', 'Connexion culturelle profonde. Comprehension quasi-native. (B2+)', 6, '🌍') RETURNING id INTO c6;

-- STEP 2: LESSONS
  INSERT INTO lessons (course_id, title, lesson_order, parent_theme) VALUES (c1, 'Sons et alphabet', 1, 'Niveau 1') RETURNING id INTO l1_1;
  INSERT INTO lessons (course_id, title, lesson_order, parent_theme) VALUES (c1, 'Salutations et politesse', 2, 'Niveau 1') RETURNING id INTO l1_2;
  INSERT INTO lessons (course_id, title, lesson_order, parent_theme) VALUES (c1, 'Presentation personnelle', 3, 'Niveau 1') RETURNING id INTO l1_3;
  INSERT INTO lessons (course_id, title, lesson_order, parent_theme) VALUES (c1, 'Pronoms et adjectifs possessifs', 4, 'Niveau 1') RETURNING id INTO l1_3b;
  INSERT INTO lessons (course_id, title, lesson_order, parent_theme) VALUES (c1, 'Chiffres, jours et temps', 5, 'Niveau 1') RETURNING id INTO l1_4;

  INSERT INTO lessons (course_id, title, lesson_order, parent_theme) VALUES (c2, 'La famille et les relations', 1, 'Niveau 2') RETURNING id INTO l2_1;
  INSERT INTO lessons (course_id, title, lesson_order, parent_theme) VALUES (c2, 'La maison et les objets', 2, 'Niveau 2') RETURNING id INTO l2_2;
  INSERT INTO lessons (course_id, title, lesson_order, parent_theme) VALUES (c2, 'Manger et boire', 3, 'Niveau 2') RETURNING id INTO l2_3;
  INSERT INTO lessons (course_id, title, lesson_order, parent_theme) VALUES (c2, 'Le corps et la sante', 4, 'Niveau 2') RETURNING id INTO l2_4;
  INSERT INTO lessons (course_id, title, lesson_order, parent_theme) VALUES (c2, 'Construction de phrases 1', 5, 'Niveau 2') RETURNING id INTO l2_5;

  INSERT INTO lessons (course_id, title, lesson_order, parent_theme) VALUES (c3, 'Deplacements et directions', 1, 'Niveau 3') RETURNING id INTO l3_1;
  INSERT INTO lessons (course_id, title, lesson_order, parent_theme) VALUES (c3, 'Le travail et les metiers', 2, 'Niveau 3') RETURNING id INTO l3_2;
  INSERT INTO lessons (course_id, title, lesson_order, parent_theme) VALUES (c3, 'Conjugaison - present et passe', 3, 'Niveau 3') RETURNING id INTO l3_3;
  INSERT INTO lessons (course_id, title, lesson_order, parent_theme) VALUES (c3, 'Conjugaison - futur et imperatif', 4, 'Niveau 3') RETURNING id INTO l3_4;
  INSERT INTO lessons (course_id, title, lesson_order, parent_theme) VALUES (c3, 'Sentiments et emotions', 5, 'Niveau 3') RETURNING id INTO l3_5;
  INSERT INTO lessons (course_id, title, lesson_order, parent_theme) VALUES (c3, 'Construction de phrases 2', 6, 'Niveau 3') RETURNING id INTO l3_6;

  INSERT INTO lessons (course_id, title, lesson_order, parent_theme) VALUES (c4, 'Le marche et l''argent', 1, 'Niveau 4') RETURNING id INTO l4_1;
  INSERT INTO lessons (course_id, title, lesson_order, parent_theme) VALUES (c4, 'La nature et les animaux', 2, 'Niveau 4') RETURNING id INTO l4_2;
  INSERT INTO lessons (course_id, title, lesson_order, parent_theme) VALUES (c4, 'Proverbes et expressions idiomatiques', 3, 'Niveau 4') RETURNING id INTO l4_3;
  INSERT INTO lessons (course_id, title, lesson_order, parent_theme) VALUES (c4, 'Raconter une histoire', 4, 'Niveau 4') RETURNING id INTO l4_4;
  INSERT INTO lessons (course_id, title, lesson_order, parent_theme) VALUES (c4, 'La ville et les lieux', 5, 'Niveau 4') RETURNING id INTO l4_5;

  INSERT INTO lessons (course_id, title, lesson_order, parent_theme) VALUES (c5, 'Registres : formel vs informel', 1, 'Niveau 5') RETURNING id INTO l5_1;
  INSERT INTO lessons (course_id, title, lesson_order, parent_theme) VALUES (c5, 'Debats et opinions', 2, 'Niveau 5') RETURNING id INTO l5_2;
  INSERT INTO lessons (course_id, title, lesson_order, parent_theme) VALUES (c5, 'Medias et actualites', 3, 'Niveau 5') RETURNING id INTO l5_3;
  INSERT INTO lessons (course_id, title, lesson_order, parent_theme) VALUES (c5, 'Ecriture et composition', 4, 'Niveau 5') RETURNING id INTO l5_4;

  INSERT INTO lessons (course_id, title, lesson_order, parent_theme) VALUES (c6, 'Musique et arts', 1, 'Niveau 6') RETURNING id INTO l6_1;
  INSERT INTO lessons (course_id, title, lesson_order, parent_theme) VALUES (c6, 'Cuisine et gastronomie', 2, 'Niveau 6') RETURNING id INTO l6_2;
  INSERT INTO lessons (course_id, title, lesson_order, parent_theme) VALUES (c6, 'Traditions et ceremonies', 3, 'Niveau 6') RETURNING id INTO l6_3;
  INSERT INTO lessons (course_id, title, lesson_order, parent_theme) VALUES (c6, 'La langue dans le monde', 4, 'Niveau 6') RETURNING id INTO l6_4;

-- STEP 3: ITEMS

  -- Module 1.1 Sons et alphabet (3 items)
  INSERT INTO lesson_items (lesson_id, french, dialect, example_french, example_dialect, item_order) VALUES
    (l1_1, '[PLACEHOLDER] Sons et alphabet — module audio. Ajouter: voyelles, consonnes, tons, paires minimales.', '[A COMPLETER]', NULL, NULL, 1),
    (l1_1, '[PLACEHOLDER] Sons et alphabet — module audio. Ajouter: voyelles, consonnes, tons, paires minimales.', '[A COMPLETER]', NULL, NULL, 2),
    (l1_1, '[PLACEHOLDER] Sons et alphabet — module audio. Ajouter: voyelles, consonnes, tons, paires minimales.', '[A COMPLETER]', NULL, NULL, 3);

  -- Module 1.2 Salutations et politesse (41 items)
  INSERT INTO lesson_items (lesson_id, french, dialect, example_french, example_dialect, item_order) VALUES
    (l1_2, 'Bonjour / Bonsoir', 'Mbote', 'Mbote signifie bonjour a toute heure - matin comme soir.', 'Mbote e-lobamaka tango nionso - tongo to butu.', 1),
    (l1_2, 'Comment tu vas ?', 'Ndenge nini ?', NULL, NULL, 2),
    (l1_2, 'Je vais bien et toi ?', 'Na za malamu bongo yo ?', NULL, NULL, 3),
    (l1_2, 'Couci-Couça', 'Mukie mukie', NULL, NULL, 4),
    (l1_2, 'Je vais mal', 'Naza malamu te', NULL, NULL, 5),
    (l1_2, 'Au revoir', 'Tikala malamu (au revoir)', NULL, NULL, 6),
    (l1_2, 'Merci. Merci beaucoup.', 'Matondo. Matondo mingi.', NULL, NULL, 7),
    (l1_2, 'De rien', 'Likambo te', NULL, NULL, 8),
    (l1_2, 'C''est gentil', 'Eza malamu', NULL, NULL, 9),
    (l1_2, 'Excuse-moi, désolé', 'Limbisa ngai', NULL, NULL, 10),
    (l1_2, 'Bon appétit', 'Ko lia malamu', NULL, NULL, 11),
    (l1_2, 'Bonne nuit, dors bien !', 'Butu malamu, lala malamu !', NULL, NULL, 12),
    (l1_2, 'Passe une bonne journée', 'Lekisa mokolo malamu', NULL, NULL, 13),
    (l1_2, 'A plus tard', 'Ngonga moko', NULL, NULL, 14),
    (l1_2, 'Prends soin de toi', 'Mi kipe', NULL, NULL, 15),
    (l1_2, 'Enchanté / de même', 'Na sepeli ko yeba yo / Ngai pe', NULL, NULL, 16),
    (l1_2, 'Au revoir !', 'Tikala malamu !', NULL, NULL, 17),
    (l1_2, 'A bientôt !', 'Ba kala te !', NULL, NULL, 18),
    (l1_2, 'Bonne journée', 'Mokolo malamu', NULL, NULL, 19),
    (l1_2, 'Bon voyage', 'Mobembo malamu', NULL, NULL, 20),
    (l1_2, 'Bienvenue', 'Boyeyi malamu', NULL, NULL, 21),
    (l1_2, 'S''il-te-plait : Va me chercher le couteau stp.', 'Limbisa : Kende ko zuela ngai mbeli limbisa.', NULL, NULL, 22),
    (l1_2, 'Merci', 'Matondi', NULL, NULL, 23),
    (l1_2, 'Que Dieu te bénisse', 'Nzambe apambola yo.', NULL, NULL, 24),
    (l1_2, 'à demain !', 'Lobi !', NULL, NULL, 25),
    (l1_2, 'à la semaine prochaine', 'Mposo ekoya', NULL, NULL, 26),
    (l1_2, 'A bientôt', 'Ba kala te', NULL, NULL, 27),
    (l1_2, 'Allons-y', 'To keyi', NULL, NULL, 28),
    (l1_2, 'Comment tu t''appelles ?', 'Kombo na yo nani ?', NULL, NULL, 29),
    (l1_2, 'Comment va ton père ?', 'Boni tata na yo ?', NULL, NULL, 30),
    (l1_2, 'Comment vas-tu ?', 'Ndenge nini ?', NULL, NULL, 31),
    (l1_2, 'Je t''aime', 'Na lingi yo.', NULL, NULL, 32),
    (l1_2, 'Joyeux Anniversaire', 'Mbotama elamu.', NULL, NULL, 33),
    (l1_2, 'Bonne chance', 'Lupemba malamu.', NULL, NULL, 34),
    (l1_2, 'Bon courage', 'Mpiko malamu.', NULL, NULL, 35),
    (l1_2, 'Ne t''inquiète pas', 'Ko banga te.', NULL, NULL, 36),
    (l1_2, 'Ne pleure pas', 'Ko lela te.', NULL, NULL, 37),
    (l1_2, 'Tu es très gentil', 'Oza motema malamu.', NULL, NULL, 38),
    (l1_2, 'Que tu es belle !', 'Oza kitoko !', NULL, NULL, 39),
    (l1_2, 'Tu danses bien', 'Obinaka malamu.', NULL, NULL, 40),
    (l1_2, 'Tu chantes bien', 'Oyembaka malamu.', NULL, NULL, 41);

  -- Module 1.3 Presentation personnelle (33 items)
  INSERT INTO lesson_items (lesson_id, french, dialect, example_french, example_dialect, item_order) VALUES
    (l1_3, 'Comment tu t''appelles ?', 'Kombo na yo nani ?', NULL, NULL, 1),
    (l1_3, 'Je m''appelle', 'Kombo na ngai…', NULL, NULL, 2),
    (l1_3, 'D''où tu viens ?', 'Owuti wapi ?', NULL, NULL, 3),
    (l1_3, 'Je viens de', 'Na wuti…', NULL, NULL, 4),
    (l1_3, 'Quel est ton métier ?', 'Osalaka mosala nini ?', NULL, NULL, 5),
    (l1_3, 'Mon métier est', 'Mosala na ngai eza…', NULL, NULL, 6),
    (l1_3, 'Tu es marié ?', 'Oza ya ko bala ?', NULL, NULL, 7),
    (l1_3, 'Tu habites où ?', 'Ofandaka wapi ?', NULL, NULL, 8),
    (l1_3, 'Tu as quel âge ? J''ai 15ans', 'Oza na mbula nini ? Na za na mbula zomi na motoba.', NULL, NULL, 9),
    (l1_3, 'Père', 'Tata', NULL, NULL, 10),
    (l1_3, 'Mère', 'Mama', NULL, NULL, 11),
    (l1_3, 'Sœur', 'Ndeko ya mwasi', NULL, NULL, 12),
    (l1_3, 'Frère', 'Ndeko ya mobali', NULL, NULL, 13),
    (l1_3, 'Enfants : J''ai 2 enfants', 'Mwana : naza na bana mibale', NULL, NULL, 14),
    (l1_3, 'Fils', 'Mwana mwasi', NULL, NULL, 15),
    (l1_3, 'Fille', 'Mwana mobali', NULL, NULL, 16),
    (l1_3, 'Ami : Voici Simon, mon ami', 'Moninga : tala Simon, moninga na ngai', NULL, NULL, 17),
    (l1_3, 'Grand-père', 'Koko ya mobali', NULL, NULL, 18),
    (l1_3, 'Grand-mère', 'Koko ya mwasi', NULL, NULL, 19),
    (l1_3, 'Jumeaux', 'Mapasa', NULL, NULL, 20),
    (l1_3, 'Femme', 'Mwasi', NULL, NULL, 21),
    (l1_3, 'Mari', 'Mobali', NULL, NULL, 22),
    (l1_3, 'Homme', 'Mobali', NULL, NULL, 23),
    (l1_3, 'Mariage', 'Libala', NULL, NULL, 24),
    (l1_3, 'Grossesse / Enceinte', 'Zemi', NULL, NULL, 25),
    (l1_3, 'Ancêtre', 'Nkoko', NULL, NULL, 26),
    (l1_3, 'Bénédiction', 'Lipamboli', NULL, NULL, 27),
    (l1_3, 'Malédiction', 'Bilekeli mabe', NULL, NULL, 28),
    (l1_3, 'La vie', 'Bomoyi', NULL, NULL, 29),
    (l1_3, 'La mort', 'Liwa', NULL, NULL, 30),
    (l1_3, 'J''apprends la langue', 'Na zo yekola lokota.', NULL, NULL, 31),
    (l1_3, 'Je ne parle pas bien la langue. Je parle un peu le swahili.', 'Na lobaka lokota malamu te. Na lobaka swahili mokie.', NULL, NULL, 32),
    (l1_3, 'Je parle bien le patois', 'Na lobaka ndinga na ngai.', NULL, NULL, 33);

  -- Module 1.3b Pronoms et possessifs (12 items)
  INSERT INTO lesson_items (lesson_id, french, dialect, example_french, example_dialect, item_order) VALUES
    (l1_3b, 'Ton', 'Na yo', 'Ton ami est en route', 'Moninga na yo aza na nzela.', 1),
    (l1_3b, 'Ta', 'Na yo', 'Ta famille nous regarde', 'Libota na yo ba zo tala biso.', 2),
    (l1_3b, 'Tes', 'Na yo', 'Tes affaires sont en désordre', 'Biloko na yo eza kili-kili.', 3),
    (l1_3b, 'Son', 'Na ye', 'Son mari l''a quittée', 'Mobali na ye aboyi ye.', 4),
    (l1_3b, 'Sa', 'Na ye', 'Sa femme est fâchée', 'Mwasi na ye asiliki.', 5),
    (l1_3b, 'Ses', 'Na ye', 'Ses ancêtres sont fiers de lui', 'Ba nkoko na ye ba za na lolendo pona ye.', 6),
    (l1_3b, 'Notre', 'Na biso', 'Notre maison est loin d''ici', 'Ndako na biso eza mosika na awa.', 7),
    (l1_3b, 'Nos', 'Na biso', 'Nos professeurs à l''école sont sévères', 'Ba lakisi na biso na kelasi ba za makasi.', 8),
    (l1_3b, 'Votre', 'Na bino', 'Votre langue est difficile', 'Nzinga na bino eza makasi.', 9),
    (l1_3b, 'Vos', 'Na bino', 'Vos voisins vous dérangent', 'Bato na bino ya pembeni ba zangisaka biso kimia.', 10),
    (l1_3b, 'Leur', 'Na bango', 'Leur pays est bizarre', 'Mboka na bango eza ndenge.', 11),
    (l1_3b, 'Leurs', 'Na bango', 'Leurs enfants sont têtus', 'Bana na bango ba za moto makasi.', 12);

  -- Module 1.4 Chiffres, jours et temps (92 items)
  INSERT INTO lesson_items (lesson_id, french, dialect, example_french, example_dialect, item_order) VALUES
    (l1_4, '1', 'Moko', 'Il n''y a qu''un seul Dieu', 'Nzambe aza kaka moko.', 1),
    (l1_4, '2', 'Mibale', 'Une feuille a deux côtés', 'Likasa eza na biteni mibale.', 2),
    (l1_4, '3', 'Misato', 'Chez nous on mange trois fois par jour', 'Epai na biso ba liaka mbala misato na mokolo.', 3),
    (l1_4, '4', 'Minei', 'Cette pièce a quatre murs et 4 coins', 'Ndako oyo eza ba efelo minei na ba suka minei.', 4),
    (l1_4, '5', 'Mitano', 'La main a cinq doigts', 'Loboko eza na misapi mitano.', 5),
    (l1_4, '6', 'Motoba', 'Une guitare a six cordes', 'Lindanda eza na ba singa motoba.', 6),
    (l1_4, '7', 'Sambo', 'L''arc en ciel a sept couleurs', 'Monama eza na ba langi sambo.', 7),
    (l1_4, '8', 'Mwambe', 'Les araignées ont huit pattes', 'Ba alulu baza na makolo mwambe.', 8),
    (l1_4, '9', 'Libwa', 'Notre fils a neuf ans aujourd''hui', 'Mwana na biso akokisi mbula libwa lelo.', 9),
    (l1_4, '10', 'Zomi', 'Il y a dix commandements dans la bible', 'Eza na mibeko zomi na bibliya.', 10),
    (l1_4, '11', 'Zomi na moko', 'Il faut 11 joueurs pour faire une équipe de football', 'Esengi ba beti zomi na moko pona ko sala ekipe ya motopi.', 11),
    (l1_4, '12', 'Zomi na mibale j', 'Il y a douze mois dans l''année', 'Eza na ba sanza zomi na mibale na mbula moko.', 12),
    (l1_4, '13', 'Zomi na misato', 'Certaines personnes croient que le 13 porte malheur', 'Batu misusu ba kanisaka ete zomi na misato epesaka libabe.', 13),
    (l1_4, '14', 'zomi na minei', 'Elle a mis 14 oignons dans la soupe', 'Atie matungulu zomi na minei na bilia.', 14),
    (l1_4, '15', 'Zomi na mitano', 'Il faut arracher les 15 feuilles de la branche', 'Esengeli ko buka makasa zomi na mitano na nzete.', 15),
    (l1_4, '16', 'Zomi na motoba', '4 fois 4 égal 16', 'Minei likolo ya minei epesi zomi na motoba.', 16),
    (l1_4, '17', 'Zomi na sambo', '10 plus 7 égal 17', 'Zomi obakisi sambo epesi zomi na sambo.', 17),
    (l1_4, '18', 'Zomi na mwambe', 'A 18 ans on est adulte', 'Na mbula zomi na mwambe okomi mokolo.', 18),
    (l1_4, '19', 'Zomi na libwa', 'Il a 19 façons de cuisiner le pondu', 'Eza na ba ndenge zomi na libwa ya ko lamba pondu.', 19),
    (l1_4, '20', 'Tuku mibale', '21 moins 1 fait 20', 'Tuku mibale na moko olongoli moko epesi tuku mibale.', 20),
    (l1_4, '30', 'Tuku misato', NULL, NULL, 21),
    (l1_4, '40', 'Tuku minei', NULL, NULL, 22),
    (l1_4, '50', 'Tuku mitano', NULL, NULL, 23),
    (l1_4, '60', 'Tuku motoba', NULL, NULL, 24),
    (l1_4, '70', 'Tuku sambo', NULL, NULL, 25),
    (l1_4, '80', 'Tuku mwambe', NULL, NULL, 26),
    (l1_4, '90', 'Tuku libwa', NULL, NULL, 27),
    (l1_4, '100', 'Nkama', NULL, NULL, 28),
    (l1_4, '101', 'Nkama na moko', NULL, NULL, 29),
    (l1_4, '110', 'Nkama na zomi', NULL, NULL, 30),
    (l1_4, '200', 'Nkama mibale', NULL, NULL, 31),
    (l1_4, '300', 'Nkama misato', NULL, NULL, 32),
    (l1_4, '400', 'Nkama minei', NULL, NULL, 33),
    (l1_4, '500', 'Nkama mitano', NULL, NULL, 34),
    (l1_4, '600', 'Nkama motoba', NULL, NULL, 35),
    (l1_4, '700', 'Nkama sambo', NULL, NULL, 36),
    (l1_4, '800', 'Nkama mwambe', NULL, NULL, 37),
    (l1_4, '900', 'Nkama libwa', NULL, NULL, 38),
    (l1_4, '1000', 'Nkoto', NULL, NULL, 39),
    (l1_4, '1001', 'Nkoto na moko', NULL, NULL, 40),
    (l1_4, '1100', 'Nkoto na nkama', NULL, NULL, 41),
    (l1_4, '2000', 'Nkoto mibale', NULL, NULL, 42),
    (l1_4, '3000', 'Nkoto misato', NULL, NULL, 43),
    (l1_4, '4000', 'Nkoto minei', NULL, NULL, 44),
    (l1_4, '5000', 'Nkoto mitano', NULL, NULL, 45),
    (l1_4, '6000', 'Nkoto motoba', NULL, NULL, 46),
    (l1_4, '7000', 'Nkoto sambo', NULL, NULL, 47),
    (l1_4, '8000', 'Nkoto mwambe', NULL, NULL, 48),
    (l1_4, '9000', 'Nkoto libwa', NULL, NULL, 49),
    (l1_4, '10000', 'Mokoko', NULL, NULL, 50);

  INSERT INTO lesson_items (lesson_id, french, dialect, example_french, example_dialect, item_order) VALUES
    (l1_4, '10100', 'Mokoko na nkama', NULL, NULL, 51),
    (l1_4, '11000', 'Mokoko na nkoto', NULL, NULL, 52),
    (l1_4, '100000', 'Elundu', NULL, NULL, 53),
    (l1_4, '200000', 'Bilundu mibale', NULL, NULL, 54),
    (l1_4, '1000000', 'Efuku', NULL, NULL, 55),
    (l1_4, '1er', 'Ya liboso', 'Son 1er mari l''aimait beaucoup', 'Mobali na ye ya liboso alingaki ye mingi.', 56),
    (l1_4, '2e', 'Ya mibale', 'C''est la 2e fois qu''elle tombe enceinte', 'Eza mbala ya mibale azua zemi.', 57),
    (l1_4, '3e', 'Ya misato', 'J''ai fini 3e à la course.', 'Na silisi moto ya misato na ko kima mbango.', 58),
    (l1_4, 'Jour', 'Mokolo', 'Il est resté ici pendant deux jours', 'Azalaki awa pona mikolo mibale.', 59),
    (l1_4, 'Semaine', 'Mposo', 'Ton voyage va durer une semaine', 'Mobembo na yo eko sala mposo moko.', 60),
    (l1_4, 'Mois', 'Sanza', 'On a laissé sécher le poisson pendant 1 mois', 'To tiki mbisi eyoma sanza moko.', 61),
    (l1_4, 'Saison', 'Eleko', 'C''était une saison passionnante', 'Oyo ezalaki eleko moko ya esengo.', 62),
    (l1_4, 'Saison sèche', 'Elanga', 'Les mangues mûrissent pendant la saison sèche', 'Ba mangolo etelaka na elanga.', 63),
    (l1_4, 'Année', 'Mbula', 'L''année dernière nous étions en conflit.', 'Mbula eleki to zalaki na ko swana.', 64),
    (l1_4, 'Lundi', 'Mokolo ya liboso', NULL, NULL, 65),
    (l1_4, 'Mardi', 'Mokolo ya mibale', NULL, NULL, 66),
    (l1_4, 'Mercredi', 'Mokolo ya misato', NULL, NULL, 67),
    (l1_4, 'Jeudi', 'Mokolo ya minei', NULL, NULL, 68),
    (l1_4, 'Vendredi', 'Mokolo ya mitano', NULL, NULL, 69),
    (l1_4, 'Samedi', 'Mokolo ya poso', NULL, NULL, 70),
    (l1_4, 'Dimanche', 'Mokolo ya eyenga', NULL, NULL, 71),
    (l1_4, 'Janvier', 'Sanza ya liboso', NULL, NULL, 72),
    (l1_4, 'Février', 'Sanza ya mibale', NULL, NULL, 73),
    (l1_4, 'mars', 'Sanza ya misato', NULL, NULL, 74),
    (l1_4, 'avril', 'Sanza ya minei', NULL, NULL, 75),
    (l1_4, 'mai', 'Sanza ya mitano', NULL, NULL, 76),
    (l1_4, 'juin', 'Sanza ya motoba', NULL, NULL, 77),
    (l1_4, 'juillet', 'Sanza ya sambo', NULL, NULL, 78),
    (l1_4, 'août', 'Sanza ya mwambe', NULL, NULL, 79),
    (l1_4, 'septembre', 'Sanza ya libwa', NULL, NULL, 80),
    (l1_4, 'octobre', 'Sanza ya zomi', NULL, NULL, 81),
    (l1_4, 'novembre', 'Sanza ya zomi na moko', NULL, NULL, 82),
    (l1_4, 'décembre', 'Sanza ya zomi na mibale', NULL, NULL, 83),
    (l1_4, 'Saison des pluies', 'Tango ya mbula', NULL, NULL, 84),
    (l1_4, 'Saison sèche', 'Elanga', NULL, NULL, 85),
    (l1_4, 'Quelle heure est-il ?', 'Ekomi ngonga nini ?', NULL, NULL, 86),
    (l1_4, 'A quelle heure on part ?', 'To ko kende na ngonga nini ?', NULL, NULL, 87),
    (l1_4, 'C''est trop tard', 'Ngonga esi eleki.', NULL, NULL, 88),
    (l1_4, 'Il est trop tôt', 'Eza tongo makasi.', NULL, NULL, 89),
    (l1_4, 'C''est l''heure de partir', 'Ekomi ngonga ko kende.', NULL, NULL, 90),
    (l1_4, 'Attends un peu', 'Zela mokie.', NULL, NULL, 91),
    (l1_4, 'Je suis prêt / Je ne suis pas prêt', 'Na bongami / Nanu na bongami te.', NULL, NULL, 92);

  -- Module 2.1 La famille et les relations (14 items)
  INSERT INTO lesson_items (lesson_id, french, dialect, example_french, example_dialect, item_order) VALUES
    (l2_1, 'Père', 'Tata', 'Tu es comme un père pour nous.', 'Oza lokola tata pona biso.', 1),
    (l2_1, 'Mère', 'Mama', 'C''est ma mère qui m''a éduquée seule.', 'Eza mama na ngai akolisi ngai ye moko.', 2),
    (l2_1, 'Fils', 'Mwana mobali', 'Mon fils à le même âge que le tien', 'Mwana na ngai ya mobali azali na mbula moko na oyo ya yo.', 3),
    (l2_1, 'Fille', 'Mwana mwasi', 'Cette fille est très belle', 'Mwana mwasi oyo azali kitoko makasi.', 4),
    (l2_1, 'Frère', 'Ndeko ya mobali', 'Mon frère arrive bientôt.', 'Ndeko na ngai ya mobali ako ya kala te.', 5),
    (l2_1, 'Enfant', 'Mwana', 'Chaque enfant est une bénédiction', 'Mwana nionso aza lipamboli.', 6),
    (l2_1, 'Oncle', 'Noko', 'Mes oncles n''ont pas de pitié', 'Ba noko na ngai ba za na mawa te.', 7),
    (l2_1, 'Tante', 'Tata mwasi', 'C''est ma tante qui m''a donné de l''argent.', 'Tata mwasi na nga nde apesi nga mbongo.', 8),
    (l2_1, 'Grand-père/mère', 'Koko ya mobali / Koko ya mwasi', 'Mon grand père est vieux mais fort', 'Koko na ngai ya mobali anuni kasi aza makasi.', 9),
    (l2_1, 'Cousin(e)', 'Ndeko', 'J''aime mon cousin plus que tout.', 'Na lingi ndeko na ngai ya mobali ko leka nionso.', 10),
    (l2_1, 'Neveu / Nièce', 'Mwana nkasi ya mobali / Mwana nkasi ya mwasi', 'Mon neveu est malade, ma nièce s''occupe de lui.', 'Mwana nkasi na ngai ya mobali aza na bokono, ndeko na ye ya mwasi azo salisa ye.', 11),
    (l2_1, 'Mari', 'Mobali', 'Mon mari rentre tard dans la nuit', 'Mobali na ngai akotaka na kati kati ya butu.', 12),
    (l2_1, 'Épouse / Époux', 'Mwasi / Mobali', 'L''époux et son épouse se promettent de s''aimer pour la vie', 'Mobali na mwasi na ye ba laki ko milinga kino na suka.', 13),
    (l2_1, 'Famille', 'Libota', 'La famille est sacrée.', 'Libota ezali motuya.', 14);

  -- Module 2.2 La maison et les objets (36 items)
  INSERT INTO lesson_items (lesson_id, french, dialect, example_french, example_dialect, item_order) VALUES
    (l2_2, 'Cave / Sous-sol', 'Se ya ndako', 'On range nos affaires au sous-sol', 'To tiaka biloko na biso na se ya ndako.', 1),
    (l2_2, 'Chaise', 'Kiti', 'Seul mon père s''assoit toujours sur cette chaise', 'Kaka tata ngai nde afandaka na kiti oyo.', 2),
    (l2_2, 'Chambre', 'Elalelo', 'Mon frère et moi dormons dans la même chambre', 'Ngai na ndeko na ngai ya mobali to lalaka elalelo moko.', 3),
    (l2_2, 'Concession', 'Esika', 'Tous nos ancêtres sont enterrés dans cette concession', 'Ba nkoko na biso nionso ba kundama na esika oyo.', 4),
    (l2_2, 'Couverture', 'Bulangeti', 'Je ne trouve pas la nouvelle couverture, et l''ancienne est déchirée.', 'Na zo mona bulangeti ya sika te, pe ya kala epasuki.', 5),
    (l2_2, 'Cuisine', 'Kuku', 'Elle passe sa journée à la cuisine', 'Alekisaka mokolo na kuku.', 6),
    (l2_2, 'École', 'Kelasi', 'Tous les enfants doivent aller à l''école pour apprendre à lire et à compter', 'Bana nionso esengeli ba kende kelasi pona ko yeba ko tanga.', 7),
    (l2_2, 'Fenêtre', 'Lininisa', 'Les mères regardent de la fenêtre leurs enfants rentrer de l''école', 'Ba mama ba zo tala na lininisa bana na bango ko zonga kelasi.', 8),
    (l2_2, 'Habitants (de)', 'Bato (ya)', 'Nos ennemis sont les habitants du village voisin', 'Ba yini na biso eza bato ya mboka pembeni.', 9),
    (l2_2, 'Hôpital', 'Opitalo', 'Certaines personnes meurent à l''hôpital, d''autres sont sauvées', 'Bato misusu ba kufaka na opitalo, basusu ba bikaka.', 10),
    (l2_2, 'Jardin', 'Elanga', 'J''ai un petit potager dans le jardin', 'Na za na ndunda na elanga.', 11),
    (l2_2, 'Lit', 'Mbeto', 'Elle a passé la journée allongée dans le lit', 'Alekisi mokolo mobimba ya ko lala na mbeto.', 12),
    (l2_2, 'Lumière', 'Mwinda', 'N''oublie pas d''éteindre la lumière en sortant.', 'Bosana te ko boma mwinda tango ozo bima.', 13),
    (l2_2, 'Magasin / Boutique', 'Ligablo', 'Ma mère tient sa boutique depuis 10 ans', 'Mama na ngai aza na ligablo na ye banda mbula zomi.', 14),
    (l2_2, 'Maison', 'Ndako', 'J''ai hâte de rentrer à la maison après cette dure journée de travail', 'Na lingi na kende ndako noki sima ya mokolo ya pasi na mosala.', 15),
    (l2_2, 'Mur', 'Efelo', 'Un mur nous sépare de chez le voisin', 'Efelo ezo kabola biso na bato ya pembeni.', 16),
    (l2_2, 'Peuple', 'Ekolo', 'Les gens de mon peuple parlent tous le patois', 'Batu ya ekolo na ngai ba lobaka bango nionso nzinga ya mboka.', 17),
    (l2_2, 'Plafond', 'Likolo ya ndako', 'Le plafond est sale', 'Likolo ya ndako eza mbindo.', 18),
    (l2_2, 'Quartier', 'Kalitie', 'Il faut sortir du quartier pour aller au marché', 'Esengeli ko bima na kalitie pona ko kende zando.', 19),
    (l2_2, 'Route', 'Nzela', 'Attention les enfants ! Marchez au bord de la route', 'Bo keba bana ! Bo tambola pembeni ya nzela.', 20),
    (l2_2, 'Table', 'Mesa', 'Cette table est très ancienne', 'Mesa oyo eza ya kala.', 21),
    (l2_2, 'Toilettes', 'Wese', 'Les toilettes sont dehors', 'Wese eza libanda.', 22),
    (l2_2, 'Toit', 'Likolo ya ndako', 'Ce toit a des fuites mais nous protège quand même', 'Likolo ya ndako oyo eza na mabulu kasi ebatelaka biso kaka.', 23),
    (l2_2, 'Village', 'Mboka', 'Ma sœur s''est mariée avec un homme d''un autre village', 'Ndeko na ngai ya mwasi abali moto ya mboka mosusu.', 24),
    (l2_2, 'Ville', 'Lipopo', 'Je ne pars jamais en ville', 'Na kendaka lipopo te.', 25),
    (l2_2, 'Assiette', 'Sani', 'Chacun son assiette', 'Moto na moto na sani na ye.', 26),
    (l2_2, 'Bouteille', 'Molangi', 'Ferme bien la bouteille pour que l''eau ne se renverse pas', 'Kanga molangi malamu po mayi esopana te.', 27),
    (l2_2, 'Conserver', 'Ko bombama', 'Les aliments se conservent mieux au frais', 'Bilia ebombamaka malamu na malili.', 28),
    (l2_2, 'Couteau', 'Mbeli', 'Je sors toujours avec mon couteau pour défendre ma famille', 'Na bimaka tango nionso na mbeli na ngai pona ko batela libota na ngai.', 29),
    (l2_2, 'Couvrir', 'Ko kanga', 'C''est bientôt prêt, couvre la marmite et appelle les autres', 'Kala te eko bela, kanga nzungu pe benga ba ninga.', 30),
    (l2_2, 'Cuillère', 'Lutu', 'Je remue la sauce avec ma cuillère', 'Na zo palola elubu na lutu na ngai.', 31),
    (l2_2, 'Emballer', 'Ko linga', 'Emballe les courges dans les feuilles et distribue-les à chacun des invités', 'Linga mbika oyo na makasa pe kabola yango na ba paya nionso.', 32),
    (l2_2, 'Marmite / Casserole', 'Nzungu', 'La marmite a noirci au feu', 'Nzungu eyindi na moto.', 33),
    (l2_2, 'Mortier', 'Eboka', 'Tu sais piler le foufou dans le mortier ?', 'Oyebi ko tuta fufu na kati ya eboka ?', 34),
    (l2_2, 'Plat', 'Sani', 'Servez-vous tous dans ce plat', 'Bo tia bino nionso bilia na kati ya sani oyo.', 35),
    (l2_2, 'Verre', 'Kopo', 'Il a renversé l''eau qui était dans le verre sans faire exprès', 'Asopi mayi ezalaki na kopo kasi asali na nko te.', 36);

  -- Module 2.3 Manger et boire (24 items)
  INSERT INTO lesson_items (lesson_id, french, dialect, example_french, example_dialect, item_order) VALUES
    (l2_3, 'J''ai faim, on mange quoi ? On mange quand ?', 'Na za na nzala, to ko lia nini ? To ko lia na ngonga nini ?', NULL, NULL, 1),
    (l2_3, 'Je n''ai pas mangé depuis hier', 'Na lie te banda lobi.', NULL, NULL, 2),
    (l2_3, 'Je n''ai pas mangé le taro et la sauce jaune depuis longtemps', 'Na lie mbala na elubu ya motani kala.', NULL, NULL, 3),
    (l2_3, 'C''est trop chaud, je préfère manger ce plat froid.', 'Eza moto makasi, na ko lia yango ya malili.', NULL, NULL, 4),
    (l2_3, 'Va réchauffer mon assiette stp la nourriture a refroidi', 'Kende ko tia bilia na ngai ezua moto limbisa, ekomi malili.', NULL, NULL, 5),
    (l2_3, 'Elle n''a pas besoin de fourchette ni de couteau ni de cuillère puisqu''elle mange avec les doigts', 'Aza na posa ya kania to mbeli to pe lutu te po aliaka na maboko.', NULL, NULL, 6),
    (l2_3, 'J''ai soif, et mon verre est vide, remplis-le stp', 'Naza na posa ya ko mela, pe kopo na ngai eza na eloko te, tondisa yango limbisa.', NULL, NULL, 7),
    (l2_3, 'Je te sers du jus bien frais.', 'Na pesa yo sicre ya piyo makasi.', NULL, NULL, 8),
    (l2_3, 'Riz', 'Loso', 'Comment tu as fait pour que le riz ne colle pas ?', 'Ndenge nini osali po loso ekangama te ?', 9),
    (l2_3, 'Poisson', 'Mbisi', 'Écailler et vider le poisson prend du temps', 'Ko bongisa pe ko longola mbindo ya mbisi ezuaka tango mingi.', 10),
    (l2_3, 'Haricot', 'Madesu', 'Les haricots rouges se marient bien avec les beignets', 'Madesu ya mitani ebongi na mikate.', 11),
    (l2_3, 'Pain', 'Lipa (mapa)', 'J''envoie mon fils acheter le pain tous les matins.', 'Na tindaka mwana na nga ya mobali ko somba lipa tongo nionso.', 12),
    (l2_3, 'Bœuf', 'Ngombe', 'Sa famille a demandé un bœuf pour la dot.', 'Libota na ye esengi ngombe pona libala na ye.', 13),
    (l2_3, 'Légume', 'Ndunda', 'Les enfants préfèrent la viande aux légumes', 'Bana ba lingaka ngombe ko leka ndunda.', 14),
    (l2_3, 'Fruit', 'Mbuma', 'Les voisins m''ont donné des fruits.', 'Ba ninga na ngai ba pesi ngai ba mbuma.', 15),
    (l2_3, 'Thé', 'Ti', 'Je bois du thé.', 'Na zo mela ti.', 16),
    (l2_3, 'Café', 'Kawa', 'Le café m''empêche de dormir', 'Kawa esilisi ngai pongi.', 17),
    (l2_3, 'Bière', 'Masanga', 'Il aime la bière', 'Alingi masanga.', 18),
    (l2_3, 'Boire', 'Ko mela', 'Je veux boire de l''eau', 'Na lingi ko mela mayi.', 19),
    (l2_3, 'Frire', 'Ko kalinga', 'Je fais frire le poisson.', 'Na zo kalinga mbisi.', 20),
    (l2_3, 'Bouillir', 'Ko toka', 'Mets l''eau à bouillir avant d''y verser le riz', 'Tia mayi etoka yambo otia loso.', 21),
    (l2_3, 'Huile', 'Mafuta', 'Verse l''huile au fond de la marmite', 'Tia mafuta na mozindo ya nzungu.', 22),
    (l2_3, 'Sauce', 'Bilei', 'Tu as mis quoi dans cette sauce ?', 'Otie nini na bilei oyo ?', 23),
    (l2_3, 'Déjeuner', 'Bilei ya moyi', 'Tu veux manger quoi pour le déjeuner ?', 'Olingi nini pona bilei ya moyi ?', 24);

  -- Module 2.4 Le corps et la sante (50 items)
  INSERT INTO lesson_items (lesson_id, french, dialect, example_french, example_dialect, item_order) VALUES
    (l2_4, 'Diarrhée', 'Pulupulu', 'Tu as la diarrhée parce que tu n''es pas habitué à la nourriture d''ici', 'Oza na pulupulu po omesana te na bilia ya awa.', 1),
    (l2_4, 'Douleur', 'Pasi', 'Je n''ai jamais ressenti une telle douleur', 'Nanu na mona pasi ya boye te.', 2),
    (l2_4, 'S''évanouir', 'Ko kueya', 'Heureusement que tu étais là pour la retenir quand elle s''est évanouie', 'Malamu ozalki awa pona ko simba ye tango akueyi', 3),
    (l2_4, 'Fièvre', 'Fidèle', 'On lui donne de l''eau froide en espérant que sa fièvre baisse', 'To pesa ye mayi ya piyo na elikia ete fefele na ye eko kita.', 4),
    (l2_4, 'Guérir / Guérison', 'Ko bika', 'Bonne guérison', 'Lobiko malamu.', 5),
    (l2_4, 'Hôpital', 'Opitalo', 'L''hôpital est à une heure de marche d''ici', 'Opitalo eza na ngonga moko ya ko tambola kino awa.', 6),
    (l2_4, 'Malade / Maladie', 'Bokono', 'Tout malade a besoin qu''on s''occupe de lui. La maladie ne guérit que par les soins. Toute maladie n''a pas un remède.', 'Moto ya bokono nionso aza na posa ba kipa ye. Bokono ebika kaka na bopeto. Bokono nionso eza lobiko te.', 7),
    (l2_4, 'Médecin', 'Munganga', 'Si tu ne guéris pas d''ici deux jours j''appellerai le médecin', 'Soki obiki te na mikolo mibale oyo na ko benga munganga.', 8),
    (l2_4, 'Médicaments', 'Kisi', 'Ces médicaments sont à prendre 3 fois par jour.', 'Oko mela ba kisi oyo mbala misato na mokolo.', 9),
    (l2_4, 'Santé', 'Kolongono', 'La santé est lune bénédiction', 'Bokolongono eza lipamboli.', 10),
    (l2_4, 'Tousser', 'Ko kosola', 'Tu as remarqué qu''elle tousse un peu ? Je pense qu''elle a attrapé froid, elle a dû dormir mal couverte.', 'Omoni ete azo kosola mukie ? Nakanisi ete malili ekangi ye, ami zipaki te.', 11),
    (l2_4, 'Vomir', 'Ko sanza', 'Elle vomit tellement qu''elle a maigri.', 'Azo sanza ebele yango wana akondi.', 12),
    (l2_4, 'Tu es malade ?', 'Ozo bela ?', NULL, NULL, 13),
    (l2_4, 'Je me sens mal', 'Nzoto eza malamu te.', NULL, NULL, 14),
    (l2_4, 'Il est mort', 'Akufi', NULL, NULL, 15),
    (l2_4, 'Qu''est-ce qu''il y a ? Qu''est-ce qu''il se passe ?', 'Nini kaka ? Nini ezo leka ?', NULL, NULL, 16),
    (l2_4, 'C''est pas grave', 'Eza motuya te.', NULL, NULL, 17),
    (l2_4, 'J''arrive', 'Na zo yaka.', NULL, NULL, 18),
    (l2_4, 'J''ai faim', 'Naza na nzala.', NULL, NULL, 19),
    (l2_4, 'J''ai soif', 'Na za na posa ya ko mela.', NULL, NULL, 20),
    (l2_4, 'Tu veux manger quoi ? Boire quoi ?', 'Olingi kolia nini ? Ko mela nini ?', NULL, NULL, 21),
    (l2_4, 'J''ai bien mangé', 'Na lie malamu.', NULL, NULL, 22),
    (l2_4, 'J''ai besoin d''aide / Est-ce que tu peux m''aider stp ?', 'Na za na mposa lisungi / Okoki ko sunga ngai limbisa ?', NULL, NULL, 23),
    (l2_4, 'Merci de m''avoir aidé', 'Matondo po osungi ngai.', NULL, NULL, 24),
    (l2_4, 'Vous parlez français ?', 'Olobaka falanse ?', NULL, NULL, 25),
    (l2_4, 'Je n''ai pas compris', 'Na sosoli te.', NULL, NULL, 26),
    (l2_4, 'Tu peux parler plus lentement stp ? Tu parles trop vite', 'Limbisa, okoki ko loba malembe koleka ? Ozo loba mbangu mingi.', NULL, NULL, 27),
    (l2_4, 'Comment on dit « merci (ou autre mot français) » en lingala ?', 'Ndenge nini ba lobaka « Merci » na lingala ?', NULL, NULL, 28),
    (l2_4, 'Qu''est-ce que ça veut dire ?', 'Elingi ko loba nini ?', NULL, NULL, 29),
    (l2_4, 'Tu comprends ? / Tu as compris ?', 'Ozo sosola ?/ Ososoli ?', NULL, NULL, 30),
    (l2_4, 'Qu''est-ce que ça veut dire ?', 'Elakisi nini ?', NULL, NULL, 31),
    (l2_4, 'Quelque chose ne va pas ? Il y a un souci ? Quel est le problème', 'Likambo eza awa ? Eza na likambo ? Likambo eza nini ?', NULL, NULL, 32),
    (l2_4, 'Je me suis fait mal', 'Na mi monisi pasi.', NULL, NULL, 33),
    (l2_4, 'Tête', 'Mutu', 'J''ai mal à la tête', 'Na zo yoka mutu pasi.', 34),
    (l2_4, 'Nez', 'Zolo', 'Elle a un nez épaté', 'Aza na zolo ya monene.', 35),
    (l2_4, 'Épaule', 'Lipeka (Mapeka)', 'Le père porte sa fille sur ses épaules', 'Tata amemi mwana na mapeka na ye.', 36),
    (l2_4, 'Bras / avant-bras', 'Loboko (maboko)', 'Pourquoi les enfants jouent toujours les bras levés ?', 'Pona nini bana ba sakanaka kaka maboko likolo ?', 37),
    (l2_4, 'Doigt', 'Mosapi (misapi)', 'Croise les doigts pour te porter chance', 'Kanga misapi eko pesa yo lupemba.', 38),
    (l2_4, 'Poitrine', 'Tolo', 'Sa poitrine est large', 'Tolo na ye eza monene.', 39),
    (l2_4, 'Dos', 'Mokongo (mikongo)', 'Tu as encore mal au dos ?', 'Oza lisusu na pasi na mokongo ?', 40),
    (l2_4, 'Jambe', 'Likolo (makolo)', 'Courir longtemps me fait mal aux jambes', 'Ko kima tango molayi esalaka nga pasi na makolo.', 41),
    (l2_4, 'Genou', 'Libolongo (mabolongo)', 'On se met à genoux pour demander sa femme en mariage', 'Ba fukamaka pona ko senga loboko ya mwasi na libala.', 42),
    (l2_4, 'Pied', 'Likolo (makolo)', 'J''ai mal aux pieds car j''ai trop marché.', 'Na zo yoka makolo pasi po na tamboli mingi.', 43),
    (l2_4, 'Cœur', 'Motema', 'J''ai eu tellement peur que mon cœur s''est mis à battre fort', 'Na yoki bomo mingi yango motema na ngai ezo beta makasi.', 44),
    (l2_4, 'Sang', 'Makila', 'Le sang est rouge.', 'Makila eza motane.', 45),
    (l2_4, 'Gorge', 'Mongongo', 'Ma gorge me fait mal', 'Mongongo ezo sua ngai.', 46),
    (l2_4, 'Lèvres', 'Mbebo', 'Mes lèvres sont sèches', 'Ba mbebo na ngai eyomi.', 47),
    (l2_4, 'Joue', 'Litama (matama)', 'Tu es tellement maigre que tes joues sont creusées.', 'Oza mokie mingi yango matama na yo ekoti.', 48),
    (l2_4, 'Menton', 'Mbanga', 'En se battant il est tombé sur le menton.', 'Na ko bunda akweyi na mbanga.', 49),
    (l2_4, 'Front', 'Mbunzu', 'Ma mère touche mon front pour savoir si j''ai de la fièvre.', 'Mama na ngai azo simba ngai na mbunzu pona ko tala soki na za na moto.', 50);

  -- Module 2.5 Construction de phrases 1 (62 items)
  INSERT INTO lesson_items (lesson_id, french, dialect, example_french, example_dialect, item_order) VALUES
    (l2_5, 'Je vais à l''école tous les jours', 'Na kendaka kelasi mikolo nionso.', NULL, NULL, 1),
    (l2_5, 'Je suis en train d''aller à l''école', 'Na zali ko kende kelasi.', NULL, NULL, 2),
    (l2_5, 'Tu vas à l''école tous les jours', 'Okendaka kelasi mikolo nionso.', NULL, NULL, 3),
    (l2_5, 'Tu es en train d''aller à l''école', 'Ozali ko kende kelasi.', NULL, NULL, 4),
    (l2_5, 'Il va à l''école tous les jours', 'Akendaka kelasi mikolo nionso.', NULL, NULL, 5),
    (l2_5, 'Il est en train d''aller à l''école', 'Azali ko kende kelasi.', NULL, NULL, 6),
    (l2_5, 'Elle va à l''école tous les jours', 'Akendaka kelasi mikolo nionso.', NULL, NULL, 7),
    (l2_5, 'Elle est en train d''aller à l''école', 'Azali ko kende kelasi', NULL, NULL, 8),
    (l2_5, 'Nous allons à l''école tous les jours', 'To kendaka kelasi mikolo nionso.', NULL, NULL, 9),
    (l2_5, 'Nous sommes en train d''aller à l''école', 'To zali ko kende kelasi.', NULL, NULL, 10),
    (l2_5, 'Vous allez à l''école tous les jours', 'Bo kendaka kelasi mikolo nionso.', NULL, NULL, 11),
    (l2_5, 'Vous êtes en train d''aller à l''école', 'Bo zali ko kende kelasi.', NULL, NULL, 12),
    (l2_5, 'Ils vont à l''école tous les jours', 'Ba kendaka kelasi mikolo nionso.', NULL, NULL, 13),
    (l2_5, 'Ils sont en train d''aller à l''école', 'Ba zali ko kende kelasi.', NULL, NULL, 14),
    (l2_5, 'Elles vont à l''école tous les jours', 'Ba kendaka kelasi mikolo nionso.', NULL, NULL, 15),
    (l2_5, 'Elles sont en train d''aller à l''école', 'Ba zali ko kende kelasi.', NULL, NULL, 16),
    (l2_5, 'Je ne vais pas à l''école s''il pleut beaucoup', 'Na kendaka kelasi te soki mbula ebeti mingi.', NULL, NULL, 17),
    (l2_5, 'Je ne suis pas en train d''aller à l''école', 'Na zali ko kende kelasi te.', NULL, NULL, 18),
    (l2_5, 'Tu ne vas pas à l''école s''il pleut beaucoup', 'Okendaka kelasi te soki mbula ebeti mingi.', NULL, NULL, 19),
    (l2_5, 'Tu n''es pas en train d''aller à l''école', 'Ozali ko kende kelasi te.', NULL, NULL, 20),
    (l2_5, 'Il ne va pas à l''école s''il pleut beaucoup', 'Akendaka kelasi te soki mbula ebeti mingi.', NULL, NULL, 21),
    (l2_5, 'Il n''est pas en train d''aller à l''école', 'Azali ko kende kelasi te.', NULL, NULL, 22),
    (l2_5, 'Elle ne va pas à l''école s''il pleut beaucoup', 'Akendaka kelasi te soki mbula ebeti mingi', NULL, NULL, 23),
    (l2_5, 'Elle n''est pas en train d''aller à l''école', 'Azali ko kende kelasi te.', NULL, NULL, 24),
    (l2_5, 'Nous n''allons pas à l''école s''il pleut beaucoup', 'To kendaka kelasi te soki mbula ebeti mingi.', NULL, NULL, 25),
    (l2_5, 'Nous ne sommes pas en train d''aller à l''école', 'To zali ko kende kelasi te.', NULL, NULL, 26),
    (l2_5, 'Vous n''allez pas à l''école s''il pleut beaucoup', 'Bo kendaka kelasi te soki mbula ebeti mingi.', NULL, NULL, 27),
    (l2_5, 'Vous n''êtes pas en train d''aller à l''école', 'Bo zali ko kende kelasi te.', NULL, NULL, 28),
    (l2_5, 'Ils ne vont pas à l''école s''il pleut beaucoup', 'Ba kendaka kelasi te soki mbula ebeti mingi.', NULL, NULL, 29),
    (l2_5, 'Ils ne sont pas en train d''aller à l''école', 'Ba zali ko kende kelasi te.', NULL, NULL, 30),
    (l2_5, 'Je ne vais plus à l''école depuis que je suis malade', 'Na kendeke lisusu kelasi te banda na belaki.', NULL, NULL, 31),
    (l2_5, 'Je ne vais jamais à l''école sans mon sac', 'Na kendeke kelasi ata mokolo moko te ko zanga saki na ngai.', NULL, NULL, 32),
    (l2_5, 'Que veux-tu manger ?', 'Olingi ko lia nini ?', NULL, NULL, 33),
    (l2_5, 'Qu''est-ce que tu cherches ?', 'Ozali ko luka nini ?', NULL, NULL, 34),
    (l2_5, 'Quelle fille est la plus belle ?', 'Mwasi nini aleki kitoko ?', NULL, NULL, 35),
    (l2_5, 'Parmi tous ces enfants, lesquels sont les vôtres ?', 'Kati na bana oyo nionso, ba nani ba zali ya yo ?', NULL, NULL, 36),
    (l2_5, 'Regarde toutes ces jeunes filles, laquelle tu veux épouser ?', 'Tala bilenge basi oyo, nani olingi ko bala ?', NULL, NULL, 37),
    (l2_5, 'Pourquoi tu mens tout le temps ?', 'Pona nini okosaka tango nionso ?', NULL, NULL, 38),
    (l2_5, 'Il n''a plus d''argent, c''est pourquoi il reste chez lui.', 'Aza lisusu na mbongo te, yango afandi na ndako na ye.', NULL, NULL, 39),
    (l2_5, 'Qui est venu chez nous ce matin ?', 'Nani aye epai na biso na tongo ?', NULL, NULL, 40),
    (l2_5, 'Tu veux donner ça à qui ?', 'Olingi opesa yango epayi ya nani ?', NULL, NULL, 41),
    (l2_5, 'A qui appartient ce pagne ?', 'Eza ya nani liputa oyo ?', NULL, NULL, 42),
    (l2_5, 'Quand est-ce que reprend l''école ?', 'Tango nini kelasi ebandaka lisusu ?', NULL, NULL, 43),
    (l2_5, 'Pense à moi quand tu seras là-bas', 'Kanisa ngai tango oko koma kuna.', NULL, NULL, 44),
    (l2_5, 'Depuis quand tu vis chez ton frère ?', 'Ozali ko fanda na ndeko na yo ya mobali banda tango nini ?', NULL, NULL, 45),
    (l2_5, 'Comment tu fais pour porter tout ce bois ?', 'Ozo sala ndenge nini pona ko mema koni nionso oyo ?', NULL, NULL, 46),
    (l2_5, 'Où es-tu ? Je viens te chercher immédiatement.', 'Oza wapi ? Na zo yaka ko zua yo sikoyo.', NULL, NULL, 47),
    (l2_5, 'Je sais pas où ils sont.', 'Na yebi bisika baza te.', NULL, NULL, 48),
    (l2_5, 'A Combien tu vends ce sac de riz ?', 'Talo boni ozo teka sakochi ya loso oyo ?', NULL, NULL, 49),
    (l2_5, 'Combien de fois tu es parti à la mer ?', 'Mbala boni okeyi na ebale ?', NULL, NULL, 50);

  INSERT INTO lesson_items (lesson_id, french, dialect, example_french, example_dialect, item_order) VALUES
    (l2_5, 'Tu vas rester là-bas combien de temps ?', 'Oko vanda kuna mikolo boni ?', NULL, NULL, 51),
    (l2_5, 'Combien d''enfants vivent ici ?', 'Bana boni ba vandaka awa ?', NULL, NULL, 52),
    (l2_5, 'Oui', 'Iyo', NULL, NULL, 53),
    (l2_5, 'Non', 'Te', NULL, NULL, 54),
    (l2_5, 'Est-ce que tu as fait ce que je t''ai demandé hier ?', 'Osali oyo na yebisaki yo lobi ?', NULL, NULL, 55),
    (l2_5, 'Est-ce qu''il reste de la sauce dans la marmite ?', 'Elubu etikali lisusu na nzungu ?', NULL, NULL, 56),
    (l2_5, 'Ont-t-ils déjà visité la ville voisine ?', 'Esi ba tali mboka ya pembeni ?', NULL, NULL, 57),
    (l2_5, 'Allez-vous construire la nouvelle école ici ?', 'Bo ko tonga kelasi mosusu awa ?', NULL, NULL, 58),
    (l2_5, 'C''est ici qu''elle s''est faite agresser', 'Awa nde ba betaki ye.', NULL, NULL, 59),
    (l2_5, 'Nous avons été menacés pas les hommes du village voisin', 'To betamaki epai batu ya mboka ya pembeni.', NULL, NULL, 60),
    (l2_5, 'Il s''est fait tuer à la tombée de la nuit', 'Ba bomi ye tango butu ekweyi.', NULL, NULL, 61),
    (l2_5, 'On m''a dit que le grand père était mort', 'Ba yebisi ngai ete koko ya mobali akufaki.', NULL, NULL, 62);

  -- Module 3.1 Deplacements et directions (23 items)
  INSERT INTO lesson_items (lesson_id, french, dialect, example_french, example_dialect, item_order) VALUES
    (l3_1, 'Je suis perdu, je me suis trompé de chemin', 'Na bungi, na bosani nzela.', NULL, NULL, 1),
    (l3_1, 'Je cherche à me rendre au marché', 'Na lingi na kende zando.', NULL, NULL, 2),
    (l3_1, 'Comment faire pour se rendre chez Firmin ?', 'Na sala ndenge nini pona ko kende epayi ya Firmin ?', NULL, NULL, 3),
    (l3_1, 'J''ai pris un chemin trop long et trop compliqué.', 'Na zui nzela molayi mingi pe pasi mingi.', NULL, NULL, 4),
    (l3_1, 'Montre moi un raccourci pour arriver là-bas', 'Lakisa ngai nzela mokuse po na koma kuna.', NULL, NULL, 5),
    (l3_1, 'Pour arriver plus tôt tu dois contourner ce quartier', 'Pona ko koma noki esengeli obaluka quartier oyo.', NULL, NULL, 6),
    (l3_1, 'Comment faire pour arriver à l''école sans passer par la brousse ?', 'Ndenge nini na sala po na koma kelasi soki na leki na zamba te ?', NULL, NULL, 7),
    (l3_1, 'Pour aller là-bas va tout droit, une fois arrivé au carrefour prends la 2e à droite', 'Pona ko kende kuna pusana, soki okomi na suka zwa nzela mibale na loboko ya mobali.', NULL, NULL, 8),
    (l3_1, 'puis marche jusqu''à la maison en bois, et demande ton chemin au vieux.', 'pe tambola kino na ndaku ya mabaya, pe tuna nzela na yo na koko.', NULL, NULL, 9),
    (l3_1, 'Répète doucement, je n''ai pas compris', 'Limbola malembe, na kangi eloko te.', NULL, NULL, 10),
    (l3_1, 'Je reviens du village', 'Na wuti mboka.', NULL, NULL, 11),
    (l3_1, 'Comment était la route ?', 'Nzela ezalaki ndenge nini ?', NULL, NULL, 12),
    (l3_1, 'Où vas-tu ?', 'Okeyi wapi ?', NULL, NULL, 13),
    (l3_1, 'Je suis perdu', 'Na bungi.', NULL, NULL, 14),
    (l3_1, 'Je cherche la maison de Roger.', 'Na zo luka ndaku ya Roger.', NULL, NULL, 15),
    (l3_1, 'Je suis chez moi', 'Na za epai na ngai.', NULL, NULL, 16),
    (l3_1, 'Je vais à la maison', 'Na keyi ndaku.', NULL, NULL, 17),
    (l3_1, 'Je rentre en France', 'Na zongi poto.', NULL, NULL, 18),
    (l3_1, 'Je vais au travail', 'Na keyi mosala.', NULL, NULL, 19),
    (l3_1, 'Je suis Congolais/Français/Anglais/Américain', 'Na za congolais/français/anglais/américain.', NULL, NULL, 20),
    (l3_1, 'Tu es d''où ?', 'Oza ekolo nini ?', NULL, NULL, 21),
    (l3_1, 'Où je peux prendre un taxi ?', 'Na koki ko zua motuka wapi ?', NULL, NULL, 22),
    (l3_1, 'Il faut aller à gauche puis à droit puis continuer tout droit', 'Kende na loboko ya mwasi sima ozui loboko ya mobali sima oke liboso.', NULL, NULL, 23);

  -- Module 3.2 Le travail et les metiers (25 items)
  INSERT INTO lesson_items (lesson_id, french, dialect, example_french, example_dialect, item_order) VALUES
    (l3_2, 'Accompagner', 'Ko tika', 'J''accompagne mon ami chez sa mère puisqu''il est aveugle', 'Na zo kende ko tika moninga na ngai epai ya mama na ye po amonaka te.', 1),
    (l3_2, 'Agriculteur', 'Mosali bilanga', 'Mon grand-père était agriculteur, il cultivait le haricot et les arachides', 'Koko na ngai azalaki mosali bilanga, azalaki ko lona madesu na nguba.', 2),
    (l3_2, 'Arroser', 'Ko sopa', 'La plante a séché parce qu''on ne l''a pas arrosée tous les jours', 'Nzete eyomi po ba sopi yango mayi mikolo nionso te.', 3),
    (l3_2, 'Cahier', 'Buku', 'On achète chaque année des cahiers et des livres neufs à nos enfants', 'To sombaka ba mbula nionso bikomelo pe ba buku pona bana na biso.', 4),
    (l3_2, 'Chasseur', 'Mokangi niama (ba kangi niama)', 'Les hommes de ce village sont chasseurs', 'Mibali ya mboka oyo ba za ba kangi niama.', 5),
    (l3_2, 'Chef', 'Mokonzi', 'Le chef aime décider de tout', 'Mokonzi alingaka ko pesa mitindo na nionso.', 6),
    (l3_2, 'Commerçant', 'Moteki (ba teki)', 'Certains commerçants escroquent les clients', 'Ba teki misusu ba yibaka ba sombi.', 7),
    (l3_2, 'Cultiver', 'Ko lona', 'Il cultivait le haricot et les arachides', 'Azalaki ko lona madesu na nguba.', 8),
    (l3_2, 'Docteur', 'Munganga', 'Le docteur travaille à l''hôpital mais il va aussi chez les malades.', 'Munganga asalaka na ndako ya bokono kasi akendaka pe ko tala ba beli.', 9),
    (l3_2, 'Écrire', 'Ko koma', 'Les enfants apprennent d''abord à écrire leur prénom', 'Bana ba yekolaka nani ko koma kombo na bango.', 10),
    (l3_2, 'Élever', 'Ko bokola', 'Mon frère élève des chèvres', 'Ndeko na ngai ya mobali abokolaka ba ntaba.', 11),
    (l3_2, 'Gardien', 'Mokengeli', 'Le gardien veille toute la nuit pour nous protéger', 'Mokengeli alalaka te butu nionso pona ko batela biso.', 12),
    (l3_2, 'Guerrier / soldat', 'Mobundi (ba bundi)', 'Les guerriers sont courageux et savent manier les armes', 'Ba bundi ba za mpiko pe ba yebi ko bongisa mindoki.', 13),
    (l3_2, 'Livre', 'Buku', 'On achète chaque année des cahiers et des livres neufs à nos enfants', 'To sombaka ba mbula nionso bikomelo pe ba buku pona bana na biso.', 14),
    (l3_2, 'Maître', 'Molakisi', 'Le maître d''école tient une craie dans sa main pour écrire au tableau', 'Molakisi ya kelasi asimbi ekomeli na maboko na ye pona ko koma na etanda ya bileko.', 15),
    (l3_2, 'Marabout / Sorcier', 'Nganga / Ndoki', 'Le sorcier pratique la magie.', 'Ndoki asalelaka soloka.', 16),
    (l3_2, 'Notable', 'Moknzi ya mboka', 'Les notables accompagnent le roi', 'Ba konzi ba za ko kende ko tika nkumu.', 17),
    (l3_2, 'Papier', 'Mokanda', 'Les enfants écrivent sur une feuille de papier', 'Bana ba zali ko koma likolo ya mokanda.', 18),
    (l3_2, 'Pêcheur', 'Mokangi mbisi', 'Mon grand-père était aussi pêcheur', 'Koko na ngai ya mobali azalaki pe mokangi mbisi.', 19),
    (l3_2, 'Planter', 'Ko lona', 'C''est aujourd''hui qu''on doit planter le maïs', 'Lelo nde to ko lona masangu.', 20),
    (l3_2, 'Professeur', 'Molakisi', 'Le professeur est respecté par tous les élèves', 'Molakisi aza na luzitu ya bana nionso ya kelasi.', 21),
    (l3_2, 'Récolter', 'Ko buka', 'La récolte se fera dans 6 mois', 'To ko buka bilanga na biso na ba sanza motoba.', 22),
    (l3_2, 'Roi', 'Nkumu', 'Le roi actuel est le fils de l''ancien roi', 'Nkumu ya sika oyo aza mwana ya nkumu ya kala.', 23),
    (l3_2, 'Sac', 'Libenga', 'Il y a trop de choses dans ton sac', 'Eza na biloko ebele na libenga na yo.', 24),
    (l3_2, 'Serviteur', 'Mosali (ba sali)', 'Les serviteurs du roi passent leur vie avec lui', 'Ba sali ya mokonzi balekisaka bomoyi na bango na ye.', 25);

  -- Module 3.3 Conjugaison present et passe (18 items)
  INSERT INTO lesson_items (lesson_id, french, dialect, example_french, example_dialect, item_order) VALUES
    (l3_3, 'j''aime / j''ai aimé', 'Na lingi', 'Ko linga (aimer)', NULL, 1),
    (l3_3, 'Tu aimess / Tu as aimés', 'Olingi', 'Ko linga (aimer)', NULL, 2),
    (l3_3, 'Il aime / Il a aimé', 'Alingi', 'Ko linga (aimer)', NULL, 3),
    (l3_3, 'Nous aimons / Nous avons aimés', 'To lingi', 'Ko linga (aimer)', NULL, 4),
    (l3_3, 'Vous aimez / Vous avez aimé', 'Bo lingi', 'Ko linga (aimer)', NULL, 5),
    (l3_3, 'Ils aimes / Ils ont aimé', 'Ba lingi', 'Ko linga (aimer)', NULL, 6),
    (l3_3, 'J''aimais', 'Na lingaki', 'Ko linga (aimer)', NULL, 7),
    (l3_3, 'Il aimait', 'Alingaki', 'Ko linga (aimer)', NULL, 8),
    (l3_3, 'Tu aimais', 'Olingaki', 'Ko linga (aimer)', NULL, 9),
    (l3_3, 'Nous aimions', 'To lingaki', 'Ko linga (aimer)', NULL, 10),
    (l3_3, 'Vous aimiez', 'Bo lingaki', 'Ko linga (aimer)', NULL, 11),
    (l3_3, 'Ils aimaient', 'Ba lingaki', 'Ko linga (aimer)', NULL, 12),
    (l3_3, 'j''étais en train d''aimer', 'Na za laki ko linga', 'Ko linga (aimer)', NULL, 13),
    (l3_3, 'Tu étais en train d''aimer', 'Ozalaki ko linga', 'Ko linga (aimer)', NULL, 14),
    (l3_3, 'Il/Elle est en train d''aimer', 'Azalaki ko linga', 'Ko linga (aimer)', NULL, 15),
    (l3_3, 'Nous sommes en train d''aimer', 'To zalaki ko linga', 'Ko linga (aimer)', NULL, 16),
    (l3_3, 'Vous êtes en train d''aimer', 'Bo zalaki ko linga', 'Ko linga (aimer)', NULL, 17),
    (l3_3, 'Ils/Elles sont en train d''aimer', 'Ba zalaki ko linga', 'Ko linga (aimer)', NULL, 18);

  -- Module 3.4 Conjugaison futur et imperatif (18 items)
  INSERT INTO lesson_items (lesson_id, french, dialect, example_french, example_dialect, item_order) VALUES
    (l3_4, 'J''aimerai', 'Na ko linga', 'Ko linga (aimer)', NULL, 1),
    (l3_4, 'Tu aimeras', 'Oko linga', 'Ko linga (aimer)', NULL, 2),
    (l3_4, 'Il aimera', 'Ako linga', 'Ko linga (aimer)', NULL, 3),
    (l3_4, 'Nous aimerons', 'To ko linga', 'Ko linga (aimer)', NULL, 4),
    (l3_4, 'Vous aimerez', 'Bo ko linga', 'Ko linga (aimer)', NULL, 5),
    (l3_4, 'Ils aimeront', 'Ba ko linga', 'Ko linga (aimer)', NULL, 6),
    (l3_4, 'je suis en train d''aimer', 'Na zo linga', 'Ko linga (aimer)', NULL, 7),
    (l3_4, 'Tu es en train d''aimer', 'Ozo linga', 'Ko linga (aimer)', NULL, 8),
    (l3_4, 'Il/Elle es en train d''aimer', 'Azo linga', 'Ko linga (aimer)', NULL, 9),
    (l3_4, 'Nous sommes en train d''aimer', 'To zo linga', 'Ko linga (aimer)', NULL, 10),
    (l3_4, 'Vous êtes en train d''aimer', 'Bo zo linga', 'Ko linga (aimer)', NULL, 11),
    (l3_4, 'Ils/Elles sont en train d''aimer', 'Ba zo linga', 'Ko linga (aimer)', NULL, 12),
    (l3_4, 'Va à l''école', 'Kende kelasi.', NULL, NULL, 13),
    (l3_4, 'Va te coucher', 'Kende ko lala.', NULL, NULL, 14),
    (l3_4, 'Lève-toi', 'Kotelema.', NULL, NULL, 15),
    (l3_4, 'Va me chercher une assiette', 'Kende kozua ngai sani.', NULL, NULL, 16),
    (l3_4, 'Viens !', 'Yaka !', NULL, NULL, 17),
    (l3_4, 'Donne-moi ça', 'Pesa ngai oyo.', NULL, NULL, 18);

  -- Module 3.5 Sentiments et emotions (30 items)
  INSERT INTO lesson_items (lesson_id, french, dialect, example_french, example_dialect, item_order) VALUES
    (l3_5, 'Je suis content', 'Na sepeli.', NULL, NULL, 1),
    (l3_5, 'Je suis heureux', 'Na za na esengo.', NULL, NULL, 2),
    (l3_5, 'Je suis triste', 'Na za na mawa.', NULL, NULL, 3),
    (l3_5, 'Je suis étonné', 'Na zo kamwa.', NULL, NULL, 4),
    (l3_5, 'Je suis fatigué', 'Na lembi.', NULL, NULL, 5),
    (l3_5, 'Je suis déçu', 'Olembisi ngai.', NULL, NULL, 6),
    (l3_5, 'J''ai peur de', 'Na za na bomo ya', 'J''ai peur de l''obscurité', 'Na za na bomo ya molili.', 7),
    (l3_5, 'J''ai peur que', 'Na za na bomo', 'J''ai peur que tu me laisses seul', 'Na za na bomo otika ngai moko.', 8),
    (l3_5, 'Je sais', 'Na yebi.', NULL, NULL, 9),
    (l3_5, 'Je ne sais pas', 'Na yebi te.', NULL, NULL, 10),
    (l3_5, 'D''accord / Je suis d''accord', 'Malamu / Na ndimi', NULL, NULL, 11),
    (l3_5, 'Je ne suis pas d''accord', 'Na ndimi te.', NULL, NULL, 12),
    (l3_5, 'Tu as raison', 'Oza na motindo.', NULL, NULL, 13),
    (l3_5, 'Tu as tort', 'Oza na foti.', NULL, NULL, 14),
    (l3_5, 'Je ne suis pas sûr', 'Na ndimi te.', NULL, NULL, 15),
    (l3_5, 'C''est vrai', 'Eza solo.', NULL, NULL, 16),
    (l3_5, 'C''est faux', 'Eza lokuta.', NULL, NULL, 17),
    (l3_5, 'J''aime courir', 'Na lingaka ko kima.', NULL, NULL, 18),
    (l3_5, 'Je déteste ce plat', 'Na lingaka bilia oyo te.', NULL, NULL, 19),
    (l3_5, 'Quelle est ta musique préférée ?', 'Olingaka ndule nini ?', NULL, NULL, 20),
    (l3_5, 'J''aime la viande mais je préfère le poisson', 'Na lingaka ngombe kasi na poni mbisi.', NULL, NULL, 21),
    (l3_5, 'Bonne idée / mauvaise idée', 'Likanisi malamu / Likanisi mabe', NULL, NULL, 22),
    (l3_5, 'Qu''est-ce que tu en penses ? Qu''est-ce que tu penses de lui ?', 'Ozo mona ndenge nini ? Ozo mona ndenge nini pona ye ?', NULL, NULL, 23),
    (l3_5, 'D''accord ? (= C''est bon ? = C''est ok ?)', 'Malamu ? (= Eza malamu ? = Na ndimi ?)', NULL, NULL, 24),
    (l3_5, 'Voilà', 'Na yango', NULL, NULL, 25),
    (l3_5, 'Moi aussi', 'Ngai pe', NULL, NULL, 26),
    (l3_5, 'Moi non plus', 'Ngai pe te', NULL, NULL, 27),
    (l3_5, 'Bien sûr', 'Ya solo', NULL, NULL, 28),
    (l3_5, 'J''aime cette musique', 'Na lingaka ndule oyo.', NULL, NULL, 29),
    (l3_5, 'Je ne veux pas aller à l''école aujourd''hui', 'Na ko kende kelasi te lelo.', NULL, NULL, 30);

  -- Module 3.6 Construction de phrases 2 (237 items)
  INSERT INTO lesson_items (lesson_id, french, dialect, example_french, example_dialect, item_order) VALUES
    (l3_6, 'Mais', 'Kasi', 'J''aime le poulet mais je préfère le bœuf.', 'Na lingi soso kasi na sepelaka mingi na ngombe.', 1),
    (l3_6, 'Ou', 'To', 'Tu peux rester à la maison ou alors venir avec nous.', 'Okoki ko tikala na ndako to oko ya na biso.', 2),
    (l3_6, 'Et', 'Na', 'Kamga et Fotso vont bientôt arriver. J''aime la viande et le foufou.', 'Kamga na Fotso ba ko koma kala te. Na lingi ngombe na fufu.', 3),
    (l3_6, 'Donc', 'Na yango', 'Je me suis levé tard aujourd''hui donc je n''ai pas pu aller au champ ce matin.', 'Na lamuki na moyi na yango na ke na bilanga te lelo na tongo.', 4),
    (l3_6, 'Or', 'Kasi', 'Il me demande de l''argent, or il me doit encore 1000 francs.', 'Azo senga ngai mbongo, kasi azo defa nga nani kama mibale.', 5),
    (l3_6, 'Ni', 'Pe', 'Je n''ai rien apporté pour toi, ni pour lui.', 'Na memi eloko te pona yo, pe pona ye.', 6),
    (l3_6, 'Car', 'Po', 'Il s''énerve car tu lui as mal parlé.', 'Asiliki po olobi na ye mabe.', 7),
    (l3_6, 'Que', 'Ete', 'Je crois qu''il ne viendra pas.', 'Na kanisi ete ako ya te.', 8),
    (l3_6, 'Puisque', 'Po', 'Puisque tu ne veux pas venir je partirai à la guerre sans toi.', 'Po olingi ko yaka te na ko kende bitumba ngai moko.', 9),
    (l3_6, 'Parce que', 'Po', 'Elle est triste parce que son mari est malade.', 'Aza mawa po mobali na ye aza na bokono.', 10),
    (l3_6, 'Alors que', 'Kasi', 'Il me critique alors qu''il ne peut rien faire sans moi.', 'Azo tumbola ngai kasi akoki ko sala eloko te soki na za te.', 11),
    (l3_6, 'Comme si', 'Lokola', 'Vous me regardez comme si c''était moi qui l''avais tué.', 'Bo zo tala ngai lokola ngai nde moto na bomi ye.', 12),
    (l3_6, 'Qui', 'Oyo', 'Voici le gars qui me doit de l''argent', 'Tala mobali oyo azo defa ngai mbongo.', 13),
    (l3_6, 'Je le reconnais, c''est lui l''homme qui a volé mon sac hier', 'Na zo yeba ye, eza ye nde ayibi sakochi na ngai lobi.', NULL, NULL, 14),
    (l3_6, 'Que', 'Oyo', 'Souvenez-vous de ce que je vous ai dit.', 'Bo yeba oyo na yebisaki bino.', 15),
    (l3_6, 'C''est la personne que je respecte le plus', 'Eza mutu oyo na tosaka ko leka.', NULL, NULL, 16),
    (l3_6, 'Ils nous ont dit que  nous n''étions pas les bienvenus ici.', 'Ba lobi ete to yeyi malamu awa te.', NULL, NULL, 17),
    (l3_6, 'Il tient le couteau que je lui ai offert.', 'Asimbi mbeli oyo na pesi ye.', NULL, NULL, 18),
    (l3_6, 'Quoi', 'Oyo', 'Maman nous a expliqué quoi faire quand les invités arriveront.', 'Mama alobi na biso oyo esengeli to sala tango ba paya ba ko ya.', 19),
    (l3_6, 'Je ne sais pas quoi faire', 'Na yebi oyo na sala te.', NULL, NULL, 20),
    (l3_6, 'Où', 'Esika', 'J''ai oublié où j''ai rangé mes affaires', 'Na bosani esika na tie biloko na ngai.', 21),
    (l3_6, 'Lequel', 'Oyo', 'C''est l''enfant pour lequel j''ai le plus d''espoir', 'Aza mwana oyo na za mingi na elikia.', 22),
    (l3_6, 'Laquelle', 'Oyo', 'C''est la question à laquelle j''ai déjà répondu', 'Eza motuna na oyo esi na yanola.', 23),
    (l3_6, 'Duquel', 'Yango', 'Elle porte un sac au fond duquel se trouve un collier', 'Alati sakochi na kati na yango eza na mayaka.', 24),
    (l3_6, 'Plus', 'Ko leka', 'Je suis plus beau que lui', 'Na leki ye na kitoko.', 25),
    (l3_6, 'Tu es plus intelligent que moi', 'Oza mayele ko leka ngai.', NULL, NULL, 26),
    (l3_6, 'Moins', 'Ko leka', 'Il est moins généreux que toi', 'Oza malamu ko leka ye.', 27),
    (l3_6, 'Vous êtes moins forts que nous', 'To za makasi ko leka bino.', NULL, NULL, 28),
    (l3_6, 'Le plus / La plus / Les plus', 'Ko leka', 'C''est la personne la plus gentille que je connaisse', 'Aza moto malamu ko leka oyo na yebi.', 29),
    (l3_6, 'C''est le meilleur des élèves ici', 'Aza mayele ko leka ba yekoli nionso awa.', NULL, NULL, 30),
    (l3_6, 'Toujours', 'Kaka', 'Ces enfants veulent toujours jouer', 'Bana oyo ba lingi kaka ko sakana.', 31),
    (l3_6, 'En général', 'Tango nionso', 'En général mon fils refuse de manger le soir', 'Tango nionso, mwana na nga aboyaka ko lia na pokwa.', 32),
    (l3_6, 'La plupart du temps', 'Tango nionso', 'Il fait chaud la plupart du temps ici', 'Tango nionso molunge eza makasi.', 33),
    (l3_6, 'Souvent', 'Mingi', 'La voiture se coince souvent dans la boue les jours de pluie', 'Motuka ekangamaka mingi na potopoto mikolo ya mbula.', 34),
    (l3_6, 'Parfois', 'Mikolo misusu', 'La voisine nous apporte parfois les vêtements qu''elle ne porte plus', 'Moto ya pembeni amemelaka biso mikolo misusu bilamba oyo alataka lisusu te.', 35),
    (l3_6, 'Rarement', 'Na pasi', 'Ces gens nous saluent rarement quand ils passent devant chez nous.', 'Bato oyo ba pesaka biso mbote na pasi tango ba lekaka liboso na biso.', 36),
    (l3_6, 'Jamais', 'Ata mokie', 'Tu ne me reconnais jamais quand tu me croises', 'Oyebaka ngai ata mokie soki okutani na ngai.', 37),
    (l3_6, 'Je ne suis jamais montée en haut de cette montagne', 'Na tikala ko mata te likolo ya ngomba oyo.', NULL, NULL, 38),
    (l3_6, 'Devoir (dans le sens fortement possible)', 'Ko mona', 'Je ne vois plus Siakam, il doit déjà être arrivé.', 'Na zo mona lisusu Siakam te, na moni lokola esi akomi.', 39),
    (l3_6, 'Peut-être', 'Tango mosusu', 'Nous cherchons Magne, peut-être qu''elle nous cherche aussi', 'To zo luka Magne, tango mosusu azo luka biso pe.', 40),
    (l3_6, 'À', 'Na', 'Je vais à *nom d''une ville/village*', 'Na keyi na  *...*', 41),
    (l3_6, 'je suis à *nom d''une ville/village*', 'Na za na *…*', NULL, NULL, 42),
    (l3_6, 'Je dis à mon frère de m''aider à porter mon sac', 'Na lobi na ndeko na nga asunga nga ko mema sakochi.', NULL, NULL, 43),
    (l3_6, 'Donne ce paquet à ta mère', 'Pesa liboke oyo na mama na yo.', NULL, NULL, 44),
    (l3_6, 'Dans', 'Na kati ya', 'Les voisins sont dans leurs maisons', 'Bato ya pembeni ba za na kati ya ba ndako na bango.', 45),
    (l3_6, 'Je rentrerai chez moi dans 10jours', 'Na ko zonga epai na ngai na mikolo zomi.', NULL, NULL, 46),
    (l3_6, 'On entend son nom dans toutes les sales histoires', 'To zo yoka kombo na ye na masolo nionso ya mabe ezo lobama.', NULL, NULL, 47),
    (l3_6, 'La souris se cache dans son trou', 'Mpoko azo bombana na libulu na ye.', NULL, NULL, 48),
    (l3_6, 'Dedans', 'Na kati', 'Je préfère que les enfants jouent dehors plutôt que dedans', 'Na lingi bana ba sakana na libanda kasi na kati te.', 49),
    (l3_6, 'Dehors', 'Na libanda', NULL, NULL, 50);

  INSERT INTO lesson_items (lesson_id, french, dialect, example_french, example_dialect, item_order) VALUES
    (l3_6, 'En Haut', 'Na likolo', 'Elle est restée en haut au lieu de venir nous aider à balayer et faire le ménage en bas', 'Atikali na likolo na yango aya ko sunga biso ko kombola na se.', 51),
    (l3_6, 'En bas', 'Na se', NULL, NULL, 52),
    (l3_6, 'Par', '/', 'Pour rentrer chez moi je dois passer par le marécage', 'Pona ko kende epai na ngai esengeli na katisa ba mayi ya mikie mikie.', 53),
    (l3_6, 'Il était par ici tout à l''heure.', 'Azalaki awa sikoyo.', NULL, NULL, 54),
    (l3_6, 'Ce plat a été cuisiné par ma femme', 'Bilia oyo elambami na mwasi na ngai.', NULL, NULL, 55),
    (l3_6, 'Elle décortique les arachides un par un', 'Azo pasola ba nguba moko na moko.', NULL, NULL, 56),
    (l3_6, 'Elle a fait tomber le pot par inadvertance', 'Akweyisi kopo kasi asali na nko te.', NULL, NULL, 57),
    (l3_6, 'En', 'Tango', 'Elle nous parle tout en cuisinant', 'Azo loba na biso tango azo lamba.', 58),
    (l3_6, 'Nous croyons en Dieu', 'To ndimelaka Nzambe.', NULL, NULL, 59),
    (l3_6, 'Sur', 'Likolo ya', 'Dépose la bouteille d''eau sur la table', 'Tia mulangi ya mayi likolo ya mesa.', 60),
    (l3_6, 'Elle met sa main sur mon front pour sentir si j''ai de la fièvre', 'Atie loboko na mbunzu na ngai pona ayeba soki na zo bela.', NULL, NULL, 61),
    (l3_6, 'Est-ce que je peux compter sur toi ?', 'Na koki ko talela yo ?', NULL, NULL, 62),
    (l3_6, 'Sous', 'Na se ya', 'Le chien est couché sous la table', 'Mbwa aza na se ya mesa.', 63),
    (l3_6, 'Vers', 'Mosika te na', 'Vous habitez vers la rivière', 'Bo fandaka mosika te na ebale.', 64),
    (l3_6, 'À quelle heure ton mari rentre du travail ? Il rentre vers 17h', 'Na ngonga nini mobali na yo ako wuta mosala ? Ako ya na ba ngonga zomi na sambo.', NULL, NULL, 65),
    (l3_6, 'Chez', 'Epai ya', 'Nous partons chez des notables', 'To zo kende epai ya ba nkumu.', 66),
    (l3_6, 'Rentre chez toi', 'Zonga na ndako na yo.', NULL, NULL, 67),
    (l3_6, 'Bienvenue chez moi', 'Boyeyi malamu epai na ngai.', NULL, NULL, 68),
    (l3_6, 'Devant', 'Liboso ya', 'Le gardien surveille les gens devant la maison', 'Mokengeli azo batela liboso ya ndako.', 69),
    (l3_6, 'Derrière', 'Sima', 'On a enterré le grand-père derrière sa maison', 'Ba kundi koko ya mobali sima ndako na ye.', 70),
    (l3_6, 'À Droite', 'Na lokobo ya mobali', 'Le notable est à la droite du roi', 'Nkumu aza na loboko ya mobali ya mokonzi.', 71),
    (l3_6, 'À Gauche', 'Na loboko ya mwasi', 'Le prince est à la gauche du chef', 'Mwana mokonzi aza na loboko ya mwasi ya mokonzi.', 72),
    (l3_6, 'Entre', 'Katikati ya… na…', 'On se donne rendez-vous demain entre la forêt et la rivière', 'To kutana lobi katikati ya zamba na ebale.', 73),
    (l3_6, 'Qu''est-ce qui se passe entre eux deux ?', 'Nini ezo leka kati na bango mibale ?', NULL, NULL, 74),
    (l3_6, 'Je  n''aime pas quand la viande reste coincée entre mes dents', 'Na lingaka te tango mosuni ekangamaka na mino na ngai.', NULL, NULL, 75),
    (l3_6, 'Jusque', 'Kino', 'Elle s''est occupée de son enfant jusqu''à ce qu''il soit grand', 'Akipa mwana na ye kino akoli.', 76),
    (l3_6, 'Nous construisons la barrière d''ici jusqu''à là-bas', 'To zo tonga mondelo banda awa kino kuna.', NULL, NULL, 77),
    (l3_6, 'Contre', 'Na', 'Tu aimes t''adosser contre ce mur', 'Olingi ko yekama na efelo oyo.', 78),
    (l3_6, 'Il est toujours contre moi', 'Aza kaka na likunia pona ngai.', NULL, NULL, 79),
    (l3_6, 'Il ne s''est jamais battu contre moi', 'Nani abunda te na ngai.', NULL, NULL, 80),
    (l3_6, 'À côté', 'Pembeni ya', 'Le chien reste à côté de son maître.', 'Mbwa azalaka pembeni ya mokolo na ye.', 81),
    (l3_6, 'Loin (de)', 'Mosika (ya)', 'Malgré une longue marche, La maison de son fils est encore loin', 'Ata ko tambola ebele, ndako ya mwana na ye eza nani mosika.', 82),
    (l3_6, 'Je suis triste quand tu es loin de moi', 'Na za mawa soki oza mosika na ngai.', NULL, NULL, 83),
    (l3_6, 'En face', 'Liboso (na)', 'Elle s''assoie souvent en face de moi', 'Afandaka mingi liboso na nga.', 84),
    (l3_6, 'Hors', 'Libanda (ya)', 'Elle n''aime pas cuisiner hors de la maison', 'Alingi ko lamba libanda ya ndako te.', 85),
    (l3_6, 'Au-delà', 'Ko leka', 'Mon terrain s''étend au-delà de la prairie', 'Lopango na ngai etandami ko leka esobe.', 86),
    (l3_6, 'À partir', 'Ko banda', 'Sa concession commence à partir d''ici.', 'Lopango na ye ebandi esika oyo.', 87),
    (l3_6, 'Autour de', 'Nzinganzinga ya', 'L''herbe a poussé de partout autour de la maison pendant la saison des pluies.', 'Matiti epusani esika nionso nzinganzinga ya ndako na tango ya mbula.', 88),
    (l3_6, 'Alors', 'Kasi', 'Vous ne voulez pas laisser les enfants dormir alors qu''il sont fatigués', 'Bo lingi bo tika bana ba lala te kasi bango ba za ya ko lemba.', 89),
    (l3_6, 'Danse alors !', 'Bina kasi !', NULL, NULL, 90),
    (l3_6, 'J''ai épousé la femme que vous détestiez, et alors ?', 'Na bali mwasi oyo bo lingaka te, sikoyo ?', NULL, NULL, 91),
    (l3_6, 'À travers', 'Na kati', 'L''eau de cette rivière est si claire qu''on peut voir le fond à travers', 'Mayi ya ebale oyo eza peto to koki ko mona na kati na yango.', 92),
    (l3_6, 'La voiture s''est garée de travers sur la route', 'Motuka ekangami na ndenge ya mabe na nzela.', NULL, NULL, 93),
    (l3_6, 'Ici', 'Awa', 'J''ai mal juste ici (quelqu''un qui montre du doigt où il a mal)', 'Na za na pasi kaka awa.', 94),
    (l3_6, 'Est-ce que c''est la première fois que tu viens ici ?', 'Eza mbala ya liboso oya awa ?', NULL, NULL, 95),
    (l3_6, 'Ailleurs', 'Esika mosusu', 'Depuis que je suis fâché avec mon fils, il m''évite, il préfère être ailleurs.', 'Banda na siliki na mwana na ngai, azo kima ngai, alingi ko vanda esika mosusu ko leka.', 96),
    (l3_6, 'Partout', 'Bisika nionso', 'Le chat a fait pipi partout.', 'Niao asubi bisika nionso.', 97),
    (l3_6, 'Nulle part', 'Esika te', 'On se promène depuis le matin mais on ne va nulle part.', 'To zo tambola banda tongo kasi to zo kende esika te.', 98),
    (l3_6, 'Avant', 'Liboso na', 'Tu es née avant moi mais je suis né avant lui.', 'Obotami liboso na ngai kasi na botami liboso na ye.', 99),
    (l3_6, 'Avant d''être professeur, j''étais d''abord agriculteur', 'Yambo na koma molakisi, na zalaki mosali bilanga.', NULL, NULL, 100);

  INSERT INTO lesson_items (lesson_id, french, dialect, example_french, example_dialect, item_order) VALUES
    (l3_6, 'Après', 'Sima ya', 'Les enfant sortiront jouer après manger, et je les rejoindrai après ma sieste', 'Bana ba ko kende ko sakana sima ya ko lia, pe na ko kende ko kuta bango sima ko pema.', 101),
    (l3_6, 'Depuis', 'Banda', 'J''ai mal au pied depuis hier', 'Na za na makolo pasi banda lobi.', 102),
    (l3_6, 'Nous ne sommes pas retournés au village depuis longtemps', 'To zongi mboka te banda kala.', NULL, NULL, 103),
    (l3_6, 'Dès', 'Tango', 'Il s''est levé dès que je lui ai demandé', 'Atelemi tango na sengi ye.', 104),
    (l3_6, 'Pendant', '/', 'On a vécu pendant 2 ans à la montagne', 'To fandi ba mbula mibale na ngomba.', 105),
    (l3_6, 'À partir de', 'Ko banda', 'A partir de demain j''irai travailler tous les jours', 'Ko banda lobi na ko kende mosala mikolo nionso.', 106),
    (l3_6, 'D''abord', 'Nanu', 'Tu veux manger ? Pas tout de suite, je vais d''abord me laver', 'Olingi ko lia ? Sikoyo te, na lingi na sokola nanu.', 107),
    (l3_6, 'Longtemps', 'Kala', 'On ne s''était pas vus depuis longtemps', 'To monanaki te banda kala.', 108),
    (l3_6, 'Hier', 'Lobi', 'Hier il n''est pas parti à l''école car il était malade. Il va mieux aujourd''hui, donc il y retournera demain.', 'Lobi ake kelasi te po azalaki na bokono. Aza malamu lelo, sikoyo ako zonga lobi.', 109),
    (l3_6, 'Demain', 'Lobi', 'Demain tu iras récupérer tes petits frères à l''école', 'Lobi oko kende ko zua ba leki na yo na kelasi.', 110),
    (l3_6, 'Dorénavant', 'Ko banda sikoyo', 'Dorénavant vous réfléchirez avant de parler.', 'Ko banda sikoyo, bo ko kanisa yambo bo loba.', 111),
    (l3_6, 'Encore', 'Lisusu', 'Est-ce qu''il reste encore de la sauce ?', 'Etikali lisusu supu ?', 112),
    (l3_6, 'Les invités sont encore là ?', 'Ba paya ba za nani wana ?', NULL, NULL, 113),
    (l3_6, 'C''est qui ?     - C''est moi.      - Encore toi ?', 'Eza nani ? - Eza ngai. - Eza lisusu yo ?', NULL, NULL, 114),
    (l3_6, 'Elle est encore enceinte, c''est la 3e fois en 3ans', 'Azalaki lisusu na zemi, eza mbala misato na ba mbula misato.', NULL, NULL, 115),
    (l3_6, 'Finalement', 'Sikoyo', 'Finalement je préfère rester à la maison aujourd''hui.', 'Sikoyo na sepeli ko fanda na ndako lelo.', 116),
    (l3_6, 'De', 'Ya', 'La porte de la maison est fermée', 'Ekuke ya ndako eza ya ko kanga.', 117),
    (l3_6, 'Le fils de Njoya est parti', 'Mwana ya Njoya akeyi.', NULL, NULL, 118),
    (l3_6, 'Avec', 'Na', 'Elle voyage avec son mari', 'Azo kende mobembo na mobali na ye.', 119),
    (l3_6, 'Si', 'Soki', 'Si je suis malade emmène-moi à l''hôpital', 'Soki na za na bokono, mema ngai na opitalo.', 120),
    (l3_6, 'Si tu finis ton travail tu auras ton salaire', 'Soki osilisi mosala na yo, oko zua lifuta.', NULL, NULL, 121),
    (l3_6, 'Si je savais que tu ne viendrais pas je serais resté chez moi', 'Soki na yebaki ete oko ya te, na lingaki ko fanda epai na ngai.', NULL, NULL, 122),
    (l3_6, 'Pour (que)', 'Po', 'Il mange bien pour bien grandir', 'Azo lia malamu po akola malamu.', 123),
    (l3_6, 'Nous nous battons pour que notre peuple ne manque de rien', 'To zo bunda po ekolo na biso ezanga eloko te.', NULL, NULL, 124),
    (l3_6, 'Sans', '/', 'Partez sans moi.', 'Bo kende ngai na ko zala te.', 125),
    (l3_6, 'Il a réussi à me retrouver sans que je lui dise où j''étais', 'Akoki ko zua nga kasi na yebisi ye esika na zalaki te.', NULL, NULL, 126),
    (l3_6, 'Sur', 'Likolo ya', 'J''ai posé l''argent sur la table ce matin', 'Na tie mbongo likolo ya mesa tongo ya lelo.', 127),
    (l3_6, 'Le bébé est tombé sur la tête.', 'Mwana akweyi na mutu.', NULL, NULL, 128),
    (l3_6, 'Répète-moi ce que tu m''as dit sur ton frère', 'Bandela oyo olobi pona ndeko na yo ya mobali.', NULL, NULL, 129),
    (l3_6, 'Sauf', 'Kasi ya', 'J''aime toutes les viandes sauf le mouton', 'Na lingi misuni nionso kasi ya ntaba te.', 130),
    (l3_6, 'Tu devrais te taire, sauf si tu as quelque chose d''intéressant à dire', 'Esengeli okanga monoko, soki oza na eloko ya ko loba te.', NULL, NULL, 131),
    (l3_6, 'Envers', 'Pona', 'Vous êtes souvent méchants envers moi', 'Bo za mabe mingi pona nga.', 132),
    (l3_6, 'Parmi', 'Na', 'Je ne sais pas quel plat choisir parmi tous ceux qui sont sur la table.', 'Na yebi bilia nini na pona te na oyo nionso eza na mesa.', 133),
    (l3_6, 'Selon', 'Pona', 'Selon leur chef, leurs ancêtres les ont maudits.', 'Pona mokonzi na bango, ba nkoko na bango ba loka bango.', 134),
    (l3_6, 'La semaine prochaine on ira se promener ou manger selon ce que tu choisiras', 'Mposo oyo eko ya to ko kende ko tambola to ko lia ndenge oko pona.', NULL, NULL, 135),
    (l3_6, 'Grâce à', 'Pona', 'Malgré la fatigue, il a pu se lever tôt grâce au chant des oiseaux', 'Ata ko lemba, kasi alamuki tongo pona ko yemba ya ba ndeke.', 136),
    (l3_6, 'Merci car je m''en sors dans ma vie grâce à toi', 'Matondo po na zo koka ko bika na bomoyi pona yo.', NULL, NULL, 137),
    (l3_6, 'À cause de', 'Pona', 'Je n''arrive pas à dormir à cause du bruit dehors', 'Na zo koka ko lala te pona makelele libanda.', 138),
    (l3_6, 'Ils se sont fâchés à cause de nous', 'Ba siliki pona biso.', NULL, NULL, 139),
    (l3_6, 'Beaucoup', 'Ebele', 'Beaucoup de personnes sont malhonnêtes', 'Bato ebele ba za na bosolo te.', 140),
    (l3_6, 'Elle a épluché beaucoup de bananes', 'Alongoli poso na makemba ebele.', NULL, NULL, 141),
    (l3_6, 'Vous avez beaucoup fait pour nous, merci.', 'Bo sali mingi pona biso, matondo.', NULL, NULL, 142),
    (l3_6, 'Très', 'Penza', 'Il est très méchant', 'Aza mabe penza.', 143),
    (l3_6, 'Elle a très bien cuisiné', 'Alambi malamu penza.', NULL, NULL, 144),
    (l3_6, 'Trop', 'Mingi', 'Il est trop gros pour passer ici, il mange trop.', 'Aza monene mingi pona ko leka awa, aliaka mingi.', 145),
    (l3_6, 'Peu', 'Mokie', 'Elle mange peu puisqu''elle ne veut pas grossir', 'Aliaka mokie po alingi avimba te.', 146),
    (l3_6, 'Prends un peu de sauce, voici la cuillère.', 'Zwa supu mokie, tala lutu.', NULL, NULL, 147),
    (l3_6, 'Elle est timide, elle sourit un peu quand je la taquine.', 'Aza kimia, asekaka mokie soki na tumboli ye.', NULL, NULL, 148),
    (l3_6, 'Tellement', 'Mingi', 'Il a tellement dépensé qu''il ne lui reste pas assez pour payer le taxi pour rentrer chez lui.', 'Abimisi mbongo mingi yango atikali lisusu na ekolo te pona ko futa taksi eko mema ye na ndako.', 149),
    (l3_6, 'Elle est tellement belle qu''elle nous rend tous bêtes', 'Aza kitoko mingi akomisaka biso nionso ba zoba.', NULL, NULL, 150);

  INSERT INTO lesson_items (lesson_id, french, dialect, example_french, example_dialect, item_order) VALUES
    (l3_6, 'Environ', 'Na', 'Elle a vendu pour environ 10 000 francs aujourd''hui.', 'Ateki ko pusana na 10 000 lelo.', 151),
    (l3_6, 'Vraiment', 'Penza', 'Elle a vraiment peur de lui.', 'Aza penza na bomo na ye.', 152),
    (l3_6, 'Aussi', 'Pe', 'Elle travaille au marché. Moi aussi.', 'Asalaka na zando. Ngai pe.', 153),
    (l3_6, 'Nous vivons à Pointe-Noire. Elle aussi.', 'To fandaka na Pointe-Noire. Na ye pe.', NULL, NULL, 154),
    (l3_6, 'Elle est aussi grande que toi.', 'Aza molayi lokola yo.', NULL, NULL, 155),
    (l3_6, 'Même', 'Ata', 'Tout le monde nous a félicité, même notre ennemi Njitap.', 'Bato nionso ba kumisi biso, ata monguna na biso Njitap.', 156),
    (l3_6, 'Elle porte la même robe que moi', 'Alati lopo moko na ngai.', NULL, NULL, 157),
    (l3_6, 'Même si elle n''aime pas la nourriture elle mange quand même', 'Ata alingi bilia te aliaka kaka.', NULL, NULL, 158),
    (l3_6, 'Je ne ferai jamais ça même si tu me payes', 'Na ko sala yango te ata ofuti ngai.', NULL, NULL, 159),
    (l3_6, 'Elle est quand même venue au deuil malgré qu''elle ne parle plus à sa famille.', 'Aye kaka na matanga ata alobisaka lisusu libota na ye te.', NULL, NULL, 160),
    (l3_6, 'Autre', 'Mosusu', 'Cette assiette est cassée, va en chercher une autre s''il-te-plaît.', 'Sani oyo epasuki, kende oluka mosusu limbisa.', 161),
    (l3_6, 'Il faut penser aux autres', 'Esengeli ko kanisa na ba misusu.', NULL, NULL, 162),
    (l3_6, 'Va dire ça à quelqu''un d''autre', 'Kende oloba yango na moto mosusu.', NULL, NULL, 163),
    (l3_6, 'Certaines personnes aiment les chiens, d''autres aiment les chats', 'Bato mosusu ba lingi ba mbwa, misusu ba lingi ba niao.', NULL, NULL, 164),
    (l3_6, 'Presque', 'Esi kaka', 'Je suis presque arrivé. J''ai presque fini.', 'Esi na komi kaka. Esi na silisi.', 165),
    (l3_6, 'Je suis presque tombé (j''ai failli tomber)', 'Na lingaki na kweya.', NULL, NULL, 166),
    (l3_6, 'Elle est presque adulte', '/', NULL, NULL, 167),
    (l3_6, 'Sinon', 'Soki te', 'J''ai eu peur quand bandit m''a dit : « donne-moi l''argent sinon je te tue. »', 'Na yoki bomo tango kuluna alobi : « pesa ngai mbongo soki te na ko boma yo ».', 168),
    (l3_6, 'Ensemble', 'Elongo', 'Mangeons ensemble.', 'To lia elongo.', 169),
    (l3_6, 'Ils restent toujours ensemble.', 'Ba zalaka kaka elongo.', NULL, NULL, 170),
    (l3_6, 'Et', 'Pe', 'Je dois rentrer pour faire le ménage et faire la cuisine.', 'Esengeli na zonga po na bongisa ndako pe na lamba.', 171),
    (l3_6, 'On attend Femelie et Esther.', 'To zo zela Femelie pe Esther.', NULL, NULL, 172),
    (l3_6, 'Malgré', 'Kasi', 'Malgré nos conseils il est quand même parti se baigner au lac et a failli se noyer', 'To pesi ye toli kasi ake kaka ko sokola na ebale pe alingaki adinda.', 173),
    (l3_6, 'Étant donné', 'Po', 'Je me méfie de lui étant donné qu''il a déjà tué quelqu''un', 'Na zo banga ye po esi aboma moto.', 174),
    (l3_6, 'Par rapport à', 'Ko leka', 'Cette année les récoltes ont diminué par rapport à l''année dernière.', 'Mbula oyo bilanga ekiti ko leka mbula oyo eleki.', 175),
    (l3_6, 'Je suis gêné par rapport à Naya car je sais où son mari était hier.', 'Na za na soni pona Naya po na yebi esika mobali na ye azalaki lobi.', NULL, NULL, 176),
    (l3_6, 'Je', 'Na', 'Je suis perdu', 'Na bungi.', 177),
    (l3_6, 'Tu', 'O', 'Tu aimes trop la viande', 'Olingi ngombe mingi.', 178),
    (l3_6, 'Il/Elle', 'A', 'Il/Elle laisse ses enfants avec les autres', 'Atiki bana na ye na bana misusu.', 179),
    (l3_6, 'Nous', 'To', 'Nous finissons nos assiettes', 'To zo silisa bilia na biso.', 180),
    (l3_6, 'Vous', 'Bo', 'Vous saluez tout le monde', 'Bo pesa bato nionso mbote.', 181),
    (l3_6, 'Ils/Elles', 'Ba', 'Ils supportent la douleur', 'Ba kangaka pasi.', 182),
    (l3_6, 'Moi', 'Nga / Ngai', 'Elle ne veut plus de moi', 'Alingi lisusu ngai te.', 183),
    (l3_6, 'Toi', 'Yo', 'Elle ne veut plus de toi', 'Alingi lisusu yo te.', 184),
    (l3_6, 'Lui', 'Ye', 'Elle ne veut plus de lui', 'Alingi lisusu ye te.', 185),
    (l3_6, 'Elle', 'Ye', 'J''achète ça pour elle', 'Na zo somba yango pona ye.', 186),
    (l3_6, 'Nous', 'Biso', 'Elle ne veut plus de nous', 'Alingi lisusu biso te.', 187),
    (l3_6, 'Vous', 'Bino', 'J''achète ça pour vous', 'Na zo somba yango pona bino.', 188),
    (l3_6, 'Ils', 'Bango', 'J''achète ça pour eux', 'Na zo somba yango pona bango.', 189),
    (l3_6, 'J''achète ça pour elles', 'Na zo somba yango pona bango.', NULL, NULL, 190),
    (l3_6, 'Me', 'Mi', 'Je me pince', 'Na zo mi fina.', 191),
    (l3_6, 'Te', 'Mi', 'Tu te pinces', 'Ozo mi fina.', 192),
    (l3_6, 'Se (masculin singulier)', 'Mi', 'Il se pince', 'Azo mi fina.', 193),
    (l3_6, 'Se (féminin singulier)', 'Mi', 'Elle se pince', 'Azo mi fina.', 194),
    (l3_6, 'Nous', 'Mi', 'Nous nous pinçons', 'To zo mi fina.', 195),
    (l3_6, 'Vous', 'Mi', 'Vous vous pincez', 'Bo zo mi fina.', 196),
    (l3_6, 'Se (masculin pluriel)', 'Mi', 'Ils se pincent', 'Ba zo mi fina.', 197),
    (l3_6, 'Se (féminin pluriel)', 'Mi', 'Elles se pincent', 'Ba zo mi fina.', 198),
    (l3_6, 'Me (m'')', 'Nga', 'Elle m''a giflé', 'Abeti nga mbata.', 199),
    (l3_6, 'Te (t'')', 'Yo', 'Elle t''a giflé', 'Abeti yo mbata.', 200);

  INSERT INTO lesson_items (lesson_id, french, dialect, example_french, example_dialect, item_order) VALUES
    (l3_6, 'Le/La/L''', 'Ye', 'Je l''ai accompagnée chez elle', 'Na tiki ye epai na ye.', 201),
    (l3_6, 'Nous', 'Biso', 'Tout le monde vous aime, mais vous nous détestez', 'Bato nionso ba lingaka bino, kasi bino bo yinaka biso.', 202),
    (l3_6, 'Vous', 'Bino', 'Tout le monde vous aime, mais vous nous détestez', 'Bato nionso ba lingaka bino, kasi bino bo yinaka biso.', 203),
    (l3_6, 'Les', 'Bango', 'Nous les aimons', 'To lingi bango.', 204),
    (l3_6, 'Moi', 'Ngai', 'Donne-moi l''argent', 'Pesa ngai mbongo oyo.', 205),
    (l3_6, 'Toi', 'Mi', 'Pince-toi pour avoir de la chance', 'Mi fina po ko zua lupemba.', 206),
    (l3_6, 'Lui', 'Ye', 'Donne-lui l''argent', 'Pesa ye mbongo oyo.', 207),
    (l3_6, 'En', 'Yango', 'Il reste du pain, prenez-en', 'Etikali mapa, bo zua yango.', 208),
    (l3_6, 'Y', 'Kuna', 'Vous êtes au champ, restez-y jusqu''au soir', 'Bo za na bilanga, bo tikala kuna ti na pokwa.', 209),
    (l3_6, 'Nous', 'Biso', 'Rendez-nous l''argent', 'Bo zongisela biso mbongo.', 210),
    (l3_6, 'Vous', 'Mi', 'Pincez-vous pour avoir de la chance', 'Bo mi fina pona ko zua lupemba.', 211),
    (l3_6, 'Leur', 'Bango', 'Rendez leur l''argent.', 'Bo zongisa bango mbongo.', 212),
    (l3_6, 'Mon', 'Na ngai', 'Mon grand frère est grand', 'Yaya na ngai ya mobali aza molayi.', 213),
    (l3_6, 'Ma', 'Na ngai', 'Ma sœur est grande', 'Ndeko na ngai ya mwasi aza molayi.', 214),
    (l3_6, 'Mes', 'Na ngai', 'Mes enfants sont sages', 'Bana na ngai ba za kimia.', 215),
    (l3_6, 'Mienne', 'Ya ngai', 'A qui appartient cette maison ? C''est la mienne', 'Eza ya nani ndako oyo ? Eza ya ngai.', 216),
    (l3_6, 'Miens', 'Ya ngai', 'A qui sont ces vêtements ? Ce sont les miens', 'Eza ya nani bilamba oyo ? Eza ya ngai.', 217),
    (l3_6, 'Tienne', 'Ya yo', 'A qui appartient cette maison ? C''est la tienne', 'Eza ya nani ndako oyo ? Eza ya yo.', 218),
    (l3_6, 'Tiens', 'Ya yo', 'A qui sont ces vêtements ? Ce sont les tiens', 'Eza ya nani bilamba oyo ? Eza ya yo.', 219),
    (l3_6, 'Sienne', 'Ya ye', 'A qui appartient cette maison ? C''est la sienne', 'Eza ya nani ndako oyo ? Eza ya ye.', 220),
    (l3_6, 'Siens', 'Ya ye', 'A qui sont ces vêtements ? Ce sont les siens', 'Eza ya nani bilamba oyo ? Eza ya ye.', 221),
    (l3_6, 'Nôtre', 'Ya biso', 'A qui appartient cette maison ? C''est la nôtre', 'Eza ya nani ndako oyo ? Eza ya biso.', 222),
    (l3_6, 'Nôtres', 'Ya biso', 'A qui sont ces vêtements ? Ce sont les nôtres', 'Eza ya nani bilamba oyo ? Eza ya biso.', 223),
    (l3_6, 'Vôtre', 'Ya bino', 'A qui appartient cette maison ? C''est la vôtre', 'Eza ya nani ndako oyo ? Eza ya bino.', 224),
    (l3_6, 'Vôtres', 'Ya bino', 'A qui sont ces vêtements ? Ce sont les vôtres', 'Eza ya nani bilamba oyo ? Eza ya bino.', 225),
    (l3_6, 'Sienne', 'Ya ye', 'A qui appartient cette maison ? C''est la sienne', 'Eza ya nani ndako oyo ? Eza ya ye.', 226),
    (l3_6, 'Leurs', 'Ya bango', 'A qui sont ces vêtements ? Ce sont les leurs', 'Eza ya nani bilamba oyo ? Eza ya bango.', 227),
    (l3_6, 'Cet', 'Oyo', 'Cet enfant n''écoute rien.', 'Mwana oyo azo yoka eloko te.', 228),
    (l3_6, 'Cette', 'Oyo', 'Cette porte ne s''ouvre plus.', 'Ekuke oyo ezo fungwama lisusu te.', 229),
    (l3_6, 'Ces', 'Oyo', 'Ces moustiques m''empêchent de dormir. J''ai peur qu''ils me piquent.', 'Ba ngungi oyo ba zo pekisa nga ko lala. Na za na bomo ba swa nga.', 230),
    (l3_6, 'Ce', '(Oyo)', 'Ce (ceci) n''est pas le bon chemin.', 'Oyo eza nzela malamu te.', 231),
    (l3_6, 'C''', '/', 'C''est beau.', 'Eza kitoko.', 232),
    (l3_6, 'Celui/Celle', 'Oyo', 'Celui/celle qui cherche les problèmes sera malheureux(se).', 'Oyo azo luka makambo ako zanga kimia.', 233),
    (l3_6, 'Celui/Celle-là', 'Oyo', 'Tu choisis lequel ? Je veux celui/celle-là', 'Oponi oyo wapi ? Na lingi oyo.', 234),
    (l3_6, 'Ceux', 'Ba oyo', 'Il est généreux avec les enfants, surtout ceux qui travaillent bien à l''école.', 'Aza malamu na bana, mingi na ba oyo ba za mayele na kelasi.', 235),
    (l3_6, 'Ceux-là/ci', 'Bango', 'Quels enfants ont volé le maïs ? C''est ceux/celles-là', 'Bana nini ba yibi masangu ? Eza bango.', 236),
    (l3_6, 'Ça', 'Yango', 'Laisse ça !', 'Tika yango !', 237);

  -- Module 4.1 Le marche et l'argent (11 items)
  INSERT INTO lesson_items (lesson_id, french, dialect, example_french, example_dialect, item_order) VALUES
    (l4_1, 'Combien ça coûte ?', 'Eza talo boni ?', NULL, NULL, 1),
    (l4_1, 'C''est trop cher', 'Eza talo makasi.', NULL, NULL, 2),
    (l4_1, 'C''est bon marché', 'Talo eza malamu.', NULL, NULL, 3),
    (l4_1, 'Je suis perdu. Pouvez-vous m''aider à trouver mon chemin ?', 'Na bungi. Bo koki ko sunga ngai na zonga na nzela ?', NULL, NULL, 4),
    (l4_1, 'Argent', 'Ebende', 'Ce collier en argent est cher', 'Singa ya ebende oyo eza talo.', 5),
    (l4_1, 'Prix', 'Talo', 'J''ai payé le double du prix habituel', 'Na futi talo mibale ko leka oyo na futaka liboso.', 6),
    (l4_1, 'Acheter', 'Ko somba', 'J''ai acheté beaucoup trop de bonbons !', 'Na sombi biloko ya sukali mingi!', 7),
    (l4_1, 'Vendre', 'Ko teka', 'Elle vend des oignons au marché', 'Atekaka matungulu na zando.', 8),
    (l4_1, 'Payer', 'Ko futa', 'J''ai payé cher pour rénover ma maison.', 'Na futi talo pona ko bongisa ndako na nga.', 9),
    (l4_1, 'Changement', 'Bongwana', 'On espère du changement', 'To kanisi na bongwana.', 10),
    (l4_1, 'Peser', 'Mukinza', 'On doit peser ce sac pour connaître son prix.', 'Esengeli to zua kilo ya libenga oyo pona ko yeba talo nango.', 11);

  -- Module 4.2 La nature et les animaux (75 items)
  INSERT INTO lesson_items (lesson_id, french, dialect, example_french, example_dialect, item_order) VALUES
    (l4_2, 'Abeille', 'Nzoyi', 'Les abeilles fabriquent le miel dans leur nid', 'Ba nzoyi ba salaka mafuta na bango na zala.', 1),
    (l4_2, 'Animal', 'Niama', 'Avant j''avais peur de tous les animaux', 'Liboso na zalaka na bomo ya ba niama nionso.', 2),
    (l4_2, 'Araignée', 'Alulu', 'Une araignée a 8 pattes', 'Alulu moko aza na makolo mwambe.', 3),
    (l4_2, 'Bœuf / Vache', 'Ngombe', 'Sa famille a demandé un bœuf pour la dot. Le petit de la vache et du taureau est le veau', 'Libota na ye esengi ngombe pona libala na ye.', 4),
    (l4_2, 'Chat', 'Niawu', 'Ce chat a toujours été fou', 'Niawu oyo azalaka kaka liboma.', 5),
    (l4_2, 'Chenille / Vers', 'Mbinzo', 'Certaines chenilles se transforment en papillon', 'Ba mbinzo misusu ekomaka kipekapeka.', 6),
    (l4_2, 'Cheval', 'Punda', 'On utilise parfois la queue de cheval dans nos traditions', 'To salelaka tango mosusu mokila ya punda na bokoko na biso.', 7),
    (l4_2, 'Chèvre', 'Ntaba', 'On a tué la chèvre pour le deuil', 'Ba bomi ntaba pona ko longola pili.', 8),
    (l4_2, 'Chien', 'Mbwa', 'Le chien est le meilleur ami de l''homme, il est même capable de guider un aveugle', 'Mbwa aza moninga malamu ya moto, akoki kutu ko mema moto amonaka te.', 9),
    (l4_2, 'Coq', 'Soso', 'Le coq nous réveille tous les matins en chantant dès le lever du soleil.', 'Soso alamusaka biso mikolo nionso na loyembo soki tongo etani.', 10),
    (l4_2, 'Crocodile', 'Ngando', 'Le crocodile vit sous l''eau et sur terre', 'Ngando afandaka na mayi pe na mabele.', 11),
    (l4_2, 'Éléphant', 'Nzoko', 'La peau de l''éléphant est très épaisse', 'Loposo ya nzoko eza monene mingi.', 12),
    (l4_2, 'Fourmi', 'Nselele', 'Les fourmis travaillent toutes ensemble.', 'Ba nselele ba salaka nionso elongo.', 13),
    (l4_2, 'Girafe', 'Dikala', 'Les girafes ont des tâches et leur cou est long', 'Ba dikala ba za na bilembo pe na kingo molayi.', 14),
    (l4_2, 'Grenouille', 'Ligorodo', 'La grenouille glisse beaucoup quand on l''attrape', 'Ligorodo asielumuka mingi soki ba lingi ba kanga ye.', 15),
    (l4_2, 'Hérisson', 'Hérisson', 'Les hérissons sont couverts de pics', 'Ba hérissons ba zipami na ba songe.', 16),
    (l4_2, 'Insectes', 'Niama mikiemikie', 'Je n''aime pas les insectes', 'Na lingaka ba niama mikiemikie te.', 17),
    (l4_2, 'Lézard', 'Moselekete (miselekete)', 'Les lézards sont difficiles à attraper car ils sont trop rapides', 'Ba miselekete ba za pasi na ko kanga po ba za mbango mingi.', 18),
    (l4_2, 'Lion', 'Nkosi', 'Le lion domine la brousse', 'Nkosi akonzaka zamba.', 19),
    (l4_2, 'Mouche', 'Nzinzi', 'Ces mouches aiment trop la saleté', 'Ba nzinzi oyo ba lingi mbindo mingi.', 20),
    (l4_2, 'Moustique', 'Ngungi', 'Les moustiques m''ont piqué toute la nuit et empêché de dormir correctement.', 'Ba ngungi ba swi ngai butu nionso pe ba zangisi ngai pongi malamu.', 21),
    (l4_2, 'Mouton', 'Ntaba', 'Ils élèvent des moutons pour tisser leur fourrure', 'Ba bokolaka ba ntaba pona ko tonga ba suki na bango.', 22),
    (l4_2, 'Oiseau', 'Ndeke', 'Les oiseaux peuvent voler très loin, jusqu''à d''autres pays', 'Ba ndeke ba koki ko pumbwa mosika makasi, kino na ba mboka misusu.', 23),
    (l4_2, 'Panthère', 'Nkoi', 'La panthère est très forte', 'Nkoi aza makasi penza.', 24),
    (l4_2, 'Papillon', 'Lipekapeka', 'Les papillons ont beaucoup de couleurs', 'Lipekapeka eza na ba langi ebele.', 25),
    (l4_2, 'Poisson', 'Mbisi', 'Écailler et vider le poisson prend du temps', 'Ko bongisa pe ko longola mbindo ya mbisi ezuaka tango mingi.', 26),
    (l4_2, 'Porc-épic', 'Kunda', 'La viande de porc-épic est très prisée des voyageurs', 'Ba paya ba lingi mingi niama ya zamba.', 27),
    (l4_2, 'Porc/Cochon', 'Ngulu', 'Certains peuples ne mangent pas de porc', 'Bikolo misusu ba liaka ngulu te.', 28),
    (l4_2, 'Poule / Poulet', 'Soso', 'Le poulet ne sait pas voler.', 'Soso ayebi ko pumbwa te.', 29),
    (l4_2, 'Rat', 'Mpoko', 'On trouve les rats dans les champs ou dans le caniveau', 'Ba mpoko ba za na kati ya bilanga pe na kati ya caniveaux.', 30),
    (l4_2, 'Serpent', 'Nioka', 'Le serpent a étranglé le rat', 'Nioka aswi mpoko.', 31),
    (l4_2, 'Singe', 'Makaku (likaku)', 'Le singe ressemble à l''homme', 'Makaku aza lokola moto.', 32),
    (l4_2, 'Souris', 'Mpoko', 'La souris se cache dans son trou', 'Mpoko azo bomba na libumu na ye.', 33),
    (l4_2, 'Tortue', 'Koba', 'La tortue est lente', 'Koba atambolaka malembe.', 34),
    (l4_2, 'Air', 'Mopepe', 'L''homme a besoin d''air pour respirer', 'Mutu aza na posa ya mopepe pona ko pema.', 35),
    (l4_2, 'Après-midi', 'Sima ya nzanga', 'L''après-midi il fait trop chaud pour travailler au soleil', 'Na sima ya nzanga molunge eza makasi mingi pona ko sala na se ya moyi.', 36),
    (l4_2, 'Argile', 'Mabele', 'Ce pot est fait d''argile', 'Kopo oyo esalami na mabele.', 37),
    (l4_2, 'Bois', 'Nkoni', 'Les hommes partent ramasser du bois sec pour alimenter le feu', 'Mibali ba kendeke ko lokota nkoni ya ko yoma pona ko pelisa moto.', 38),
    (l4_2, 'Brouillard', 'Londende', 'Le brouillard m''empêche de voir correctement devant moi', 'Londende ezo kanga ngai na zo mona liboso na ngai te.', 39),
    (l4_2, 'Caillou', 'Libanga', 'Il nous apprend à tuer le rat en lui lançant un caillou', 'Azo lakisa biso ndenge ya ko boma poko na libanga.', 40),
    (l4_2, 'Chaleur', 'Molunge', 'La chaleur m''empêche de dormir', 'Molunge ezo zangisa ngai mpongi.', 41),
    (l4_2, 'Ciel', 'Likolo', 'Le ciel est au-dessus de nos têtes', 'Likolo eza likolo ya mitu na biso.', 42),
    (l4_2, 'Eau', 'Mayi', 'On garde toujours un seau d''eau à la maison au cas où on doit éteindre un feu', 'To bombaka kantini moko ya mayi na ndako pona ko boma moto.', 43),
    (l4_2, 'Éclair', 'Nkake', 'L''éclair nous a éclairé dans la nuit', 'Nkake engengisi biso na kati kati ya butu.', 44),
    (l4_2, 'Étoile', 'Monzoto (minzoto)', 'La nuit on voit un millier d''étoiles dans le ciel', 'Na butu to monaka minzoto ebele na lola.', 45),
    (l4_2, 'Fer', 'Libende', 'Les objets en fer sont lourds et solides', 'Biloko ya libende eza kilo pe makasi.', 46),
    (l4_2, 'Feu', 'Moto', 'Une braise sur un bout de bois peut raviver un feu', 'Ko tumba likolo ya moto ya koni ekoki ko pelisa moto makasi.', 47),
    (l4_2, 'Froid', 'Malili', 'Je me couvre pour me protéger du froid', 'Na mizipi pona malili ekanga ngai te.', 48),
    (l4_2, 'Jour', 'Mokolo', 'Le jour ne dure pas longtemps en ce moment.
Le jour où je serai riche je sortirai la famille de la galère', 'Mokolo ezo wumela te sikoyo. Mokolo no ko zala na mbongo ebele na ko bimisa libota na ngai na pasi.', 49),
    (l4_2, 'Lune', 'Sanza', 'Nous nous sommes repérés grâce à la lune', 'To yebaki nzela pona sanza.', 50);

  INSERT INTO lesson_items (lesson_id, french, dialect, example_french, example_dialect, item_order) VALUES
    (l4_2, 'Matin', 'Tongo', 'Avez-vous beaucoup de choses à faire demain matin ?', 'Bo za na biloko ebele ya ko sala lobi ?', 51),
    (l4_2, 'Midi', 'Ngonga zomi na mibale', 'Au travail, on fait une pause à midi pour manger.', 'Na mosala to pemaka sima ya ngonga zomi na mibale pona ko lia.', 52),
    (l4_2, 'Minuit', 'Kati kati ya butu', 'À minuit, nous sortons dehors regarder les étoiles', 'Na kati kati ya butu, to bimaka libanda pona ko tala minzoto.', 53),
    (l4_2, 'Nuage', 'Lipata (mapata)', 'Les nuages cachent le soleil aujourd''hui', 'Mapata ezo kanga moyi lelo.', 54),
    (l4_2, 'Nuit', 'Butu', 'La nuit porte conseil', 'Butu eteyaka.', 55),
    (l4_2, 'Or', 'Wolo', 'Son collier en or est très cher', 'Singa na ye ya kingo ya wolo eza talo mingi.', 56),
    (l4_2, 'Pluie', 'Mvula', 'On récolte l''eau de pluie', 'To zuaka mayi ya mvula.', 57),
    (l4_2, 'Rocher', 'Libanga', 'Cette maison est construite sur un rocher', 'Ndako oyo etongami likolo ya libanga.', 58),
    (l4_2, 'Sable', 'Zelo', 'On a besoin de sable et de ciment pour construire une maison', 'To za na posa ya zelo pe na ciment pona ko tonga ndako.', 59),
    (l4_2, 'Saison des pluies', 'Tango ya mvula', 'On plante les arachides pendant la saison des pluies', 'Ba lonaka nguba na tango ya mvula.', 60),
    (l4_2, 'Saison sèche', 'Elanga', 'On récolte les arachides pendant la saison sèche', 'Ba buka nguba na elanga.', 61),
    (l4_2, 'Soir', 'Pokwa', 'Le soir au village les aînés nous racontent des histoires autour du feu', 'Na butu na mboka mikolo ba betelaka biso masolo nzinga nzinga na moto.', 62),
    (l4_2, 'Soleil', 'Moyi', 'Le soleil m''éblouit', 'Moyi engengisi ngai.', 63),
    (l4_2, 'Tempête', 'Mopepe', 'Vous devez partir avant ce soir car il y souvent des tempêtes la nuit.', 'Esengeli bo kende yango pokwa ekoma po na butu ezalaka mingi na mopepe.', 64),
    (l4_2, 'Temps', 'Likolo', 'Nous n''avons pas pu sortir aujourd''hui à cause du mauvais temps', 'To bimi te lelo po na likolo eza mabe.', 65),
    (l4_2, 'Terre', 'Mabele', 'On vient sur la terre pour être heureux et faire le bien', 'To yaka na mabele pona ko zala na esengo pe ko sala bolamu.', 66),
    (l4_2, 'Tonnerre', 'Nkake', 'Elle a sursauté quand elle a entendu le tonnerre', 'Abangi tango ayoki nkake.', 67),
    (l4_2, 'Vent', 'Mopepe', 'Vous souffrez depuis que le vent a arraché le toit de votre maison', 'Bo zo mona pasi banda mopepe emema bino motando ya ndako.', 68),
    (l4_2, 'Verre', 'Kopo', 'Le verre est transparent et fragile', 'Kopo eza polele pe pete.', 69),
    (l4_2, 'Il fait beau aujourd''hui', 'Lelo mokolo kitoko.', NULL, NULL, 70),
    (l4_2, 'Quel temps fera-t-il demain ?', 'Lobi tango eko sala ndenge nini ?', NULL, NULL, 71),
    (l4_2, 'Il pleut', 'Mvula ezo noka.', NULL, NULL, 72),
    (l4_2, 'Il fait beau', 'Tango eza kitoko.', NULL, NULL, 73),
    (l4_2, 'Il fait chaud', 'Mulunge eza.', NULL, NULL, 74),
    (l4_2, 'Il fait froid', 'Malili eza.', NULL, NULL, 75);

  -- Module 4.3 Proverbes PLACEHOLDER (3 items)
  INSERT INTO lesson_items (lesson_id, french, dialect, example_french, example_dialect, item_order) VALUES
    (l4_3, '[PLACEHOLDER] Proverbe 1 - REQUIERT SAISIE DU PROFESSEUR', '[A COMPLETER]', NULL, NULL, 1),
    (l4_3, '[PLACEHOLDER] Proverbe 2 - REQUIERT SAISIE DU PROFESSEUR', '[A COMPLETER]', NULL, NULL, 2),
    (l4_3, '[PLACEHOLDER] Proverbe 3 - REQUIERT SAISIE DU PROFESSEUR', '[A COMPLETER]', NULL, NULL, 3);

  -- Module 4.4 Raconter une histoire PLACEHOLDER (3 items)
  INSERT INTO lesson_items (lesson_id, french, dialect, example_french, example_dialect, item_order) VALUES
    (l4_4, '[PLACEHOLDER] Narration 1 - REQUIERT SAISIE DU PROFESSEUR', '[A COMPLETER]', NULL, NULL, 1),
    (l4_4, '[PLACEHOLDER] Narration 2 - REQUIERT SAISIE DU PROFESSEUR', '[A COMPLETER]', NULL, NULL, 2),
    (l4_4, '[PLACEHOLDER] Narration 3 - REQUIERT SAISIE DU PROFESSEUR', '[A COMPLETER]', NULL, NULL, 3);

  -- Module 4.5 La ville et les lieux (29 items)
  INSERT INTO lesson_items (lesson_id, french, dialect, example_french, example_dialect, item_order) VALUES
    (l4_5, 'Blanc', 'Pembe', 'Les nuages sont blancs', 'Mapata eza pembe.', 1),
    (l4_5, 'Bleu', 'Bozinga', 'Le ciel est bleu', 'Likolo eza bozinga.', 2),
    (l4_5, 'Clair', 'Motane', 'Ce petit est plus clair que son grand frère', 'Mwana oyo aza motane ko leka yaya na ye.', 3),
    (l4_5, 'Jaune', 'Mosaka', 'L''urine est jaune', 'Basuba eza na langi ya mosaka.', 4),
    (l4_5, 'Noir', 'Moyindo', 'Mes cheveux sont noirs', 'Ba suki na nga eza moyindo.', 5),
    (l4_5, 'Orange', 'Lilala', 'La mangue est orange', 'Manga eza na langi ya lilala.', 6),
    (l4_5, 'Rouge', 'Motane', 'Le sang est rouge', 'Makila eza na langi ya motane.', 7),
    (l4_5, 'Sombre/Foncé', 'Moyindo', 'Elle est plus foncée que sa mère', 'Aza moyindo ko leka mama na ye.', 8),
    (l4_5, 'Vert', 'Pondu', 'L''herbe est verte', 'Matiti eza na langi ya pondu.', 9),
    (l4_5, 'Violet', 'Longondo', 'La prune est violette', 'Prune eza na langi ya longondo.', 10),
    (l4_5, 'Bague', 'Lopete', 'Son mari lui a mis sa bague de fiançailles', 'Molongani na ye alatisi ye lopete ya libala.', 11),
    (l4_5, 'Bracelet', 'Mayaka', 'Qui t''a offert ce bracelet ? Ton amie ?', 'Nani abonzeli yo mayaka ya loboko oyo ? Moninga na yo ?', 12),
    (l4_5, 'Caleçon', 'Bilamba ya kati', 'On change de caleçon tous les jours', 'To bongolaka bilamba ya kati mikolo nionso.', 13),
    (l4_5, 'Chapeau', 'Ekoti', 'Mon chapeau est trop serré', 'Ekoti na nga ekangi nga mingi.', 14),
    (l4_5, 'Chaussures', 'Ba sapatu', 'Est-ce que tu as vu leurs chaussures ?', 'Omoni ba sapatu na bango ?', 15),
    (l4_5, 'Chemise', 'Simisi', 'Il attache sa chemise jusqu''en haut pour aller travailler', 'Akangaka simisi na ye ti na likolo pona ko kende mosala.', 16),
    (l4_5, 'Collier', 'Mayaka', 'J''ai le même collier que toi', 'Na za na mayaka lolenge moko na ya yo.', 17),
    (l4_5, 'Foulard', 'Kitambala', 'Elle a un foulard sur sa tête', 'Aza na kitambala na mutu na ye.', 18),
    (l4_5, 'Grand / Petit', 'Monene / Mingi', 'Ça ne te va pas, c''est trop grand / c''est trop petit.', 'Ezo koka yo te, eza monene mingi / eza mokie mingi.', 19),
    (l4_5, 'Lunettes', 'Maneti', 'Mes lunettes sont sales, je dois les laver', 'Maneti eza mbindo, esengeli na sokola yango.', 20),
    (l4_5, 'Pagne', 'Liputa (maputa)', 'Nos mamans sont souvent en pagne', 'Ba mama na biso ba lataka mingi maputa.', 21),
    (l4_5, 'Pantalon', 'Mbati', 'Mon argent est dans la poche de mon pantalon', 'Mbongo na ngai eza na libenga ya mbati na ngai.', 22),
    (l4_5, 'Parapluie', 'Ebombamelo mbula', 'Je sors toujours avec mon parapluie', 'Na bimaka tango nionso na ebombamelo mbula na ngai.', 23),
    (l4_5, 'Sandales', 'Mapapa', 'Je portes les sandales quand il fait chaud', 'Na lataka mapapa na tango ya moyi.', 24),
    (l4_5, 'Short', 'Mugondo', 'J''aime ce short', 'Na lingi mugondo oyo.', 25),
    (l4_5, 'T-shirt', 'Elamba ya likolo', 'Mon t-shirt est sale', 'Elamba na nga ya likolo eza mbindo.', 26),
    (l4_5, 'Veste', 'Kazaka', 'Cette veste me protège du vent', 'Kazaka oyo ezo batela nga na malili.', 27),
    (l4_5, 'Vêtement / Habit', 'Elamba (bilamba)', 'Ses vêtements sont déchirés', 'Bilamba na ye epasuki.', 28),
    (l4_5, 'Citer quelques vêtements traditionnels', 'Raphia', 'Vêtement porté par les rois et certains chefs coutumiers', NULL, 29);

  -- Module 5.1 Registres PLACEHOLDER (3 items)
  INSERT INTO lesson_items (lesson_id, french, dialect, example_french, example_dialect, item_order) VALUES
    (l5_1, '[PLACEHOLDER] Registres 1 - REQUIERT SAISIE DU PROFESSEUR', '[A COMPLETER]', NULL, NULL, 1),
    (l5_1, '[PLACEHOLDER] Registres 2 - REQUIERT SAISIE DU PROFESSEUR', '[A COMPLETER]', NULL, NULL, 2),
    (l5_1, '[PLACEHOLDER] Registres 3 - REQUIERT SAISIE DU PROFESSEUR', '[A COMPLETER]', NULL, NULL, 3);

  -- Module 5.2 Debats et opinions (22 items)
  INSERT INTO lesson_items (lesson_id, french, dialect, example_french, example_dialect, item_order) VALUES
    (l5_2, 'Je sais', 'Na yebi.', NULL, NULL, 1),
    (l5_2, 'Je ne sais pas', 'Na yebi te.', NULL, NULL, 2),
    (l5_2, 'D''accord / Je suis d''accord', 'Malamu / Na ndimi', NULL, NULL, 3),
    (l5_2, 'Je ne suis pas d''accord', 'Na ndimi te.', NULL, NULL, 4),
    (l5_2, 'Tu as raison', 'Oza na motindo.', NULL, NULL, 5),
    (l5_2, 'Tu as tort', 'Oza na foti.', NULL, NULL, 6),
    (l5_2, 'Je ne suis pas sûr', 'Na ndimi te.', NULL, NULL, 7),
    (l5_2, 'C''est vrai', 'Eza solo.', NULL, NULL, 8),
    (l5_2, 'C''est faux', 'Eza lokuta.', NULL, NULL, 9),
    (l5_2, 'J''aime courir', 'Na lingaka ko kima.', NULL, NULL, 10),
    (l5_2, 'Je déteste ce plat', 'Na lingaka bilia oyo te.', NULL, NULL, 11),
    (l5_2, 'Quelle est ta musique préférée ?', 'Olingaka ndule nini ?', NULL, NULL, 12),
    (l5_2, 'J''aime la viande mais je préfère le poisson', 'Na lingaka ngombe kasi na poni mbisi.', NULL, NULL, 13),
    (l5_2, 'Bonne idée / mauvaise idée', 'Likanisi malamu / Likanisi mabe', NULL, NULL, 14),
    (l5_2, 'Qu''est-ce que tu en penses ? Qu''est-ce que tu penses de lui ?', 'Ozo mona ndenge nini ? Ozo mona ndenge nini pona ye ?', NULL, NULL, 15),
    (l5_2, 'D''accord ? (= C''est bon ? = C''est ok ?)', 'Malamu ? (= Eza malamu ? = Na ndimi ?)', NULL, NULL, 16),
    (l5_2, 'Voilà', 'Na yango', NULL, NULL, 17),
    (l5_2, 'Moi aussi', 'Ngai pe', NULL, NULL, 18),
    (l5_2, 'Moi non plus', 'Ngai pe te', NULL, NULL, 19),
    (l5_2, 'Bien sûr', 'Ya solo', NULL, NULL, 20),
    (l5_2, 'J''aime cette musique', 'Na lingaka ndule oyo.', NULL, NULL, 21),
    (l5_2, 'Je ne veux pas aller à l''école aujourd''hui', 'Na ko kende kelasi te lelo.', NULL, NULL, 22);

  -- Module 5.3 Medias PLACEHOLDER (3 items)
  INSERT INTO lesson_items (lesson_id, french, dialect, example_french, example_dialect, item_order) VALUES
    (l5_3, '[PLACEHOLDER] Medias 1 - REQUIERT SAISIE DU PROFESSEUR', '[A COMPLETER]', NULL, NULL, 1),
    (l5_3, '[PLACEHOLDER] Medias 2 - REQUIERT SAISIE DU PROFESSEUR', '[A COMPLETER]', NULL, NULL, 2),
    (l5_3, '[PLACEHOLDER] Medias 3 - REQUIERT SAISIE DU PROFESSEUR', '[A COMPLETER]', NULL, NULL, 3);

  -- Module 5.4 Ecriture PLACEHOLDER (3 items)
  INSERT INTO lesson_items (lesson_id, french, dialect, example_french, example_dialect, item_order) VALUES
    (l5_4, '[PLACEHOLDER] Ecriture 1 - REQUIERT SAISIE DU PROFESSEUR', '[A COMPLETER]', NULL, NULL, 1),
    (l5_4, '[PLACEHOLDER] Ecriture 2 - REQUIERT SAISIE DU PROFESSEUR', '[A COMPLETER]', NULL, NULL, 2),
    (l5_4, '[PLACEHOLDER] Ecriture 3 - REQUIERT SAISIE DU PROFESSEUR', '[A COMPLETER]', NULL, NULL, 3);

  -- Module 6.1 Musique PLACEHOLDER (3 items)
  INSERT INTO lesson_items (lesson_id, french, dialect, example_french, example_dialect, item_order) VALUES
    (l6_1, '[PLACEHOLDER] Musique 1 - REQUIERT SAISIE DU PROFESSEUR', '[A COMPLETER]', NULL, NULL, 1),
    (l6_1, '[PLACEHOLDER] Musique 2 - REQUIERT SAISIE DU PROFESSEUR', '[A COMPLETER]', NULL, NULL, 2),
    (l6_1, '[PLACEHOLDER] Musique 3 - REQUIERT SAISIE DU PROFESSEUR', '[A COMPLETER]', NULL, NULL, 3);

  -- Module 6.2 Cuisine et gastronomie (66 items)
  INSERT INTO lesson_items (lesson_id, french, dialect, example_french, example_dialect, item_order) VALUES
    (l6_2, 'Ail', 'Litungulu (matungulu)', 'Écrase tout l''ail ici.', 'Tuta litungulu nionso awa.', 1),
    (l6_2, 'Ananas', 'Ananasi', 'La peau de l''ananas est dure et piquante.', 'Poso ya ananasi eza makasi pe koswa.', 2),
    (l6_2, 'Arachides', 'Nguba', 'Il faut décortiquer les arachides car leur coquille ne se mange pas.', 'Esengeli ko longola ba nguba poso po eliamaka te.', 3),
    (l6_2, 'Arbre', 'Nzete', 'L''ombre de l''arbre nous protège des brulures du soleil', 'Mpewa ya nzete ebikisaka biso na moyi oyo esuwaka.', 4),
    (l6_2, 'Avocat', 'Avocat', 'Cet avocat est bien mou sans être pourri', 'Avocat oyo eza pete kasi epoli te.', 5),
    (l6_2, 'Banane', 'Etabe (bitabe)', 'Les petites bananes du village sont les meilleures', 'Bitabe ya mboka eza kitoko makasi.', 6),
    (l6_2, 'Bouillir', 'Ko toka', 'Mets l''eau à bouillir avant d''y verser le riz', 'Tia mayi etoka yambo o tia loso.', 7),
    (l6_2, 'Branche', 'Etape (bitape)', 'Le singe ne lâche jamais une branche sans en avoir attrapé une autre', 'Makaku atikaka etape te soki nani asimbi mosusu te.', 8),
    (l6_2, 'Canne à sucre', 'Nzete ya sukali', 'La canne à sucre est très coupante', 'Nzete ya sukali ekatanaka.', 9),
    (l6_2, 'Chair', 'Musuni', 'Il y a plus d''os que de chair dans la viande que tu as préparée', 'Eza na mikua mingi koleka musuni na ngombe olambi.', 10),
    (l6_2, 'Citron', 'Ndimo', 'Le citron est acide', 'Ndimo eza ngayi.', 11),
    (l6_2, 'Couscous', '/', 'On mange le couscous avec les doigts', '/', 12),
    (l6_2, 'Cuire', 'Ko bela', 'La viande-ci n''est pas bien cuite', 'Ngombe oyo ebeli malamu te.', 13),
    (l6_2, 'Eau', 'Mayi', 'Boire de l''eau permet de vivre longtemps', 'Komela mayi esalaka owumela na bomoyi.', 14),
    (l6_2, 'Écorce', 'Poso', 'Nos ancêtres préparaient des médicaments avec des écorces.', 'Ba koko na biso ba zalaki kobongisa kisi na ba poso ya nzete.', 15),
    (l6_2, 'Feuille', 'Likasa (makasa)', 'On utilise les feuilles de bananier pour emballer la nourriture', 'Ba salelaka makasa ya makemba pona kozinga bilia.', 16),
    (l6_2, 'Fleur', 'Fololo', 'Les fleurs attirent les abeilles', 'Ba fololo e bendaka ba nzoi.', 17),
    (l6_2, 'Foufou', 'Fufu', 'Le foufou se mange avec tout', 'Fufu eliamaka na nionso.', 18),
    (l6_2, 'Frire', 'Ko kalinga', 'Faire frire le poulet gagne du temps', 'Ko kalinga soso eza mbangu mingi.', 19),
    (l6_2, 'Fruit', 'Mbuma', 'Quand j''étais petit je ne mangeais que des fruits', 'ezuaka', 20),
    (l6_2, 'Gombo', 'Dongo dongo', 'Le gombo devient gluant une fois écrasé', 'Dongo dongo e komaka moselu soki ba tuti yango.', 21),
    (l6_2, 'Graine', 'Mbuma', 'Les graines qu''on a plantées n''ont rien donné.', 'Ba mbuma to loni e pesi eloko te.', 22),
    (l6_2, 'Graisse', 'Mafuta', 'Il y a trop de graisse dans cette viande', 'Eza na mafuta mingi na ngombe oyo.', 23),
    (l6_2, 'Griller', 'Ko kalinga', 'Elle vend le maïs grillé pour nourrir ses enfants', 'Atekaka masangu ya ko kalinga pona ko bokola bana na ye.', 24),
    (l6_2, 'Haricots rouges', 'Madesu ya mitani', 'Les haricots rouges se marient bien avec les beignets', 'Madesu ya mitani ebongi na mikate.', 25),
    (l6_2, 'Herbe', 'Matiti', 'Nous avons envoyé les enfants arracher les herbes autour de la maison', 'To tindi bana ko longola matiti nzinga nzinga na ndako.', 26),
    (l6_2, 'Huile', 'Mafuta', 'L''huile rouge est présente dans beaucoup de plats', 'Mafuta ya mbila eza na bilia ebele.', 27),
    (l6_2, 'Igname', 'Mbala', 'L''igname peut remplacer le manioc s''il n''y en a plus', 'Mbala ekoki ko zua esika ya kwanga soki eza lisusu te.', 28),
    (l6_2, 'Lait', 'Miliki', 'Seuls les enfants boivent du lait au village', 'Kaka bana ba melaka miliki na mboka.', 29),
    (l6_2, 'Légumes', 'Ndunda', 'Les enfants préfèrent la viande aux légumes', 'Bana ba lingaka ngombe koleka ndunda.', 30),
    (l6_2, 'Macabo', 'Mbala', 'Le macabo pousse dans la terre', 'Mbala epusaka na se ya mabele.', 31),
    (l6_2, 'Maïs', 'Masangu', 'Elle vend le maïs grillé pour nourrir ses enfants', 'Azo teka masangu ya ko tumba po abokola bana na ye.', 32),
    (l6_2, 'Mangue', 'Mangolo', 'Cette mangue est pourrie', 'Mangolo oyo epoli.', 33),
    (l6_2, 'Manioc', 'Kwanga', 'L''igname peut remplacer le manioc s''il n''y en a plus', 'Mbala ekoki ko zua esika ya kwanga soki eza lisusu te.', 34),
    (l6_2, 'Miel', 'Mafuta ya nzoyi', 'Les abeilles piquent ceux qui veulent voler leur miel', 'Ba nzoyi ba swaka ba oyo ba lingi ko yiba mafuta na bango.', 35),
    (l6_2, 'Noyau', 'Mokokoli', 'Je plante ce noyau en espérant qu''un arbre pousse', 'Na zo lona mokokoli oyo pona ebota nzete.', 36),
    (l6_2, 'Œufs', 'Liki (maki)', 'La poule cache bien ses œufs jusqu''à leur éclosion', 'Soso abombaka maki na ye kino eko bonzana.', 37),
    (l6_2, 'Oignons', 'Litungulu (mitungulu)', 'Émince les oignons-là !', 'Kata matungulu wana !', 38),
    (l6_2, 'Orange', 'Lilala', 'L''orange ne pousse pas ici', 'Lilala epusaka awa te.', 39),
    (l6_2, 'Patate douce', 'Mbala ya sukali', 'La patate douce ne pousse pas partout.', 'Mbala ya sukali epusaka bisika nionso te.', 40),
    (l6_2, 'Piment', 'Pilipili', 'Attention ! Ce piment pique trop la bouche', 'Pilipili oyo ezo swa mingi.', 41),
    (l6_2, 'Plantain', 'Likemba (makemba)', 'Ces plantains sont encore vertes', 'Makemba oyo eza nini mobesu.', 42),
    (l6_2, 'Plat', 'Sani', 'Nous mangeons dans même plat', 'To zo lia sani moko.', 43),
    (l6_2, 'Poisson', 'Mbisi', 'Pêcher le poisson est difficile en saison sèche', 'Ko lɔba mbisi eza pasi na tango ya elanga.', 44),
    (l6_2, 'Pomme de terre', 'Mbala', 'Si tu perds ton argent tu ne pourras même plus acheter des pommes de terre.', 'Soki obongisi mbongo na yo, okoki ko somba lisusu mbala te.', 45),
    (l6_2, 'Racine', 'Lisisa (misisa)', 'Les racines rendent l''arbre solide', 'Misisa ekomisaka nzete makasi.', 46),
    (l6_2, 'Riz', 'Loso', 'Comment tu as fait pour que le riz ne colle pas ?', 'Ndenge nini osali po loso ekangama te ?', 47),
    (l6_2, 'Sauce', 'Bilei', 'Tu as mis quoi dans cette sauce ?', 'Otie nini na bilei oyo ?', 48),
    (l6_2, 'Sel', 'Mungwa', 'La nourriture manque de sel.', 'Bilia ezangi mungwa.', 49),
    (l6_2, 'Soupe / Bouillon', 'Supu', 'Tu as l''habitude de tremper ton pain dans la soupe', 'Oza na ezaleli ya ko tia lipa na kati ya supu.', 50);

  INSERT INTO lesson_items (lesson_id, french, dialect, example_french, example_dialect, item_order) VALUES
    (l6_2, 'Sucre', 'Sukali', 'Le sucre vient de la canne', 'Sukali ewuti na nzete nango.', 51),
    (l6_2, 'Tomate', 'Tomati', 'Je ne trouve pas les tomates, tu les as rangées où ?', 'Na zo mona ba tomati te.', 52),
    (l6_2, 'Tronc', 'Eteni', 'Le tronc soutient les branches', 'Eteni ya nzete esungaka nzete mobimba.', 53),
    (l6_2, 'Viande / Poisson', 'Ngombe / Mbisi', 'Je mange de la viande à chaque repas, et du poisson une fois par semaine.', 'Na liaka ngombe tango nionso na zo lia, pe mbisi mbala moko na mposo.', 54),
    (l6_2, 'Nom des plats locaux', 'Saka-saka / Pondu', 'Plat à base de feuilles de manioc', NULL, 55),
    (l6_2, 'Assiette', 'Sani', 'Chacun son assiette', 'Moto na moto na sani na ye.', 56),
    (l6_2, 'Bouteille', 'Molangi', 'Ferme bien la bouteille pour que l''eau ne se renverse pas', 'Kanga molangi malamu po mayi esopana te.', 57),
    (l6_2, 'Conserver', 'Ko bombama', 'Les aliments se conservent mieux au frais', 'Bilia ebombamaka malamu na malili.', 58),
    (l6_2, 'Couteau', 'Mbeli', 'Je sors toujours avec mon couteau pour défendre ma famille', 'Na bimaka tango nionso na mbeli na ngai pona ko batela libota na ngai.', 59),
    (l6_2, 'Couvrir', 'Ko kanga', 'C''est bientôt prêt, couvre la marmite et appelle les autres', 'Kala te eko bela, kanga nzungu pe benga ba ninga.', 60),
    (l6_2, 'Cuillère', 'Lutu', 'Je remue la sauce avec ma cuillère', 'Na zo palola elubu na lutu na ngai.', 61),
    (l6_2, 'Emballer', 'Ko linga', 'Emballe les courges dans les feuilles et distribue-les à chacun des invités', 'Linga mbika oyo na makasa pe kabola yango na ba paya nionso.', 62),
    (l6_2, 'Marmite / Casserole', 'Nzungu', 'La marmite a noirci au feu', 'Nzungu eyindi na moto.', 63),
    (l6_2, 'Mortier', 'Eboka', 'Tu sais piler le foufou dans le mortier ?', 'Oyebi ko tuta fufu na kati ya eboka ?', 64),
    (l6_2, 'Plat', 'Sani', 'Servez-vous tous dans ce plat', 'Bo tia bino nionso bilia na kati ya sani oyo.', 65),
    (l6_2, 'Verre', 'Kopo', 'Il a renversé l''eau qui était dans le verre sans faire exprès', 'Asopi mayi ezalaki na kopo kasi asali na nko te.', 66);

  -- Module 6.3 Traditions PLACEHOLDER (3 items)
  INSERT INTO lesson_items (lesson_id, french, dialect, example_french, example_dialect, item_order) VALUES
    (l6_3, '[PLACEHOLDER] Traditions 1 - REQUIERT SAISIE DU PROFESSEUR', '[A COMPLETER]', NULL, NULL, 1),
    (l6_3, '[PLACEHOLDER] Traditions 2 - REQUIERT SAISIE DU PROFESSEUR', '[A COMPLETER]', NULL, NULL, 2),
    (l6_3, '[PLACEHOLDER] Traditions 3 - REQUIERT SAISIE DU PROFESSEUR', '[A COMPLETER]', NULL, NULL, 3);

  -- Module 6.4 La langue dans le monde (6 items)
  INSERT INTO lesson_items (lesson_id, french, dialect, example_french, example_dialect, item_order) VALUES
    (l6_4, 'J''apprends la langue', 'Na zo yekola lokota.', NULL, NULL, 1),
    (l6_4, 'Je ne parle pas bien la langue. Je parle un peu le swahili.', 'Na lobaka lokota malamu te. Na lobaka swahili mokie.', NULL, NULL, 2),
    (l6_4, 'Je parle bien le patois', 'Na lobaka ndinga na ngai.', NULL, NULL, 3),
    (l6_4, '[PLACEHOLDER] Lingala diaspora 1 - REQUIERT SAISIE DU PROFESSEUR', '[A COMPLETER]', NULL, NULL, 4),
    (l6_4, '[PLACEHOLDER] Lingala diaspora 2 - REQUIERT SAISIE DU PROFESSEUR', '[A COMPLETER]', NULL, NULL, 5),
    (l6_4, '[PLACEHOLDER] Lingala diaspora 3 - REQUIERT SAISIE DU PROFESSEUR', '[A COMPLETER]', NULL, NULL, 6);

END $$;

-- =====================================================================
-- STEP 4: COPY AUDIO FROM OLD LESSON_ITEMS TO NEW ONES
-- =====================================================================
UPDATE lesson_items li_new
SET
    audio_url                 = li_old.audio_url,
    audio_key                 = li_old.audio_key,
    audio_source_cell         = li_old.audio_source_cell,
    example_audio_url         = li_old.example_audio_url,
    example_audio_key         = li_old.example_audio_key,
    example_audio_source_cell = li_old.example_audio_source_cell
FROM lesson_items li_old
JOIN lessons l_old ON l_old.id = li_old.lesson_id
WHERE l_old.course_id IN (22, 23, 24, 25)
  AND li_new.french  = li_old.french
  AND li_new.dialect = li_old.dialect
  AND li_old.audio_url IS NOT NULL
  AND li_new.audio_url IS NULL
  AND EXISTS (
    SELECT 1 FROM lessons l
    JOIN courses c ON c.id = l.course_id
    WHERE l.id = li_new.lesson_id
      AND c.id NOT IN (22, 23, 24, 25)
      AND c.language_id = 1
  );

-- =====================================================================
-- STEP 4b: PULL AUDIO FROM DICTIONARY SENSES FOR NEW-ONLY ITEMS
-- =====================================================================
UPDATE lesson_items li_new
SET
    audio_url         = s.audio_url,
    audio_key         = s.audio_key,
    audio_source_cell = s.audio_source_cell
FROM senses s
WHERE li_new.dialect = s.dialect_word
  AND s.audio_url IS NOT NULL
  AND li_new.audio_url IS NULL
  AND EXISTS (
    SELECT 1 FROM lessons l
    JOIN courses c ON c.id = l.course_id
    WHERE l.id = li_new.lesson_id
      AND c.id NOT IN (22, 23, 24, 25)
      AND c.language_id = 1
  );

UPDATE lesson_items li_new
SET
    example_audio_url         = e.audio_url,
    example_audio_key         = e.audio_key,
    example_audio_source_cell = e.audio_source_cell
FROM examples e
WHERE li_new.example_dialect = e.sentence_dialect
  AND e.audio_url IS NOT NULL
  AND li_new.example_audio_url IS NULL
  AND EXISTS (
    SELECT 1 FROM lessons l
    JOIN courses c ON c.id = l.course_id
    WHERE l.id = li_new.lesson_id
      AND c.id NOT IN (22, 23, 24, 25)
      AND c.language_id = 1
  );

-- =====================================================================
-- VERIFICATION
-- =====================================================================
-- SELECT c.title, l.title, COUNT(li.id) items, COUNT(li.audio_url) with_audio
-- FROM courses c JOIN lessons l ON l.course_id=c.id
-- LEFT JOIN lesson_items li ON li.lesson_id=l.id
-- WHERE c.language_id=1 AND c.id NOT IN (22,23,24,25)
-- GROUP BY c.title, c.course_order, l.title, l.lesson_order
-- ORDER BY c.course_order, l.lesson_order;

-- =====================================================================
-- CLEANUP (only after verifying in the app)
-- =====================================================================
-- DELETE FROM courses WHERE id IN (22, 23, 24, 25);
