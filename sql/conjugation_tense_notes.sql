-- Professor-authored explanations displayed with the conjugation paradigms.
-- Run after sql/conjugation_tables.sql.

create table if not exists conjugation_tense_notes (
  language_id  bigint not null references languages(id),
  tense        text not null,
  tense_label  text not null,
  explanation  text not null,
  sort_order   smallint not null default 0,
  source_key   text,
  updated_at   timestamptz not null default now(),
  primary key (language_id, tense)
);

create index if not exists conjugation_tense_notes_order
  on conjugation_tense_notes (language_id, sort_order);

alter table conjugation_tense_notes enable row level security;

drop policy if exists "conjugation_tense_notes public read"
  on conjugation_tense_notes;
create policy "conjugation_tense_notes public read"
  on conjugation_tense_notes for select using (true);

-- Verify:
-- select tense_label, length(explanation), sort_order
-- from conjugation_tense_notes where language_id = 1 order by sort_order;

-- Rollback:
-- drop table if exists conjugation_tense_notes;
