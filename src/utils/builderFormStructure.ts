import type { RoundName } from '../types/game'

// ─── Types ─────────────────────────────────────────────────────────────────────

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
  rounds: CategoryFormState[][] // rounds[roundIndex][categoryIndex]
  finalRound: FinalRoundFormState
}

/** Validation error map keyed by field path */
export type ValidationErrors = Record<string, string>

// ─── Constants ─────────────────────────────────────────────────────────────────

const ROUND_NAMES = [
  'single',
  'double',
  'triple',
  'quadruple',
  'quintuple',
  'sextuple',
] as const

// ─── Functions ─────────────────────────────────────────────────────────────────

/**
 * Returns the first N RoundName values in order.
 */
export function generateRoundLabels(totalRounds: number): RoundName[] {
  return ROUND_NAMES.slice(0, totalRounds) as RoundName[]
}

/**
 * Produces a correctly-sized empty form state.
 * Each category has 5 clues with empty strings and dailyDouble: false.
 * All objects are distinct (no shared references).
 */
export function generateEmptyFormState(
  totalRounds: number,
  categoriesPerRound: number,
): BuilderFormState {
  const createEmptyClue = (): ClueFormState => ({
    value: '',
    clue: '',
    solution: '',
    dailyDouble: false,
  })

  const createEmptyCategory = (): CategoryFormState => ({
    name: '',
    clues: [
      createEmptyClue(),
      createEmptyClue(),
      createEmptyClue(),
      createEmptyClue(),
      createEmptyClue(),
    ],
  })

  return {
    gameName: '',
    totalRounds,
    categoriesPerRound,
    rounds: Array.from({ length: totalRounds }, () =>
      Array.from({ length: categoriesPerRound }, () => createEmptyCategory()),
    ),
    finalRound: { category: '', clue: '', solution: '' },
  }
}
