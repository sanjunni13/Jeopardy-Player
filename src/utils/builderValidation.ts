import type { BuilderFormState, ValidationErrors, ClueFormState, CategoryFormState } from './builderFormStructure'

// Re-export types for backward compatibility with existing imports
export type { BuilderFormState, ValidationErrors, ClueFormState, CategoryFormState }

// ─── Constants ─────────────────────────────────────────────────────────────

const GAME_NAME_REGEX = /^[\w\s-]{1,100}$/

/**
 * Regex for recognized YouTube URL patterns:
 * - youtube.com/watch?v=ID
 * - youtu.be/ID
 * - youtube.com/embed/ID
 * With optional http(s)://, www. prefix
 */
const YOUTUBE_URL_REGEX = /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)[\w-]+/

// ─── Validation Functions ──────────────────────────────────────────────────

/**
 * Validates a game name string.
 * Returns null if valid, or an error message string if invalid.
 */
export function validateGameName(name: string): string | null {
  if (name.length === 0) {
    return 'Game name is required'
  }
  if (!GAME_NAME_REGEX.test(name)) {
    return 'Game name must be 1–100 characters: letters, numbers, spaces, hyphens, underscores only'
  }
  return null
}

/**
 * Validates a clue value string.
 * Returns null if empty (allowed during editing) or a valid integer 1–999999.
 * Returns an error message for invalid values.
 */
export function validateClueValue(value: string): string | null {
  if (value === '') return null
  const num = Number(value)
  if (!Number.isInteger(num) || num < 1 || num > 999999) {
    return 'Clue value must be a whole number between 1 and 999,999'
  }
  return null
}

/**
 * Validates a point value (number or string).
 * If string, parses to number first.
 * Returns null if valid (positive integer ≥ 1), or an error message string if invalid.
 */
export function validatePointValue(value: number | string): string | null {
  const num = typeof value === 'string' ? Number(value) : value
  if (isNaN(num) || !Number.isFinite(num)) {
    return 'Point value must be a valid number'
  }
  if (!Number.isInteger(num)) {
    return 'Point value must be a whole number'
  }
  if (num < 1) {
    return 'Point value must be at least 1'
  }
  return null
}

/**
 * Validates a YouTube URL against recognized patterns.
 * Returns true if the URL matches: youtube.com/watch?v=ID, youtu.be/ID, or youtube.com/embed/ID
 * (with optional www., https://, http:// prefix). Returns false otherwise.
 */
export function validateYouTubeUrl(url: string): boolean {
  return YOUTUBE_URL_REGEX.test(url)
}

/**
 * Validates all fields for publish. Every required field must be non-empty and valid.
 * Returns a ValidationErrors record with an entry for each invalid field.
 * An empty record means all fields are valid.
 */
export function validateForPublish(state: BuilderFormState): ValidationErrors {
  const errors: ValidationErrors = {}

  // Validate game name
  const gameNameError = validateGameName(state.gameName)
  if (gameNameError) {
    errors['gameName'] = gameNameError
  }

  // Validate all rounds
  for (let roundIdx = 0; roundIdx < state.rounds.length; roundIdx++) {
    const round = state.rounds[roundIdx]

    // Validate point values per row
    for (let rowIdx = 0; rowIdx < round.pointValues.length; rowIdx++) {
      const pointValueError = validatePointValue(round.pointValues[rowIdx])
      if (pointValueError) {
        errors[`rounds.${roundIdx}.pointValues.${rowIdx}`] = pointValueError
      }
    }

    for (let catIdx = 0; catIdx < round.categories.length; catIdx++) {
      const category = round.categories[catIdx]

      // Category name must be non-empty and not a default name
      if (category.name.trim() === '') {
        errors[`rounds.${roundIdx}.${catIdx}.name`] = 'Category name is required'
      } else if (category.isDefaultName) {
        errors[`rounds.${roundIdx}.${catIdx}.name`] = 'Please provide a custom category name'
      }

      // Each clue row
      for (let clueIdx = 0; clueIdx < category.clues.length; clueIdx++) {
        const clue = category.clues[clueIdx]

        // Clue value must be non-empty and valid
        if (clue.value.trim() === '') {
          errors[`rounds.${roundIdx}.${catIdx}.clues.${clueIdx}.value`] = 'Clue value is required'
        } else {
          const valueError = validateClueValue(clue.value)
          if (valueError) {
            errors[`rounds.${roundIdx}.${catIdx}.clues.${clueIdx}.value`] = valueError
          }
        }

        // Clue text must be non-empty
        if (clue.clue.trim() === '') {
          errors[`rounds.${roundIdx}.${catIdx}.clues.${clueIdx}.clue`] = 'Clue text is required'
        }

        // Solution text must be non-empty
        if (clue.solution.trim() === '') {
          errors[`rounds.${roundIdx}.${catIdx}.clues.${clueIdx}.solution`] = 'Solution is required'
        }
      }
    }
  }

  // Validate Final Jeopardy
  if (state.finalRound.category.trim() === '') {
    errors['final.category'] = 'Final Jeopardy category is required'
  }
  if (state.finalRound.clue.trim() === '') {
    errors['final.clue'] = 'Final Jeopardy clue is required'
  }
  if (state.finalRound.solution.trim() === '') {
    errors['final.solution'] = 'Final Jeopardy solution is required'
  }

  return errors
}

/**
 * Validates only non-empty fields for format validity.
 * Empty fields are permitted (no errors generated for them).
 * Only flags fields that have content but in an invalid format.
 * Returns a ValidationErrors record. An empty record means no format errors.
 */
export function validateForSave(state: BuilderFormState): ValidationErrors {
  const errors: ValidationErrors = {}

  // Only validate game name if non-empty
  if (state.gameName !== '') {
    const gameNameError = validateGameName(state.gameName)
    if (gameNameError) {
      errors['gameName'] = gameNameError
    }
  }

  // Validate all rounds — only non-empty fields
  for (let roundIdx = 0; roundIdx < state.rounds.length; roundIdx++) {
    const round = state.rounds[roundIdx]
    for (let catIdx = 0; catIdx < round.categories.length; catIdx++) {
      const category = round.categories[catIdx]

      // Category names don't have a format constraint beyond length (1-100)
      // so we don't flag them here — they're only required on publish

      // Each clue row — only check value format if non-empty
      for (let clueIdx = 0; clueIdx < category.clues.length; clueIdx++) {
        const clue = category.clues[clueIdx]

        if (clue.value.trim() !== '') {
          const valueError = validateClueValue(clue.value)
          if (valueError) {
            errors[`rounds.${roundIdx}.${catIdx}.clues.${clueIdx}.value`] = valueError
          }
        }
      }
    }
  }

  return errors
}
