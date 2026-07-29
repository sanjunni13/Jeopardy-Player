import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  computeWagerRange,
  computePenaltyDoubler,
  updateStreakCount,
  computeStreakMultiplier,
  checkStealCondition,
  applyModifiers,
} from './gameToggles'
import { DEFAULT_TOGGLE_CONFIG } from '../types/game'
import type { ToggleConfig } from '../types/game'

// ─── Generators ───────────────────────────────────────────────────────────────

/** Player score: any integer (can be negative for Jeopardy) */
const scoreArb = fc.integer({ min: -100_000, max: 100_000 })

/** Wager floor: positive integer 1–10000 */
const wagerFloorArb = fc.integer({ min: 1, max: 10_000 })

/** Base clue value: positive integer */
const baseValueArb = fc.integer({ min: 1, max: 10_000 })

/** Streak count: non-negative */
const streakCountArb = fc.integer({ min: 0, max: 50 })

/** Streak threshold: 2–5 */
const thresholdArb = fc.integer({ min: 2, max: 5 })

/** Streak multiplier value: 2–5 */
const multiplierArb = fc.integer({ min: 2, max: 5 })

/** Per-round incorrect count: non-negative */
const perRoundIncorrectArb = fc.integer({ min: 0, max: 20 })

/** Marking value */
const markingArb = fc.constantFrom('correct' as const, 'incorrect' as const, null)

/** Non-null marking value */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const nonNullMarkingArb = fc.constantFrom('correct' as const, 'incorrect' as const)

/** Player name */
const playerNameArb = fc.string({ minLength: 1, maxLength: 15 }).filter(s => s.trim().length > 0)

// ─── Property 6: Wager permitted range is correct for any player score ───────

describe('Property 6: Wager permitted range is correct for any player score', () => {
  /**
   * **Validates: Requirements 3.3, 3.4, 3.5**
   *
   * When score > 0: range is [wagerFloor, max(wagerFloor, score)]
   * When score <= 0: range is [1, wagerFloor]
   */

  it('when score > 0, min is wagerFloor and max is max(wagerFloor, score)', () => {
    const positiveScoreArb = fc.integer({ min: 1, max: 100_000 })

    fc.assert(
      fc.property(positiveScoreArb, wagerFloorArb, (score, wagerFloor) => {
        const result = computeWagerRange(score, wagerFloor)
        expect(result.min).toBe(wagerFloor)
        expect(result.max).toBe(Math.max(wagerFloor, score))
        expect(result.min).toBeLessThanOrEqual(result.max)
      }),
      { numRuns: 500 }
    )
  })

  it('when score <= 0, min is 1 and max is wagerFloor', () => {
    const nonPositiveScoreArb = fc.integer({ min: -100_000, max: 0 })

    fc.assert(
      fc.property(nonPositiveScoreArb, wagerFloorArb, (score, wagerFloor) => {
        const result = computeWagerRange(score, wagerFloor)
        expect(result.min).toBe(1)
        expect(result.max).toBe(wagerFloor)
        expect(result.min).toBeLessThanOrEqual(result.max)
      }),
      { numRuns: 500 }
    )
  })

  it('min is always <= max for any score and wagerFloor', () => {
    fc.assert(
      fc.property(scoreArb, wagerFloorArb, (score, wagerFloor) => {
        const result = computeWagerRange(score, wagerFloor)
        expect(result.min).toBeLessThanOrEqual(result.max)
        expect(result.min).toBeGreaterThanOrEqual(1)
      }),
      { numRuns: 500 }
    )
  })
})

// ─── Property 16: Penalty Doubler deduction depends on per-round incorrect count ─

