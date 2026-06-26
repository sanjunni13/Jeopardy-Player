/**
 * Game name utilities for the Generate Game page.
 * Provides sanitization, default name generation, and shared constants.
 */

/** Regex pattern for allowed game name characters */
export const GAME_NAME_PATTERN = /^[a-zA-Z0-9 \-_'.,!?]*$/

/** Maximum allowed game name length */
export const MAX_GAME_NAME_LENGTH = 100

/**
 * Strips characters outside the allowed set and truncates to MAX_GAME_NAME_LENGTH.
 * Allowed characters: letters, digits, spaces, hyphens, underscores, apostrophes,
 * periods, commas, exclamation marks, and question marks.
 */
export function sanitizeGameName(input: string): string {
  const stripped = input.replace(/[^a-zA-Z0-9 \-_'.,!?]/g, '')
  return stripped.slice(0, MAX_GAME_NAME_LENGTH)
}

/**
 * Returns a default game name in the format "{Method} Game - {MMM DD, YYYY}"
 * using the current date.
 */
export function getDefaultGameName(method: 'Archive' | 'Labs' | 'AI'): string {
  const date = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  return `${method} Game - ${date}`
}
