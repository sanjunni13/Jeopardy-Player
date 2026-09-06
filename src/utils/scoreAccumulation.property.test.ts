import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  initializeGamblingScores,
  applyAuctionBidDeduction,
  applyBetWagerDeduction,
  applyBetPayout,
} from './gamblingScoring'
import type { Player } from '../types/game'

// ─── Generators ─────────────────────────────────────────────────────────────

/** Valid starting balance range as per GamblingConfig (500-10000) */
const startingBalanceArb = fc.integer({ min: 500, max: 10000 })

/**
 * Action types that can affect a player's score during a gambling game.
 * - clue_score: points earned/lost from answering clues (can be negative for incorrect)
 * - winning_bid: deduction from winning a category auction
 * - bet_wager: deduction from placing a side bet
 * - bet_payout: credit from winning a side bet (wager * 2)
 * - ownership_bonus: credit from answering correctly in an owned category (bonus points)
 */
type ActionType = 'clue_score' | 'winning_bid' | 'bet_wager' | 'bet_payout' | 'ownership_bonus'

interface ScoringAction {
  type: ActionType
  amount: number
}

/** Generate a random clue score (can be positive or negative) */
const clueScoreActionArb: fc.Arbitrary<ScoringAction> = fc.integer({ min: -2000, max: 2000 })
  .filter(v => v !== 0)
  .map(amount => ({ type: 'clue_score' as const, amount }))

/** Generate an auction bid deduction (always positive amount deducted) */
const winningBidActionArb: fc.Arbitrary<ScoringAction> = fc.integer({ min: 1, max: 5000 })
  .map(amount => ({ type: 'winning_bid' as const, amount }))

/** Generate a bet wager deduction (always positive amount deducted) */
const betWagerActionArb: fc.Arbitrary<ScoringAction> = fc.integer({ min: 1, max: 3000 })
  .map(amount => ({ type: 'bet_wager' as const, amount }))

/** Generate a bet payout (wager amount; actual payout = wager * 2) */
const betPayoutActionArb: fc.Arbitrary<ScoringAction> = fc.integer({ min: 1, max: 3000 })
  .map(amount => ({ type: 'bet_payout' as const, amount }))

/** Generate an ownership bonus (extra points from owning a category) */
const ownershipBonusActionArb: fc.Arbitrary<ScoringAction> = fc.integer({ min: 100, max: 2000 })
  .map(amount => ({ type: 'ownership_bonus' as const, amount }))

/** Generate a random sequence of scoring actions */
const actionsArb: fc.Arbitrary<ScoringAction[]> = fc.array(
  fc.oneof(
    { weight: 5, arbitrary: clueScoreActionArb },
    { weight: 2, arbitrary: winningBidActionArb },
    { weight: 2, arbitrary: betWagerActionArb },
    { weight: 2, arbitrary: betPayoutActionArb },
    { weight: 2, arbitrary: ownershipBonusActionArb },
  ),
  { minLength: 1, maxLength: 50 }
)

// ─── Helper: create a base player ──────────────────────────────────────────

