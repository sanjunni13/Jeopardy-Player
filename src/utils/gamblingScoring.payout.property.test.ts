import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { resolveRoundBets, evaluateBet } from './gamblingScoring'
import type { RoundResult } from './gamblingScoring'
import type { Player, SideBet, SideBetType } from '../types/game'

// ─── Generators ─────────────────────────────────────────────────────────────

const ALL_BET_TYPES: SideBetType[] = [
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
]

/** Player names for generation - using fixed pool to ensure predictions can match */
const PLAYER_NAMES = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank']

const playerNameArb = fc.constantFrom(...PLAYER_NAMES)

/** Generate a player with a positive score (as starting balance) */
const playerArb = (name: string): fc.Arbitrary<Player> =>
  fc.record({
    name: fc.constant(name),
    score: fc.integer({ min: 100, max: 10000 }),
    correctCount: fc.nat({ max: 50 }),
    incorrectCount: fc.nat({ max: 50 }),
    correctDailyDoubles: fc.nat({ max: 5 }),
    incorrectDailyDoubles: fc.nat({ max: 5 }),
    correctFinalJeopardy: fc.constantFrom(0, 1) as fc.Arbitrary<number>,
    incorrectFinalJeopardy: fc.constantFrom(0, 1) as fc.Arbitrary<number>,
    totalEarned: fc.nat({ max: 50000 }),
  })

/** Generate a list of 2-4 players with unique names from our pool */
const playersArb: fc.Arbitrary<Player[]> = fc
  .shuffledSubarray(PLAYER_NAMES, { minLength: 2, maxLength: 4 })
  .chain((names) => fc.tuple(...names.map((n) => playerArb(n))))
  .map((players) => players as Player[])

/** Generate a RoundResult with predictions from our player pool */
const roundResultArb: fc.Arbitrary<RoundResult> = fc.record({
  roundLeader: fc.oneof(fc.constant(null), playerNameArb),
  dailyDoubleFinderPlayer: fc.oneof(fc.constant(null), playerNameArb),
  mostIncorrectPlayer: fc.oneof(fc.constant(null), playerNameArb),
  sweepCategoryPlayer: fc.oneof(fc.constant(null), playerNameArb),
  zeroScoreRoundPlayers: fc.shuffledSubarray(PLAYER_NAMES, { minLength: 0, maxLength: 3 }),
  noWrongAnswersPlayers: fc.shuffledSubarray(PLAYER_NAMES, { minLength: 0, maxLength: 3 }),
  highestSingleCluePlayer: fc.oneof(fc.constant(null), playerNameArb),
  mostCorrectPlayer: fc.oneof(fc.constant(null), playerNameArb),
  firstIncorrectPlayer: fc.oneof(fc.constant(null), playerNameArb),
  biggestEarnerPlayer: fc.oneof(fc.constant(null), playerNameArb),
  bottomFeederPlayer: fc.oneof(fc.constant(null), playerNameArb),
})

/** Generate a valid side bet for a given set of player names */
const sideBetArb = (playerNames: string[]): fc.Arbitrary<SideBet> =>
  fc.record({
    playerName: fc.constantFrom(...playerNames),
    betType: fc.constantFrom(...ALL_BET_TYPES),
    wager: fc.integer({ min: 1, max: 500 }),
    prediction: fc.constantFrom(...playerNames),
  })

// ─── Property 2: Payout Invariant ───────────────────────────────────────────

describe('Feature: expanded-bet-types, Property 2: Payout Invariant', () => {
  /**
   * **Validates: Requirements 3.13**
   *
   * For any winning bet with wager W, the payout credited to the bettor's balance
   * is exactly W × 2. For any losing bet, the balance change from resolution is 0
   * (the wager was already deducted at placement).
   */

  it('winning bets produce wager×2 balance credit, losing bets produce 0 additional balance change', () => {
    fc.assert(
      fc.property(
        playersArb.chain((players) => {
          const names = players.map((p) => p.name)
          return fc.tuple(
            fc.constant(players),
            fc.array(sideBetArb(names), { minLength: 1, maxLength: 8 }),
            roundResultArb,
          )
        }),
        ([players, bets, roundResult]) => {
          // Record pre-resolution scores (these are the post-wager-deduction baselines)
          const preScores: Record<string, number> = {}
          for (const player of players) {
            preScores[player.name] = player.score
          }

          // Resolve bets
          const { updatedPlayers } = resolveRoundBets(players, bets, roundResult)

          // Compute expected score changes based on wins/losses
          const expectedChanges: Record<string, number> = {}
          for (const player of players) {
            expectedChanges[player.name] = 0
          }

          for (const bet of bets) {
            const won = evaluateBet(bet, roundResult)
            if (won) {
              // Winning bet: wager × 2 credited
              expectedChanges[bet.playerName] += bet.wager * 2
            }
            // Losing bet: 0 additional balance change from resolution
          }

          // Verify each player's score change matches expected
          for (const updatedPlayer of updatedPlayers) {
            const actualChange = updatedPlayer.score - preScores[updatedPlayer.name]
            expect(actualChange).toBe(expectedChanges[updatedPlayer.name])
          }
        },
      ),
      { numRuns: 200 },
    )
  })

  it('a single winning bet increases balance by exactly wager × 2', () => {
    fc.assert(
      fc.property(
        playersArb.chain((players) => {
          const names = players.map((p) => p.name)
          return fc.tuple(
            fc.constant(players),
            fc.constantFrom(...names),
            fc.constantFrom(...ALL_BET_TYPES),
            fc.integer({ min: 1, max: 500 }),
          )
        }),
        ([players, bettorName, betType, wager]) => {
          // Build a RoundResult that guarantees this bet wins
          const winningResult = buildWinningRoundResult(bettorName, betType)

          const bet: SideBet = {
            playerName: bettorName,
            betType,
            wager,
            prediction: bettorName,
          }

          const preBettorScore = players.find((p) => p.name === bettorName)!.score

          const { updatedPlayers } = resolveRoundBets(players, [bet], winningResult)
          const updatedBettor = updatedPlayers.find((p) => p.name === bettorName)!

          // The bettor's score should increase by exactly wager * 2
          expect(updatedBettor.score - preBettorScore).toBe(wager * 2)
        },
      ),
      { numRuns: 200 },
    )
  })

  it('a single losing bet produces zero balance change from resolution', () => {
    fc.assert(
      fc.property(
        playersArb.chain((players) => {
          const names = players.map((p) => p.name)
          return fc.tuple(
            fc.constant(players),
            fc.constantFrom(...names),
            fc.constantFrom(...ALL_BET_TYPES),
            fc.integer({ min: 1, max: 500 }),
          )
        }),
        ([players, bettorName, betType, wager]) => {
          // Build a RoundResult that guarantees this bet loses
          const losingResult = buildLosingRoundResult(bettorName, betType)

          const bet: SideBet = {
            playerName: bettorName,
            betType,
            wager,
            prediction: bettorName,
          }

          const preBettorScore = players.find((p) => p.name === bettorName)!.score

          const { updatedPlayers } = resolveRoundBets(players, [bet], losingResult)
          const updatedBettor = updatedPlayers.find((p) => p.name === bettorName)!

          // The bettor's score should not change from resolution (wager was already deducted)
          expect(updatedBettor.score - preBettorScore).toBe(0)
        },
      ),
      { numRuns: 200 },
    )
  })
})

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build a RoundResult that makes a bet on `prediction` with `betType` WIN.
 */
