import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { DAILY_DOUBLE_WAGER_FLOOR, computeDailyDoubleWagerRange } from './gamblingScoring'

// ─── Generators ───────────────────────────────────────────────────────────────

/** Deeply negative Real_Balance — a player far below $0 */
const deeplyNegativeBalanceArb = fc.integer({ min: -1_000_000, max: -1_001 })

/** Small positive Real_Balance — strictly above $0, at or below the floor */
const smallPositiveBalanceArb = fc.integer({ min: 1, max: DAILY_DOUBLE_WAGER_FLOOR })

/** Real_Balance above the floor */
const largeBalanceArb = fc.integer({ min: DAILY_DOUBLE_WAGER_FLOOR + 1, max: 1_000_000 })

/**
 * Any Real_Balance, biased to include the boundary cases the task calls out:
 * exactly $0, deeply negative balances, and small positive balances.
 */
const balanceArb = fc.oneof(
  { arbitrary: fc.constant(0), weight: 1 },
  { arbitrary: fc.constant(DAILY_DOUBLE_WAGER_FLOOR), weight: 1 },
  { arbitrary: fc.constant(-DAILY_DOUBLE_WAGER_FLOOR), weight: 1 },
  { arbitrary: fc.integer({ min: -1_000, max: -1 }), weight: 2 },
  { arbitrary: deeplyNegativeBalanceArb, weight: 2 },
  { arbitrary: smallPositiveBalanceArb, weight: 2 },
  { arbitrary: largeBalanceArb, weight: 2 },
)

/** Plausible clue face values on a board — used to show no cap is derived from them */
const clueValuesArb = fc.array(fc.integer({ min: 100, max: 2_000 }), { minLength: 1, maxLength: 30 })

// ─── Property 12: Daily Double wager range ────────────────────────────────────

describe('Property 12: Daily Double wager range', () => {
  /**
   * **Validates: Requirements 3.1, 3.2, 3.9**
   *
   * For any Real_Balance, the permitted range has a minimum of exactly $1 and a
   * maximum of exactly the greater of $1,000 and that Real_Balance, so a
   * non-positive balance yields a maximum of exactly $1,000 and no maximum is
   * derived from any clue value on the board.
   */

  it('minimum is exactly $1 for every Real_Balance', () => {
    fc.assert(
      fc.property(balanceArb, score => {
        expect(computeDailyDoubleWagerRange(score).min).toBe(1)
      }),
      { numRuns: 500 },
    )
  })

  it('maximum is exactly the greater of $1,000 and the Real_Balance', () => {
    fc.assert(
      fc.property(balanceArb, score => {
        const { min, max } = computeDailyDoubleWagerRange(score)
        expect(max).toBe(Math.max(DAILY_DOUBLE_WAGER_FLOOR, score))
        expect(max).toBeGreaterThanOrEqual(DAILY_DOUBLE_WAGER_FLOOR)
        expect(min).toBeLessThanOrEqual(max)
      }),
      { numRuns: 500 },
    )
  })

  it('a non-positive Real_Balance yields a maximum of exactly $1,000', () => {
    const nonPositiveArb = fc.oneof(
      fc.constant(0),
      fc.integer({ min: -1_000, max: 0 }),
      deeplyNegativeBalanceArb,
    )

    fc.assert(
      fc.property(nonPositiveArb, score => {
        expect(computeDailyDoubleWagerRange(score)).toEqual({
          min: 1,
          max: DAILY_DOUBLE_WAGER_FLOOR,
        })
      }),
      { numRuns: 500 },
    )
  })

  it('a small positive Real_Balance still permits up to $1,000', () => {
    fc.assert(
      fc.property(smallPositiveBalanceArb, score => {
        expect(computeDailyDoubleWagerRange(score)).toEqual({
          min: 1,
          max: DAILY_DOUBLE_WAGER_FLOOR,
        })
      }),
      { numRuns: 500 },
    )
  })

  it('the range depends only on the Real_Balance, never on board clue values', () => {
    fc.assert(
      fc.property(balanceArb, clueValuesArb, (score, clueValues) => {
        const range = computeDailyDoubleWagerRange(score)
        // The maximum is unrelated to the highest clue value: it stays at
        // max($1,000, balance) no matter what the board holds.
        expect(range).toEqual({ min: 1, max: Math.max(DAILY_DOUBLE_WAGER_FLOOR, score) })
        const highestClueValue = Math.max(...clueValues)
        if (highestClueValue !== Math.max(DAILY_DOUBLE_WAGER_FLOOR, score)) {
          expect(range.max).not.toBe(highestClueValue)
        }
      }),
      { numRuns: 500 },
    )
  })

  it('is monotonic and pure across repeated calls', () => {
    fc.assert(
      fc.property(balanceArb, balanceArb, (a, b) => {
        const rangeA = computeDailyDoubleWagerRange(a)
        expect(computeDailyDoubleWagerRange(a)).toEqual(rangeA)
        if (a <= b) {
          expect(rangeA.max).toBeLessThanOrEqual(computeDailyDoubleWagerRange(b).max)
        }
      }),
      { numRuns: 500 },
    )
  })
})
