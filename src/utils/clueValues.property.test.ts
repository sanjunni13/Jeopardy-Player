import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { computeClueValue } from './clueValues'

// Feature: game-editor-updates, Property 4: Clue value computation

describe('Property 4: Clue value computation', () => {
  /**
   * **Validates: Requirements 6.1**
   *
   * For any rowPosition in [1, 5] and any roundNumber in [1, 6],
   * computeClueValue(rowPosition, roundNumber) SHALL return exactly
   * rowPosition × 200 × roundNumber.
   */
  it('should return rowPosition * 200 * roundNumber for all valid inputs', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),  // rowPosition
        fc.integer({ min: 1, max: 6 }),  // roundNumber
        (rowPosition, roundNumber) => {
          expect(computeClueValue(rowPosition, roundNumber))
            .toBe(rowPosition * 200 * roundNumber)
        }
      ),
      { numRuns: 100 }
    )
  })
})
