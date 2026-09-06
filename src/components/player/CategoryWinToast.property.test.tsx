import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { buildCategoryWinMessage } from './CategoryWinToast'
import { formatCurrency } from '../../utils/currency'

// Feature: negative-balance-and-analytics-updates
// Property 23: Category_Win_Toast content

/**
 * **Validates: Requirements 7.4, 7.5**
 *
 * For any category name and any winning bid, the toast message contains that
 * category name and the exact Currency_Formatter output for that bid; and where
 * the Currency_Formatter returns the empty string, the message contains the
 * unformatted bid amount instead.
 *
 * `buildCategoryWinMessage` is the single source of the toast's text, so the
 * property is exercised purely — no rendering required.
 */
describe('Property 23: Category_Win_Toast content', () => {
  /** Category names as a host would type them, plus unicode and punctuation. */
  const categoryArb = fc.oneof(
    fc.string({ minLength: 1, maxLength: 40 }),
    fc.constantFrom(
      'Potent Potables',
      'THE "QUOTES" CATEGORY',
      'Rhyme & Reason',
      'Ñoño Español',
      '日本の地理',
      'A'
    )
  )

  /** Finite bids across the formatter's documented range, including negatives and zero. */
  const finiteBidArb = fc.oneof(
    fc.integer({ min: -9_999_999, max: 9_999_999 }),
    fc.double({ min: -9_999_999, max: 9_999_999, noNaN: true, noDefaultInfinity: true }),
    fc.constantFrom(0, -0, 1, -1, 0.5, -0.5, 1000, 1_234_567)
  )

  /** Non-finite bids, for which the Currency_Formatter returns the empty string. */
  const nonFiniteBidArb = fc.constantFrom(
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY
  )

  it('contains the category name and the exact Currency_Formatter output for finite bids', () => {
    fc.assert(
      fc.property(categoryArb, finiteBidArb, (category, winningBid) => {
        const message = buildCategoryWinMessage(category, winningBid)
        const formatted = formatCurrency(winningBid)

        // The formatter produces a value for every finite bid.
        expect(formatted).not.toBe('')
        // Requirement 7.4 — both the category name and the formatted amount appear.
        expect(message).toContain(category)
        expect(message).toContain(formatted)
      }),
      { numRuns: 300 }
    )
  })

  it('contains the unformatted bid amount when the Currency_Formatter returns the empty string', () => {
    fc.assert(
      fc.property(categoryArb, nonFiniteBidArb, (category, winningBid) => {
        const message = buildCategoryWinMessage(category, winningBid)

        // Precondition of Requirement 7.5: the formatter produces no value.
        expect(formatCurrency(winningBid)).toBe('')
        // Requirement 7.5 — the raw amount stands in for the formatted one.
        expect(message).toContain(category)
        expect(message).toContain(String(winningBid))
      }),
      { numRuns: 150 }
    )
  })

  it('always names the category and some amount, for finite and non-finite bids alike', () => {
    fc.assert(
      fc.property(
        categoryArb,
        fc.oneof(finiteBidArb, nonFiniteBidArb),
        (category, winningBid) => {
          const message = buildCategoryWinMessage(category, winningBid)
          const formatted = formatCurrency(winningBid)
          const expectedAmount = formatted === '' ? String(winningBid) : formatted

          expect(message).toContain(category)
          expect(message).toContain(expectedAmount)
          // No empty amount ever reaches the player.
          expect(expectedAmount).not.toBe('')
          expect(message).toBe(`You won "${category}" for ${expectedAmount}! 🎉`)
        }
      ),
      { numRuns: 300 }
    )
  })
})
