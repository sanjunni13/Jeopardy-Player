import { describe, it, expect } from 'vitest'
import type { Player, SideBet } from '../types/game'
import { beginGamblingPhases, unspentBudget } from './gamblingAllowance'
import {
  betWinCredit,
  computeOwnedClueCredit,
  settlePlacedWager,
  settlePlacedWagers,
  settleResolvedBet,
  settleWinningBid,
} from './gamblingSettlement'

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

const allowancePlayer: Player = makePlayer('Neg', -1000)
const balancePlayer: Player = makePlayer('Pos', 2000)
const players: Player[] = [allowancePlayer, balancePlayer]

function auctionContext() {
  return {
    budgetState: beginGamblingPhases(players),
    players,
    ledger: [],
    ownership: {},
  }
}

describe('settleWinningBid', () => {
  it('draws an allowance-funded bid from the pool and leaves Real_Balance alone', () => {
    const result = settleWinningBid(auctionContext(), {
      winner: 'Neg',
      winningBid: 200,
      category: 'HISTORY',
      roundName: 'Jeopardy',
      categoryIndex: 1,
    })

    expect(result.accepted).toBe(true)
    expect(result.fundedBy).toBe('allowance')
    expect(unspentBudget(result.budgetState, 'Neg')).toBe(300)
    expect(result.players.find((p) => p.name === 'Neg')?.score).toBe(-1000)
    expect(result.ownership['Jeopardy-1']).toBe('Neg')
    expect(result.entry).toMatchObject({ type: 'bid', amount: 200, fundedBy: 'allowance' })
  })

  it('deducts a balance-funded bid and records ownership on the same terms', () => {
    const result = settleWinningBid(auctionContext(), {
      winner: 'Pos',
      winningBid: 200,
      category: 'HISTORY',
      roundName: 'Jeopardy',
      categoryIndex: 1,
    })

    expect(result.fundedBy).toBe('balance')
    expect(result.players.find((p) => p.name === 'Pos')?.score).toBe(1800)
    expect(result.ownership['Jeopardy-1']).toBe('Pos')
    expect(result.entry?.fundedBy).toBe('balance')
  })

  it('changes nothing for a released category or an inadmissible bid', () => {
    const context = auctionContext()

    const released = settleWinningBid(context, {
      winner: null,
      winningBid: 0,
      category: 'HISTORY',
      roundName: 'Jeopardy',
      categoryIndex: 1,
    })
    expect(released.accepted).toBe(false)
    expect(released.ledger).toHaveLength(0)
    expect(released.ownership).toEqual({})

    const tooLarge = settleWinningBid(context, {
      winner: 'Neg',
      winningBid: 501,
      category: 'HISTORY',
      roundName: 'Jeopardy',
      categoryIndex: 1,
    })
    expect(tooLarge.accepted).toBe(false)
    expect(tooLarge.ledger).toHaveLength(0)
    expect(unspentBudget(tooLarge.budgetState, 'Neg')).toBe(500)

    const zero = settleWinningBid(context, {
      winner: 'Pos',
      winningBid: 0,
      category: 'HISTORY',
      roundName: 'Jeopardy',
      categoryIndex: 1,
    })
    expect(zero.accepted).toBe(false)
    expect(zero.players).toBe(context.players)
  })
})

describe('settlePlacedWager', () => {
  it('shares one pool with the auction for an Allowance_Player', () => {
    const afterBid = settleWinningBid(auctionContext(), {
      winner: 'Neg',
      winningBid: 400,
      category: 'HISTORY',
      roundName: 'Jeopardy',
      categoryIndex: 1,
    })

    const accepted = settlePlacedWager(afterBid, {
      playerName: 'Neg',
      betType: 'round_leader',
      wager: 100,
      prediction: 'Pos',
    })
    expect(accepted.accepted).toBe(true)
    expect(unspentBudget(accepted.budgetState, 'Neg')).toBe(0)
    expect(accepted.bet).toMatchObject({ wager: 100, fundedBy: 'allowance' })
    expect(accepted.players.find((p) => p.name === 'Neg')?.score).toBe(-1000)

    const beyondPool = settlePlacedWager(accepted, {
      playerName: 'Neg',
      betType: 'most_correct',
      wager: 1,
      prediction: 'Pos',
    })
    expect(beyondPool.accepted).toBe(false)
    expect(beyondPool.ledger).toBe(accepted.ledger)
  })

  it('rejects only the wager that breaks the cumulative limit in a batch', () => {
    const result = settlePlacedWagers(
      { budgetState: beginGamblingPhases(players), players, ledger: [] },
      [
        { playerName: 'Neg', betType: 'round_leader', wager: 300, prediction: 'Pos' },
        { playerName: 'Neg', betType: 'most_correct', wager: 300, prediction: 'Pos' },
        { playerName: 'Neg', betType: 'first_incorrect', wager: 200, prediction: 'Pos' },
      ],
    )

    expect(result.bets.map((bet) => bet.wager)).toEqual([300, 200])
    expect(result.rejected.map((wager) => wager.wager)).toEqual([300])
    expect(unspentBudget(result.budgetState, 'Neg')).toBe(0)
  })
})

describe('settleResolvedBet', () => {
  const allowanceBet: SideBet = {
    playerName: 'Neg',
    betType: 'round_leader',
    wager: 500,
    prediction: 'Pos',
    fundedBy: 'allowance',
  }

  it('credits the wager once on a won allowance bet with no clamping at $0', () => {
    const result = settleResolvedBet({ players, ledger: [] }, allowanceBet, true)

    expect(result.credit).toBe(500)
    expect(result.players.find((p) => p.name === 'Neg')?.score).toBe(-500)
    expect(result.entry).toMatchObject({ type: 'bet_won', amount: 500, fundedBy: 'allowance' })
  })

  it('leaves Real_Balance unchanged on a lost allowance bet', () => {
    const result = settleResolvedBet({ players, ledger: [] }, allowanceBet, false)

    expect(result.credit).toBe(0)
    expect(result.players.find((p) => p.name === 'Neg')?.score).toBe(-1000)
    expect(result.entry).toMatchObject({ type: 'bet_lost', amount: 500, fundedBy: 'allowance' })
  })

  it('credits twice the wager on a won balance bet, matching the legacy payout', () => {
    const balanceBet: SideBet = {
      playerName: 'Pos',
      betType: 'round_leader',
      wager: 500,
      prediction: 'Neg',
      fundedBy: 'balance',
    }
    const result = settleResolvedBet({ players, ledger: [] }, balanceBet, true)

    expect(result.credit).toBe(1000)
    expect(result.players.find((p) => p.name === 'Pos')?.score).toBe(3000)
  })

  it('treats a bet with no recorded funding source as balance-funded', () => {
    expect(betWinCredit(250, 'balance')).toBe(500)
    const legacyBet: SideBet = {
      playerName: 'Pos',
      betType: 'round_leader',
      wager: 250,
      prediction: 'Neg',
    }
    const result = settleResolvedBet({ players, ledger: [] }, legacyBet, true)

    expect(result.credit).toBe(500)
    expect(result.entry.fundedBy).toBe('balance')
  })
})

describe('computeOwnedClueCredit', () => {
  it('doubles an owned category clue value regardless of how the bid was funded', () => {
    const ownership = { 'Jeopardy-1': 'Neg' }

    expect(computeOwnedClueCredit(400, 'Jeopardy', 1, 'Neg', ownership)).toBe(800)
    expect(computeOwnedClueCredit(400, 'Jeopardy', 1, 'Pos', ownership)).toBe(400)
  })
})
