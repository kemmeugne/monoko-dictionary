-- One-time gifts placed after ordinary lessons on the course trail.
-- Apply after community_experience.sql. Idempotent.

begin;

create table if not exists lesson_reward_claims (
  user_id      uuid not null references auth.users(id) on delete cascade,
  lesson_id    bigint not null references lessons(id) on delete cascade,
  language_id  bigint not null references languages(id),
  xp           int not null check (xp between 0 and 200),
  claimed_at   timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create index if not exists lesson_reward_claims_user_language
  on lesson_reward_claims (user_id, language_id, claimed_at desc);

alter table lesson_reward_claims enable row level security;

drop policy if exists "Users read their own lesson rewards" on lesson_reward_claims;
create policy "Users read their own lesson rewards" on lesson_reward_claims
  for select using (auth.uid() = user_id);

-- The browser cannot insert claims directly. XP and eligibility are derived in
-- this function so request payloads cannot mint points or claim locked gifts.
create or replace function claim_lesson_reward(p_lesson_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_language_id bigint;
  v_xp integer;
  v_capsule_id text;
  v_inserted integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select course.language_id,
         coalesce(capsule.reward_xp, 40 + course.course_order * 10),
         capsule.id
    into v_language_id, v_xp, v_capsule_id
  from lessons lesson
  join courses course on course.id = lesson.course_id
  left join culture_capsules capsule
    on capsule.lesson_id = lesson.id and capsule.is_published = true
  where lesson.id = p_lesson_id
    and exists (
      select 1 from user_progress progress
      where progress.user_id = v_user_id and progress.lesson_id = lesson.id
    )
    and exists (
      select 1 from lessons later
      where later.course_id = lesson.course_id
        and (later.lesson_order, later.id) > (lesson.lesson_order, lesson.id)
    );

  if v_language_id is null then
    raise exception 'Reward is locked or belongs to a level milestone' using errcode = '42501';
  end if;

  insert into lesson_reward_claims (user_id, lesson_id, language_id, xp)
  values (v_user_id, p_lesson_id, v_language_id, v_xp)
  on conflict (user_id, lesson_id) do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted = 1 then
    insert into user_xp_events (user_id, language_id, lesson_id, stage, xp, event_key)
    values (v_user_id, v_language_id, p_lesson_id, 'culture', v_xp, gen_random_uuid());

    if v_capsule_id is not null then
      insert into user_culture_rewards (user_id, capsule_id)
      values (v_user_id, v_capsule_id)
      on conflict (user_id, capsule_id) do nothing;
    end if;
  end if;

  return jsonb_build_object(
    'claimed', true,
    'new_claim', v_inserted = 1,
    'lesson_id', p_lesson_id,
    'xp', v_xp,
    'capsule_id', v_capsule_id
  );
end;
$$;

revoke all on function claim_lesson_reward(bigint) from public;
grant execute on function claim_lesson_reward(bigint) to authenticated;

-- Final lesson rewards are claimed through the medal ceremony. As with lesson
-- gifts, the browser supplies only the course id; eligibility, language, XP,
-- and the attached final-lesson capsule are derived here.
create or replace function claim_level_reward(p_course_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_language_id bigint;
  v_capsule_id text;
  v_inserted integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select course.language_id
    into v_language_id
  from courses course
  where course.id = p_course_id
    and exists (select 1 from lessons lesson where lesson.course_id = course.id)
    and not exists (
      select 1
      from lessons lesson
      where lesson.course_id = course.id
        and not exists (
          select 1 from user_progress progress
          where progress.user_id = v_user_id
            and progress.lesson_id = lesson.id
        )
    );

  if v_language_id is null then
    raise exception 'Level reward is locked' using errcode = '42501';
  end if;

  insert into user_level_rewards (user_id, course_id, language_id, xp)
  values (v_user_id, p_course_id, v_language_id, 500)
  on conflict (user_id, course_id) do nothing;

  get diagnostics v_inserted = row_count;

  select capsule.id
    into v_capsule_id
  from lessons lesson
  join culture_capsules capsule
    on capsule.lesson_id = lesson.id and capsule.is_published = true
  where lesson.course_id = p_course_id
    and not exists (
      select 1 from lessons later
      where later.course_id = lesson.course_id
        and (later.lesson_order, later.id) > (lesson.lesson_order, lesson.id)
    )
  limit 1;

  return jsonb_build_object(
    'claimed', true,
    'new_claim', v_inserted = 1,
    'course_id', p_course_id,
    'xp', 500,
    'capsule_id', v_capsule_id
  );
end;
$$;

revoke all on function claim_level_reward(bigint) from public;
grant execute on function claim_level_reward(bigint) to authenticated;

-- A level's final path node is its medal rather than an ordinary gift. Keep a
-- cultural capsule attached to that final lesson in the same medal claim.
create or replace function record_level_reward_xp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into user_xp_events (user_id, language_id, stage, xp, event_key)
  values (new.user_id, new.language_id, 'level_bonus', new.xp, gen_random_uuid());

  insert into user_culture_rewards (user_id, capsule_id)
  select new.user_id, capsule.id
  from culture_capsules capsule
  join lessons lesson on lesson.id = capsule.lesson_id
  where lesson.course_id = new.course_id
    and not exists (
      select 1 from lessons later
      where later.course_id = lesson.course_id
        and (later.lesson_order, later.id) > (lesson.lesson_order, lesson.id)
    )
  on conflict (user_id, capsule_id) do nothing;

  return new;
end;
$$;

-- Bring already-earned level medals into the capsule ledger.
insert into user_culture_rewards (user_id, capsule_id)
select reward.user_id, capsule.id
from user_level_rewards reward
join lessons lesson on lesson.course_id = reward.course_id
join culture_capsules capsule on capsule.lesson_id = lesson.id
where not exists (
  select 1 from lessons later
  where later.course_id = lesson.course_id
    and (later.lesson_order, later.id) > (lesson.lesson_order, lesson.id)
)
on conflict (user_id, capsule_id) do nothing;

-- Used only by the protected developer snapshot RPC. It mirrors the mock:
-- gifts strictly before the current lesson boundary are already claimed, while
-- the gift immediately after the latest completed lesson remains available.
create or replace function developer_rebuild_trail_rewards(
  p_user_id uuid,
  p_language_id bigint,
  p_completed_lessons integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_xp integer;
begin
  delete from lesson_reward_claims
  where user_id = p_user_id and language_id = p_language_id;

  with ordered_lessons as (
    select lesson.id,
           course.course_order,
           row_number() over (order by course.course_order, lesson.lesson_order, lesson.id) as position,
           row_number() over (partition by course.id order by lesson.lesson_order, lesson.id) as course_position,
           count(*) over (partition by course.id) as course_total,
           coalesce(capsule.reward_xp, 40 + course.course_order * 10) as reward_xp
    from lessons lesson
    join courses course on course.id = lesson.course_id
    left join culture_capsules capsule
      on capsule.lesson_id = lesson.id and capsule.is_published = true
    where course.language_id = p_language_id
  )
  insert into lesson_reward_claims (user_id, lesson_id, language_id, xp)
  select p_user_id, id, p_language_id, reward_xp
  from ordered_lessons
  where position < p_completed_lessons
    and course_position < course_total;

  insert into user_xp_events (user_id, language_id, lesson_id, stage, xp, event_key)
  select p_user_id, p_language_id, claim.lesson_id, 'culture', claim.xp, gen_random_uuid()
  from lesson_reward_claims claim
  where claim.user_id = p_user_id and claim.language_id = p_language_id;

  insert into user_culture_rewards (user_id, capsule_id)
  select p_user_id, capsule.id
  from lesson_reward_claims claim
  join culture_capsules capsule on capsule.lesson_id = claim.lesson_id
  where claim.user_id = p_user_id and claim.language_id = p_language_id
  on conflict (user_id, capsule_id) do nothing;

  select coalesce(sum(xp), 0)::integer into v_xp
  from lesson_reward_claims
  where user_id = p_user_id and language_id = p_language_id;

  return v_xp;
end;
$$;

revoke all on function developer_rebuild_trail_rewards(uuid, bigint, integer) from public, anon, authenticated;

commit;