describe('Property 16: Penalty Doubler deduction is always value × 2', () => {
  /**
   * **Validates: Requirements 7.2, 7.3**
   *
   * computePenaltyDoubler always returns deduction = value × 2
   * and increments the incorrect count by 1.
   */

  it('deduction is always value × 2 regardless of prior count', () => {
    fc.assert(
      fc.property(baseValueArb, perRoundIncorrectArb, (value, priorCount) => {
        const result = computePenaltyDoubler({ value, priorIncorrectCount: priorCount })
        expect(result.deduction).toBe(value * 2)
        expect(result.newIncorrectCount).toBe(priorCount + 1)
      }),
      { numRuns: 500 }
    )
  })

  it('newIncorrectCount is always priorIncorrectCount + 1', () => {
    fc.assert(
      fc.property(baseValueArb, perRoundIncorrectArb, (value, priorCount) => {
        const result = computePenaltyDoubler({ value, priorIncorrectCount: priorCount })
        expect(result.newIncorrectCount).toBe(priorCount + 1)
      }),
      { numRuns: 500 }
    )
  })
})

// ─── Property 13: Streak count equals length of trailing correct run ─────────

describe('Property 13: Streak count equals length of trailing correct run', () => {
  /**
   * **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
   *
   * Starting from 0, applying updateStreakCount with a sequence of markings
   * produces a final count equal to the number of trailing consecutive 'correct'
   * values in the sequence.
   */

  it('final streak count equals trailing correct run length', () => {
    fc.assert(
      fc.property(
        fc.array(markingArb, { minLength: 0, maxLength: 30 }),
        (markings) => {
          let count = 0
          for (const marking of markings) {
            count = updateStreakCount(count, marking)
          }

          // Count trailing corrects manually
          let trailingCorrects = 0
          for (let i = markings.length - 1; i >= 0; i--) {
            if (markings[i] === 'correct') {
              trailingCorrects++
            } else {
              break
            }
          }

          expect(count).toBe(trailingCorrects)
        }
      ),
      { numRuns: 500 }
    )
  })

  it('correct increments count, incorrect/null resets to 0', () => {
    fc.assert(
      fc.property(streakCountArb, markingArb, (prev, marking) => {
        const result = updateStreakCount(prev, marking)
        if (marking === 'correct') {
          expect(result).toBe(prev + 1)
        } else {
          expect(result).toBe(0)
        }
      }),
      { numRuns: 500 }
    )
  })
})

// ─── Property 14: Streak multiplier applied when and only when streak >= threshold ─

describe('Property 14: Streak multiplier applied iff streak >= threshold', () => {
  /**
   * **Validates: Requirements 6.2, 6.3**
   *
   * computeStreakMultiplier returns multiplier when streakCount >= threshold,
   * returns 1 otherwise.
   */

  it('returns multiplier when count >= threshold, 1 otherwise', () => {
    fc.assert(
      fc.property(streakCountArb, thresholdArb, multiplierArb, (count, threshold, multiplier) => {
        const result = computeStreakMultiplier(count, threshold, multiplier)
        if (count >= threshold) {
          expect(result).toBe(multiplier)
        } else {
          expect(result).toBe(1)
        }
      }),
      { numRuns: 500 }
    )
  })
})


// ─── Property 8: Wagering Mode uses recorded wager as point value ─────────────

describe('Property 8: Wagering Mode uses recorded wager as point value for scoring', () => {
  /**
   * **Validates: Requirements 3.7**
   *
   * When wagering mode is enabled, the baseValue passed to applyModifiers
   * IS the wager (the caller resolves this). In all cases, a correct marking
   * should produce a positive delta of at least the baseValue, and an incorrect
   * marking should produce a negative delta of at least -baseValue.
   */

  it('correct marking with wagering adds at least baseValue (wager)', () => {
    fc.assert(
      fc.property(baseValueArb, playerNameArb, (wager, playerName) => {
        const config: ToggleConfig = {
          ...DEFAULT_TOGGLE_CONFIG,
          wagering: { enabled: true, wagerFloor: 100 },
        }

        const result = applyModifiers({
          playerName,
          prevMarking: null,
          newMarking: 'correct',
          baseValue: wager,
          toggleConfig: config,
          streakCount: 0,
          perRoundIncorrect: 0,
          playerMarkings: { [playerName]: 'correct' },
        })

        // Without any multiplier/bonus, delta === wager
        expect(result.scoreDelta).toBe(wager)
      }),
      { numRuns: 500 }
    )
  })

  it('incorrect marking with wagering deducts baseValue (wager)', () => {
    fc.assert(
      fc.property(baseValueArb, playerNameArb, (wager, playerName) => {
        const config: ToggleConfig = {
          ...DEFAULT_TOGGLE_CONFIG,
          wagering: { enabled: true, wagerFloor: 100 },
        }

        const result = applyModifiers({
          playerName,
          prevMarking: null,
          newMarking: 'incorrect',
          baseValue: wager,
          toggleConfig: config,
          streakCount: 0,
          perRoundIncorrect: 0,
          playerMarkings: { [playerName]: 'incorrect' },
        })

        expect(result.scoreDelta).toBe(-wager)
      }),
      { numRuns: 500 }
    )
  })
})

