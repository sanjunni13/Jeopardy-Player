import { describe, it, expect } from 'vitest'
import {
  getMarkedPlayers,
  getIncorrectPlayers,
  buildHeatmapCellLabel,
  computeHeatmapData,
} from './heatmapUtils'
import type { HeatmapCell } from './heatmapUtils'
import type {
  NormalizedGame,
  Player,
  GameSession,
  ClueState,
  RoundName,
} from '../types/game'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

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

/** One Single round: 1 category × 2 clues, the second a Daily Double. */
function makeGame(): NormalizedGame {
  return {
    rounds: {
      single: [
        {
          category: 'History',
          clues: [
            { value: 200, clue: 'Q1', solution: 'A1', dailyDouble: false, html: false },
            { value: 1000, clue: 'Q2', solution: 'A2', dailyDouble: true, html: false },
          ],
        },
      ],
    } as unknown as NormalizedGame['rounds'],
    final: null as unknown as NormalizedGame['final'],
    totalRounds: 1,
  }
}

function makeSession(
  playerNames: string[],
  clueStates: Record<string, ClueState>,
): GameSession {
  return {
    game: makeGame(),
    gameId: 'test-game',
    players: playerNames.map(makePlayer),
    currentRoundIndex: 0,
    orderedRoundNames: ['single'] as RoundName[],
    clueStates,
    dailyDoubleRecords: [],
  } as GameSession
}

function makeCell(overrides: Partial<HeatmapCell> = {}): HeatmapCell {
  return {
    categoryIndex: 0,
    clueIndex: 0,
    value: 200,
    status: 'unanswered',
    dailyDouble: false,
    correctPlayers: [],
    incorrectPlayers: [],
    ...overrides,
  }
}

// ─── getMarkedPlayers ─────────────────────────────────────────────────────────

describe('getMarkedPlayers', () => {
  const clueState: ClueState = {
    chosen: true,
    playerMarkings: { Cara: 'correct', Alice: 'correct', Bob: 'incorrect', Dan: null },
  }

  it('returns matching players in session order, not marking insertion order', () => {
    expect(getMarkedPlayers(clueState, 'correct', ['Alice', 'Bob', 'Cara', 'Dan'])).toEqual([
      'Alice',
      'Cara',
    ])
  })

  it('drops markings for players no longer in the session', () => {
    expect(getMarkedPlayers(clueState, 'correct', ['Alice'])).toEqual(['Alice'])
  })

  it('returns an empty list for a missing clue state or an unheld marking', () => {
    expect(getMarkedPlayers(undefined, 'correct', ['Alice'])).toEqual([])
    expect(getMarkedPlayers(clueState, 'incorrect', ['Alice', 'Dan'])).toEqual([])
  })
})

describe('getIncorrectPlayers', () => {
  it('wraps getMarkedPlayers for the incorrect marking', () => {
    const clueState: ClueState = {
      chosen: true,
      playerMarkings: { Bob: 'incorrect', Alice: 'incorrect' },
    }
    expect(getIncorrectPlayers(clueState, ['Alice', 'Bob'])).toEqual(['Alice', 'Bob'])
    expect(getIncorrectPlayers(clueState)).toEqual(['Bob', 'Alice'])
    expect(getIncorrectPlayers(undefined)).toEqual([])
  })
})

// ─── buildHeatmapCellLabel ────────────────────────────────────────────────────

describe('buildHeatmapCellLabel', () => {
  it('names winners only when nobody missed', () => {
    const cell = makeCell({ status: 'correct', correctPlayers: ['Alice', 'Bob'] })
    expect(buildHeatmapCellLabel(cell)).toBe('$200 — Correct: Alice, Bob')
  })

  it('names missers only when nobody was correct', () => {
    const cell = makeCell({ status: 'incorrect', incorrectPlayers: ['Bob'] })
    expect(buildHeatmapCellLabel(cell)).toBe('$200 — Incorrect: Bob')
  })

  it('names both groups under separate labels for a mixed-outcome clue', () => {
    const cell = makeCell({
      status: 'correct',
      correctPlayers: ['Alice'],
      incorrectPlayers: ['Bob', 'Cara'],
    })
    expect(buildHeatmapCellLabel(cell)).toBe('$200 — Correct: Alice — Incorrect: Bob, Cara')
  })

  it('states the clue was not attempted and names nobody when unanswered', () => {
    expect(buildHeatmapCellLabel(makeCell())).toBe('$200 — Not attempted')
  })

  it('appends the Daily Double indication for every status', () => {
    expect(buildHeatmapCellLabel(makeCell({ value: 1000, dailyDouble: true }))).toBe(
      '$1,000 — Not attempted — Daily Double',
    )
    expect(
      buildHeatmapCellLabel(
        makeCell({ value: 1000, dailyDouble: true, status: 'correct', correctPlayers: ['Alice'] }),
      ),
    ).toBe('$1,000 — Correct: Alice — Daily Double')
  })
})

// ─── computeHeatmapData ───────────────────────────────────────────────────────

describe('computeHeatmapData', () => {
  it('populates both marking lists in session order for a mixed-outcome clue', () => {
    const session = makeSession(['Alice', 'Bob', 'Cara'], {
      'single-0-0': {
        chosen: true,
        playerMarkings: { Cara: 'incorrect', Alice: 'correct', Bob: 'incorrect' },
      },
    })

    const cell = computeHeatmapData(session)[0].grid[0][0]

    expect(cell.status).toBe('correct')
    expect(cell.correctPlayers).toEqual(['Alice'])
    expect(cell.incorrectPlayers).toEqual(['Bob', 'Cara'])
  })

  it('leaves both lists empty for an unanswered clue', () => {
    const session = makeSession(['Alice'], {})
    const cell = computeHeatmapData(session)[0].grid[0][0]

    expect(cell.status).toBe('unanswered')
    expect(cell.correctPlayers).toEqual([])
    expect(cell.incorrectPlayers).toEqual([])
  })
})
