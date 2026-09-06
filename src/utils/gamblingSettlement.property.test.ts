import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import type {
  CategoryOwnership,
  FundingSource,
  GamblingLedger,
  Player,
  SideBet,
  SideBetType,
} from '../types/game'
import {
  GAMBLING_ALLOWANCE_AMOUNT,
  beginGamblingPhases,
  discardGamblingPhases,
  fundingSourceFor,
  unspentBudget,
  type GamblingBudgetState,
} from './gamblingAllowance'
import {
  betWinCredit,
  computeOwnedClueCredit,
  fundingSourceOf,
  settlePlacedWager,
  settlePlacedWagers,
  settleResolvedBet,
  settleRoundBets,
  settleWinningBid,
  type PlacedWager,
} from './gamblingSettlement'
import { evaluateBet, type RoundResult } from './gamblingScoring'

// ─── Shared generators ────────────────────────────────────────────────────────
// Shared by every gamblingSettlement property in this file (Properties 7–10).

/** A Real_Balance at or below $0, including exactly $0 and deeply negative. */
export const nonPositiveBalanceArb = fc.oneof(
  { arbitrary: fc.constant(0), weight: 3 },
  { arbitrary: fc.integer({ min: -1_000, max: 0 }), weight: 3 },
  { arbitrary: fc.integer({ min: -1_000_000, max: -1_001 }), weight: 2 },
)

/** A Real_Balance strictly above $0, including exactly $1 and below the allowance. */
export const positiveBalanceArb = fc.oneof(
  { arbitrary: fc.constant(1), weight: 2 },
  { arbitrary: fc.integer({ min: 1, max: GAMBLING_ALLOWANCE_AMOUNT }), weight: 3 },
  { arbitrary: fc.integer({ min: GAMBLING_ALLOWANCE_AMOUNT + 1, max: 1_000_000 }), weight: 3 },
)

/**
 * A score entry as it reaches the budget module: a recorded Real_Balance, or
 * `undefined` for a player who joined mid-game and holds no recorded score,
 * whose Real_Balance is treated as $0.
 */
export const scoreEntryArb: fc.Arbitrary<number | undefined> = fc.oneof(
  { arbitrary: nonPositiveBalanceArb as fc.Arbitrary<number | undefined>, weight: 3 },
  { arbitrary: positiveBalanceArb as fc.Arbitrary<number | undefined>, weight: 3 },
  { arbitrary: fc.constant(undefined), weight: 1 },
)

/** A score entry that always classifies its holder as an Allowance_Player. */
export const allowanceScoreArb: fc.Arbitrary<number | undefined> = fc.oneof(
  { arbitrary: nonPositiveBalanceArb as fc.Arbitrary<number | undefined>, weight: 6 },
  { arbitrary: fc.constant(undefined), weight: 2 },
)

/** The non-monetary `Player` counters, which settlement must leave untouched. */
export const playerCountersArb = fc.record({
  correctCount: fc.nat({ max: 30 }),
  incorrectCount: fc.nat({ max: 30 }),
  correctDailyDoubles: fc.nat({ max: 3 }),
  incorrectDailyDoubles: fc.nat({ max: 3 }),
  correctFinalJeopardy: fc.integer({ min: 0, max: 1 }),
  incorrectFinalJeopardy: fc.integer({ min: 0, max: 1 }),
  totalEarned: fc.nat({ max: 1_000_000 }),
})

type PlayerCounters = Omit<Player, 'name' | 'score'>

/**
 * Reusable `Player` factory. A `score` of `undefined` omits the property
 * entirely, modelling the mid-game joiner who holds no recorded score.
 */
export function makePlayer(
  name: string,
  score: number | undefined,
  counters: PlayerCounters,
): Player {
  const base = { name, ...counters }
  return (score === undefined ? base : { ...base, score }) as Player
}

/** Reusable `Player` factory arbitrary for one named player. */
export function playerArb(
  name: string,
  scoreArb: fc.Arbitrary<number | undefined> = scoreEntryArb,
): fc.Arbitrary<Player> {
  return fc
    .tuple(scoreArb, playerCountersArb)
    .map(([score, counters]) => makePlayer(name, score, counters))
}

export interface FieldOptions {
  minLength?: number
  maxLength?: number
}

/**
 * A session field of players with unique names (`P1`, `P2`, …) and generated
 * balances drawn from `scoreArb`.
 */
export function playerFieldArb(
  scoreArb: fc.Arbitrary<number | undefined> = scoreEntryArb,
  { minLength = 1, maxLength = 8 }: FieldOptions = {},
): fc.Arbitrary<Player[]> {
  return fc
    .array(fc.tuple(scoreArb, playerCountersArb), { minLength, maxLength })
    .map((entries) =>
      entries.map(([score, counters], index) => makePlayer(`P${index + 1}`, score, counters)),
    )
}

/**
 * A session field whose first player (`P1`) is always an Allowance_Player and
 * whose remaining players hold any balance.
 */
export function fieldWithAllowanceFirstArb(
  { minLength = 1, maxLength = 8 }: FieldOptions = {},
): fc.Arbitrary<Player[]> {
  return fc
    .tuple(
      playerArb('P1', allowanceScoreArb),
      playerFieldArb(scoreEntryArb, {
        minLength: Math.max(0, minLength - 1),
        maxLength: Math.max(0, maxLength - 1),
      }),
    )
    .map(([first, rest]) => [
      first,
      ...rest.map((player, index) => ({ ...player, name: `P${index + 2}` })),
    ])
}

export const sideBetTypeArb: fc.Arbitrary<SideBetType> = fc.constantFrom(
  'round_leader',
  'daily_double_finder',
  'most_incorrect',
  'sweep_category',
  'zero_score_round',
  'no_wrong_answers',
  'highest_single_clue',
  'most_correct',
  'first_incorrect',
  'biggest_earner',
  'bottom_feeder',
)

export const roundNameArb = fc.constantFrom('Jeopardy', 'Double Jeopardy', 'Round 3')
export const categoryIndexArb = fc.nat({ max: 5 })
export const categoryNameArb = fc.constantFrom('SCIENCE', 'HISTORY', 'POTPOURRI', '19th CENTURY')
export const predictionArb = fc.constantFrom('P1', 'P2', 'yes', 'no', '')

