// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { ClueHeatmap } from './ClueHeatmap'
import type { ClueState, GameSession, NormalizedGame, Player } from '../../types/game'

// ─── Fixture Helpers ──────────────────────────────────────────────────────────

function makePlayer(name: string): Player {
  return {
    name,
    score: 0,
    correctCount: 0,
    incorrectCount: 0,
    correctDailyDoubles: 0,
    incorrectDailyDoubles: 0,
    correctFinalJeopardy: 0,
    incorrectFinalJeopardy: 0,
    totalEarned: 0,
  }
}

const MOCK_GAME: NormalizedGame = {
  rounds: {
    single: [
      {
        category: 'Science',
        clues: [
          { value: 1000, clue: 'Q1', solution: 'A1', dailyDouble: false, html: false },
          { value: 2000, clue: 'Q2', solution: 'A2', dailyDouble: true, html: false },
        ],
      },
    ],
    double: [],
    triple: [],
    quadruple: [],
    quintuple: [],
    sextuple: [],
  },
  final: { category: 'Final', clue: 'FQ', solution: 'FA', html: false },
  totalRounds: 1,
}

function makeSession(clueStates: Record<string, ClueState>): GameSession {
  return {
    game: MOCK_GAME,
    gameId: 'test-game',
    players: [makePlayer('Alice'), makePlayer('Bob'), makePlayer('Cara')],
    currentRoundIndex: 0,
    orderedRoundNames: ['single'],
    clueStates,
    dailyDoubleRecords: [],
    toggleConfig: {
      coop: { enabled: false, targetPercentage: 75 },
      wagering: { enabled: false, wagerFloor: 100 },
      rulesEngine: {
        enabled: false,
        stealBonus: { enabled: false, bonusPoints: 200 },
        streakMultiplier: { enabled: false, threshold: 3, multiplier: 2 },
        penaltyDoubler: { enabled: false },
      },
      timedClues: { enabled: false, timerDuration: 30 },
      gambling: { enabled: false, startingBalance: 1000, auctionTimer: 20 },
    },
    streakCounts: {},
    perRoundIncorrect: {},
    activeWagers: null,
    teamPool: 0,
    targetScore: 0,
    boardTotal: 0,
    gamblingLedger: [],
    categoryOwnership: {},
    activeSideBets: [],
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ClueHeatmap cell labels', () => {
  it('renders the visible cell value with the shared currency formatter', () => {
    render(<ClueHeatmap session={makeSession({})} />)

    expect(screen.getByText('$1,000')).toBeInTheDocument()
    expect(screen.getByText('$2,000')).toBeInTheDocument()
  })

  it('names winners and missers in session order for a mixed-outcome clue', () => {
    const session = makeSession({
      'single-0-0': {
        chosen: true,
        playerMarkings: { Cara: 'incorrect', Alice: 'correct', Bob: 'incorrect' },
      },
    })
    render(<ClueHeatmap session={session} />)

    const cell = screen.getByTitle('$1,000 — Correct: Alice — Incorrect: Bob, Cara')
    expect(cell).toBeInTheDocument()
  })

  it('sets every cell accessible label to the same string as its tooltip', () => {
    const session = makeSession({
      'single-0-0': { chosen: true, playerMarkings: { Alice: 'correct' } },
      'single-0-1': { chosen: true, playerMarkings: { Bob: 'incorrect' } },
    })
    const { container } = render(<ClueHeatmap session={session} />)

    const cells = container.querySelectorAll('td.clue-heatmap-cell')
    expect(cells.length).toBe(2)
    for (const cell of cells) {
      expect(cell.getAttribute('aria-label')).toBe(cell.getAttribute('title'))
    }
  })

  it('states the clue was not attempted and marks the Daily Double', () => {
    render(<ClueHeatmap session={makeSession({})} />)

    expect(screen.getByTitle('$1,000 — Not attempted')).toBeInTheDocument()
    expect(screen.getByTitle('$2,000 — Not attempted — Daily Double')).toBeInTheDocument()
  })
})
