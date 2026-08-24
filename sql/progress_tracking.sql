-- Phase 2: User progress tracking
-- Run this in the Supabase SQL editor

-- ── profiles ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  user_id              uuid REFERENCES auth.users PRIMARY KEY,
  display_name         text,
  preferred_language_id int REFERENCES languages(id),
  created_at           timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own profile"
  ON profiles FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── user_progress ─────────────────────────────────────────────────────────────
-- One row per (user, lesson). exam_score stays null until Phase 3 exams ship.
CREATE TABLE IF NOT EXISTS user_progress (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users NOT NULL,
  lesson_id   int  REFERENCES lessons(id) ON DELETE CASCADE NOT NULL,
  language_id int  REFERENCES languages(id) NOT NULL,
  completed_at timestamptz DEFAULT now(),
  exam_score  numeric,
  UNIQUE (user_id, lesson_id)
);

ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own progress" ON user_progress;
DROP POLICY IF EXISTS "Users read their own progress" ON user_progress;
CREATE POLICY "Users read their own progress"
  ON user_progress FOR SELECT
  USING (auth.uid() = user_id);

-- Index for fast per-user queries
CREATE INDEX IF NOT EXISTS user_progress_user_lang_idx
  ON user_progress (user_id, language_id);
