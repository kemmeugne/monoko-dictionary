-- Migration: add latency columns to chat_events
-- Run in Supabase SQL editor

ALTER TABLE chat_events
  ADD COLUMN IF NOT EXISTS t_rag_ms integer,
  ADD COLUMN IF NOT EXISTS t_llm_ms integer;

-- Useful queries once data is collected:

-- Average latency breakdown
SELECT
  ROUND(AVG(t_rag_ms)) AS avg_rag_ms,
  ROUND(AVG(t_llm_ms)) AS avg_llm_ms,
  ROUND(AVG(t_rag_ms + t_llm_ms)) AS avg_total_ms
FROM chat_events
WHERE t_rag_ms IS NOT NULL;

-- p95 latency (good proxy for worst-case user experience)
SELECT
  PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY t_llm_ms) AS p50_llm_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY t_llm_ms) AS p95_llm_ms,
  PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY t_rag_ms) AS p50_rag_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY t_rag_ms) AS p95_rag_ms
FROM chat_events
WHERE t_rag_ms IS NOT NULL;
