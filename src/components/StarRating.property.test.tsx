// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest'
import fc from 'fast-check'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { StarRating } from './StarRating'

// Feature: game-ratings-favorites, Property 2: Star display reflects stored value
// Feature: game-ratings-favorites, Property 12: Star highlight logic

describe('Property 2: Star display reflects stored value', () => {
  /**
   * **Validates: Requirements 1.6, 2.1**
   *
   * For any rating value in the set {1, 2, 3, 4, 5} or null, the StarRating component
   * SHALL render exactly that many stars in the filled state (or zero filled stars when null),
   * and the remaining stars in the unfilled state.
   */

  it('renders the correct number of filled stars for any valid rating value', () => {
    const ratingArb = fc.oneof(
      fc.constant(null),
      fc.integer({ min: 1, max: 5 })
    )

    fc.assert(
      fc.property(ratingArb, (value) => {
        cleanup()
        const { container } = render(<StarRating value={value} />)

        const allStars = container.querySelectorAll('.star-rating__star')
        const filledStars = container.querySelectorAll('.star-rating__star--filled')

        const expectedFilled = value === null ? 0 : value

        expect(allStars.length).toBe(5)
        expect(filledStars.length).toBe(expectedFilled)
      }),
      { numRuns: 100 }
    )
  })
})

describe('Property 12: Star highlight logic', () => {
  /**
   * **Validates: Requirements 8.2, 8.3**
   *
   * For any star index N in {1, 2, 3, 4, 5}, when that star is hovered,
   * stars at indices 1 through N SHALL be in the highlighted state,
   * and stars at indices N+1 through 5 SHALL be in the unhighlighted state.
   */

  it('highlights stars 1 through N when star N is hovered', () => {
    const starIndexArb = fc.integer({ min: 0, max: 4 }) // 0-indexed internally

    fc.assert(
      fc.property(starIndexArb, (hoveredIndex) => {
        cleanup()
        const onChange = vi.fn()
        const { container } = render(<StarRating value={null} onChange={onChange} />)

        const allStars = container.querySelectorAll('.star-rating__star')

        // Simulate hover on the star at hoveredIndex
        fireEvent.mouseEnter(allStars[hoveredIndex])

        // Re-query after state update
        const hoveredStars = container.querySelectorAll('.star-rating__star--hover')

        // Stars 0 through hoveredIndex should be highlighted (hoveredIndex + 1 total)
        expect(hoveredStars.length).toBe(hoveredIndex + 1)

        // Verify each star's highlight state individually
        const updatedStars = container.querySelectorAll('.star-rating__star')
        for (let i = 0; i < 5; i++) {
          if (i <= hoveredIndex) {
            expect(updatedStars[i].classList.contains('star-rating__star--hover')).toBe(true)
          } else {
            expect(updatedStars[i].classList.contains('star-rating__star--hover')).toBe(false)
          }
        }
      }),
      { numRuns: 100 }
    )
  })
})
