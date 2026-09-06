import type { GameSession, ClueState, RoundName, Category } from '../types/game'
import { formatCurrency } from './currency'

// ─── Types ────────────────────────────────────────────────────────────────────

export type HeatmapCellStatus = 'correct' | 'incorrect' | 'unanswered'

export interface HeatmapCell {
  categoryIndex: number
  clueIndex: number
  value: number
  status: HeatmapCellStatus
  /** True if this clue was a Daily Double */
  dailyDouble: boolean
  /** Requirement 8.1 — all players marked `correct`, in session player order. */
  correctPlayers: string[]
  /** Requirement 8.1 — all players marked `incorrect`, in session player order. */
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
 * Returns the names of players holding the given marking for a clue, ordered by
 * `playerOrder` (which callers pass as `session.players.map(p => p.name)`).
 *
 * Filtering `playerOrder` rather than iterating `playerMarkings` gives session
 * order for free and drops any marking for a player no longer in the session.
 */
export function getMarkedPlayers(
  clueState: ClueState | undefined,
  marking: 'correct' | 'incorrect',
  playerOrder: string[],
): string[] {
  if (!clueState) return []
  return playerOrder.filter(name => clueState.playerMarkings[name] === marking)
}

/**
 * Returns the names of players who were marked incorrect for a given clue.
 *
 * Thin wrapper over `getMarkedPlayers`. When no `playerOrder` is supplied the
 * order falls back to `playerMarkings` key order.
 */
export function getIncorrectPlayers(
  clueState: ClueState | undefined,
  playerOrder?: string[],
): string[] {
  if (!clueState) return []

  return getMarkedPlayers(
    clueState,
    'incorrect',
    playerOrder ?? Object.keys(clueState.playerMarkings),
  )
}

/**
 * Builds the single string used as both a heatmap cell's tooltip and its
 * accessible label (Requirements 8.2–8.6, 8.8, 8.9). Names are joined with
 * ', ' with no truncation.
 */
export function buildHeatmapCellLabel(cell: HeatmapCell): string {
  const parts = [formatCurrency(cell.value)]

  if (cell.correctPlayers.length > 0) {
    parts.push(`Correct: ${cell.correctPlayers.join(', ')}`)
  }
  if (cell.incorrectPlayers.length > 0) {
    parts.push(`Incorrect: ${cell.incorrectPlayers.join(', ')}`)
  }
  if (cell.correctPlayers.length === 0 && cell.incorrectPlayers.length === 0) {
    parts.push('Not attempted')
  }
  if (cell.dailyDouble) {
    parts.push('Daily Double')
  }

  return parts.join(' — ')
}

/**
 * Computes heatmap data for all rounds in a game session.
 */
export function computeHeatmapData(session: GameSession): HeatmapRound[] {
  const playerOrder = session.players.map(p => p.name)
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
          correctPlayers: getMarkedPlayers(clueState, 'correct', playerOrder),
          incorrectPlayers: getMarkedPlayers(clueState, 'incorrect', playerOrder),
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
