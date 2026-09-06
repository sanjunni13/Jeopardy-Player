import { describe, it, expect } from 'vitest'
import { computeGamblingStats, computeGamblingStatsExpanded } from './gamblingScoring'
import type { Player, GamblingLedger } from '../types/game'

/** A `Player` with every counter zeroed; only `name` and `score` matter here. */
function makePlayer(name: string, score: number): Player {
  return {
    name,
    score,
    correctCount: 0,
    incorrectCount: 0,
    correctDailyDoubles: 0,
    incorrectDailyDoubles: 0,
    correctFinalJeopardy: 0,
    incorrectFinalJeopardy: 0,
    totalEarned: 0,
  }
}

const players: Player[] = [makePlayer('Alice', 0)]

describe('allowance-aware gambling stats (Requirement 2.12)', () => {
  it('accumulates allowanceSpend from allowance-funded bids and bets', () => {
    const ledger: GamblingLedger = [
      { type: 'bid', playerName: 'Alice', amount: 300, label: 'HISTORY', order: 0, fundedBy: 'allowance' },
      { type: 'bet_placed', playerName: 'Alice', amount: 200, label: 'round_leader', order: 1, fundedBy: 'allowance' },
    ]

    const [stats] = computeGamblingStats(ledger, players)

    expect(stats.allowanceSpend).toBe(500)
    // Displayed columns still count every bid.
    expect(stats.categoriesOwned).toBe(1)
    expect(stats.totalBidSpend).toBe(300)
    expect(stats.betsPlaced).toBe(1)
  })

  it('charges no allowance-funded spend against net profit', () => {
    const ledger: GamblingLedger = [
      { type: 'bid', playerName: 'Alice', amount: 300, label: 'HISTORY', order: 0, fundedBy: 'allowance' },
      { type: 'bet_placed', playerName: 'Alice', amount: 200, label: 'round_leader', order: 1, fundedBy: 'allowance' },
    ]

    const [stats] = computeGamblingStats(ledger, players)

    expect(stats.netGamblingProfit).toBe(0)
  })

  it('gives a won allowance bet the same net profit as a won balance bet', () => {
    const allowanceLedger: GamblingLedger = [
      { type: 'bet_placed', playerName: 'Alice', amount: 500, label: 'round_leader', order: 0, fundedBy: 'allowance' },
      { type: 'bet_won', playerName: 'Alice', amount: 500, label: 'round_leader', order: 1, fundedBy: 'allowance' },
    ]
    const balanceLedger: GamblingLedger = [
      { type: 'bet_placed', playerName: 'Alice', amount: 500, label: 'round_leader', order: 0, fundedBy: 'balance' },
      { type: 'bet_won', playerName: 'Alice', amount: 1000, label: 'round_leader', order: 1, fundedBy: 'balance' },
    ]

    expect(computeGamblingStats(allowanceLedger, players)[0].netGamblingProfit).toBe(500)
    expect(computeGamblingStats(balanceLedger, players)[0].netGamblingProfit).toBe(500)
  })

  it('treats an absent fundedBy exactly as a balance-funded entry', () => {
    const legacyLedger: GamblingLedger = [
      { type: 'bid', playerName: 'Alice', amount: 300, label: 'HISTORY', order: 0 },
      { type: 'bet_placed', playerName: 'Alice', amount: 200, label: 'round_leader', order: 1 },
      { type: 'bet_lost', playerName: 'Alice', amount: 200, label: 'round_leader', order: 2 },
    ]
    const explicitLedger: GamblingLedger = legacyLedger.map((e) => ({ ...e, fundedBy: 'balance' as const }))

    const legacy = computeGamblingStats(legacyLedger, players)[0]

    expect(legacy.allowanceSpend).toBe(0)
    expect(legacy.netGamblingProfit).toBe(-500)
    expect(legacy).toEqual(computeGamblingStats(explicitLedger, players)[0])
  })

  it('carries allowanceSpend through the expanded stats', () => {
    const ledger: GamblingLedger = [
      { type: 'bet_placed', playerName: 'Alice', amount: 150, label: 'most_correct', order: 0, fundedBy: 'allowance' },
      { type: 'bet_lost', playerName: 'Alice', amount: 150, label: 'most_correct', order: 1, fundedBy: 'allowance' },
    ]

    const [stats] = computeGamblingStatsExpanded(ledger, players)

    expect(stats.allowanceSpend).toBe(150)
    expect(stats.netGamblingProfit).toBe(0)
    expect(stats.betTypeBreakdown).toEqual([
      { betType: 'most_correct', displayName: 'Who will get the most right?', won: 0, lost: 1 },
    ])
  })
})
