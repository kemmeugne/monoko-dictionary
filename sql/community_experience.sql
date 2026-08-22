-- Production support for the redesigned learner profile and weekly ranking.
-- Idempotent. Apply after sql/progression.sql and before deploying the UI.

begin;

alter table lesson_stage_state
  add column if not exists pratiquer_xp int not null default 0;

-- Historical Pratiquer sessions predate persisted XP. This conservative
-- backfill restores the guaranteed 200 XP per completed 20-question run and
-- one known perfect-session bonus where the learner has a 100% best score.
update lesson_stage_state
set pratiquer_xp = pratiquer_runs * 200
  + case when pratiquer_best = 100 and pratiquer_runs > 0 then 50 else 0 end
where pratiquer_xp = 0 and pratiquer_runs > 0;

alter table profiles add column if not exists public_pseudonym text;
alter table profiles add column if not exists country_code text;
alter table profiles add column if not exists leaderboard_opt_in boolean not null default false;
alter table profiles add column if not exists updated_at timestamptz not null default now();

alter table profiles drop constraint if exists profiles_public_pseudonym_length;
alter table profiles add constraint profiles_public_pseudonym_length
  check (public_pseudonym is null or char_length(trim(public_pseudonym)) between 2 and 24);

alter table profiles drop constraint if exists profiles_country_code_length;
alter table profiles add constraint profiles_country_code_length
  check (country_code is null or char_length(country_code) between 2 and 8);

create unique index if not exists profiles_public_pseudonym_unique
  on profiles (lower(public_pseudonym))
  where leaderboard_opt_in = true and public_pseudonym is not null;

create table if not exists user_xp_events (
  id           bigserial primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  language_id  bigint not null references languages(id),
  lesson_id    bigint references lessons(id) on delete set null,
  stage        text not null check (stage in ('pratiquer', 'elargir', 'level_bonus', 'level_challenge', 'culture')),
  xp           int not null check (xp between 0 and 1000),
  event_key    uuid not null unique,
  earned_at    timestamptz not null default now()
);

create index if not exists user_xp_events_weekly_rank
  on user_xp_events (language_id, earned_at desc, user_id);

-- Existing installations may already have the narrower stage constraint.
alter table user_xp_events drop constraint if exists user_xp_events_stage_check;
alter table user_xp_events add constraint user_xp_events_stage_check
  check (stage in ('pratiquer', 'elargir', 'level_bonus', 'level_challenge', 'culture'));

create table if not exists user_level_rewards (
  user_id      uuid not null references auth.users(id) on delete cascade,
  course_id    bigint not null references courses(id) on delete cascade,
  language_id  bigint not null references languages(id),
  xp           int not null default 500 check (xp = 500),
  claimed_at   timestamptz not null default now(),
  primary key (user_id, course_id)
);

create table if not exists level_challenge_state (
  user_id      uuid not null references auth.users(id) on delete cascade,
  course_id    bigint not null references courses(id) on delete cascade,
  language_id  bigint not null references languages(id),
  best_score   int not null default 0 check (best_score between 0 and 100),
  passed       boolean not null default false,
  runs         int not null default 0 check (runs >= 0),
  session_xp   int not null default 0 check (session_xp >= 0),
  reward_xp    int not null default 0 check (reward_xp in (0, 300)),
  updated_at   timestamptz not null default now(),
  primary key (user_id, course_id)
);

alter table level_challenge_state
  add column if not exists session_xp int not null default 0 check (session_xp >= 0);

alter table user_level_rewards enable row level security;
alter table level_challenge_state enable row level security;

drop policy if exists "Users read their own level rewards" on user_level_rewards;
create policy "Users read their own level rewards" on user_level_rewards
  for select using (auth.uid() = user_id);

drop policy if exists "Users claim completed level rewards" on user_level_rewards;
create policy "Users claim completed level rewards" on user_level_rewards
  for insert with check (
    auth.uid() = user_id and xp = 500
    and not exists (
      select 1 from lessons lesson
      where lesson.course_id = user_level_rewards.course_id
        and not exists (
          select 1 from user_progress progress
          where progress.user_id = auth.uid() and progress.lesson_id = lesson.id
        )
    )
  );

drop policy if exists "Users read their own level challenges" on level_challenge_state;
create policy "Users read their own level challenges" on level_challenge_state
  for select using (auth.uid() = user_id);

drop policy if exists "Users manage completed level challenges" on level_challenge_state;
create policy "Users manage completed level challenges" on level_challenge_state
  for all using (auth.uid() = user_id) with check (
    auth.uid() = user_id
    and not exists (
      select 1 from lessons lesson
      where lesson.course_id = level_challenge_state.course_id
        and not exists (
          select 1 from user_progress progress
          where progress.user_id = auth.uid() and progress.lesson_id = lesson.id
        )
    )
  );

create or replace function record_level_reward_xp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into user_xp_events (user_id, language_id, stage, xp, event_key)
  values (new.user_id, new.language_id, 'level_bonus', new.xp, gen_random_uuid());
  return new;
end;
$$;

drop trigger if exists user_level_reward_xp_event on user_level_rewards;
create trigger user_level_reward_xp_event
after insert on user_level_rewards
for each row execute function record_level_reward_xp();

create or replace function record_level_challenge_xp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.passed and (tg_op = 'INSERT' or old.passed = false) then
    new.reward_xp := 300;
    insert into user_xp_events (user_id, language_id, stage, xp, event_key)
    values (new.user_id, new.language_id, 'level_challenge', 300, gen_random_uuid());
  elsif tg_op = 'UPDATE' and old.passed then
    new.passed := true;
    new.reward_xp := old.reward_xp;
  end if;
  if tg_op = 'UPDATE' then
    new.best_score := greatest(old.best_score, new.best_score);
    new.runs := greatest(old.runs, new.runs);
    new.session_xp := greatest(old.session_xp, new.session_xp);
  end if;
  return new;
end;
$$;

drop trigger if exists level_challenge_xp_event on level_challenge_state;
create trigger level_challenge_xp_event
before insert or update on level_challenge_state
for each row execute function record_level_challenge_xp();

alter table user_xp_events enable row level security;

drop policy if exists "Users read their own XP events" on user_xp_events;
create policy "Users read their own XP events" on user_xp_events
  for select using (auth.uid() = user_id);

drop policy if exists "Users record their own XP events" on user_xp_events;
create policy "Users record their own XP events" on user_xp_events
  for insert with check (auth.uid() = user_id);

commit;

-- Verification:
-- select column_name from information_schema.columns
--  where table_name = 'profiles' order by ordinal_position;
-- select column_name from information_schema.columns
--  where table_name = 'lesson_stage_state' and column_name = 'pratiquer_xp';
-- select count(*) from user_xp_events;
