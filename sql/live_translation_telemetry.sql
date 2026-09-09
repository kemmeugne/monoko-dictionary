-- Privacy-safe operational telemetry for live translation.
-- Run once in the Supabase SQL Editor before deploying the matching endpoint.
-- No audio, transcript, translation, prompt or retrieved corpus is stored.

begin;

create table if not exists live_translation_events (
  id                    bigserial primary key,
  event_id              text not null unique check (char_length(event_id) between 12 and 80),
  user_id               uuid not null references auth.users(id) on delete cascade,
  language_id           bigint not null references languages(id),
  event_type            text not null check (event_type in ('translation','playback')),
  direction             text not null check (direction in ('fr_to_lingala','lingala_to_fr')),
  input_mode            text not null check (input_mode in ('speech','text','edit')),
  outcome               text not null check (outcome in ('success','failure')),
  failure_stage         text check (failure_stage in ('capture','stt','context','translation','tts')),
  failure_code          text check (char_length(failure_code) between 1 and 64),
  source_length_bucket  text check (source_length_bucket in ('1-25','26-75','76-150','151+')),
  audio_duration_bucket text check (audio_duration_bucket in ('0-3s','3-7s','7-15s','15s+')),
  capture_ms            integer check (capture_ms between 0 and 120000),
  stt_ms                integer check (stt_ms between 0 and 120000),
  context_ms            integer check (context_ms between 0 and 120000),
  translation_ms        integer check (translation_ms between 0 and 120000),
  tts_ms                integer check (tts_ms between 0 and 120000),
  created_at            timestamptz not null default now(),
  check ((outcome = 'success' and failure_stage is null and failure_code is null) or outcome = 'failure')
);

create index if not exists live_translation_events_funnel
  on live_translation_events (created_at desc, event_type, outcome, direction);
create index if not exists live_translation_events_user
  on live_translation_events (user_id, created_at desc);

alter table live_translation_events enable row level security;

-- Vercel writes with the server credential. Browser roles receive no policy.
revoke all on table live_translation_events from public, anon, authenticated;
revoke all on sequence live_translation_events_id_seq from public, anon, authenticated;

commit;

-- Aggregate examples (never select by user or event_id for product reporting):
-- select direction, outcome, count(*) from live_translation_events
-- where event_type = 'translation' group by direction, outcome;
-- select failure_stage, failure_code, count(*) from live_translation_events
-- where outcome = 'failure' group by failure_stage, failure_code order by count(*) desc;
