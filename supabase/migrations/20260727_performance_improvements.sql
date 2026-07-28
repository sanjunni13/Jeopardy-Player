-- Issue #10: Add storage_path column to games table for direct file resolution
ALTER TABLE games ADD COLUMN IF NOT EXISTS storage_path TEXT;

-- Backfill existing games where created_by has an auth_uuid
-- (New games will have storage_path set at insert time)
UPDATE games g
SET storage_path = p.auth_uuid || '/' || g.game_name || '.json'
FROM players p
WHERE g.created_by = p.id
  AND g.storage_path IS NULL
  AND p.auth_uuid IS NOT NULL;

-- Issue #4: Create RPC for aggregated game rating summaries
CREATE OR REPLACE FUNCTION get_game_rating_summaries(game_ids BIGINT[])
RETURNS TABLE(game_id BIGINT, avg_rating NUMERIC, rating_count BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT
    gr.game_id,
    ROUND(AVG(gr.rating)::numeric, 1) AS avg_rating,
    COUNT(*) AS rating_count
  FROM game_ratings gr
  WHERE gr.game_id = ANY(game_ids)
  GROUP BY gr.game_id;
$$;