/** A raw seed mapped into the admissible commitment window, $1 through `unspent`. */
export function admissibleAmount(raw: number, unspent: number): number {
  return 1 + (raw % Math.max(1, Math.floor(unspent)))
}

/** The Real_Balance the settlement helpers must read for a player: `score ?? 0`. */
export const realBalanceOf = (player: Player): number => player.score ?? 0

/** Real_Balance by player name, for comparing before and after a settlement. */
export function balanceMap(players: Player[]): Record<string, number> {
  const balances: Record<string, number> = {}
  for (const player of players) balances[player.name] = realBalanceOf(player)
  return balances
}

/** Unspent Spendable_Budget by player name, for the same comparison. */
export function unspentMap(state: GamblingBudgetState, players: Player[]): Record<string, number> {
  const unspent: Record<string, number> = {}
  for (const player of players) unspent[player.name] = unspentBudget(state, player.name)
  return unspent
}

const emptyOwnership: CategoryOwnership = {}
const emptyLedger: GamblingLedger = []

// ─── Property 7: Allowance-funded commitments never touch Real_Balance ────────

describe('Property 7: Allowance-funded commitments never touch Real_Balance', () => {
  /**
   * **Validates: Requirements 2.1, 2.3, 2.6, 2.8**
   *
   * For any Allowance_Player and any admissible bid or wager, settling that
   * commitment reduces the unspent Gambling_Allowance by exactly the amount and
   * leaves Real_Balance unchanged; a losing bid leaves both the unspent
   * allowance and Real_Balance unchanged; and a lost allowance-funded bet
   * leaves Real_Balance unchanged with no additional deduction.
   */

  it('draws a won allowance-funded bid from the allowance alone', () => {
    fc.assert(
      fc.property(
        fieldWithAllowanceFirstArb(),
        fc.nat({ max: 10_000 }),
        roundNameArb,
        categoryIndexArb,
        categoryNameArb,
        (players, rawBid, roundName, categoryIndex, category) => {
          const budgetState = beginGamblingPhases(players)
          const winner = players[0].name
          const winningBid = admissibleAmount(rawBid, unspentBudget(budgetState, winner))
          const balancesBefore = balanceMap(players)

          const result = settleWinningBid(
            { budgetState, players, ledger: emptyLedger, ownership: emptyOwnership },
            { winner, winningBid, category, roundName, categoryIndex },
          )

          expect(result.accepted).toBe(true)
          expect(result.fundedBy).toBe('allowance')
          // Requirement 2.1 — the allowance falls by exactly the bid…
          expect(unspentBudget(result.budgetState, winner)).toBe(
            GAMBLING_ALLOWANCE_AMOUNT - winningBid,
          )
          // …and no player's Real_Balance moves.
          expect(balanceMap(result.players)).toEqual(balancesBefore)
          expect(result.players).toEqual(players)
        },
      ),
      { numRuns: 300 },
    )
  })

  it('draws a placed allowance-funded wager from the allowance alone', () => {
    fc.assert(
      fc.property(
        fieldWithAllowanceFirstArb(),
        fc.nat({ max: 10_000 }),
        sideBetTypeArb,
        predictionArb,
        (players, rawWager, betType, prediction) => {
          const budgetState = beginGamblingPhases(players)
          const playerName = players[0].name
          const amount = admissibleAmount(rawWager, unspentBudget(budgetState, playerName))
          const balancesBefore = balanceMap(players)

          const result = settlePlacedWager(
            { budgetState, players, ledger: emptyLedger },
            { playerName, betType, wager: amount, prediction },
          )

          expect(result.accepted).toBe(true)
          expect(result.fundedBy).toBe('allowance')
          expect(result.bet?.fundedBy).toBe('allowance')
          // Requirement 2.3 — the allowance falls by exactly the wager…
          expect(unspentBudget(result.budgetState, playerName)).toBe(
            GAMBLING_ALLOWANCE_AMOUNT - amount,
          )
          // …and no player's Real_Balance moves.
          expect(balanceMap(result.players)).toEqual(balancesBefore)
          expect(result.players).toEqual(players)
        },
      ),
      { numRuns: 300 },
    )
  })

  it('draws a bid and a batch of wagers from one shared pool, by their exact sum', () => {
    fc.assert(
      fc.property(
        fieldWithAllowanceFirstArb(),
        fc.nat({ max: 10_000 }),
        fc.array(fc.tuple(fc.integer({ min: 1, max: 600 }), sideBetTypeArb, predictionArb), {
          minLength: 1,
          maxLength: 6,
        }),
        roundNameArb,
        categoryIndexArb,
        categoryNameArb,
        (players, rawBid, rawWagers, roundName, categoryIndex, category) => {
          const budgetState = beginGamblingPhases(players)
          const playerName = players[0].name
          const winningBid = admissibleAmount(rawBid, unspentBudget(budgetState, playerName))

          const afterBid = settleWinningBid(
            { budgetState, players, ledger: emptyLedger, ownership: emptyOwnership },
            { winner: playerName, winningBid, category, roundName, categoryIndex },
          )

          const wagers: PlacedWager[] = rawWagers.map(([wager, betType, prediction]) => ({
            playerName,
            betType,
            wager,
            prediction,
          }))

          const afterWagers = settlePlacedWagers(
            {
              budgetState: afterBid.budgetState,
              players: afterBid.players,
              ledger: afterBid.ledger,
            },
            wagers,
          )

          const committed =
            winningBid + afterWagers.bets.reduce((total, bet) => total + bet.wager, 0)

          expect(unspentBudget(afterWagers.budgetState, playerName)).toBe(
            GAMBLING_ALLOWANCE_AMOUNT - committed,
          )
          expect(unspentBudget(afterWagers.budgetState, playerName)).toBeGreaterThanOrEqual(0)
          // Real_Balance is untouched across both phases.
          expect(afterWagers.players).toEqual(players)
          expect(afterWagers.bets.every((bet) => bet.fundedBy === 'allowance')).toBe(true)
        },
      ),
      { numRuns: 200 },
    )
  })

  it('leaves the allowance and every Real_Balance untouched for a losing bid', () => {
    fc.assert(
      fc.property(
        fieldWithAllowanceFirstArb({ minLength: 2, maxLength: 8 }),
        fc.nat({ max: 10_000 }),
        fc.boolean(),
        roundNameArb,
        categoryIndexArb,
        categoryNameArb,
        (players, rawBid, releasedCategory, roundName, categoryIndex, category) => {
          const budgetState = beginGamblingPhases(players)
          const loser = players[0].name
          const rival = players[1].name
          const balancesBefore = balanceMap(players)
          const unspentBefore = unspentMap(budgetState, players)

          // Either the category was released or tied (no winner at all), or a
          // rival won it — in both cases P1's bid loses.
          const rivalUnspent = unspentBudget(budgetState, rival)
          const outcome = releasedCategory
            ? { winner: null, winningBid: 0 }
            : { winner: rival, winningBid: admissibleAmount(rawBid, rivalUnspent) }

          const result = settleWinningBid(
            { budgetState, players, ledger: emptyLedger, ownership: emptyOwnership },
            { ...outcome, category, roundName, categoryIndex },
          )

          // Requirement 2.8 — the loser keeps their whole unspent allowance and
          // their Real_Balance, so the amount stays spendable for both phases.
          expect(unspentBudget(result.budgetState, loser)).toBe(unspentBefore[loser])
          expect(unspentBudget(result.budgetState, loser)).toBe(GAMBLING_ALLOWANCE_AMOUNT)
          expect(balanceMap(result.players)[loser]).toBe(balancesBefore[loser])

          if (outcome.winner === null) {
            // Nothing was settled at all.
            expect(result.accepted).toBe(false)
            expect(result.entry).toBeNull()
            expect(result.ledger).toEqual(emptyLedger)
            expect(result.ownership).toEqual(emptyOwnership)
            expect(unspentMap(result.budgetState, players)).toEqual(unspentBefore)
            expect(balanceMap(result.players)).toEqual(balancesBefore)
          } else if (rival !== loser) {
            // Only the winner's records moved.
            expect(result.accepted).toBe(true)
            expect(result.ledger).toHaveLength(1)
            expect(result.ledger[0].playerName).toBe(rival)
          }
        },
      ),
      { numRuns: 300 },
    )
  })

  it('applies no further deduction when an allowance-funded bet is lost', () => {
    fc.assert(
      fc.property(
        fieldWithAllowanceFirstArb(),
        fc.integer({ min: 1, max: GAMBLING_ALLOWANCE_AMOUNT }),
        sideBetTypeArb,
        predictionArb,
        (players, wager, betType, prediction) => {
          const budgetState = beginGamblingPhases(players)
          const playerName = players[0].name

          const placed = settlePlacedWager(
            { budgetState, players, ledger: emptyLedger },
            { playerName, betType, wager, prediction },
          )
          expect(placed.accepted).toBe(true)

          const bet = placed.bet as SideBet
          const resolved = settleResolvedBet(
            { players: placed.players, ledger: placed.ledger },
            bet,
            false,
          )

          // Requirement 2.6 — a lost allowance-funded bet moves nothing.
          expect(resolved.won).toBe(false)
          expect(resolved.credit).toBe(0)
          expect(resolved.players).toEqual(placed.players)
          expect(balanceMap(resolved.players)).toEqual(balanceMap(players))
          expect(resolved.entry.type).toBe('bet_lost')
          expect(resolved.entry.amount).toBe(wager)
          expect(resolved.entry.fundedBy).toBe('allowance')
        },
      ),
      { numRuns: 300 },
    )
  })
})

