-- Add reviewed_at timestamp to corrections
-- Populated by admin-action.js whenever a correction is approved or rejected

ALTER TABLE corrections ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

-- ── Useful queries ────────────────────────────────────────────────────────────

-- Corrections reviewed per day
SELECT
  DATE(reviewed_at) AS day,
  COUNT(*) AS reviewed
FROM corrections
WHERE reviewed_at IS NOT NULL
GROUP BY day
ORDER BY day DESC;

-- Session pace: average seconds between consecutive reviews per day
SELECT
  DATE(reviewed_at) AS day,
  COUNT(*) AS total,
  ROUND(EXTRACT(EPOCH FROM (MAX(reviewed_at) - MIN(reviewed_at))) / NULLIF(COUNT(*) - 1, 0)) AS avg_seconds_between,
  TO_CHAR(MIN(reviewed_at) AT TIME ZONE 'Africa/Kinshasa', 'HH24:MI') AS session_start,
  TO_CHAR(MAX(reviewed_at) AT TIME ZONE 'Africa/Kinshasa', 'HH24:MI') AS session_end
FROM corrections
WHERE reviewed_at IS NOT NULL
GROUP BY day
ORDER BY day DESC;
