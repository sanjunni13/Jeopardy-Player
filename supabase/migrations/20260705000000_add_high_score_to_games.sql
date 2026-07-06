-- Add high score tracking columns to games table
ALTER TABLE games
  ADD COLUMN IF NOT EXISTS high_score integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS high_score_player text DEFAULT NULL;

-- Add a comment for documentation
COMMENT ON COLUMN games.high_score IS 'Highest score ever achieved on this game';
COMMENT ON COLUMN games.high_score_player IS 'Name of the player who achieved the high score';
