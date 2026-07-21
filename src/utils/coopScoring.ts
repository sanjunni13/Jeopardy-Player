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

/**
 * Returns the maximum wager for a Daily Double in co-op mode.
 * If the team pool is positive, the max wager is the greater of teamPool or $1000.
 * Otherwise, the max wager is $1000 (allowing the team to recover).
 */
export function getCoopDailyDoubleMaxWager(teamPool: number): number {
  if (teamPool > 0) {
    return Math.max(teamPool, 1000)
  }
  return 1000
}