// ─── Property 8: Won bets have funding-independent net profit ─────────────────

// Feature: negative-balance-and-analytics-updates, Property 8: Won bets have
// funding-independent net profit and are never clamped
describe('Property 8: Won bets have funding-independent net profit and are never clamped', () => {
  /**
   * **Validates: Requirements 2.4, 2.5**
   *
   * For any wager amount and any starting Real_Balance, including a negative
   * one, the net Real_Balance change from placing and winning that bet is
   * exactly `+wager` whether the bet was funded from a Gambling_Allowance or
   * from a positive Real_Balance, and the resulting Real_Balance is never
   * clamped at $0.
   */

  interface WinOutcome {
    startBalance: number
    /** Real_Balance immediately after the wager was placed. */
    placedBalance: number
    finalBalance: number
    credit: number
    fundedBy: FundingSource | null
    entryType: string
    entryAmount: number
    entryFundedBy: FundingSource | undefined
  }

  /**
   * Puts one player through the whole life of a winning bet: classify at
   * Auction_Phase start, place the wager, then resolve it as won.
   */
  function placeAndWin(
    score: number | undefined,
    counters: PlayerCounters,
    wager: number,
    betType: SideBetType,
    prediction: string,
  ): WinOutcome {
    const players = [makePlayer('P1', score, counters)]
    const budgetState = beginGamblingPhases(players)

    const placed = settlePlacedWager(
      { budgetState, players, ledger: emptyLedger },
      { playerName: 'P1', betType, wager, prediction },
    )
    expect(placed.accepted).toBe(true)

    const resolved = settleResolvedBet(
      { players: placed.players, ledger: placed.ledger },
      placed.bet as SideBet,
      true,
    )

    return {
      startBalance: realBalanceOf(players[0]),
      placedBalance: realBalanceOf(placed.players[0]),
      finalBalance: realBalanceOf(resolved.players[0]),
      credit: resolved.credit,
      fundedBy: placed.fundedBy,
      entryType: resolved.entry.type,
      entryAmount: resolved.entry.amount,
      entryFundedBy: resolved.entry.fundedBy,
    }
  }

  /** A wager within the allowance, paired with a Real_Balance that can fund it. */
  const wagerWithFundingBalanceArb = fc
    .tuple(fc.integer({ min: 1, max: GAMBLING_ALLOWANCE_AMOUNT }), fc.nat({ max: 1_000_000 }))
    .map(([wager, headroom]) => ({ wager, balanceFundedScore: wager + headroom }))

  it('credits an allowance-funded win by exactly the wager, with no clamping at $0', () => {
    fc.assert(
      fc.property(
        allowanceScoreArb,
        fc.integer({ min: 1, max: GAMBLING_ALLOWANCE_AMOUNT }),
        playerCountersArb,
        sideBetTypeArb,
        predictionArb,
        (score, wager, counters, betType, prediction) => {
          const outcome = placeAndWin(score, counters, wager, betType, prediction)

          expect(outcome.fundedBy).toBe('allowance')
          // Requirement 2.4 — never deducted from Real_Balance, credited once.
          expect(outcome.placedBalance).toBe(outcome.startBalance)
          expect(outcome.credit).toBe(betWinCredit(wager, 'allowance'))
          expect(outcome.credit).toBe(wager)
          // Requirement 2.4, 2.5 — net `+wager`, unclamped in both directions.
          expect(outcome.finalBalance).toBe(outcome.startBalance + wager)
          if (outcome.startBalance + wager < 0) {
            expect(outcome.finalBalance).toBeLessThan(0)
          }
          expect(outcome.entryType).toBe('bet_won')
          expect(outcome.entryAmount).toBe(outcome.credit)
          expect(outcome.entryFundedBy).toBe('allowance')
        },
      ),
      { numRuns: 300 },
    )
  })

  it('credits a balance-funded win by twice the wager, for the same net of +wager', () => {
    fc.assert(
      fc.property(
        wagerWithFundingBalanceArb,
        playerCountersArb,
        sideBetTypeArb,
        predictionArb,
        ({ wager, balanceFundedScore }, counters, betType, prediction) => {
          const outcome = placeAndWin(balanceFundedScore, counters, wager, betType, prediction)

          expect(outcome.fundedBy).toBe('balance')
          // The wager is deducted up front and paid back gross at twice the wager.
          expect(outcome.placedBalance).toBe(outcome.startBalance - wager)
          expect(outcome.credit).toBe(betWinCredit(wager, 'balance'))
          expect(outcome.credit).toBe(wager * 2)
          expect(outcome.finalBalance).toBe(outcome.startBalance + wager)
          expect(outcome.entryType).toBe('bet_won')
          expect(outcome.entryAmount).toBe(outcome.credit)
          expect(outcome.entryFundedBy).toBe('balance')
        },
      ),
      { numRuns: 300 },
    )
  })

  it('gives an identical net Real_Balance change for both funding sources', () => {
    fc.assert(
      fc.property(
        wagerWithFundingBalanceArb,
        allowanceScoreArb,
        playerCountersArb,
        sideBetTypeArb,
        predictionArb,
        ({ wager, balanceFundedScore }, allowanceScore, counters, betType, prediction) => {
          const fromAllowance = placeAndWin(allowanceScore, counters, wager, betType, prediction)
          const fromBalance = placeAndWin(balanceFundedScore, counters, wager, betType, prediction)

          const allowanceNet = fromAllowance.finalBalance - fromAllowance.startBalance
          const balanceNet = fromBalance.finalBalance - fromBalance.startBalance

          // Requirement 2.4 — net-profit parity between the two funding sources.
          expect(allowanceNet).toBe(balanceNet)
          expect(allowanceNet).toBe(wager)
          // The gross credits differ even though the net change does not.
          expect(fromAllowance.credit).toBe(wager)
          expect(fromBalance.credit).toBe(wager * 2)
        },
      ),
      { numRuns: 300 },
    )
  })

  it('never clamps a resolved win at $0 for any starting Real_Balance', () => {
    fc.assert(
      fc.property(
        fc.oneof(nonPositiveBalanceArb, positiveBalanceArb),
        fc.integer({ min: 1, max: GAMBLING_ALLOWANCE_AMOUNT }),
        playerCountersArb,
        sideBetTypeArb,
        (startBalance, wager, counters, betType) => {
          // Settle the win directly, so the starting Real_Balance is free of the
          // constraint that it must be able to fund the wager.
          const players = [makePlayer('P1', startBalance, counters)]
          const bet: SideBet = {
            playerName: 'P1',
            betType,
            wager,
            prediction: 'P1',
            fundedBy: 'allowance',
          }

          const resolved = settleResolvedBet({ players, ledger: emptyLedger }, bet, true)

          // Requirement 2.5 — the credit lands wherever the arithmetic puts it.
          expect(balanceMap(resolved.players).P1).toBe(startBalance + wager)
          expect(resolved.credit).toBe(wager)
        },
      ),
      { numRuns: 300 },
    )
  })

  it('lands a -$1,000 balance at -$500 after a won $500 allowance-funded bet', () => {
    const counters: PlayerCounters = {
      correctCount: 0,
      incorrectCount: 0,
      correctDailyDoubles: 0,
      incorrectDailyDoubles: 0,
      correctFinalJeopardy: 0,
      incorrectFinalJeopardy: 0,
      totalEarned: 0,
    }

    const outcome = placeAndWin(-1_000, counters, GAMBLING_ALLOWANCE_AMOUNT, 'round_leader', 'P1')

    expect(outcome.fundedBy).toBe('allowance')
    expect(outcome.placedBalance).toBe(-1_000)
    expect(outcome.credit).toBe(500)
    // Requirement 2.5 — the stated worked example.
    expect(outcome.finalBalance).toBe(-500)
  })
})

