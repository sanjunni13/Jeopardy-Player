-- Add a persisted Gambling_Mode sub-phase to game_sessions.
--
-- The `phase` column only distinguishes lobby | buzzer | final-jeopardy | ended,
-- so the auction (bidding) and betting phases were previously broadcast-only and
-- invisible to any player device that missed the ephemeral realtime message or
-- refreshed the page — leaving that player stranded on the locked buzzer.
--
-- `gambling_state` is the DB record of the current auction/betting sub-phase:
--   { "phase": "auction", "auction": { ... } }
--   { "phase": "betting", "betting": { ... } }
-- NULL means no gambling sub-phase is active (normal buzzer/board play).
ALTER TABLE game_sessions
  ADD COLUMN IF NOT EXISTS gambling_state JSONB;
