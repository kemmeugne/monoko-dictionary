-- Persistent developer-only course controls.
--
-- Developers can move their own account to a known point in the course trail
-- while preserving the same XP and level rewards a learner would have earned.
-- Membership is stored outside `profiles`, whose rows users may edit through
-- RLS, so a learner cannot grant this capability to themselves.

begin;

create table if not exists app_developers (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  granted_at  timestamptz not null default now()
);

alter table app_developers enable row level security;
revoke all on table app_developers from anon, authenticated;

create or replace function is_course_developer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (select 1 from app_developers where user_id = auth.uid());
$$;

revoke all on function is_course_developer() from public;
grant execute on function is_course_developer() to authenticated;

create or replace function developer_set_course_progress(
  p_language_id bigint,
  p_completed_lessons integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_total integer;
  v_target integer;
  v_rewards integer;
begin
  if v_user_id is null or not exists (
    select 1 from app_developers where user_id = v_user_id
  ) then
    raise exception 'Developer course access required' using errcode = '42501';
  end if;

  select count(*)::integer
    into v_total
  from lessons lesson
  join courses course on course.id = lesson.course_id
  where course.language_id = p_language_id;

  v_target := greatest(0, least(coalesce(p_completed_lessons, 0), v_total));

  -- A preset is a complete snapshot for this developer and language. Clearing
  -- dependent rows first keeps progress, visible XP, and leaderboard XP aligned.
  delete from user_culture_rewards reward
  using culture_capsules capsule, lessons lesson, courses course
  where reward.user_id = v_user_id
    and reward.capsule_id = capsule.id
    and capsule.lesson_id = lesson.id
    and lesson.course_id = course.id
    and course.language_id = p_language_id;

  delete from exercise_attempts attempt
  using lessons lesson, courses course
  where attempt.user_id = v_user_id
    and attempt.lesson_id = lesson.id
    and lesson.course_id = course.id
    and course.language_id = p_language_id;

  delete from level_challenge_state
  where user_id = v_user_id and language_id = p_language_id;

  delete from user_level_rewards
  where user_id = v_user_id and language_id = p_language_id;

  delete from user_xp_events
  where user_id = v_user_id and language_id = p_language_id;

  delete from lesson_stage_state
  where user_id = v_user_id and language_id = p_language_id;

  delete from user_progress
  where user_id = v_user_id and language_id = p_language_id;

  with ordered_lessons as (
    select lesson.id,
           row_number() over (order by course.course_order, lesson.lesson_order, lesson.id) as position
    from lessons lesson
    join courses course on course.id = lesson.course_id
    where course.language_id = p_language_id
  )
  insert into user_progress (user_id, lesson_id, language_id, completed_at, exam_score)
  select v_user_id, id, p_language_id, now(), 80
  from ordered_lessons
  where position <= v_target;

  with ordered_lessons as (
    select lesson.id,
           row_number() over (order by course.course_order, lesson.lesson_order, lesson.id) as position
    from lessons lesson
    join courses course on course.id = lesson.course_id
    where course.language_id = p_language_id
  )
  insert into lesson_stage_state (
    user_id, lesson_id, language_id,
    pratiquer_passed, pratiquer_best, pratiquer_runs, pratiquer_xp,
    elargir_best, elargir_runs, elargir_xp, updated_at
  )
  select v_user_id, id, p_language_id,
         true, 80, 1, 200,
         0, 0, 0, now()
  from ordered_lessons
  where position <= v_target;

  with ordered_lessons as (
    select lesson.id,
           row_number() over (order by course.course_order, lesson.lesson_order, lesson.id) as position
    from lessons lesson
    join courses course on course.id = lesson.course_id
    where course.language_id = p_language_id
  )
  insert into user_xp_events (user_id, language_id, lesson_id, stage, xp, event_key)
  select v_user_id, p_language_id, id, 'pratiquer', 200, gen_random_uuid()
  from ordered_lessons
  where position <= v_target;

  with ordered_lessons as (
    select lesson.id,
           lesson.course_id,
           row_number() over (order by course.course_order, lesson.lesson_order, lesson.id) as position
    from lessons lesson
    join courses course on course.id = lesson.course_id
    where course.language_id = p_language_id
  ), completed_courses as (
    select course_id
    from ordered_lessons
    group by course_id
    having count(*) = count(*) filter (where position <= v_target)
  )
  insert into user_level_rewards (user_id, course_id, language_id, xp)
  select v_user_id, course_id, p_language_id, 500
  from completed_courses;

  get diagnostics v_rewards = row_count;

  return jsonb_build_object(
    'completed_lessons', v_target,
    'total_lessons', v_total,
    'level_rewards', v_rewards,
    'xp', v_target * 200 + v_rewards * 500
  );
end;
$$;

revoke all on function developer_set_course_progress(bigint, integer) from public;
grant execute on function developer_set_course_progress(bigint, integer) to authenticated;

commit;

-- Grant a developer once, using their Monoko login email:
-- insert into app_developers (user_id)
-- select id from auth.users where lower(email) = lower('developer@example.com')
-- on conflict (user_id) do nothing;
