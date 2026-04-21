-- Monoko tester tracking setup
-- Run this in the Supabase SQL editor before using tester/session tracking.

alter table corrections
  add column if not exists tester_name text,
  add column if not exists session_id text;

create table if not exists chat_events (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  tester_name text,
  session_id text,
  language_id bigint references languages(id),
  user_query text,
  assistant_response text,
  message_count int
);

create index if not exists idx_chat_events_created_at on chat_events(created_at desc);
create index if not exists idx_chat_events_tester_name on chat_events(tester_name);
create index if not exists idx_chat_events_session_id on chat_events(session_id);
create index if not exists idx_corrections_tester_name on corrections(tester_name);
create index if not exists idx_corrections_session_id on corrections(session_id);
