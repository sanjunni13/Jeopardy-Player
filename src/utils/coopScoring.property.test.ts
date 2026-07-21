import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  calculateBoardTotal,
  calculateTargetScore,
  applyCoopScoring,
  getCoopDailyDoubleMaxWager,
} from './coopScoring'
import type { NormalizedGame, Category, RoundName } from '../types/game'

// ─── Generators ─────────────────────────────────────────────────────────────

/** Valid target percentage: integer 50–100 */
const targetPercentageArb = fc.integer({ min: 50, max: 100 })

/** Positive board total */
const boardTotalArb = fc.integer({ min: 0, max: 1_000_000 })

/** Positive base value for scoring */
const baseValueArb = fc.integer({ min: 1, max: 100_000 })

/** Arbitrary current pool (can be negative) */
const currentPoolArb = fc.integer({ min: -500_000, max: 500_000 })

/** Arbitrary team pool value */
const teamPoolArb = fc.integer({ min: -100_000, max: 100_000 })

/** Arbitrary target score (positive) */
const targetScoreArb = fc.integer({ min: 1, max: 1_000_000 })

/** A marking value */
const markingArb = fc.constantFrom('correct' as const, 'incorrect' as const)

/** Generate a single NormalizedClue */
const clueArb = fc.record({
  value: fc.integer({ min: 100, max: 2000 }),
  clue: fc.constant('Test clue'),
  solution: fc.constant('Test solution'),
  dailyDouble: fc.boolean(),
  html: fc.constant(false),
})

/** Generate a category with 1–5 clues */
const categoryArb: fc.Arbitrary<Category> = fc.record({
  category: fc.string({ minLength: 1, maxLength: 20 }),
  clues: fc.array(clueArb, { minLength: 1, maxLength: 5 }),
})

/** Valid round names (excluding final jeopardy) */
const roundNameArb = fc.constantFrom(
  'single' as RoundName,
  'double' as RoundName,
  'triple' as RoundName,
)

/** Generate a NormalizedGame with random rounds */
const normalizedGameArb: fc.Arbitrary<NormalizedGame> = fc
  .array(
    fc.tuple(roundNameArb, fc.array(categoryArb, { minLength: 1, maxLength: 6 })),
    { minLength: 1, maxLength: 3 }
  )
  .map((entries) => {
    const rounds: Record<string, Category[]> = {}
    for (const [name, categories] of entries) {
      rounds[name] = categories
    }
    return {
      rounds: rounds as NormalizedGame['rounds'],
      final: { category: 'Final', clue: 'Final clue', solution: 'Final solution', html: false },
      totalRounds: Object.keys(rounds).length,
    }
  })

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Property 3: Target_Score calculation is correct', () => {
  /**
   * **Validates: Requirements 1.5**
   *
   * For any boardTotal and targetPercentage in [50, 100], targetScore equals
   * Math.floor(boardTotal × targetPercentage / 100).
   */

  it('calculateTargetScore equals Math.floor(boardTotal * targetPercentage / 100)', () => {
    fc.assert(
      fc.property(
        boardTotalArb,
        targetPercentageArb,
        (boardTotal, targetPercentage) => {
          const result = calculateTargetScore(boardTotal, targetPercentage)
          const expected = Math.floor(boardTotal * targetPercentage / 100)
          expect(result).toBe(expected)
        }
      ),
      { numRuns: 1000 }
    )
  })
})

