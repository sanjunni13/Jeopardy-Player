/**
 * Buzzer logic pure functions.
 *
 * Handles buzz queue ordering, duplicate detection, lockout checks,
 * and overall buzz eligibility determination.
 */

import type { BuzzEvent, BuzzState } from '../types/session';

/**
 * Returns a copy of the buzz events sorted in ascending chronological order
 * by their server-side timestamp.
 *
 * @param events - Array of buzz events to order
 * @returns A new array sorted by timestamp (earliest first)
 */
export function orderBuzzQueue(events: BuzzEvent[]): BuzzEvent[] {
  return [...events].sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Returns true if the given player already has a buzz event in the queue.
 *
 * @param queue - The current buzz queue
 * @param playerName - The player name to check
 * @returns true if a duplicate buzz exists for this player
 */
export function isDuplicateBuzz(queue: BuzzEvent[], playerName: string): boolean {
  return queue.some(e => e.playerName === playerName);
}

/**
 * Returns true if the given player is in the locked-out list
 * (e.g., already answered incorrectly for the current clue).
 *
 * @param lockedOut - Array of locked-out player names
 * @param playerName - The player name to check
 * @returns true if the player is locked out
 */
export function isPlayerLockedOut(lockedOut: string[], playerName: string): boolean {
  return lockedOut.includes(playerName);
}

/**
 * Determines whether a player is eligible to buzz in given the current buzz state.
 *
 * A player can buzz if and only if all of the following hold:
 * - The system is not locked by the host
 * - A clue is currently active
 * - The player has not already buzzed in for this clue
 * - The player is not locked out (e.g., marked incorrect)
 *
 * @param buzzState - The current buzz state
 * @param playerName - The player name to check eligibility for
 * @returns true if the player is allowed to buzz in
 */
export function canPlayerBuzz(buzzState: BuzzState, playerName: string): boolean {
  if (buzzState.systemLocked) return false;
  if (!buzzState.clueActive) return false;
  if (isDuplicateBuzz(buzzState.queue, playerName)) return false;
  if (isPlayerLockedOut(buzzState.lockedOut, playerName)) return false;
  return true;
}
