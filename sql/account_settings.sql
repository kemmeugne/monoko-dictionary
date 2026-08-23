-- Account settings: optional personal details, and a public pseudonym that is
-- unique across every learner and can only be chosen once.
--
-- Apply after community_experience.sql. Idempotent.

begin;

-- Optional personal information. Every one of these may stay null: they are
-- offered in settings, never required, and nothing in the app reads them for
-- behaviour. They are deliberately NOT exposed to the leaderboard endpoint,
-- which selects an explicit column list and never `*`.
alter table profiles add column if not exists phone      text;
alter table profiles add column if not exists address    text;
alter table profiles add column if not exists ethnicity  text;

alter table profiles drop constraint if exists profiles_phone_length;
alter table profiles add constraint profiles_phone_length
  check (phone is null or char_length(trim(phone)) <= 32);

alter table profiles drop constraint if exists profiles_address_length;
alter table profiles add constraint profiles_address_length
  check (address is null or char_length(trim(address)) <= 200);

alter table profiles drop constraint if exists profiles_ethnicity_length;
alter table profiles add constraint profiles_ethnicity_length
  check (ethnicity is null or char_length(trim(ethnicity)) <= 60);

-- The pseudonym is unique across EVERY learner, not just the ones taking part
-- in the ranking. The old index was partial —
--   where leaderboard_opt_in = true and public_pseudonym is not null
-- — so two learners could hold the same name as long as one of them had not
-- opted in, and the collision only surfaced later, at the moment one of them
-- switched the ranking on. Uniqueness now holds from the moment it is set.
drop index if exists profiles_public_pseudonym_unique;
create unique index if not exists profiles_public_pseudonym_unique
  on profiles (lower(trim(public_pseudonym)))
  where public_pseudonym is not null and trim(public_pseudonym) <> '';

-- A pseudonym is chosen once and then fixed: it is the name other learners see
-- in the weekly ranking, so letting it change lets someone shed a ranking
-- history or take a name another learner has retired. Enforced in the database
-- rather than in the form, because the form is a client and RLS lets a learner
-- write their own row directly.
--
-- Blanking it is not an escape hatch either: null -> name is allowed exactly
-- once, name -> anything-else is refused. Existing learners are unaffected
-- until they set one, which is what makes this safe to apply to live data.
create or replace function enforce_pseudonym_immutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and old.public_pseudonym is not null
     and trim(old.public_pseudonym) <> ''
     and coalesce(trim(new.public_pseudonym), '') is distinct from trim(old.public_pseudonym)
  then
    raise exception 'Le pseudonyme ne peut pas être modifié une fois choisi'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_pseudonym_immutable on profiles;
create trigger profiles_pseudonym_immutable
  before update on profiles
  for each row execute function enforce_pseudonym_immutable();

commit;