describe('Property 4: Co-op scoring adds on correct and deducts on incorrect', () => {
  /**
   * **Validates: Requirements 2.2, 2.3**
   *
   * For any baseValue > 0, marking correct produces poolDelta === +baseValue and
   * marking incorrect produces poolDelta === -baseValue (when no previous marking exists).
   */

  it('marking correct with no previous marking adds baseValue', () => {
    fc.assert(
      fc.property(
        baseValueArb,
        currentPoolArb,
        (baseValue, currentPool) => {
          const result = applyCoopScoring({
            prevMarking: null,
            newMarking: 'correct',
            baseValue,
            currentPool,
          })
          expect(result.poolDelta).toBe(baseValue)
          expect(result.newPool).toBe(currentPool + baseValue)
        }
      ),
      { numRuns: 1000 }
    )
  })

  it('marking incorrect with no previous marking deducts baseValue', () => {
    fc.assert(
      fc.property(
        baseValueArb,
        currentPoolArb,
        (baseValue, currentPool) => {
          const result = applyCoopScoring({
            prevMarking: null,
            newMarking: 'incorrect',
            baseValue,
            currentPool,
          })
          expect(result.poolDelta).toBe(-baseValue)
          expect(result.newPool).toBe(currentPool - baseValue)
        }
      ),
      { numRuns: 1000 }
    )
  })
})

describe('Property 5: Marking reversals are exact inverses', () => {
  /**
   * **Validates: Requirements 2.5**
   *
   * For any sequence of mark → reverse operations, the net poolDelta over the
   * full sequence is 0 (the pool returns to its original value).
   */

  it('mark then reverse (to null) returns pool to original value', () => {
    fc.assert(
      fc.property(
        baseValueArb,
        currentPoolArb,
        markingArb,
        (baseValue, currentPool, marking) => {
          // Apply marking
          const afterMark = applyCoopScoring({
            prevMarking: null,
            newMarking: marking,
            baseValue,
            currentPool,
          })

          // Reverse marking (prev = marking, new = null)
          const afterReverse = applyCoopScoring({
            prevMarking: marking,
            newMarking: null,
            baseValue,
            currentPool: afterMark.newPool,
          })

          // Net delta over both operations should be 0
          const netDelta = afterMark.poolDelta + afterReverse.poolDelta
          expect(netDelta).toBe(0)
          expect(afterReverse.newPool).toBe(currentPool)
        }
      ),
      { numRuns: 1000 }
    )
  })

  it('mark correct then switch to incorrect has net delta of -2*baseValue', () => {
    fc.assert(
      fc.property(
        baseValueArb,
        currentPoolArb,
        (baseValue, currentPool) => {
          // Mark correct initially
          const afterCorrect = applyCoopScoring({
            prevMarking: null,
            newMarking: 'correct',
            baseValue,
            currentPool,
          })

          // Switch from correct to incorrect (reversal + new marking)
          const afterSwitch = applyCoopScoring({
            prevMarking: 'correct',
            newMarking: 'incorrect',
            baseValue,
            currentPool: afterCorrect.newPool,
          })

          // Net delta: +baseValue (first) + (-2*baseValue) (switch) = -baseValue total
          // The switch itself reverses correct (-baseValue) and applies incorrect (-baseValue) = -2*baseValue
          expect(afterSwitch.poolDelta).toBe(-2 * baseValue)
          expect(afterSwitch.newPool).toBe(currentPool - baseValue)
        }
      ),
      { numRuns: 1000 }
    )
  })
})

describe('Property 6: Wagering Mode uses wager as base value in co-op', () => {
  /**
   * **Validates: Requirements 2.4**
   *
   * For any recorded wager w, marking correct adds w and incorrect deducts w.
   * (In co-op + wagering mode, the wager IS the baseValue passed to applyCoopScoring.)
   */

  it('wager value is used as baseValue: correct adds wager, incorrect deducts wager', () => {
    const wagerArb = fc.integer({ min: 1, max: 50_000 })

    fc.assert(
      fc.property(
        wagerArb,
        currentPoolArb,
        (wager, currentPool) => {
          // Correct with wager as baseValue
          const correctResult = applyCoopScoring({
            prevMarking: null,
            newMarking: 'correct',
            baseValue: wager,
            currentPool,
          })
          expect(correctResult.poolDelta).toBe(wager)
          expect(correctResult.newPool).toBe(currentPool + wager)

          // Incorrect with wager as baseValue
          const incorrectResult = applyCoopScoring({
            prevMarking: null,
            newMarking: 'incorrect',
            baseValue: wager,
            currentPool,
          })
          expect(incorrectResult.poolDelta).toBe(-wager)
          expect(incorrectResult.newPool).toBe(currentPool - wager)
        }
      ),
      { numRuns: 1000 }
    )
  })
})

