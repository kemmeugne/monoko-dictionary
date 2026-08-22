-- Editable lesson-linked cultural capsules.
-- Apply before sql/culture_capsules_seed.sql.
--
-- Capsule copy and images are product content, not application code. Keeping
-- them here lets an editor replace either after deployment without rebuilding
-- the learner app. A completed `user_progress.lesson_id` unlocks its capsule;
-- `user_culture_rewards` records the one-time gift claim.

create table if not exists culture_capsules (
  id             text primary key,
  lesson_id      bigint not null unique references lessons(id) on delete cascade,
  level          smallint not null check (level between 1 and 6),
  sort_order     smallint not null,

  title          text not null,
  region         text not null,
  short_copy     text not null,
  body_copy      text not null,
  icon           text not null,
  visual_key     text not null,
  image_url      text,

  source_label   text,
  source_url     text,
  review_status  text not null default 'draft'
                 check (review_status in ('draft', 'professor_reviewed', 'published')),
  reward_xp      smallint not null default 50 check (reward_xp >= 0),
  is_published   boolean not null default true,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists culture_capsules_level_order
  on culture_capsules (level, sort_order);

create table if not exists user_culture_rewards (
  user_id       uuid not null references auth.users(id) on delete cascade,
  capsule_id    text not null references culture_capsules(id) on delete cascade,
  claimed_at    timestamptz not null default now(),
  primary key (user_id, capsule_id)
);

create index if not exists user_culture_rewards_user_claimed
  on user_culture_rewards (user_id, claimed_at desc);

alter table culture_capsules enable row level security;
alter table user_culture_rewards enable row level security;

drop policy if exists "Published capsules are readable" on culture_capsules;
create policy "Published capsules are readable" on culture_capsules
  for select using (is_published = true);

drop policy if exists "Users read their own culture rewards" on user_culture_rewards;
create policy "Users read their own culture rewards" on user_culture_rewards
  for select using (auth.uid() = user_id);

drop policy if exists "Users claim their own culture rewards" on user_culture_rewards;
create policy "Users claim their own culture rewards" on user_culture_rewards
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1
      from culture_capsules capsule
      join user_progress progress on progress.lesson_id = capsule.lesson_id
      where capsule.id = user_culture_rewards.capsule_id
        and progress.user_id = auth.uid()
    )
  );

-- XP is always derived from culture_capsules.reward_xp after the claim. The
-- browser never submits an XP amount, so changing a request cannot mint points.

-- Verify after applying the seed:
-- select level, count(*) from culture_capsules group by level order by level;
-- Expected draft selection: 1=3, 2=1, 3=1, 4=5, 5=2, 6=4 (16 total).

-- Rollback:
-- drop table if exists user_culture_rewards;
-- drop table if exists culture_capsules;
