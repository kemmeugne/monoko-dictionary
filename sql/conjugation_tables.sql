-- Run once in the Supabase SQL Editor.
-- A conjugation paradigm, stored with its shape intact.
--
-- WHY NOT lesson_items
-- lesson_items is flat: french, dialect, an order. A paradigm is a GRID — every
-- cell is addressed by (verb, tense, person), and the lesson is unreadable
-- unless it is laid out that way. Flattening it into 30 ordered rows is exactly
-- what happened to this material the first time: the original workbook held it
-- as a matrix, the migration read it row-wise, and the whole table fell out of
-- the course. It is stored as a grid here so that cannot happen again.
--
-- WHERE THE CONTENT CAME FROM
-- The FIRST professor's "Cours 2 Grammaire-Conjugaison", rows 259-264, columns
-- B-F. One verb (ko linga / aimer), five tenses, six persons, no gaps — and
-- crucially it distinguishes `Na lingi` (présent) from `Na zo linga` (présent
-- progressif), which is the distinction the current conjugation lessons blur.
-- 24 of the 30 forms already have his recording on R2, addressed by the
-- workbook cell the clip was cut from (2.C259.mp3 = column C, row 259).
-- The présent column was never recorded.

create table if not exists conjugation_forms (
  id           bigserial primary key,
  language_id  bigint not null references languages(id),

  -- The infinitive as the learner meets it, plus its French gloss.
  verb         text   not null,          -- "ko linga"
  verb_fr      text   not null,          -- "aimer"

  -- Grid coordinates. `tense_order` and `person_order` exist so the table can be
  -- rendered in the order a French speaker expects (je, tu, il…) without the
  -- client hardcoding a sort.
  tense        text     not null,        -- present | imparfait | futur | present_prog | passe_prog
  tense_label  text     not null,        -- what the header row shows
  tense_order  smallint not null,
  person       text     not null,        -- je | tu | il | nous | vous | ils
  person_order smallint not null,

  french       text not null,
  lingala      text not null,
  audio_url    text,                     -- null where the professor never recorded it

  source_cell  text,                     -- provenance: "2.C259"
  created_at   timestamptz not null default now(),

  unique (language_id, verb, tense, person)
);

create index if not exists conjugation_forms_lookup
  on conjugation_forms (language_id, verb, tense_order, person_order);

-- Public read, like the rest of the course content. Writes are service-key only.
alter table conjugation_forms enable row level security;
drop policy if exists "conjugation_forms public read" on conjugation_forms;
create policy "conjugation_forms public read" on conjugation_forms
  for select using (true);

-- Which lessons show which paradigm. A join table rather than a lesson_id column
-- because the same table belongs at the top of every conjugation lesson, and
-- pinning it to one lesson would mean storing it five times.
create table if not exists lesson_conjugation_tables (
  lesson_id   bigint not null references lessons(id) on delete cascade,
  language_id bigint not null references languages(id),
  verb        text   not null,
  sort_order  smallint not null default 0,
  primary key (lesson_id, verb)
);

alter table lesson_conjugation_tables enable row level security;
drop policy if exists "lesson_conjugation_tables public read" on lesson_conjugation_tables;
create policy "lesson_conjugation_tables public read" on lesson_conjugation_tables
  for select using (true);

-- ── Verify ───────────────────────────────────────────────────────────────────
-- select tense_label, count(*), count(audio_url) from conjugation_forms
--  group by tense_label, tense_order order by tense_order;   -- 6 each, 0/6/6/6/6 audio
-- select l.title, c.verb from lesson_conjugation_tables c join lessons l on l.id=c.lesson_id;

-- ── Rollback ─────────────────────────────────────────────────────────────────
-- drop table if exists lesson_conjugation_tables;
-- drop table if exists conjugation_forms;
