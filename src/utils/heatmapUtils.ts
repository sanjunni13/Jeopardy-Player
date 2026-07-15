import type { GameSession, ClueState, RoundName, Category } from '../types/game'

// ─── Types ────────────────────────────────────────────────────────────────────

export type HeatmapCellStatus = 'correct' | 'incorrect' | 'unanswered'

export interface HeatmapCell {
  categoryIndex: number
  clueIndex: number
  value: number
  status: HeatmapCellStatus
  /** True if this clue was a Daily Double */
  dailyDouble: boolean
  /** Players who answered incorrectly (only populated when status is 'incorrect') */
  incorrectPlayers: string[]
}

export interface HeatmapRound {
  roundName: RoundName
  roundDisplayName: string
  categories: string[]
  /** Grid of cells: [clueIndex][categoryIndex] */
  grid: HeatmapCell[][]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROUND_DISPLAY_NAMES: Record<RoundName, string> = {
  single: 'Single Jeopardy',
  double: 'Double Jeopardy',
  triple: 'Triple Jeopardy',
  quadruple: 'Quadruple Jeopardy',
  quintuple: 'Quintuple Jeopardy',
  sextuple: 'Sextuple Jeopardy',
}

// ─── Logic ────────────────────────────────────────────────────────────────────

/**
 * Determines the heatmap status of a single clue based on its ClueState.
 *
 * - 'correct': clue was chosen and at least one player answered correctly
 * - 'incorrect': clue was chosen and at least one player answered incorrectly (but none correct)
 * - 'unanswered': clue was never chosen, OR was chosen but nobody was marked at all
 */
export function getClueHeatmapStatus(clueState: ClueState | undefined): HeatmapCellStatus {
  if (!clueState || !clueState.chosen) {
    return 'unanswered'
  }

  const markings = Object.values(clueState.playerMarkings)
  const hasCorrect = markings.some(m => m === 'correct')

  if (hasCorrect) {
    return 'correct'
  }

  const hasIncorrect = markings.some(m => m === 'incorrect')

  if (hasIncorrect) {
    return 'incorrect'
  }

  // Chosen but all markings are null — nobody attempted it
  return 'unanswered'
}

/**
 * Returns the names of players who were marked incorrect for a given clue.
 */
export function getIncorrectPlayers(clueState: ClueState | undefined): string[] {
  if (!clueState) return []

  return Object.entries(clueState.playerMarkings)
    .filter(([, marking]) => marking === 'incorrect')
    .map(([name]) => name)
}

/**
 * Computes heatmap data for all rounds in a game session.
 */
export function computeHeatmapData(session: GameSession): HeatmapRound[] {
  const rounds: HeatmapRound[] = []

  for (let roundIdx = 0; roundIdx < session.orderedRoundNames.length; roundIdx++) {
    const roundName = session.orderedRoundNames[roundIdx]
    const categories: Category[] = session.game.rounds[roundName]

    if (!categories || categories.length === 0) continue

    const categoryNames = categories.map(c => c.category)
    const numClues = categories[0].clues.length
    const roundNumber = roundIdx + 1

    const grid: HeatmapCell[][] = []

    for (let clueIdx = 0; clueIdx < numClues; clueIdx++) {
      const row: HeatmapCell[] = []

      for (let catIdx = 0; catIdx < categories.length; catIdx++) {
        const key = `${roundName}-${catIdx}-${clueIdx}`
        const clueState = session.clueStates[key]
        const clue = categories[catIdx].clues[clueIdx]
        const status = getClueHeatmapStatus(clueState)

        row.push({
          categoryIndex: catIdx,
          clueIndex: clueIdx,
          value: clue?.value ?? (clueIdx + 1) * 200 * roundNumber,
          status,
          dailyDouble: clue?.dailyDouble ?? false,
          incorrectPlayers: status === 'incorrect' ? getIncorrectPlayers(clueState) : [],
        })
      }

      grid.push(row)
    }

    rounds.push({
      roundName,
      roundDisplayName: ROUND_DISPLAY_NAMES[roundName] ?? roundName,
      categories: categoryNames,
      grid,
    })
  }

  return rounds
}

/**
 * Computes summary statistics for a heatmap round.
 */
export function computeHeatmapSummary(round: HeatmapRound): {
  correct: number
  incorrect: number
  unanswered: number
  total: number
} {
  let correct = 0
  let incorrect = 0
  let unanswered = 0

  for (const row of round.grid) {
    for (const cell of row) {
      switch (cell.status) {
        case 'correct':
          correct++
          break
        case 'incorrect':
          incorrect++
          break
        case 'unanswered':
          unanswered++
          break
      }
    }
  }

  return { correct, incorrect, unanswered, total: correct + incorrect + unanswered }
}
