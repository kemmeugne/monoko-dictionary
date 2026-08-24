-- Production security hardening for authenticated APIs, corrections and the
-- competitive progression ledger. Apply after trail_rewards.sql.
-- Idempotent: safe to run again.

begin;

-- Corrections may contain learner prompts and professor edits. They are never
-- readable or writable directly by browser roles; the authenticated submission
-- endpoint and password-protected admin endpoint use the service role.
alter table corrections add column if not exists submitted_by uuid references auth.users(id) on delete set null;
alter table corrections enable row level security;

drop policy if exists "Public read corrections" on corrections;
drop policy if exists "Public insert corrections" on corrections;
drop policy if exists "Anyone can read corrections" on corrections;
drop policy if exists "Anyone can insert corrections" on corrections;
drop policy if exists "corrections public read" on corrections;
drop policy if exists "corrections public insert" on corrections;
drop policy if exists "Public read" on corrections;
drop policy if exists "Public insert" on corrections;

-- Production predates the tracked migrations and has used several policy names
-- over time. Remove every remaining correction policy instead of relying on a
-- list that can miss a dashboard-created name. Service-role endpoints bypass
-- RLS and therefore need no policy here.
do $$
declare
  policy_name text;
begin
  for policy_name in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'corrections'
  loop
    execute format('drop policy %I on public.corrections', policy_name);
  end loop;
end;
$$;

-- Country is chosen once at signup. UI-only immutability is not enough because
-- profiles can also be updated through the Supabase REST API.
create or replace function enforce_country_immutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and old.country_code is not null
     and trim(old.country_code) <> ''
     and coalesce(trim(new.country_code), '') is distinct from trim(old.country_code)
  then
    raise exception 'Le pays ne peut pas être modifié après inscription'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_country_immutable on profiles;
create trigger profiles_country_immutable
  before update on profiles
  for each row execute function enforce_country_immutable();

-- Durable per-account API quotas. Browser roles have no table access and the
-- quota function is callable only with the service role used by Vercel APIs.
create table if not exists api_usage_events (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  scope      text not null check (char_length(scope) between 1 and 64),
  used_at    timestamptz not null default now()
);

create index if not exists api_usage_events_window
  on api_usage_events (user_id, scope, used_at desc);

alter table api_usage_events enable row level security;

create or replace function check_api_quota(
  p_user_id uuid,
  p_scope text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_user_id is null or p_scope is null or p_limit < 1
     or p_window_seconds < 1 or p_limit > 10000 or p_window_seconds > 604800 then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_scope, 0));
  select count(*) into v_count
  from api_usage_events
  where user_id = p_user_id
    and scope = p_scope
    and used_at >= now() - make_interval(secs => p_window_seconds);

  if v_count >= p_limit then return false; end if;
  insert into api_usage_events (user_id, scope) values (p_user_id, p_scope);

  if random() < 0.01 then
    delete from api_usage_events where used_at < now() - interval '8 days';
  end if;
  return true;
end;
$$;

revoke all on function check_api_quota(uuid,text,integer,integer) from public, anon, authenticated;
grant execute on function check_api_quota(uuid,text,integer,integer) to service_role;

-- One immutable receipt makes session recording idempotent even if a mobile
-- connection retries the RPC after the database committed but before replying.
create table if not exists learning_sessions (
  id             uuid primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  lesson_id      bigint references lessons(id) on delete cascade,
  course_id      bigint references courses(id) on delete cascade,
  language_id    bigint not null references languages(id),
  stage          text not null check (stage in ('pratiquer','elargir','level_challenge')),
  completed      boolean not null,
  question_count integer not null check (question_count between 1 and 20),
  score_pct      integer not null check (score_pct between 0 and 100),
  xp             integer not null check (xp between 0 and 250),
  created_at     timestamptz not null default now(),
  check ((lesson_id is not null) <> (course_id is not null))
);

alter table learning_sessions enable row level security;
drop policy if exists "Users read their own learning sessions" on learning_sessions;
create policy "Users read their own learning sessions" on learning_sessions
  for select using (auth.uid() = user_id);

-- Competitive state is readable by its owner but written only by the security
-- definer functions below. Reward RPCs remain the sole writers of gift XP.
drop policy if exists "Users record their own XP events" on user_xp_events;
drop policy if exists "Users manage their own attempts" on exercise_attempts;
drop policy if exists "Users manage their own stage state" on lesson_stage_state;
drop policy if exists "Users manage their own progress" on user_progress;
drop policy if exists "Users manage their own streak" on user_streak;
drop policy if exists "Users manage their own review schedule" on review_schedule;
drop policy if exists "Users manage completed level challenges" on level_challenge_state;
drop policy if exists "Users claim completed level rewards" on user_level_rewards;

