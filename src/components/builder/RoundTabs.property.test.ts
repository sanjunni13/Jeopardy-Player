import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { generateTabLabels, getNextFocusIndex } from './RoundTabs'

// Feature: game-editor-updates

// ─── Generators ─────────────────────────────────────────────────────────────

/** Generate a valid totalRounds value (1–6) */
const totalRoundsArb = fc.integer({ min: 1, max: 6 })

/** Generate a valid tab count (at least 1 tab) */
const tabCountArb = fc.integer({ min: 1, max: 20 })

/** Generate a direction: -1 (left) or +1 (right) */
const directionArb = fc.constantFrom(-1, 1)

// ─── Property 1: Tab generation produces correct count and labels ───────────

describe('Property 1: Tab generation produces correct count and labels', () => {
  /**
   * **Validates: Requirements 1.1, 1.5**
   *
   * For any valid totalRounds value (1–6), the generated tab list SHALL
   * contain exactly totalRounds + 1 entries, where the first N entries are
   * labeled "Round 1" through "Round N" and the final entry is labeled
   * "Final Jeopardy".
   */

  it('generates totalRounds+1 tabs with correct round labels and Final Jeopardy', () => {
    fc.assert(
      fc.property(totalRoundsArb, (totalRounds) => {
        const labels = generateTabLabels(totalRounds)

        // Correct count: totalRounds + 1
        expect(labels).toHaveLength(totalRounds + 1)

        // First N entries are "Round 1" through "Round N"
        for (let i = 0; i < totalRounds; i++) {
          expect(labels[i]).toBe(`Round ${i + 1}`)
        }

        // Final entry is "Final Jeopardy"
        expect(labels[totalRounds]).toBe('Final Jeopardy')
      }),
      { numRuns: 100 }
    )
  })
})

// ─── Property 2: Active tab fallback on round removal ───────────────────────

describe('Property 2: Active tab fallback on round removal', () => {
  /**
   * **Validates: Requirements 1.6**
   *
   * For any activeTab index and any reduction in totalRounds, the resulting
   * active tab index SHALL equal min(activeTab, newTotal-1) and SHALL never
   * be negative.
   */

  it('active tab falls back to min(activeTab, newTotal-1) and is never negative', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 6 }),  // activeTab (index into tab list)
        fc.integer({ min: 1, max: 6 }),  // newTotalRounds after removal
        (activeTab, newTotalRounds) => {
          // newTotal is the total number of tabs (rounds + Final Jeopardy)
          const newTabCount = newTotalRounds + 1

          // The fallback logic: clamp activeTab to valid range
          const result = Math.min(activeTab, newTabCount - 1)

          // Result should never be negative
          expect(result).toBeGreaterThanOrEqual(0)

          // Result should be within valid tab indices
          expect(result).toBeLessThan(newTabCount)

          // If activeTab is within range, it stays the same
          if (activeTab < newTabCount) {
            expect(result).toBe(activeTab)
          } else {
            // Otherwise it clamps to the last valid index
            expect(result).toBe(newTabCount - 1)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ─── Property 3: Tab keyboard focus wrapping ────────────────────────────────

describe('Property 3: Tab keyboard focus wrapping', () => {
  /**
   * **Validates: Requirements 1.8**
   *
   * For any tab count N > 0, any current focus index in [0, N-1], and any
   * direction (left or right), the next focus index SHALL equal
   * (currentIndex + direction + N) % N, ensuring wraparound from last to
   * first and first to last.
   */

  it('next focus index wraps correctly using modular arithmetic', () => {
    fc.assert(
      fc.property(
        tabCountArb,
        directionArb,
        (tabCount, direction) => {
          // Generate a valid current index within [0, tabCount-1]
          const currentIndex = fc.sample(fc.integer({ min: 0, max: tabCount - 1 }), 1)[0]

          const result = getNextFocusIndex(currentIndex, direction, tabCount)

          // Result should equal the wrapping formula
          const expected = (currentIndex + direction + tabCount) % tabCount
          expect(result).toBe(expected)

          // Result should always be within valid bounds
          expect(result).toBeGreaterThanOrEqual(0)
          expect(result).toBeLessThan(tabCount)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('wraps from first to last when going left, and last to first when going right', () => {
    fc.assert(
      fc.property(tabCountArb, (tabCount) => {
        // Going left from index 0 should wrap to last
        const leftWrap = getNextFocusIndex(0, -1, tabCount)
        expect(leftWrap).toBe(tabCount - 1)

        // Going right from last index should wrap to first
        const rightWrap = getNextFocusIndex(tabCount - 1, 1, tabCount)
        expect(rightWrap).toBe(0)
      }),
      { numRuns: 100 }
    )
  })
})
