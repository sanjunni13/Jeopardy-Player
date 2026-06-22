import type { RoundName } from '../types/game'

// ─── Types ─────────────────────────────────────────────────────────────────────

/** Media attachment for a clue or final round */
export interface MediaAttachment {
  type: 'image' | 'audio' | 'youtube'
  url: string
  filename?: string
}

/** Form-level state for a single clue row */
export interface ClueFormState {
  value: string
  clue: string
  solution: string
  dailyDouble: boolean
  media?: MediaAttachment[]
}

/** Form-level state for a single category */
export interface CategoryFormState {
  name: string
  clues: ClueFormState[]
  isDefaultName: boolean
}

/** Form-level state for Final Jeopardy */
export interface FinalRoundFormState {
  category: string
  clue: string
  solution: string
  media?: MediaAttachment[]
}

/** Per-round state */
export interface RoundFormState {
  categories: CategoryFormState[]
  pointValues: number[]
}

/** Top-level builder form state */
export interface BuilderFormState {
  gameName: string
  totalRounds: number
  categoriesPerRound: number
  rounds: RoundFormState[]
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
 * Generates default point values for a given round number and row count.
 * Round 1 base values: 200, 400, 600, 800, 1000
 * Each subsequent round multiplies by the round number.
 * For row counts beyond 5, continues the 200-increment progression.
 */
export function generateDefaultPointValues(roundNumber: number, rowCount: number = 5): number[] {
  const baseValues = [200, 400, 600, 800, 1000]
  const multiplier = roundNumber

  if (rowCount <= 5) {
    return baseValues.slice(0, rowCount).map(v => v * multiplier)
  }
  return Array.from({ length: rowCount }, (_, i) => (i + 1) * 200 * multiplier)
}

/**
 * Produces a correctly-sized empty form state.
 * Each round has 6 categories × 5 rows with default point values.
 * Categories are assigned default names ("Category 1", "Category 2", etc.).
 * All objects are distinct (no shared references).
 */
export function generateEmptyFormState(
  totalRounds: number,
  categoriesPerRound: number,
): BuilderFormState {
  const rowCount = 5

  const createEmptyClue = (): ClueFormState => ({
    value: '',
    clue: '',
    solution: '',
    dailyDouble: false,
  })

  const createEmptyCategory = (categoryIndex: number): CategoryFormState => ({
    name: `Category ${categoryIndex + 1}`,
    clues: Array.from({ length: rowCount }, () => createEmptyClue()),
    isDefaultName: true,
  })

  const createEmptyRound = (roundIndex: number): RoundFormState => ({
    categories: Array.from({ length: categoriesPerRound }, (_, catIdx) =>
      createEmptyCategory(catIdx),
    ),
    pointValues: generateDefaultPointValues(roundIndex + 1, rowCount),
  })

  return {
    gameName: '',
    totalRounds,
    categoriesPerRound,
    rounds: Array.from({ length: totalRounds }, (_, roundIdx) => createEmptyRound(roundIdx)),
    finalRound: { category: '', clue: '', solution: '' },
  }
}
