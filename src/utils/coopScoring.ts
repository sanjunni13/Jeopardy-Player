import type { NormalizedGame } from '../types/game'

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface CoopScoringOptions {
  prevMarking: 'correct' | 'incorrect' | null
  newMarking: 'correct' | 'incorrect' | null
  baseValue: number
  currentPool: number
}

export interface CoopScoringResult {
  poolDelta: number
  newPool: number
}

/** An inclusive whole-dollar wager range. */
export interface CoopWagerRange {
  min: number
  max: number
}

// ─── Utility Functions ───────────────────────────────────────────────────────

/**
 * Calculates the total point value of all clues across all rounds,
 * excluding Final Jeopardy.
 */
export function calculateBoardTotal(game: NormalizedGame): number {
  let total = 0
  for (const roundName of Object.keys(game.rounds)) {
    const categories = game.rounds[roundName as keyof typeof game.rounds]
    if (!categories) continue
    for (const category of categories) {
      for (const clue of category.clues) {
        total += clue.value
      }
    }
  }
  return total
}

/**
 * Calculates the target score the team must reach.
 */
export function calculateTargetScore(boardTotal: number, targetPercentage: number): number {
  return Math.floor(boardTotal * targetPercentage / 100)
}

/**
 * Applies co-op scoring logic: reverses a previous marking (if any)
 * and applies a new marking (if any), returning the net pool delta and new pool.
 */
export function applyCoopScoring(opts: CoopScoringOptions): CoopScoringResult {
  const { prevMarking, newMarking, baseValue, currentPool } = opts

  let poolDelta = 0

  // Reverse previous marking
  if (prevMarking === 'correct') {
    poolDelta -= baseValue
  } else if (prevMarking === 'incorrect') {
    poolDelta += baseValue
  }

  // Apply new marking
  if (newMarking === 'correct') {
    poolDelta += baseValue
  } else if (newMarking === 'incorrect') {
    poolDelta -= baseValue
  }

  return {
    poolDelta,
    newPool: currentPool + poolDelta,
  }
}

/** The co-op wager floor: a team can always wager up to $1,000. */
export const COOP_WAGER_FLOOR = 1000

/**
 * The permitted co-op team wager range: a minimum of $1 through a maximum of
 * the greater of the team pool and $1,000 (Requirement 4.11).
 *
 * The team pool is the only input. No Lowest_Positive_Balance rule and no
 * configured wager floor influence the co-op range.
 */
export function computeCoopWagerRange(teamPool: number): CoopWagerRange {
  return { min: 1, max: Math.max(teamPool, COOP_WAGER_FLOOR) }
}

/**
 * Returns the maximum wager for a Daily Double in co-op mode: the greater of
 * the team pool and $1,000, so a team at or below $0 can still recover.
 */
export function getCoopDailyDoubleMaxWager(teamPool: number): number {
  return computeCoopWagerRange(teamPool).max
}