// ─── Property 10: Steal bonus added when steal condition is met ───────────────

describe('Property 10: Steal bonus is added to correct player score when steal condition met', () => {
  /**
   * **Validates: Requirements 5.1, 5.2**
   *
   * When stealBonus is enabled and at least one other player has an incorrect
   * marking, a correct answer awards baseValue + bonusPoints.
   * When no other player is incorrect, only baseValue is awarded.
   */

  it('correct with steal condition met adds baseValue + bonusPoints', () => {
    const bonusArb = fc.integer({ min: 1, max: 5000 })

    fc.assert(
      fc.property(baseValueArb, bonusArb, playerNameArb, (baseValue, bonus, playerName) => {
        const otherPlayer = playerName + '_other'
        const config: ToggleConfig = {
          ...DEFAULT_TOGGLE_CONFIG,
          rulesEngine: {
            enabled: true,
            stealBonus: { enabled: true, bonusPoints: bonus },
            streakMultiplier: { enabled: false, threshold: 3, multiplier: 2 },
            penaltyDoubler: { enabled: false },
          },
        }

        const result = applyModifiers({
          playerName,
          prevMarking: null,
          newMarking: 'correct',
          baseValue,
          toggleConfig: config,
          streakCount: 0,
          perRoundIncorrect: 0,
          playerMarkings: { [playerName]: 'correct', [otherPlayer]: 'incorrect' },
        })

        expect(result.scoreDelta).toBe(baseValue + bonus)
        expect(result.stealBonusApplied).toBe(true)
      }),
      { numRuns: 500 }
    )
  })

  it('correct without steal condition awards only baseValue', () => {
    const bonusArb = fc.integer({ min: 1, max: 5000 })

    fc.assert(
      fc.property(baseValueArb, bonusArb, playerNameArb, (baseValue, bonus, playerName) => {
        const otherPlayer = playerName + '_other'
        const config: ToggleConfig = {
          ...DEFAULT_TOGGLE_CONFIG,
          rulesEngine: {
            enabled: true,
            stealBonus: { enabled: true, bonusPoints: bonus },
            streakMultiplier: { enabled: false, threshold: 3, multiplier: 2 },
            penaltyDoubler: { enabled: false },
          },
        }

        const result = applyModifiers({
          playerName,
          prevMarking: null,
          newMarking: 'correct',
          baseValue,
          toggleConfig: config,
          streakCount: 0,
          perRoundIncorrect: 0,
          // Other player is correct or null — no steal condition
          playerMarkings: { [playerName]: 'correct', [otherPlayer]: 'correct' },
        })

        expect(result.scoreDelta).toBe(baseValue)
        expect(result.stealBonusApplied).toBe(false)
      }),
      { numRuns: 500 }
    )
  })
})

// ─── Property 15: Combined score delta formula holds for all active modifier combinations ─

