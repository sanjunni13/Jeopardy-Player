/**
 * Determines whether the Answer Sheet should be visible during gameplay.
 *
 * The Answer Sheet is shown when:
 * - The game was launched from the Game Library (`fromLibrary === true`), OR
 * - The game source is 'ai', 'labs', or 'archive'
 *
 * @param source - The game's source field ('ai', 'labs', 'archive', null, or undefined)
 * @param fromLibrary - Whether the game was launched from the Game Library page
 * @returns true if the Answer Sheet should be displayed
 */
export function shouldShowCheatSheet(
  source: string | null | undefined,
  fromLibrary?: boolean
): boolean {
  if (fromLibrary === true) {
    return true
  }

  return source === 'ai' || source === 'labs' || source === 'archive'
}
