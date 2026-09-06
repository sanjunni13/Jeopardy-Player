import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { shouldAutoResolveAuction, BET_DESCRIPTIONS, BET_EXPLANATIONS } from './gamblingScoring'

// Feature: gambling-updates, Property 1: Sentinel value prevents auto-resolution

describe('Property 1: Sentinel value prevents auto-resolution', () => {
  /**
   * **Validates: Requirements 1.3, 1.5**
   *
   * For any auction state where auctionTimeRemaining holds the sentinel value (null),
   * the shouldAutoResolveAuction function SHALL return false, preventing resolution
   * regardless of which category index is being auctioned.
   *
   * Additionally:
   * - For 0 input, returns true (timer expired)
   * - For any positive integer, returns false (timer still counting)
   */
  it('should return false for null (sentinel value)', () => {
    expect(shouldAutoResolveAuction(null)).toBe(false)
  })

  it('should return true for 0 (timer expired)', () => {
    expect(shouldAutoResolveAuction(0)).toBe(true)
  })

  it('should return false for any positive integer', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        (positiveTime) => {
          expect(shouldAutoResolveAuction(positiveTime)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// Feature: gambling-updates, Property 2: BET_EXPLANATIONS completeness and uniqueness

describe('Property 2: BET_EXPLANATIONS completeness and uniqueness', () => {
  /**
   * **Validates: Requirements 2.2**
   *
   * For any key present in BET_DESCRIPTIONS, that key SHALL also exist in
   * BET_EXPLANATIONS with a non-empty, distinct string value (no two
   * explanation values are identical).
   */

  const descriptionKeys = Object.keys(BET_DESCRIPTIONS) as Array<keyof typeof BET_DESCRIPTIONS>

  it('every key in BET_DESCRIPTIONS exists in BET_EXPLANATIONS with a non-empty string', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...descriptionKeys),
        (betType) => {
          // Key exists in BET_EXPLANATIONS
          expect(betType in BET_EXPLANATIONS).toBe(true)

          // Value is a non-empty string
          const explanation = BET_EXPLANATIONS[betType]
          expect(typeof explanation).toBe('string')
          expect(explanation.trim().length).toBeGreaterThan(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('all values in BET_EXPLANATIONS are distinct (no duplicates)', () => {
    const explanationValues = Object.values(BET_EXPLANATIONS)
    const uniqueValues = new Set(explanationValues)
    expect(uniqueValues.size).toBe(explanationValues.length)
  })

  it('BET_EXPLANATIONS values are distinct from each other for any pair of keys', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...descriptionKeys),
        fc.constantFrom(...descriptionKeys),
        (keyA, keyB) => {
          // If keys are different, explanations must be different
          if (keyA !== keyB) {
            expect(BET_EXPLANATIONS[keyA]).not.toBe(BET_EXPLANATIONS[keyB])
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