describe('Property 15: Combined score delta formula holds for active modifier combinations', () => {
  /**
   * **Validates: Requirements 3.7, 5.1, 5.2, 6.7, 6.8**
   *
   * For a fresh correct marking with all modifiers active and streak >= threshold:
   * delta = (baseValue × multiplier) + stealBonus (if steal condition met)
   *
   * For a fresh incorrect marking with penalty doubler:
   * delta = -(baseValue × 2)
   */

  it('correct with streak multiplier and steal bonus combines correctly', () => {
    fc.assert(
      fc.property(
        baseValueArb,
        thresholdArb,
        multiplierArb,
        fc.integer({ min: 1, max: 5000 }),
        playerNameArb,
        (baseValue, threshold, multiplier, bonus, playerName) => {
          const otherPlayer = playerName + '_other'
          // Ensure streak meets threshold
          const streakCount = threshold // after correct, newStreak = threshold + 1 >= threshold

          const config: ToggleConfig = {
            ...DEFAULT_TOGGLE_CONFIG,
            rulesEngine: {
              enabled: true,
              stealBonus: { enabled: true, bonusPoints: bonus },
              streakMultiplier: { enabled: true, threshold, multiplier },
              penaltyDoubler: { enabled: false },
            },
          }

          const result = applyModifiers({
            playerName,
            prevMarking: null,
            newMarking: 'correct',
            baseValue,
            toggleConfig: config,
            streakCount,
            perRoundIncorrect: 0,
            playerMarkings: { [playerName]: 'correct', [otherPlayer]: 'incorrect' },
          })

          // newStreakCount = streakCount + 1 = threshold + 1, which >= threshold
          const expectedMultiplied = baseValue * multiplier
          const expectedDelta = expectedMultiplied + bonus
          expect(result.scoreDelta).toBe(expectedDelta)
          expect(result.stealBonusApplied).toBe(true)
        }
      ),
      { numRuns: 500 }
    )
  })

  it('incorrect with penalty doubler deducts baseValue × 2', () => {
    fc.assert(
      fc.property(baseValueArb, perRoundIncorrectArb, playerNameArb, (baseValue, priorCount, playerName) => {
        const config: ToggleConfig = {
          ...DEFAULT_TOGGLE_CONFIG,
          rulesEngine: {
            enabled: true,
            stealBonus: { enabled: false, bonusPoints: 200 },
            streakMultiplier: { enabled: false, threshold: 3, multiplier: 2 },
            penaltyDoubler: { enabled: true },
          },
        }

        const result = applyModifiers({
          playerName,
          prevMarking: null,
          newMarking: 'incorrect',
          baseValue,
          toggleConfig: config,
          streakCount: 0,
          perRoundIncorrect: priorCount,
          playerMarkings: { [playerName]: 'incorrect' },
        })

        expect(result.scoreDelta).toBe(-(baseValue * 2))
        expect(result.newPerRoundIncorrect).toBe(priorCount + 1)
      }),
      { numRuns: 500 }
    )
  })
})

// ─── Property 11: Reversing a steal-bonus correct marking deducts the steal bonus ─

describe('Property 11: Reversing a steal-bonus correct marking deducts steal bonus', () => {
  /**
   * **Validates: Requirements 5.4**
   *
   * When a correct marking that included a steal bonus is reversed (cleared to null),
   * the reversal delta must negate the full amount (baseValue + bonus).
   */

  it('clearing a correct marking reverses baseValue + stealBonus', () => {
    const bonusArb = fc.integer({ min: 1, max: 5000 })

    fc.assert(
      fc.property(baseValueArb, bonusArb, playerNameArb, (baseValue, bonus, playerName) => {
        const otherPlayer = playerName + '_other'
        const config: ToggleConfig = {
          ...DEFAULT_TOGGLE_CONFIG,
          rulesEngine: {
            enabled: true,
            stealBonus: { enabled: true, bonusPoints: bonus },
            streakMultiplier: { enabled: false, threshold: 3, multiplier: 2 },
            penaltyDoubler: { enabled: false },
          },
        }

        // Reverse a previously-correct marking to null
        // The other player still has incorrect marking so steal was awarded originally
        const result = applyModifiers({
          playerName,
          prevMarking: 'correct',
          newMarking: null,
          baseValue,
          toggleConfig: config,
          streakCount: 0, // streak before the correct was applied
          perRoundIncorrect: 0,
          playerMarkings: { [playerName]: null, [otherPlayer]: 'incorrect' },
        })

        // Reversal of correct with steal: -(baseValue + bonus) + 0 (no new marking)
        // The streak at time of original correct was 0, newStreak was 1, which < threshold(3)
        // So multiplier was 1: reversalDelta = -(base*1 + bonus) = -(base + bonus)
        expect(result.scoreDelta).toBe(-(baseValue + bonus))
      }),
      { numRuns: 500 }
    )
  })
})