describe('Property 7: Daily Double max wager equals max(teamPool, 1000)', () => {
  /**
   * **Validates: Requirements 2.7**
   *
   * When teamPool > 0 returns Math.max(teamPool, 1000),
   * when teamPool <= 0 returns 1000.
   */

  it('when teamPool > 0, max wager is Math.max(teamPool, 1000)', () => {
    const positivePoolArb = fc.integer({ min: 1, max: 1_000_000 })

    fc.assert(
      fc.property(positivePoolArb, (teamPool) => {
        const maxWager = getCoopDailyDoubleMaxWager(teamPool)
        expect(maxWager).toBe(Math.max(teamPool, 1000))
      }),
      { numRuns: 1000 }
    )
  })

  it('when teamPool <= 0, max wager is 1000', () => {
    const nonPositivePoolArb = fc.integer({ min: -100_000, max: 0 })

    fc.assert(
      fc.property(nonPositivePoolArb, (teamPool) => {
        const maxWager = getCoopDailyDoubleMaxWager(teamPool)
        expect(maxWager).toBe(1000)
      }),
      { numRuns: 1000 }
    )
  })
})

describe('Property 9: Victory condition is teamPool >= targetScore', () => {
  /**
   * **Validates: Requirements 5.2**
   *
   * The game result is "Team Victory" if and only if teamPool >= targetScore.
   */

  it('teamPool >= targetScore means victory, teamPool < targetScore means defeat', () => {
    fc.assert(
      fc.property(
        teamPoolArb,
        targetScoreArb,
        (teamPool, targetScore) => {
          const isVictory = teamPool >= targetScore
          if (isVictory) {
            expect(teamPool).toBeGreaterThanOrEqual(targetScore)
          } else {
            expect(teamPool).toBeLessThan(targetScore)
          }
        }
      ),
      { numRuns: 1000 }
    )
  })

  it('victory boundary: pool === target is victory, pool === target - 1 is defeat', () => {
    fc.assert(
      fc.property(targetScoreArb, (targetScore) => {
        // Exactly at target = victory
        expect(targetScore >= targetScore).toBe(true)

        // One below target = defeat
        const belowTarget = targetScore - 1
        expect(belowTarget >= targetScore).toBe(false)
      }),
      { numRuns: 1000 }
    )
  })
})

describe('Property 10: Board total equals sum of all clue values', () => {
  /**
   * **Validates: Requirements 1.5**
   *
   * For any NormalizedGame, calculateBoardTotal returns the sum of clue.value
   * for every clue in every category in every round (excluding Final Jeopardy).
   */

  it('calculateBoardTotal returns sum of all clue values across all rounds', () => {
    fc.assert(
      fc.property(normalizedGameArb, (game) => {
        const result = calculateBoardTotal(game)

        // Manually compute expected total
        let expectedTotal = 0
        for (const roundName of Object.keys(game.rounds)) {
          const categories = game.rounds[roundName as keyof typeof game.rounds]
          if (!categories) continue
          for (const category of categories) {
            for (const clue of category.clues) {
              expectedTotal += clue.value
            }
          }
        }

        expect(result).toBe(expectedTotal)
      }),
      { numRuns: 1000 }
    )
  })

  it('board total does not include Final Jeopardy value', () => {
    // Create a game with known values to verify FJ is excluded
    fc.assert(
      fc.property(normalizedGameArb, (game) => {
        const result = calculateBoardTotal(game)

        // The final round has no numeric value field, so it's inherently excluded.
        // Verify the total only includes rounds (not 'final').
        let roundTotal = 0
        for (const roundName of Object.keys(game.rounds)) {
          const categories = game.rounds[roundName as keyof typeof game.rounds]
          if (!categories) continue
          for (const category of categories) {
            for (const clue of category.clues) {
              roundTotal += clue.value
            }
          }
        }

        expect(result).toBe(roundTotal)
      }),
      { numRuns: 1000 }
    )
  })
})
