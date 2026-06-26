import type { RoundName } from '../types/game'
import { computeClueValue } from './clueValues'

// ─── Types ─────────────────────────────────────────────────────────────────────

/** Discriminated union for media attached to a clue */
export type MediaData =
  | { type: 'image'; url: string; fileName: string }
  | { type: 'audio'; url: string; fileName: string }
  | { type: 'youtube'; url: string }

/** Form-level state for a single clue row */
export interface ClueFormState {
  value: string
  clue: string
  solution: string
  dailyDouble: boolean
  media?: MediaData | null
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
  const createEmptyClue = (clueIndex: number, roundIndex: number): ClueFormState => ({
    value: String(computeClueValue(clueIndex + 1, roundIndex + 1)),
    clue: '',
    solution: '',
    dailyDouble: false,
    media: null,
  })

  const createEmptyCategory = (roundIndex: number): CategoryFormState => ({
    name: '',
    clues: [
      createEmptyClue(0, roundIndex),
      createEmptyClue(1, roundIndex),
      createEmptyClue(2, roundIndex),
      createEmptyClue(3, roundIndex),
      createEmptyClue(4, roundIndex),
    ],
  })

  return {
    gameName: '',
    totalRounds,
    categoriesPerRound,
    rounds: Array.from({ length: totalRounds }, (_, roundIdx) =>
      Array.from({ length: categoriesPerRound }, () => createEmptyCategory(roundIdx)),
    ),
    finalRound: { category: '', clue: '', solution: '' },
  }
}

/**
 * Recalculates all clue values in the given rounds array based on row position and round number.
 * Returns a new rounds array with updated values.
 */
export function recalculateClueValues(rounds: CategoryFormState[][]): CategoryFormState[][] {
  return rounds.map((round, roundIdx) =>
    round.map(cat => ({
      ...cat,
      clues: cat.clues.map((clue, clueIdx) => ({
        ...clue,
        value: String(computeClueValue(clueIdx + 1, roundIdx + 1)),
      })) as [ClueFormState, ClueFormState, ClueFormState, ClueFormState, ClueFormState],
    }))
  )
}
