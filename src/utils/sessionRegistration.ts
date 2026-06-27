/**
 * Session registration eligibility logic.
 *
 * Determines whether a new player can register for a game session
 * based on the session lock state and current player count.
 */

/**
 * Returns true if a new player can register for the session.
 *
 * Registration is allowed only when the session is not locked
 * AND the current player count is below the maximum.
 *
 * @param isLocked - Whether the session is currently locked by the host
 * @param playerCount - The current number of registered players
 * @param maxPlayers - The maximum allowed players (10)
 * @returns true if registration is allowed, false otherwise
 */
export function canRegisterPlayer(
  isLocked: boolean,
  playerCount: number,
  maxPlayers: number
): boolean {
  return !isLocked && playerCount < maxPlayers;
}
