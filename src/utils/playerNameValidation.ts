import type { SessionPlayer } from '../types/session';

type ValidationResult = { valid: true } | { valid: false; error: string };

/**
 * Validates a player name.
 * Accepts strings with 1-20 characters that contain at least one non-whitespace character.
 */
export function validatePlayerName(name: string): ValidationResult {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: 'A valid name is required' };
  }

  if (name.length > 20) {
    return { valid: false, error: 'Name must be 20 characters or fewer' };
  }

  return { valid: true };
}

/**
 * Checks if a candidate name is a duplicate of any existing player name (case-insensitive).
 */
export function isDuplicateName(players: SessionPlayer[], candidateName: string): boolean {
  const normalizedCandidate = candidateName.toLowerCase();
  return players.some(player => player.name.toLowerCase() === normalizedCandidate);
}