// ─── Property 9: Ownership and its payout ignore the funding source ───────────

// Feature: negative-balance-and-analytics-updates, Property 9: Ownership and its
// payout ignore the funding source
describe('Property 9: Ownership and its payout ignore the funding source', () => {
  /**
   * **Validates: Requirements 2.2, 2.7, 3.8**
   *
   * For any winning auction bid, category ownership is recorded for the winner
   * identically whether the bid was allowance-funded or balance-funded; and for
   * any correct answer in an owned category, the credited amount equals the
   * doubled clue value (or the doubled Daily Double wager) with no reduction for
   * allowance funding.
   */

  /** Board clue face values, plus arbitrary values for a non-standard board. */
  const clueValueArb = fc.oneof(
    { arbitrary: fc.constantFrom(200, 400, 600, 800, 1_000), weight: 3 },
    { arbitrary: fc.integer({ min: 1, max: 5_000 }), weight: 2 },
  )

  /** A Daily Double wager under the raised cap of Requirement 3 criteria 1–2. */
  const dailyDoubleWagerArb = fc.integer({ min: 1, max: 1_000_000 })

  /** A winning bid within the allowance, plus a Real_Balance able to fund it. */
  const bidWithFundingBalanceArb = fc
    .tuple(fc.integer({ min: 1, max: GAMBLING_ALLOWANCE_AMOUNT }), fc.nat({ max: 1_000_000 }))
    .map(([winningBid, headroom]) => ({ winningBid, balanceFundedScore: winningBid + headroom }))

  const ownershipKeyOf = (roundName: string, categoryIndex: number): string =>
    `${roundName}-${categoryIndex}`

  /** Wins one category for `P1` at the given starting Real_Balance. */
  function winCategory(
    score: number | undefined,
    counters: PlayerCounters,
    winningBid: number,
    category: string,
    roundName: string,
    categoryIndex: number,
  ) {
    const players = [makePlayer('P1', score, counters)]
    const budgetState = beginGamblingPhases(players)

    const result = settleWinningBid(
      { budgetState, players, ledger: emptyLedger, ownership: emptyOwnership },
      { winner: 'P1', winningBid, category, roundName, categoryIndex },
    )
    expect(result.accepted).toBe(true)

    return { startBalance: realBalanceOf(players[0]), ...result }
  }

  it('records identical category ownership for both funding sources', () => {
    fc.assert(
      fc.property(
        bidWithFundingBalanceArb,
        allowanceScoreArb,
        playerCountersArb,
        roundNameArb,
        categoryIndexArb,
        categoryNameArb,
        (
          { winningBid, balanceFundedScore },
          allowanceScore,
          counters,
          roundName,
          categoryIndex,
          category,
        ) => {
          const fromAllowance = winCategory(
            allowanceScore,
            counters,
            winningBid,
            category,
            roundName,
            categoryIndex,
          )
          const fromBalance = winCategory(
            balanceFundedScore,
            counters,
            winningBid,
            category,
            roundName,
            categoryIndex,
          )

          expect(fromAllowance.fundedBy).toBe('allowance')
          expect(fromBalance.fundedBy).toBe('balance')
          // Requirement 2.2 — the ownership record is identical, funding aside.
          expect(fromAllowance.ownership).toEqual(fromBalance.ownership)
          expect(fromAllowance.ownership[ownershipKeyOf(roundName, categoryIndex)]).toBe('P1')
          // Only the Real_Balance side differs.
          expect(fromAllowance.players[0].score ?? 0).toBe(fromAllowance.startBalance)
          expect(fromBalance.players[0].score ?? 0).toBe(fromBalance.startBalance - winningBid)
        },
      ),
      { numRuns: 300 },
    )
  })

  it('credits the doubled clue value for an owned category under either funding source', () => {
    fc.assert(
      fc.property(
        bidWithFundingBalanceArb,
        allowanceScoreArb,
        playerCountersArb,
        roundNameArb,
        categoryIndexArb,
        categoryNameArb,
        clueValueArb,
        (
          { winningBid, balanceFundedScore },
          allowanceScore,
          counters,
          roundName,
          categoryIndex,
          category,
          pointValue,
        ) => {
          const fromAllowance = winCategory(
            allowanceScore,
            counters,
            winningBid,
            category,
            roundName,
            categoryIndex,
          )
          const fromBalance = winCategory(
            balanceFundedScore,
            counters,
            winningBid,
            category,
            roundName,
            categoryIndex,
          )

          const allowanceCredit = computeOwnedClueCredit(
            pointValue,
            roundName,
            categoryIndex,
            'P1',
            fromAllowance.ownership,
          )
          const balanceCredit = computeOwnedClueCredit(
            pointValue,
            roundName,
            categoryIndex,
            'P1',
            fromBalance.ownership,
          )

          // Requirement 2.7 — the full doubled value, with no allowance discount.
          expect(allowanceCredit).toBe(pointValue * 2)
          expect(allowanceCredit).toBe(balanceCredit)
        },
      ),
      { numRuns: 300 },
    )
  })

  it('doubles the submitted Daily Double wager rather than the clue face value', () => {
    fc.assert(
      fc.property(
        bidWithFundingBalanceArb,
        allowanceScoreArb,
        playerCountersArb,
        roundNameArb,
        categoryIndexArb,
        categoryNameArb,
        clueValueArb,
        dailyDoubleWagerArb,
        (
          { winningBid, balanceFundedScore },
          allowanceScore,
          counters,
          roundName,
          categoryIndex,
          category,
          faceValue,
          wager,
        ) => {
          for (const score of [allowanceScore, balanceFundedScore]) {
            const won = winCategory(
              score,
              counters,
              winningBid,
              category,
              roundName,
              categoryIndex,
            )

            // Requirement 3.8 — the multiplier applies to the submitted wager.
            const credit = computeOwnedClueCredit(
              wager,
              roundName,
              categoryIndex,
              'P1',
              won.ownership,
            )
            expect(credit).toBe(wager * 2)

            if (wager !== faceValue) {
              expect(credit).not.toBe(faceValue * 2)
            }
          }
        },
      ),
      { numRuns: 200 },
    )
  })

  it('leaves an unowned category and another player at the single value', () => {
    fc.assert(
      fc.property(
        bidWithFundingBalanceArb,
        allowanceScoreArb,
        playerCountersArb,
        roundNameArb,
        categoryIndexArb,
        categoryNameArb,
        clueValueArb,
        (
          { winningBid, balanceFundedScore },
          allowanceScore,
          counters,
          roundName,
          categoryIndex,
          category,
          pointValue,
        ) => {
          for (const score of [allowanceScore, balanceFundedScore]) {
            const won = winCategory(
              score,
              counters,
              winningBid,
              category,
              roundName,
              categoryIndex,
            )

            // A player who won no category gets no multiplier…
            expect(
              computeOwnedClueCredit(pointValue, roundName, categoryIndex, 'P2', won.ownership),
            ).toBe(pointValue)
            // …and neither does the winner in a category they do not own.
            expect(
              computeOwnedClueCredit(
                pointValue,
                roundName,
                categoryIndex + 100,
                'P1',
                won.ownership,
              ),
            ).toBe(pointValue)
          }
        },
      ),
      { numRuns: 200 },
    )
  })
})

