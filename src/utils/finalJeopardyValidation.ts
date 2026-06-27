import type { FinalJeopardySubmission, SessionPlayer } from '../types/session';

type ValidationResult = { valid: true } | { valid: false; error: string };

/**
 * Returns the valid wager range for a player based on their current score.
 * Players with a score <= 0 can wager between $0 and $1,000.
 * Players with a positive score can wager between $0 and their current score.
 */
export function getValidWagerRange(playerScore: number): { min: number; max: number } {
  if (playerScore <= 0) {
    return { min: 0, max: 1000 };
  }
  return { min: 0, max: playerScore };
}

/**
 * Validates a wager amount against the player's current score.
 * Wager must be a whole integer within the valid range.
 */
export function validateWager(wager: number, playerScore: number): ValidationResult {
  const range = getValidWagerRange(playerScore);
  if (!Number.isInteger(wager)) {
    return { valid: false, error: 'Wager must be a whole dollar amount' };
  }
  if (wager < range.min || wager > range.max) {
    return { valid: false, error: `Wager must be between $${range.min} and $${range.max}` };
  }
  return { valid: true };
}

/**
 * Validates a Final Jeopardy answer.
 * Answer must be non-empty (after trimming) and at most 200 characters.
 */
export function validateAnswer(answer: string): ValidationResult {
  if (!answer || answer.trim().length === 0) {
    return { valid: false, error: 'Answer cannot be empty' };
  }
  if (answer.length > 200) {
    return { valid: false, error: 'Answer cannot exceed 200 characters' };
  }
  return { valid: true };
}

/**
 * Returns true if the player has NOT yet submitted (i.e., they CAN submit).
 * A player can submit only once.
 */
export function canSubmitFinalJeopardy(submissions: FinalJeopardySubmission[], playerName: string): boolean {
  return !submissions.some(s => s.playerName === playerName);
}

/**
 * Returns true if every registered player has exactly one submission.
 * Returns false if there are no players (avoids vacuous truth).
 */
export function allPlayersSubmitted(players: SessionPlayer[], submissions: FinalJeopardySubmission[]): boolean {
  if (players.length === 0) return false;
  return players.every(p => submissions.some(s => s.playerName === p.name));
}