drop policy if exists "Users read their own attempts" on exercise_attempts;
create policy "Users read their own attempts" on exercise_attempts
  for select using (auth.uid() = user_id);
drop policy if exists "Users read their own stage state" on lesson_stage_state;
create policy "Users read their own stage state" on lesson_stage_state
  for select using (auth.uid() = user_id);
drop policy if exists "Users read their own progress" on user_progress;
create policy "Users read their own progress" on user_progress
  for select using (auth.uid() = user_id);
drop policy if exists "Users read their own streak" on user_streak;
create policy "Users read their own streak" on user_streak
  for select using (auth.uid() = user_id);
drop policy if exists "Users read their own review schedule" on review_schedule;
create policy "Users read their own review schedule" on review_schedule
  for select using (auth.uid() = user_id);

create or replace function update_learning_streak(p_user_id uuid, p_local_day date)
returns user_streak
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current user_streak%rowtype;
begin
  if p_local_day < current_date - 1 or p_local_day > current_date + 1 then
    raise exception 'Invalid local day' using errcode = '22007';
  end if;

  select * into v_current from user_streak where user_id = p_user_id for update;
  if not found then
    insert into user_streak (user_id,current_streak,longest_streak,last_day)
    values (p_user_id,1,1,p_local_day) returning * into v_current;
  elsif v_current.last_day is null or p_local_day > v_current.last_day then
    update user_streak set
      current_streak = case when p_local_day = v_current.last_day + 1 then v_current.current_streak + 1 else 1 end,
      longest_streak = greatest(v_current.longest_streak,
        case when p_local_day = v_current.last_day + 1 then v_current.current_streak + 1 else 1 end),
      last_day = p_local_day,
      updated_at = now()
    where user_id = p_user_id returning * into v_current;
  end if;
  return v_current;
end;
$$;

revoke all on function update_learning_streak(uuid,date) from public, anon, authenticated;

