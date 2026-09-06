import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { evaluateBet } from './gamblingScoring'
import type { RoundResult } from './gamblingScoring'
import type { SideBet, SideBetType } from '../types/game'

// ─── Generators ─────────────────────────────────────────────────────────────

/** All 11 valid SideBetType values */
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

const sideBetTypeArb: fc.Arbitrary<SideBetType> = fc.constantFrom(...ALL_BET_TYPES)

/** Player name: non-empty alphanumeric string */
const playerNameArb = fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0)

/** Nullable player name for single-player fields */
const nullablePlayerNameArb = fc.oneof(playerNameArb, fc.constant(null))

/** Array of player names (possibly empty) for array fields */
const playerNameArrayArb = fc.array(playerNameArb, { minLength: 0, maxLength: 5 })

/** Generate a random RoundResult with random field values */
const roundResultArb: fc.Arbitrary<RoundResult> = fc.record({
  roundLeader: nullablePlayerNameArb,
  dailyDoubleFinderPlayer: nullablePlayerNameArb,
  mostIncorrectPlayer: nullablePlayerNameArb,
  sweepCategoryPlayer: nullablePlayerNameArb,
  zeroScoreRoundPlayers: playerNameArrayArb,
  noWrongAnswersPlayers: playerNameArrayArb,
  highestSingleCluePlayer: nullablePlayerNameArb,
  mostCorrectPlayer: nullablePlayerNameArb,
  firstIncorrectPlayer: nullablePlayerNameArb,
  biggestEarnerPlayer: nullablePlayerNameArb,
  bottomFeederPlayer: nullablePlayerNameArb,
})

/** Generate a random prediction string */
const predictionArb = playerNameArb

// ─── Reference Implementation ───────────────────────────────────────────────

/**
 * Naive reference implementation of evaluateBet for property verification.
 * Uses explicit field lookup logic matching the spec.
 */
function referenceEvaluateBet(betType: SideBetType, prediction: string, result: RoundResult): boolean {
  switch (betType) {
    case 'round_leader':
      return result.roundLeader === prediction
    case 'daily_double_finder':
      return result.dailyDoubleFinderPlayer === prediction
    case 'most_incorrect':
      return result.mostIncorrectPlayer === prediction
    case 'sweep_category':
      return result.sweepCategoryPlayer === prediction
    case 'zero_score_round':
      return result.zeroScoreRoundPlayers.includes(prediction)
    case 'no_wrong_answers':
      return result.noWrongAnswersPlayers.includes(prediction)
    case 'highest_single_clue':
      return result.highestSingleCluePlayer === prediction
    case 'most_correct':
      return result.mostCorrectPlayer === prediction
    case 'first_incorrect':
      return result.firstIncorrectPlayer === prediction
    case 'biggest_earner':
      return result.biggestEarnerPlayer === prediction
    case 'bottom_feeder':
      return result.bottomFeederPlayer === prediction
    default:
      return false
  }
}

// ─── Property 1: evaluateBet Correctness ────────────────────────────────────

