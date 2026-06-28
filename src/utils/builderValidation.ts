// ─── Builder Form Types ────────────────────────────────────────────────────

/** Form-level state for a single clue row */
export interface ClueFormState {
  value: string
  clue: string
  solution: string
  dailyDouble: boolean
}

/** Form-level state for a single category */
export interface CategoryFormState {
  name: string
  clues: [ClueFormState, ClueFormState, ClueFormState, ClueFormState, ClueFormState]
}

/** Form-level state for Final Jeopardy */
export interface FinalRoundFormState {
  category: string
  clue: string
  solution: string
}

/** Top-level builder form state */
export interface BuilderFormState {
  gameName: string
  totalRounds: number
  categoriesPerRound: number
  rounds: CategoryFormState[][]
  finalRound: FinalRoundFormState
}

/** Validation error map keyed by field path */
export type ValidationErrors = Record<string, string>

// ─── Constants ─────────────────────────────────────────────────────────────

const GAME_NAME_REGEX = /^[\w\s-]{1,100}$/

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
    for (let catIdx = 0; catIdx < round.length; catIdx++) {
      const category = round[catIdx]

      // Category name must be non-empty
      if (category.name.trim() === '') {
        errors[`rounds.${roundIdx}.${catIdx}.name`] = 'Category name is required'
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

        // Clue text must be non-empty (unless media is attached)
        const hasMedia = !!(clue as Record<string, unknown>).media
        if (clue.clue.trim() === '' && !hasMedia) {
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
  if (state.finalRound.clue.trim() === '' && !(state.finalRound as Record<string, unknown>).media) {
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
    for (let catIdx = 0; catIdx < round.length; catIdx++) {
      const category = round[catIdx]

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