function makeBasePlayer(name: string): Player {
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

// ─── Property 2: Score Accumulation Invariant ───────────────────────────────

describe('Property 2: Score Accumulation Invariant', () => {
  /**
   * **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
   *
   * For any player and any sequence of gambling actions (bids, bet placements,
   * bet payouts, ownership bonuses) and clue scoring events across all rounds,
   * the player's final Player.score SHALL equal:
   * startingBalance + Σ(clue_scores) + Σ(bet_payouts) + Σ(ownership_bonuses) - Σ(winning_bids) - Σ(bet_wagers)
   */

  it('final score equals startingBalance + Σ(clue_scores) + Σ(bet_payouts) + Σ(ownership_bonuses) - Σ(winning_bids) - Σ(bet_wagers)', () => {
    fc.assert(
      fc.property(
        startingBalanceArb,
        actionsArb,
        (startingBalance, actions) => {
          // Initialize player with starting balance
          const basePlayer = makeBasePlayer('TestPlayer')
          const [initializedPlayer] = initializeGamblingScores([basePlayer], startingBalance)

          // Apply actions sequentially using the pure scoring functions
          let player = initializedPlayer
          for (const action of actions) {
            switch (action.type) {
              case 'clue_score':
                // Clue scoring directly modifies Player.score (positive for correct, negative for incorrect)
                player = { ...player, score: player.score + action.amount }
                break
              case 'winning_bid':
                player = applyAuctionBidDeduction(player, action.amount)
                break
              case 'bet_wager':
                player = applyBetWagerDeduction(player, action.amount)
                break
              case 'bet_payout':
                player = applyBetPayout(player, action.amount)
                break
              case 'ownership_bonus':
                // Ownership bonus adds points directly (the double-points from getCategoryOwnerMultiplier)
                player = { ...player, score: player.score + action.amount }
                break
            }
          }

          // Compute expected score from the invariant formula
          const clueScores = actions
            .filter(a => a.type === 'clue_score')
            .reduce((sum, a) => sum + a.amount, 0)

          const betPayouts = actions
            .filter(a => a.type === 'bet_payout')
            .reduce((sum, a) => sum + a.amount * 2, 0) // payout = wager * 2

          const ownershipBonuses = actions
            .filter(a => a.type === 'ownership_bonus')
            .reduce((sum, a) => sum + a.amount, 0)

          const winningBids = actions
            .filter(a => a.type === 'winning_bid')
            .reduce((sum, a) => sum + a.amount, 0)

          const betWagers = actions
            .filter(a => a.type === 'bet_wager')
            .reduce((sum, a) => sum + a.amount, 0)

          const expectedScore =
            startingBalance + clueScores + betPayouts + ownershipBonuses - winningBids - betWagers

          expect(player.score).toBe(expectedScore)
        }
      ),
      { numRuns: 500 }
    )
  })

  it('score accumulates correctly across multiple rounds of mixed actions', () => {
    fc.assert(
      fc.property(
        startingBalanceArb,
        // Generate multiple "rounds" of actions to simulate multi-round gameplay
        fc.array(actionsArb, { minLength: 2, maxLength: 5 }),
        (startingBalance, rounds) => {
          const basePlayer = makeBasePlayer('MultiRoundPlayer')
          const [initializedPlayer] = initializeGamblingScores([basePlayer], startingBalance)

          // Flatten all rounds into one sequence and apply
          const allActions = rounds.flat()
          let player = initializedPlayer

          for (const action of allActions) {
            switch (action.type) {
              case 'clue_score':
                player = { ...player, score: player.score + action.amount }
                break
              case 'winning_bid':
                player = applyAuctionBidDeduction(player, action.amount)
                break
              case 'bet_wager':
                player = applyBetWagerDeduction(player, action.amount)
                break
              case 'bet_payout':
                player = applyBetPayout(player, action.amount)
                break
              case 'ownership_bonus':
                player = { ...player, score: player.score + action.amount }
                break
            }
          }

          // Verify using the invariant formula
          const clueScores = allActions
            .filter(a => a.type === 'clue_score')
            .reduce((sum, a) => sum + a.amount, 0)

          const betPayouts = allActions
            .filter(a => a.type === 'bet_payout')
            .reduce((sum, a) => sum + a.amount * 2, 0)

          const ownershipBonuses = allActions
            .filter(a => a.type === 'ownership_bonus')
            .reduce((sum, a) => sum + a.amount, 0)

          const winningBids = allActions
            .filter(a => a.type === 'winning_bid')
            .reduce((sum, a) => sum + a.amount, 0)

          const betWagers = allActions
            .filter(a => a.type === 'bet_wager')
            .reduce((sum, a) => sum + a.amount, 0)

          const expectedScore =
            startingBalance + clueScores + betPayouts + ownershipBonuses - winningBids - betWagers

          expect(player.score).toBe(expectedScore)
        }
      ),
      { numRuns: 300 }
    )
  })

  it('with no actions, score remains at startingBalance', () => {
    fc.assert(
      fc.property(
        startingBalanceArb,
        (startingBalance) => {
          const basePlayer = makeBasePlayer('IdlePlayer')
          const [player] = initializeGamblingScores([basePlayer], startingBalance)
          expect(player.score).toBe(startingBalance)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('accumulation holds independently for multiple players', () => {
    fc.assert(
      fc.property(
        startingBalanceArb,
        actionsArb,
        actionsArb,
        (startingBalance, actionsP1, actionsP2) => {
          const players = [makeBasePlayer('Player1'), makeBasePlayer('Player2')]
          const [p1Init, p2Init] = initializeGamblingScores(players, startingBalance)

          // Apply actions to each player independently
          let p1 = p1Init
          let p2 = p2Init

          for (const action of actionsP1) {
            switch (action.type) {
              case 'clue_score':
                p1 = { ...p1, score: p1.score + action.amount }
                break
              case 'winning_bid':
                p1 = applyAuctionBidDeduction(p1, action.amount)
                break
              case 'bet_wager':
                p1 = applyBetWagerDeduction(p1, action.amount)
                break
              case 'bet_payout':
                p1 = applyBetPayout(p1, action.amount)
                break
              case 'ownership_bonus':
                p1 = { ...p1, score: p1.score + action.amount }
                break
            }
          }

          for (const action of actionsP2) {
            switch (action.type) {
              case 'clue_score':
                p2 = { ...p2, score: p2.score + action.amount }
                break
              case 'winning_bid':
                p2 = applyAuctionBidDeduction(p2, action.amount)
                break
              case 'bet_wager':
                p2 = applyBetWagerDeduction(p2, action.amount)
                break
              case 'bet_payout':
                p2 = applyBetPayout(p2, action.amount)
                break
              case 'ownership_bonus':
                p2 = { ...p2, score: p2.score + action.amount }
                break
            }
          }

          // Verify invariant for Player 1
          const computeExpected = (actions: ScoringAction[]) => {
            const clueScores = actions.filter(a => a.type === 'clue_score').reduce((s, a) => s + a.amount, 0)
            const betPayouts = actions.filter(a => a.type === 'bet_payout').reduce((s, a) => s + a.amount * 2, 0)
            const ownershipBonuses = actions.filter(a => a.type === 'ownership_bonus').reduce((s, a) => s + a.amount, 0)
            const winningBids = actions.filter(a => a.type === 'winning_bid').reduce((s, a) => s + a.amount, 0)
            const betWagers = actions.filter(a => a.type === 'bet_wager').reduce((s, a) => s + a.amount, 0)
            return startingBalance + clueScores + betPayouts + ownershipBonuses - winningBids - betWagers
          }

          expect(p1.score).toBe(computeExpected(actionsP1))
          expect(p2.score).toBe(computeExpected(actionsP2))
        }
      ),
      { numRuns: 200 }
    )
  })
})