describe('Feature: expanded-bet-types, Property 1: evaluateBet Correctness', () => {
  /**
   * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 9.5**
   *
   * For any valid SideBetType, any RoundResult, and any prediction string,
   * evaluateBet returns true if and only if the prediction matches the corresponding
   * RoundResult field (equality for single-player fields, array inclusion for array fields),
   * and returns false when the result field is null.
   */

  it('evaluateBet matches expected field lookup logic for all bet types', () => {
    fc.assert(
      fc.property(
        sideBetTypeArb,
        roundResultArb,
        predictionArb,
        fc.integer({ min: 1, max: 1000 }), // wager (doesn't affect evaluation)
        (betType, roundResult, prediction, wager) => {
          const bet: SideBet = {
            playerName: 'TestBettor',
            betType,
            wager,
            prediction,
          }

          const actual = evaluateBet(bet, roundResult)
          const expected = referenceEvaluateBet(betType, prediction, roundResult)

          expect(actual).toBe(expected)
        }
      ),
      { numRuns: 200 }
    )
  })

  it('evaluateBet returns false when single-player result field is null', () => {
    const singlePlayerBetTypes: SideBetType[] = [
      'round_leader',
      'daily_double_finder',
      'most_incorrect',
      'sweep_category',
      'highest_single_clue',
      'most_correct',
      'first_incorrect',
      'biggest_earner',
      'bottom_feeder',
    ]

    fc.assert(
      fc.property(
        fc.constantFrom(...singlePlayerBetTypes),
        predictionArb,
        (betType, prediction) => {
          // Construct a RoundResult where all single-player fields are null
          const nullResult: RoundResult = {
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

          const bet: SideBet = {
            playerName: 'TestBettor',
            betType,
            wager: 100,
            prediction,
          }

          // Any prediction against a null field should return false
          expect(evaluateBet(bet, nullResult)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('evaluateBet returns false for array fields when prediction is not in the array', () => {
    const arrayBetTypes: SideBetType[] = ['zero_score_round', 'no_wrong_answers']

    fc.assert(
      fc.property(
        fc.constantFrom(...arrayBetTypes),
        playerNameArrayArb,
        predictionArb.filter(p => p.length > 0),
        (betType, players, prediction) => {
          // Ensure prediction is NOT in the array
          const filteredPlayers = players.filter(p => p !== prediction)

          const roundResult: RoundResult = {
            roundLeader: null,
            dailyDoubleFinderPlayer: null,
            mostIncorrectPlayer: null,
            sweepCategoryPlayer: null,
            zeroScoreRoundPlayers: betType === 'zero_score_round' ? filteredPlayers : [],
            noWrongAnswersPlayers: betType === 'no_wrong_answers' ? filteredPlayers : [],
            highestSingleCluePlayer: null,
            mostCorrectPlayer: null,
            firstIncorrectPlayer: null,
            biggestEarnerPlayer: null,
            bottomFeederPlayer: null,
          }

          const bet: SideBet = {
            playerName: 'TestBettor',
            betType,
            wager: 100,
            prediction,
          }

          expect(evaluateBet(bet, roundResult)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('evaluateBet returns true for array fields when prediction IS in the array', () => {
    const arrayBetTypes: SideBetType[] = ['zero_score_round', 'no_wrong_answers']

    fc.assert(
      fc.property(
        fc.constantFrom(...arrayBetTypes),
        playerNameArrayArb.filter(arr => arr.length > 0),
        (betType, players) => {
          // Pick a prediction that IS in the array
          const prediction = players[0]

          const roundResult: RoundResult = {
            roundLeader: null,
            dailyDoubleFinderPlayer: null,
            mostIncorrectPlayer: null,
            sweepCategoryPlayer: null,
            zeroScoreRoundPlayers: betType === 'zero_score_round' ? players : [],
            noWrongAnswersPlayers: betType === 'no_wrong_answers' ? players : [],
            highestSingleCluePlayer: null,
            mostCorrectPlayer: null,
            firstIncorrectPlayer: null,
            biggestEarnerPlayer: null,
            bottomFeederPlayer: null,
          }

          const bet: SideBet = {
            playerName: 'TestBettor',
            betType,
            wager: 100,
            prediction,
          }

          expect(evaluateBet(bet, roundResult)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('evaluateBet returns true for single-player fields when prediction matches exactly', () => {
    fc.assert(
      fc.property(
        predictionArb,
        (prediction) => {
          // Test each single-player bet type with matching prediction
          const roundResult: RoundResult = {
            roundLeader: prediction,
            dailyDoubleFinderPlayer: prediction,
            mostIncorrectPlayer: prediction,
            sweepCategoryPlayer: prediction,
            zeroScoreRoundPlayers: [prediction],
            noWrongAnswersPlayers: [prediction],
            highestSingleCluePlayer: prediction,
            mostCorrectPlayer: prediction,
            firstIncorrectPlayer: prediction,
            biggestEarnerPlayer: prediction,
            bottomFeederPlayer: prediction,
          }

          for (const betType of ALL_BET_TYPES) {
            const bet: SideBet = {
              playerName: 'TestBettor',
              betType,
              wager: 100,
              prediction,
            }
            expect(evaluateBet(bet, roundResult)).toBe(true)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
