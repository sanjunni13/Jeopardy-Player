import type { SupabaseClient } from '@supabase/supabase-js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Regex pattern for allowed player name characters (alphanumeric, spaces, hyphens, underscores) */
export const PLAYER_NAME_PATTERN = /^[a-zA-Z0-9 _-]+$/;

/** Minimum player name length (after trimming) */
export const MIN_PLAYER_NAME_LENGTH = 1;

/** Maximum player name length (after trimming) */
export const MAX_PLAYER_NAME_LENGTH = 50;

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validates a player name input.
 *
 * Rules:
 * - Trims leading/trailing whitespace before validation
 * - After trimming: minimum 1 character, maximum 50 characters
 * - Allowed characters: letters, digits, spaces, hyphens, underscores
 * - Empty or whitespace-only input is invalid
 * - Characters outside the allowed set are invalid
 */
export function validatePlayerName(input: string): ValidationResult {
  const trimmed = input.trim();

  if (trimmed.length === 0) {
    return {
      valid: false,
      error: 'Player name cannot be empty',
    };
  }

  if (trimmed.length > MAX_PLAYER_NAME_LENGTH) {
    return {
      valid: false,
      error: `Player name must be ${MAX_PLAYER_NAME_LENGTH} characters or fewer`,
    };
  }

  if (!PLAYER_NAME_PATTERN.test(trimmed)) {
    return {
      valid: false,
      error: 'Player name can only contain letters, numbers, spaces, hyphens, and underscores',
    };
  }

  return { valid: true };
}

// ─── Duplicate Check ──────────────────────────────────────────────────────────

export interface NameAvailabilityResult {
  available: boolean;
  /** If a matching unclaimed row exists (auth_uuid is null), this is its id */
  unclaimedPlayerId?: number;
}

/**
 * Checks whether a player name is available for use during signup.
 *
 * A name is considered available if:
 * - No row exists with that name (case-insensitive), OR
 * - A row exists but has no `auth_uuid` (unclaimed player from game stats).
 *
 * If the row is unclaimed, the caller can claim it by setting auth_uuid.
 * If the row already has an auth_uuid, the name is truly taken.
 */
export async function checkPlayerNameAvailability(
  name: string,
  supabase: SupabaseClient
): Promise<NameAvailabilityResult> {
  const trimmed = name.trim();

  const { data, error } = await supabase
    .from('players')
    .select('id, auth_uuid')
    .ilike('player_name', trimmed)
    .limit(1);

  if (error) {
    throw error;
  }

  // No existing row — name is fully available
  if (data.length === 0) {
    return { available: true };
  }

  const existing = data[0];

  // Row exists but is unclaimed (no auth account linked) — can be claimed
  if (!existing.auth_uuid) {
    return { available: true, unclaimedPlayerId: existing.id };
  }

  // Row exists and is already claimed by another account
  return { available: false };
}

/**
 * @deprecated Use checkPlayerNameAvailability instead.
 * Kept for backward compatibility — returns simple boolean.
 */
export async function checkPlayerNameAvailable(
  name: string,
  supabase: SupabaseClient
): Promise<boolean> {
  const result = await checkPlayerNameAvailability(name, supabase);
  return result.available;
}

// ─── Claim Existing Player ────────────────────────────────────────────────────

/**
 * Claims an existing unclaimed player row by setting its auth_uuid.
 * This links the existing leaderboard stats to the newly signed-up user.
 *
 * Returns true on success, throws on error.
 */
export async function claimExistingPlayer(
  playerId: number,
  authUuid: string,
  supabase: SupabaseClient
): Promise<boolean> {
  const { error } = await supabase
    .from('players')
    .update({ auth_uuid: authUuid })
    .eq('id', playerId)
    .is('auth_uuid', null); // Safety: only claim if still unclaimed

  if (error) {
    throw error;
  }

  return true;
}

// ─── Player Record Types ──────────────────────────────────────────────────────

export interface PlayerInsertPayload {
  player_name: string;
  auth_uuid: string;
  total_games_played: number;
  total_games_won: number;
  total_correct_answers: number;
  total_incorrect_answers: number;
  total_correct_daily_doubles: number;
  total_incorrect_daily_doubles: number;
  total_correct_final_jeopardies: number;
  total_incorrect_final_jeopardies: number;
  current_balance: number;
  total_money_earned: number;
}

// ─── Record Construction ──────────────────────────────────────────────────────

/**
 * Builds a player insert payload for Supabase.
 *
 * Trims the player name and sets all statistics fields to zero.
 * The auth_uuid is set to the provided Auth UUID from the authenticated session.
 */
export function buildPlayerInsertPayload(playerName: string, authUuid: string): PlayerInsertPayload {
  return {
    player_name: playerName.trim(),
    auth_uuid: authUuid,
    total_games_played: 0,
    total_games_won: 0,
    total_correct_answers: 0,
    total_incorrect_answers: 0,
    total_correct_daily_doubles: 0,
    total_incorrect_daily_doubles: 0,
    total_correct_final_jeopardies: 0,
    total_incorrect_final_jeopardies: 0,
    current_balance: 0,
    total_money_earned: 0,
  };
}