function buildWinningRoundResult(prediction: string, betType: SideBetType): RoundResult {
  const base: RoundResult = {
    roundLeader: null,
    dailyDoubleFinderPlayer: null,
    mostIncorrectPlayer: null,
    sweepCategoryPlayer: null,
    zeroScoreRoundPlayers: [],
    noWrongAnswersPlayers: [],
    highestSingleCluePlayer: null,
    mostCorrectPlayer: null,
    firstIncorrectPlayer: null,
    biggestEarnerPlayer: null,
    bottomFeederPlayer: null,
  }

  switch (betType) {
    case 'round_leader':
      return { ...base, roundLeader: prediction }
    case 'daily_double_finder':
      return { ...base, dailyDoubleFinderPlayer: prediction }
    case 'most_incorrect':
      return { ...base, mostIncorrectPlayer: prediction }
    case 'sweep_category':
      return { ...base, sweepCategoryPlayer: prediction }
    case 'zero_score_round':
      return { ...base, zeroScoreRoundPlayers: [prediction] }
    case 'no_wrong_answers':
      return { ...base, noWrongAnswersPlayers: [prediction] }
    case 'highest_single_clue':
      return { ...base, highestSingleCluePlayer: prediction }
    case 'most_correct':
      return { ...base, mostCorrectPlayer: prediction }
    case 'first_incorrect':
      return { ...base, firstIncorrectPlayer: prediction }
    case 'biggest_earner':
      return { ...base, biggestEarnerPlayer: prediction }
    case 'bottom_feeder':
      return { ...base, bottomFeederPlayer: prediction }
    default:
      return base
  }
}

/**
 * Build a RoundResult that makes a bet on `prediction` with `betType` LOSE.
 * Uses a different player name or null/empty arrays to ensure the bet loses.
 */
function buildLosingRoundResult(prediction: string, betType: SideBetType): RoundResult {
  // Use a name that definitely doesn't match the prediction
  const nonMatchingName = prediction === '__NOBODY__' ? '__OTHER__' : '__NOBODY__'

  const base: RoundResult = {
    roundLeader: null,
    dailyDoubleFinderPlayer: null,
    mostIncorrectPlayer: null,
    sweepCategoryPlayer: null,
    zeroScoreRoundPlayers: [],
    noWrongAnswersPlayers: [],
    highestSingleCluePlayer: null,
    mostCorrectPlayer: null,
    firstIncorrectPlayer: null,
    biggestEarnerPlayer: null,
    bottomFeederPlayer: null,
  }

  switch (betType) {
    case 'round_leader':
      return { ...base, roundLeader: nonMatchingName }
    case 'daily_double_finder':
      return { ...base, dailyDoubleFinderPlayer: nonMatchingName }
    case 'most_incorrect':
      return { ...base, mostIncorrectPlayer: nonMatchingName }
    case 'sweep_category':
      return { ...base, sweepCategoryPlayer: nonMatchingName }
    case 'zero_score_round':
      return { ...base, zeroScoreRoundPlayers: [nonMatchingName] }
    case 'no_wrong_answers':
      return { ...base, noWrongAnswersPlayers: [nonMatchingName] }
    case 'highest_single_clue':
      return { ...base, highestSingleCluePlayer: nonMatchingName }
    case 'most_correct':
      return { ...base, mostCorrectPlayer: nonMatchingName }
    case 'first_incorrect':
      return { ...base, firstIncorrectPlayer: nonMatchingName }
    case 'biggest_earner':
      return { ...base, biggestEarnerPlayer: nonMatchingName }
    case 'bottom_feeder':
      return { ...base, bottomFeederPlayer: nonMatchingName }
    default:
      return base
  }
}
