-- ============================================================
-- Enable Row-Level Security on all public tables
-- Run this in the Supabase SQL editor.
-- Fixes: "Table publicly accessible" + "Sensitive data exposed"
-- ============================================================

-- ── 1. Dictionary tables — intentionally public read-only ────────────────────
-- Anyone can read; nobody can write via anon key.

ALTER TABLE languages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE words           ENABLE ROW LEVEL SECURITY;
ALTER TABLE senses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE examples        ENABLE ROW LEVEL SECURITY;
ALTER TABLE parallel_sentences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read" ON languages           FOR SELECT USING (true);
CREATE POLICY "Public read" ON words               FOR SELECT USING (true);
CREATE POLICY "Public read" ON senses              FOR SELECT USING (true);
CREATE POLICY "Public read" ON examples            FOR SELECT USING (true);
CREATE POLICY "Public read" ON parallel_sentences  FOR SELECT USING (true);


-- ── 2. Course tables — public read-only ─────────────────────────────────────
-- RAG context API uses service key (bypasses RLS).
-- Frontend reads with anon key for course display.

ALTER TABLE courses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons       ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_items  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read" ON courses       FOR SELECT USING (true);
CREATE POLICY "Public read" ON lessons       FOR SELECT USING (true);
CREATE POLICY "Public read" ON lesson_items  FOR SELECT USING (true);


-- ── 3. Corrections — service endpoints only ─────────────────────────────────
-- Learners submit through /api/corrections and the admin page reads and writes
-- through /api/admin-action. Both endpoints use the service role after their
-- own authentication checks, so browser roles need no table policy.

ALTER TABLE corrections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read"   ON corrections;
DROP POLICY IF EXISTS "Public insert" ON corrections;

DO $$
DECLARE policy_name text;
BEGIN
  FOR policy_name IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'corrections'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.corrections', policy_name);
  END LOOP;
END;
$$;


-- ── 4. Chat events — NO public access ───────────────────────────────────────
-- Contains tester names and full chat content.
-- Written and read exclusively via service key in /api/chat.js.
-- Service role bypasses RLS, so no policy needed — just enabling RLS
-- blocks all anon/authenticated access.

ALTER TABLE chat_events ENABLE ROW LEVEL SECURITY;
-- (no SELECT/INSERT policy = anon and authenticated roles are blocked)


-- ── 5. Profiles + user_progress — already have RLS from progress_tracking.sql
-- No changes needed here. Included for reference:
-- profiles:      SELECT/UPDATE for auth.uid() = user_id
-- user_progress: SELECT for auth.uid() = user_id; trusted RPCs record progress