create or replace function record_learning_session(
  p_session_id uuid,
  p_lesson_id bigint,
  p_language_id bigint,
  p_stage text,
  p_completed boolean,
  p_attempts jsonb,
  p_schedule jsonb,
  p_local_day date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer;
  v_scoreable integer;
  v_correct integer;
  v_pct integer;
  v_xp integer;
  v_bonus integer;
  v_inserted integer;
  v_passed boolean;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_stage not in ('pratiquer','elargir') then raise exception 'Invalid stage' using errcode = '22023'; end if;
  if jsonb_typeof(p_attempts) <> 'array' then raise exception 'Invalid attempts' using errcode = '22023'; end if;

  v_count := jsonb_array_length(p_attempts);
  if v_count < 1 or v_count > 20 then raise exception 'Invalid question count' using errcode = '22023'; end if;
  if p_completed and v_count < 2 then raise exception 'Completed session is too short' using errcode = '22023'; end if;

  if not exists (
    select 1 from lessons lesson join courses course on course.id = lesson.course_id
    where lesson.id = p_lesson_id and course.language_id = p_language_id
  ) then raise exception 'Lesson does not belong to language' using errcode = '23503'; end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_attempts) as attempt(pool_item_id bigint, format text, correct boolean, scored boolean)
    left join lesson_pool pool on pool.id = attempt.pool_item_id
    where pool.id is null or pool.lesson_id <> p_lesson_id
      or (p_stage = 'pratiquer' and pool.tier <> 'native')
      or (p_stage = 'elargir' and pool.tier not in ('approved','reassigned'))
      or attempt.format not in ('match_pairs','choose_audio','word_order','fill_blank','listen_type','speaking')
      or attempt.correct is null
  ) then raise exception 'Attempt does not belong to this session' using errcode = '23514'; end if;

  if (
    select count(*) <> count(distinct (pool_item_id, format))
    from jsonb_to_recordset(p_attempts) as attempt(pool_item_id bigint, format text, correct boolean, scored boolean)
  ) then raise exception 'Duplicate item format in session' using errcode = '23514'; end if;

  select count(*) filter (where format <> 'speaking'),
         count(*) filter (where format <> 'speaking' and correct)
    into v_scoreable, v_correct
  from jsonb_to_recordset(p_attempts) as attempt(pool_item_id bigint, format text, correct boolean, scored boolean);

  v_pct := case when v_scoreable = 0 then 0 else round(100.0 * v_correct / v_scoreable)::integer end;
  v_bonus := case when p_completed and v_pct = 100 then 50 else 0 end;
  v_xp := case when p_completed then v_count * 10 + v_bonus else 0 end;
  v_passed := p_completed and v_pct >= 80;

  insert into learning_sessions (id,user_id,lesson_id,language_id,stage,completed,question_count,score_pct,xp)
  values (p_session_id,v_user_id,p_lesson_id,p_language_id,p_stage,p_completed,v_count,v_pct,v_xp)
  on conflict (id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    return (select jsonb_build_object('recorded',false,'score_pct',score_pct,'xp',xp,'bonus',greatest(0,xp-question_count*10),'lesson_completed',stage='pratiquer' and completed and score_pct>=80)
            from learning_sessions where id=p_session_id and user_id=v_user_id);
  end if;

  insert into exercise_attempts (user_id,pool_item_id,lesson_id,stage,format,correct)
  select v_user_id,pool_item_id,p_lesson_id,p_stage,format,correct
  from jsonb_to_recordset(p_attempts) as attempt(pool_item_id bigint, format text, correct boolean, scored boolean);

  if jsonb_typeof(coalesce(p_schedule,'[]'::jsonb)) = 'array' then
    insert into review_schedule (user_id,pool_item_id,lesson_id,ease,interval_days,reps,due_on,updated_at)
    select v_user_id,s.pool_item_id,p_lesson_id,
           least(4.0,greatest(1.3,s.ease)),
           least(3650,greatest(0,s.interval_days)),
           least(10000,greatest(0,s.reps)),
           s.due_on,now()
    from jsonb_to_recordset(coalesce(p_schedule,'[]'::jsonb))
      as s(pool_item_id bigint,ease real,interval_days integer,reps integer,due_on date)
    where exists (
      select 1 from jsonb_to_recordset(p_attempts) as a(pool_item_id bigint,format text,correct boolean,scored boolean)
      where a.pool_item_id=s.pool_item_id
    )
    on conflict (user_id,pool_item_id) do update set
      lesson_id=excluded.lesson_id,ease=excluded.ease,interval_days=excluded.interval_days,
      reps=excluded.reps,due_on=excluded.due_on,updated_at=now();
  end if;

  if p_completed then
    insert into lesson_stage_state (user_id,lesson_id,language_id,pratiquer_passed,pratiquer_best,elargir_best,pratiquer_xp,elargir_xp,pratiquer_runs,elargir_runs,updated_at)
    values (v_user_id,p_lesson_id,p_language_id,p_stage='pratiquer' and v_passed,
      case when p_stage='pratiquer' then v_pct else 0 end,
      case when p_stage='elargir' then v_pct else 0 end,
      case when p_stage='pratiquer' then v_xp else 0 end,
      case when p_stage='elargir' then v_xp else 0 end,
      case when p_stage='pratiquer' then 1 else 0 end,
      case when p_stage='elargir' then 1 else 0 end,now())
    on conflict (user_id,lesson_id) do update set
      pratiquer_passed=lesson_stage_state.pratiquer_passed or excluded.pratiquer_passed,
      pratiquer_best=greatest(lesson_stage_state.pratiquer_best,excluded.pratiquer_best),
      elargir_best=greatest(lesson_stage_state.elargir_best,excluded.elargir_best),
      pratiquer_xp=lesson_stage_state.pratiquer_xp+excluded.pratiquer_xp,
      elargir_xp=lesson_stage_state.elargir_xp+excluded.elargir_xp,
      pratiquer_runs=lesson_stage_state.pratiquer_runs+excluded.pratiquer_runs,
      elargir_runs=lesson_stage_state.elargir_runs+excluded.elargir_runs,
      updated_at=now();

    insert into user_xp_events (user_id,language_id,lesson_id,stage,xp,event_key)
    values (v_user_id,p_language_id,p_lesson_id,p_stage,v_xp,p_session_id);
    perform update_learning_streak(v_user_id,p_local_day);

    if p_stage='pratiquer' and v_passed then
      insert into user_progress (user_id,lesson_id,language_id)
      values (v_user_id,p_lesson_id,p_language_id)
      on conflict (user_id,lesson_id) do nothing;
    end if;
  end if;

  return jsonb_build_object('recorded',true,'score_pct',v_pct,'xp',v_xp,'bonus',v_bonus,'lesson_completed',p_stage='pratiquer' and v_passed);
end;
$$;

revoke all on function record_learning_session(uuid,bigint,bigint,text,boolean,jsonb,jsonb,date) from public, anon;
grant execute on function record_learning_session(uuid,bigint,bigint,text,boolean,jsonb,jsonb,date) to authenticated;

create or replace function record_level_challenge_session(
  p_session_id uuid,
  p_course_id bigint,
  p_language_id bigint,
  p_attempts jsonb,
  p_local_day date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer;
  v_scoreable integer;
  v_correct integer;
  v_pct integer;
  v_xp integer;
  v_bonus integer;
  v_first_pass boolean;
  v_inserted integer;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if jsonb_typeof(p_attempts) <> 'array' then raise exception 'Invalid attempts' using errcode='22023'; end if;
  v_count := jsonb_array_length(p_attempts);
  if v_count < 2 or v_count > 20 then raise exception 'Invalid question count' using errcode='22023'; end if;
  if not exists (select 1 from courses where id=p_course_id and language_id=p_language_id) then raise exception 'Invalid course' using errcode='23503'; end if;
  if exists (select 1 from lessons l where l.course_id=p_course_id and not exists (select 1 from user_progress p where p.user_id=v_user_id and p.lesson_id=l.id)) then raise exception 'Level challenge is locked' using errcode='42501'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_attempts) as a(pool_item_id bigint,format text,correct boolean,scored boolean)
    left join lesson_pool pool on pool.id=a.pool_item_id left join lessons lesson on lesson.id=pool.lesson_id
    where pool.id is null or lesson.course_id<>p_course_id or pool.tier not in ('native','approved','reassigned')
      or a.format not in ('match_pairs','choose_audio','word_order','fill_blank','listen_type','speaking') or a.correct is null
  ) then raise exception 'Attempt does not belong to this challenge' using errcode='23514'; end if;

  if (
    select count(*) <> count(distinct (pool_item_id, format))
    from jsonb_to_recordset(p_attempts) as a(pool_item_id bigint,format text,correct boolean,scored boolean)
  ) then raise exception 'Duplicate item format in challenge' using errcode='23514'; end if;

  select count(*) filter(where format<>'speaking'),count(*) filter(where format<>'speaking' and correct)
    into v_scoreable,v_correct from jsonb_to_recordset(p_attempts) as a(pool_item_id bigint,format text,correct boolean,scored boolean);
  v_pct := case when v_scoreable=0 then 0 else round(100.0*v_correct/v_scoreable)::integer end;
  v_bonus := case when v_pct=100 then 50 else 0 end;
  v_xp := v_count*10+v_bonus;

  insert into learning_sessions(id,user_id,course_id,language_id,stage,completed,question_count,score_pct,xp)
  values(p_session_id,v_user_id,p_course_id,p_language_id,'level_challenge',true,v_count,v_pct,v_xp)
  on conflict(id) do nothing;
  get diagnostics v_inserted=row_count;
  if v_inserted=0 then return (select jsonb_build_object('recorded',false,'score_pct',score_pct,'xp',xp,'bonus',greatest(0,xp-question_count*10),'milestone_bonus',0) from learning_sessions where id=p_session_id and user_id=v_user_id); end if;

  select coalesce(not passed,true) and v_pct>=80 into v_first_pass
  from level_challenge_state where user_id=v_user_id and course_id=p_course_id;
  if not found then v_first_pass := v_pct>=80; end if;

  insert into level_challenge_state(user_id,course_id,language_id,best_score,passed,runs,session_xp,reward_xp,updated_at)
  values(v_user_id,p_course_id,p_language_id,v_pct,v_pct>=80,1,v_xp,0,now())
  on conflict(user_id,course_id) do update set
    best_score=greatest(level_challenge_state.best_score,excluded.best_score),
    passed=level_challenge_state.passed or excluded.passed,
    runs=level_challenge_state.runs+1,
    session_xp=level_challenge_state.session_xp+excluded.session_xp,
    updated_at=now();

  insert into user_xp_events(user_id,language_id,stage,xp,event_key)
  values(v_user_id,p_language_id,'level_challenge',v_xp,p_session_id);
  perform update_learning_streak(v_user_id,p_local_day);

  return jsonb_build_object('recorded',true,'score_pct',v_pct,'xp',v_xp,'bonus',v_bonus,'milestone_bonus',case when v_first_pass then 300 else 0 end);
end;
$$;

revoke all on function record_level_challenge_session(uuid,bigint,bigint,jsonb,date) from public, anon;
grant execute on function record_level_challenge_session(uuid,bigint,bigint,jsonb,date) to authenticated;

commit;
