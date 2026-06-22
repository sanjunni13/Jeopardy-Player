import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { generateDefaultPointValues } from './builderFormStructure'

// Feature: board-style-game-editor, Property 5: Default point values scale by round number
describe('Property 5: Default point values scale by round number', () => {
  /**
   * **Validates: Requirements 5.6, 5.7, 11.3**
   *
   * For any round at position N (1-indexed) with the default 5-row configuration,
   * the point values array SHALL equal [200*N, 400*N, 600*N, 800*N, 1000*N].
   * For rounds with more than 5 rows, additional rows follow the 200*N increment progression.
   */

  const roundNumberArb = fc.integer({ min: 1, max: 6 })
  const rowCountArb = fc.integer({ min: 1, max: 12 })

  it('for any round N with 5 rows, values equal [200*N, 400*N, 600*N, 800*N, 1000*N]', () => {
    fc.assert(
      fc.property(roundNumberArb, (roundNumber) => {
        const values = generateDefaultPointValues(roundNumber, 5)
        const expected = [200 * roundNumber, 400 * roundNumber, 600 * roundNumber, 800 * roundNumber, 1000 * roundNumber]
        expect(values).toEqual(expected)
      }),
      { numRuns: 100 }
    )
  })

  it('for any round N and row count > 5, each element at index i equals (i+1) * 200 * N', () => {
    const rowCountAbove5 = fc.integer({ min: 6, max: 12 })

    fc.assert(
      fc.property(roundNumberArb, rowCountAbove5, (roundNumber, rowCount) => {
        const values = generateDefaultPointValues(roundNumber, rowCount)
        for (let i = 0; i < values.length; i++) {
          expect(values[i]).toBe((i + 1) * 200 * roundNumber)
        }
      }),
      { numRuns: 100 }
    )
  })

  it('for any round N and row count <= 5, values are first rowCount elements of [200*N, 400*N, 600*N, 800*N, 1000*N]', () => {
    const rowCountUpTo5 = fc.integer({ min: 1, max: 5 })

    fc.assert(
      fc.property(roundNumberArb, rowCountUpTo5, (roundNumber, rowCount) => {
        const values = generateDefaultPointValues(roundNumber, rowCount)
        const fullExpected = [200 * roundNumber, 400 * roundNumber, 600 * roundNumber, 800 * roundNumber, 1000 * roundNumber]
        expect(values).toEqual(fullExpected.slice(0, rowCount))
      }),
      { numRuns: 100 }
    )
  })

  it('all generated values are positive integers', () => {
    fc.assert(
      fc.property(roundNumberArb, rowCountArb, (roundNumber, rowCount) => {
        const values = generateDefaultPointValues(roundNumber, rowCount)
        for (const value of values) {
          expect(value).toBeGreaterThan(0)
          expect(Number.isInteger(value)).toBe(true)
        }
      }),
      { numRuns: 100 }
    )
  })

  it('the array length always equals the rowCount parameter', () => {
    fc.assert(
      fc.property(roundNumberArb, rowCountArb, (roundNumber, rowCount) => {
        const values = generateDefaultPointValues(roundNumber, rowCount)
        expect(values).toHaveLength(rowCount)
      }),
      { numRuns: 100 }
    )
  })
})
