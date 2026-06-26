-- Add auth_uuid column to players table to link player records to Supabase Auth users.
-- This column is nullable (existing players may not yet have an auth account linked),
-- has a unique constraint (one auth user maps to at most one player),
-- and references auth.users(id) as a foreign key.

ALTER TABLE public.players
  ADD COLUMN auth_uuid uuid UNIQUE REFERENCES auth.users(id);

-- Backfill: attempt to link existing players to auth users by joining
-- auth.users.email to the games.created_by field (which stores the creator's email).
-- For each auth user who has created games, find a player whose player_name matches
-- the local part of that email (case-insensitive). This is a best-effort heuristic
-- since the players table has no direct email column.
-- Players without a matching auth user will retain auth_uuid = NULL and can be
-- linked when they next sign in via the profile setup flow.

UPDATE public.players p
SET auth_uuid = matched.auth_id
FROM (
  SELECT DISTINCT ON (au.id)
    au.id AS auth_id,
    pl.id AS player_id
  FROM auth.users au
  INNER JOIN public.games g ON g.created_by = au.email
  INNER JOIN public.players pl
    ON LOWER(pl.player_name) = LOWER(SPLIT_PART(au.email, '@', 1))
  WHERE pl.auth_uuid IS NULL
  ORDER BY au.id, pl.id
) matched
WHERE p.id = matched.player_id
  AND p.auth_uuid IS NULL;