// ─── Property 10: Every commitment records its funding source ─────────────────

// Feature: negative-balance-and-analytics-updates, Property 10: Every commitment
// records its funding source
describe('Property 10: Every commitment records its funding source', () => {
  /**
   * **Validates: Requirements 2.9**
   *
   * For any accepted bid or wager, the resulting ledger entry records the amount
   * and a funding-source marker that matches the committing player's frozen
   * classification, and that marker survives on the entry after the
   * Gambling_Allowance is discarded.
   */

  /** The frozen classification, read straight from the generated Real_Balance. */
  const expectedSourceFor = (player: Player): FundingSource =>
    realBalanceOf(player) <= 0 ? 'allowance' : 'balance'

  /** Picks one player out of a generated field from a raw index seed. */
  const pick = (players: Player[], rawIndex: number): Player =>
    players[rawIndex % players.length]

  /**
   * A funding marker as it may sit on a persisted record: either source, or
   * absent entirely for a session stored before the Gambling_Allowance existed.
   */
  const persistedFundedByArb: fc.Arbitrary<FundingSource | undefined> = fc.constantFrom(
    'balance',
    'allowance',
    undefined,
  )

  /** A `SideBet` whose funding marker may be present or absent. */
  function persistedBetArb(playerNames: string[]): fc.Arbitrary<SideBet> {
    return fc
      .tuple(
        fc.constantFrom(...playerNames),
        sideBetTypeArb,
        fc.integer({ min: 1, max: GAMBLING_ALLOWANCE_AMOUNT }),
        fc.constantFrom(...playerNames),
        persistedFundedByArb,
      )
      .map(([playerName, betType, wager, prediction, fundedBy]) => {
        const base: SideBet = { playerName, betType, wager, prediction }
        return fundedBy === undefined ? base : { ...base, fundedBy }
      })
  }

  /** A round result drawn from the generated field, so bets resolve both ways. */
  function roundResultArb(playerNames: string[]): fc.Arbitrary<RoundResult> {
    const oneOrNone: fc.Arbitrary<string | null> = fc.constantFrom(...playerNames, null)
    return fc.record({
      roundLeader: oneOrNone,
      dailyDoubleFinderPlayer: oneOrNone,
      mostIncorrectPlayer: oneOrNone,
      sweepCategoryPlayer: oneOrNone,
      zeroScoreRoundPlayers: fc.subarray(playerNames),
      noWrongAnswersPlayers: fc.subarray(playerNames),
      highestSingleCluePlayer: oneOrNone,
      mostCorrectPlayer: oneOrNone,
      firstIncorrectPlayer: oneOrNone,
      biggestEarnerPlayer: oneOrNone,
      bottomFeederPlayer: oneOrNone,
    })
  }

  it('records the amount and the frozen source on an accepted bid entry', () => {
    fc.assert(
      fc.property(
        playerFieldArb(),
        fc.nat({ max: 10_000 }),
        fc.nat({ max: 10_000 }),
        roundNameArb,
        categoryIndexArb,
        categoryNameArb,
        (players, rawIndex, rawBid, roundName, categoryIndex, category) => {
          const budgetState = beginGamblingPhases(players)
          const winner = pick(players, rawIndex)
          const winningBid = admissibleAmount(rawBid, unspentBudget(budgetState, winner.name))

          const result = settleWinningBid(
            { budgetState, players, ledger: emptyLedger, ownership: emptyOwnership },
            { winner: winner.name, winningBid, category, roundName, categoryIndex },
          )

          expect(result.accepted).toBe(true)
          expect(result.ledger).toHaveLength(1)

          const entry = result.entry
          expect(entry).not.toBeNull()
          // Requirement 2.9 — the entry records the amount…
          expect(entry?.type).toBe('bid')
          expect(entry?.playerName).toBe(winner.name)
          expect(entry?.amount).toBe(winningBid)
          // …and a marker matching the frozen classification.
          expect(entry?.fundedBy).toBe(expectedSourceFor(winner))
          expect(entry?.fundedBy).toBe(fundingSourceFor(budgetState, winner.name))
          expect(result.fundedBy).toBe(entry?.fundedBy)
        },
      ),
      { numRuns: 300 },
    )
  })

  it('records the frozen source on a bid entry even after Real_Balance moves', () => {
    fc.assert(
      fc.property(
        playerFieldArb(),
        fc.nat({ max: 10_000 }),
        fc.nat({ max: 10_000 }),
        fc.integer({ min: -5_000, max: 5_000 }),
        roundNameArb,
        categoryIndexArb,
        categoryNameArb,
        (players, rawIndex, rawBid, delta, roundName, categoryIndex, category) => {
          // Classification is frozen here, before the balance change.
          const budgetState = beginGamblingPhases(players)
          const winner = pick(players, rawIndex)
          const winningBid = admissibleAmount(rawBid, unspentBudget(budgetState, winner.name))

          // Requirement 2.11 — a mid-phase Real_Balance change must not move the
          // player between funding sources, so the recorded marker must not move.
          const moved = players.map((player) =>
            player.name === winner.name
              ? { ...player, score: realBalanceOf(player) + delta }
              : player,
          )

          const result = settleWinningBid(
            { budgetState, players: moved, ledger: emptyLedger, ownership: emptyOwnership },
            { winner: winner.name, winningBid, category, roundName, categoryIndex },
          )

          expect(result.accepted).toBe(true)
          expect(result.entry?.fundedBy).toBe(expectedSourceFor(winner))
        },
      ),
      { numRuns: 300 },
    )
  })

  it('records the frozen source on both the bet_placed entry and the SideBet', () => {
    fc.assert(
      fc.property(
        playerFieldArb(),
        fc.nat({ max: 10_000 }),
        fc.nat({ max: 10_000 }),
        sideBetTypeArb,
        predictionArb,
        (players, rawIndex, rawWager, betType, prediction) => {
          const budgetState = beginGamblingPhases(players)
          const bettor = pick(players, rawIndex)
          const wager = admissibleAmount(rawWager, unspentBudget(budgetState, bettor.name))

          const result = settlePlacedWager(
            { budgetState, players, ledger: emptyLedger },
            { playerName: bettor.name, betType, wager, prediction },
          )

          const expected = expectedSourceFor(bettor)
          expect(result.accepted).toBe(true)
          expect(result.entry?.type).toBe('bet_placed')
          expect(result.entry?.amount).toBe(wager)
          expect(result.entry?.fundedBy).toBe(expected)
          // Requirement 2.9 — the SideBet carries the marker too, so round-end
          // settlement still knows the source after the allowance is discarded.
          expect(result.bet?.fundedBy).toBe(expected)
          expect(result.fundedBy).toBe(expected)
        },
      ),
      { numRuns: 300 },
    )
  })

  it('marks every accepted wager in a batch and appends one entry each', () => {
    fc.assert(
      fc.property(
        playerFieldArb(),
        fc.array(fc.tuple(fc.nat({ max: 10_000 }), fc.integer({ min: -50, max: 600 }), sideBetTypeArb, predictionArb), {
          minLength: 1,
          maxLength: 8,
        }),
        (players, rawWagers) => {
          const budgetState = beginGamblingPhases(players)
          const wagers: PlacedWager[] = rawWagers.map(([rawIndex, wager, betType, prediction]) => ({
            playerName: pick(players, rawIndex).name,
            betType,
            wager,
            prediction,
          }))

          const result = settlePlacedWagers({ budgetState, players, ledger: emptyLedger }, wagers)

          // Requirement 2.9, 2.10 — exactly one entry per accepted wager, and
          // none at all for a rejected one.
          expect(result.ledger).toHaveLength(result.bets.length)
          expect(result.bets.length + result.rejected.length).toBe(wagers.length)

          result.ledger.forEach((entry, index) => {
            const bet = result.bets[index]
            const bettor = players.find((player) => player.name === bet.playerName) as Player
            expect(entry.type).toBe('bet_placed')
            expect(entry.playerName).toBe(bet.playerName)
            expect(entry.amount).toBe(bet.wager)
            expect(entry.fundedBy).toBe(expectedSourceFor(bettor))
            expect(bet.fundedBy).toBe(entry.fundedBy)
          })
        },
      ),
      { numRuns: 200 },
    )
  })

  it('echoes the source onto the resolved bet_won or bet_lost entry', () => {
    fc.assert(
      fc.property(
        playerFieldArb(),
        fc.nat({ max: 10_000 }),
        fc.nat({ max: 10_000 }),
        sideBetTypeArb,
        predictionArb,
        fc.boolean(),
        (players, rawIndex, rawWager, betType, prediction, won) => {
          const budgetState = beginGamblingPhases(players)
          const bettor = pick(players, rawIndex)
          const wager = admissibleAmount(rawWager, unspentBudget(budgetState, bettor.name))

          const placed = settlePlacedWager(
            { budgetState, players, ledger: emptyLedger },
            { playerName: bettor.name, betType, wager, prediction },
          )
          expect(placed.accepted).toBe(true)

          const bet = placed.bet as SideBet
          const resolved = settleResolvedBet(
            { players: placed.players, ledger: placed.ledger },
            bet,
            won,
          )

          const expected = expectedSourceFor(bettor)
          expect(resolved.entry.type).toBe(won ? 'bet_won' : 'bet_lost')
          expect(resolved.entry.fundedBy).toBe(expected)
          // The `bet_won` entry records the credit applied; `bet_lost` the wager.
          expect(resolved.entry.amount).toBe(won ? betWinCredit(wager, expected) : wager)
          // Both entries from the bet's life carry the same marker.
          expect(resolved.ledger).toHaveLength(2)
          expect(resolved.ledger[0].fundedBy).toBe(expected)
          expect(resolved.ledger[1].fundedBy).toBe(expected)
        },
      ),
      { numRuns: 300 },
    )
  })

  it('echoes the source onto every entry from a round-end settlement', () => {
    /** A field paired with bets and a round result drawn from its own names. */
    const roundArb = playerFieldArb(scoreEntryArb, { minLength: 1, maxLength: 5 }).chain(
      (players) => {
        const playerNames = players.map((player) => player.name)
        return fc.record({
          players: fc.constant(players),
          bets: fc.array(persistedBetArb(playerNames), { minLength: 1, maxLength: 8 }),
          roundResult: roundResultArb(playerNames),
        })
      },
    )

    fc.assert(
      fc.property(roundArb, ({ players, bets, roundResult }) => {
        const result = settleRoundBets({ players, ledger: emptyLedger }, bets, roundResult)

        expect(result.entries).toHaveLength(bets.length)
        expect(result.ledger).toHaveLength(bets.length)

        result.entries.forEach((entry, index) => {
          const bet = bets[index]
          const source = fundingSourceOf(bet)
          const won = evaluateBet(bet, roundResult)
          expect(entry.playerName).toBe(bet.playerName)
          expect(entry.type).toBe(won ? 'bet_won' : 'bet_lost')
          // Requirement 2.9 — the marker is echoed, an absent one as 'balance'.
          expect(entry.fundedBy).toBe(source)
          expect(entry.amount).toBe(won ? betWinCredit(bet.wager, source) : bet.wager)
        })
      }),
      { numRuns: 200 },
    )
  })

  it('appends no entry at all for a rejected bid', () => {
    fc.assert(
      fc.property(
        playerFieldArb(),
        fc.nat({ max: 10_000 }),
        fc.oneof(
          fc.integer({ min: -10_000, max: 0 }),
          fc.integer({ min: 1, max: 10_000 }).map((over) => ({ over })),
        ),
        fc.boolean(),
        roundNameArb,
        categoryIndexArb,
        categoryNameArb,
        (players, rawIndex, amountSpec, releasedCategory, roundName, categoryIndex, category) => {
          const budgetState = beginGamblingPhases(players)
          const bidder = pick(players, rawIndex)
          const winningBid =
            typeof amountSpec === 'number'
              ? amountSpec
              : unspentBudget(budgetState, bidder.name) + amountSpec.over

          const outcome = releasedCategory
            ? { winner: null, winningBid: 0 }
            : { winner: bidder.name, winningBid }

          const result = settleWinningBid(
            { budgetState, players, ledger: emptyLedger, ownership: emptyOwnership },
            { ...outcome, category, roundName, categoryIndex },
          )

          // Requirement 2.10 — no entry, no marker, and nothing else moves.
          expect(result.accepted).toBe(false)
          expect(result.entry).toBeNull()
          expect(result.fundedBy).toBeNull()
          expect(result.ledger).toEqual(emptyLedger)
          expect(result.ownership).toEqual(emptyOwnership)
          expect(result.budgetState).toEqual(budgetState)
          expect(result.players).toEqual(players)
        },
      ),
      { numRuns: 300 },
    )
  })

  it('appends no entry at all for a rejected wager', () => {
    fc.assert(
      fc.property(
        playerFieldArb(),
        fc.nat({ max: 10_000 }),
        fc.oneof(
          fc.integer({ min: -10_000, max: 0 }),
          fc.integer({ min: 1, max: 10_000 }).map((over) => ({ over })),
        ),
        sideBetTypeArb,
        predictionArb,
        (players, rawIndex, amountSpec, betType, prediction) => {
          const budgetState = beginGamblingPhases(players)
          const bettor = pick(players, rawIndex)
          const wager =
            typeof amountSpec === 'number'
              ? amountSpec
              : unspentBudget(budgetState, bettor.name) + amountSpec.over

          const result = settlePlacedWager(
            { budgetState, players, ledger: emptyLedger },
            { playerName: bettor.name, betType, wager, prediction },
          )

          expect(result.accepted).toBe(false)
          expect(result.entry).toBeNull()
          expect(result.bet).toBeNull()
          expect(result.fundedBy).toBeNull()
          expect(result.ledger).toEqual(emptyLedger)
          expect(result.budgetState).toEqual(budgetState)
          expect(result.players).toEqual(players)
        },
      ),
      { numRuns: 300 },
    )
  })

  it('keeps every marker on the ledger after the allowance is discarded', () => {
    fc.assert(
      fc.property(
        playerFieldArb(),
        fc.nat({ max: 10_000 }),
        fc.nat({ max: 10_000 }),
        fc.nat({ max: 10_000 }),
        sideBetTypeArb,
        predictionArb,
        roundNameArb,
        categoryIndexArb,
        categoryNameArb,
        (
          players,
          rawIndex,
          rawBid,
          rawWager,
          betType,
          prediction,
          roundName,
          categoryIndex,
          category,
        ) => {
          const budgetState = beginGamblingPhases(players)
          const committer = pick(players, rawIndex)
          const expected = expectedSourceFor(committer)
          const unspent = unspentBudget(budgetState, committer.name)
          // The committer needs room for a bid and a wager out of one pool.
          fc.pre(unspent >= 2)
          const winningBid = admissibleAmount(rawBid, unspent - 1)

          const afterBid = settleWinningBid(
            { budgetState, players, ledger: emptyLedger, ownership: emptyOwnership },
            { winner: committer.name, winningBid, category, roundName, categoryIndex },
          )
          const wager = admissibleAmount(
            rawWager,
            unspentBudget(afterBid.budgetState, committer.name),
          )
          const afterWager = settlePlacedWager(
            {
              budgetState: afterBid.budgetState,
              players: afterBid.players,
              ledger: afterBid.ledger,
            },
            { playerName: committer.name, betType, wager, prediction },
          )
          expect(afterWager.accepted).toBe(true)

          const bet = afterWager.bet as SideBet
          const ledgerBeforeDiscard = afterWager.ledger

          // Requirement 1.9, 2.9 — the allowance goes away at Betting_Phase end…
          expect(discardGamblingPhases()).toBeNull()

          // …and the markers on the persisted records survive it, so round-end
          // settlement and analytics stay funding-aware.
          expect(ledgerBeforeDiscard).toHaveLength(2)
          expect(ledgerBeforeDiscard.map((entry) => entry.fundedBy)).toEqual([expected, expected])
          expect(fundingSourceOf(bet)).toBe(expected)

          const resolved = settleResolvedBet(
            { players: afterWager.players, ledger: ledgerBeforeDiscard },
            bet,
            true,
          )
          expect(resolved.entry.fundedBy).toBe(expected)
          expect(resolved.credit).toBe(betWinCredit(wager, expected))
        },
      ),
      { numRuns: 200 },
    )
  })

  it('reads an absent marker as balance-funded, and a present one verbatim', () => {
    fc.assert(
      fc.property(persistedFundedByArb, (fundedBy) => {
        const record = fundedBy === undefined ? {} : { fundedBy }

        // Requirement 2.9 — a pre-allowance record with no marker settles as
        // Real_Balance-funded, keeping it distinguishable from an allowance one.
        expect(fundingSourceOf(record)).toBe(fundedBy ?? 'balance')
        if (fundedBy === undefined) expect(fundingSourceOf(record)).toBe('balance')
      }),
      { numRuns: 100 },
    )
  })

  it('settles a persisted bet with no marker exactly as a balance-funded one', () => {
    fc.assert(
      fc.property(
        playerArb('P1', positiveBalanceArb as fc.Arbitrary<number | undefined>),
        fc.integer({ min: 1, max: GAMBLING_ALLOWANCE_AMOUNT }),
        sideBetTypeArb,
        predictionArb,
        fc.boolean(),
        (player, wager, betType, prediction, won) => {
          const players = [player]
          const unmarked: SideBet = { playerName: 'P1', betType, wager, prediction }
          const marked: SideBet = { ...unmarked, fundedBy: 'balance' }

          const fromUnmarked = settleResolvedBet({ players, ledger: emptyLedger }, unmarked, won)
          const fromMarked = settleResolvedBet({ players, ledger: emptyLedger }, marked, won)

          expect(fromUnmarked.credit).toBe(fromMarked.credit)
          expect(balanceMap(fromUnmarked.players)).toEqual(balanceMap(fromMarked.players))
          expect(fromUnmarked.entry.fundedBy).toBe('balance')
          expect(fromUnmarked.entry).toEqual(fromMarked.entry)
        },
      ),
      { numRuns: 200 },
    )
  })
})
