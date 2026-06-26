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

/**
 * Checks whether a player name is available (not already taken).
 *
 * Performs a case-insensitive comparison against the `players` table.
 * Returns `true` if the name is available, `false` if it is already taken.
 */
export async function checkPlayerNameAvailable(
  name: string,
  supabase: SupabaseClient
): Promise<boolean> {
  const trimmed = name.trim();

  const { data, error } = await supabase
    .from('players')
    .select('id')
    .ilike('player_name', trimmed)
    .limit(1);

  if (error) {
    throw error;
  }

  return data.length === 0;
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