// ─── Property 12: Steal bonus retained iff at least one incorrect marking remains ─

describe('Property 12: Steal bonus retained iff at least one incorrect marking remains', () => {
  /**
   * **Validates: Requirements 5.5, 5.6**
   *
   * checkStealCondition returns true only when at least one OTHER player
   * has an 'incorrect' marking.
   */

  it('steal condition true iff at least one other player is incorrect', () => {
    fc.assert(
      fc.property(
        playerNameArb,
        fc.array(
          fc.tuple(playerNameArb, markingArb),
          { minLength: 1, maxLength: 5 }
        ),
        (scoringPlayer, otherMarkings) => {
          const markings: Record<string, 'correct' | 'incorrect' | null> = {
            [scoringPlayer]: 'correct',
          }
          for (const [name, marking] of otherMarkings) {
            if (name !== scoringPlayer) {
              markings[name] = marking
            }
          }

          const result = checkStealCondition(markings, scoringPlayer)

          // Should be true iff any other player has 'incorrect'
          const anyOtherIncorrect = Object.entries(markings).some(
            ([name, m]) => name !== scoringPlayer && m === 'incorrect'
          )
          expect(result).toBe(anyOtherIncorrect)
        }
      ),
      { numRuns: 500 }
    )
  })
})

// ─── Property 17: Reversing an incorrect Penalty Doubler marking fully restores score ─

describe('Property 17: Reversing incorrect Penalty Doubler marking restores score and count', () => {
  /**
   * **Validates: Requirements 7.4**
   *
   * When an incorrect marking under Penalty Doubler is reversed (cleared to null),
   * the reversal delta must restore the doubled deduction and decrement the
   * per-round incorrect count.
   */

  it('clearing an incorrect marking reverses the doubled deduction', () => {
    fc.assert(
      fc.property(baseValueArb, perRoundIncorrectArb, playerNameArb, (baseValue, priorCount, playerName) => {
        // The prior count is the count AFTER the incorrect was applied,
        // so the count at time of the original incorrect was priorCount - 1
        // But for reversal we pass the current count which includes the increment.
        const countAfterIncorrect = priorCount + 1

        const config: ToggleConfig = {
          ...DEFAULT_TOGGLE_CONFIG,
          rulesEngine: {
            enabled: true,
            stealBonus: { enabled: false, bonusPoints: 200 },
            streakMultiplier: { enabled: false, threshold: 3, multiplier: 2 },
            penaltyDoubler: { enabled: true },
          },
        }

        // Reverse a previously-incorrect marking
        const result = applyModifiers({
          playerName,
          prevMarking: 'incorrect',
          newMarking: null,
          baseValue,
          toggleConfig: config,
          streakCount: 0,
          perRoundIncorrect: countAfterIncorrect,
          playerMarkings: { [playerName]: null },
        })

        // Reversal restores the doubled deduction: +value*2
        // The count at time of the original incorrect = countAfterIncorrect - 1 = priorCount
        // computePenaltyDoubler({ value: baseValue, priorIncorrectCount: priorCount }) => deduction = baseValue * 2
        expect(result.scoreDelta).toBe(baseValue * 2)
        // Per-round incorrect decremented by 1
        expect(result.newPerRoundIncorrect).toBe(Math.max(0, countAfterIncorrect - 1))
      }),
      { numRuns: 500 }
    )
  })
})
