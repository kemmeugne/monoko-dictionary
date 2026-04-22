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


-- ── 3. Corrections — public INSERT + SELECT, service key for writes ──────────
-- Users submit corrections with anon key (INSERT).
-- admin.html reads corrections with anon key (SELECT) — if this is ever
-- moved to a serverless function, remove the SELECT policy and lock down further.
-- Approve/reject go through /api/admin-action (service key, bypasses RLS).

ALTER TABLE corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read"   ON corrections FOR SELECT USING (true);
CREATE POLICY "Public insert" ON corrections FOR INSERT WITH CHECK (true);


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
-- user_progress: SELECT/INSERT/UPDATE for auth.uid() = user_id
