-- Migration: Convert games.created_by from email (text) to Player ID (bigint).
-- This migration runs as a single transaction so that a failure at any step
-- rolls back all changes completely.

BEGIN;

-- Step 1: Add a new bigint column for the player ID.
ALTER TABLE public.games
  ADD COLUMN created_by_player_id bigint;

-- Step 2: Backfill created_by_player_id by joining:
--   games.created_by (email) → auth.users.email → auth.users.id → players.auth_uuid → players.id
-- Rows where the email does not resolve to a player record will remain NULL.
UPDATE public.games g
SET created_by_player_id = p.id
FROM auth.users au
INNER JOIN public.players p ON p.auth_uuid = au.id
WHERE g.created_by = au.email;

-- Step 3: Drop the old text-based created_by column.
ALTER TABLE public.games
  DROP COLUMN created_by;

-- Step 4: Rename the new column to created_by.
ALTER TABLE public.games
  RENAME COLUMN created_by_player_id TO created_by;

-- Step 5: Add foreign key constraint referencing players(id).
-- The column is nullable to allow orphaned games whose creator has no player record.
ALTER TABLE public.games
  ADD CONSTRAINT fk_games_created_by FOREIGN KEY (created_by) REFERENCES public.players(id);

COMMIT;
