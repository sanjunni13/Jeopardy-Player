import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { validatePointValue } from './builderValidation'

// Feature: board-style-game-editor, Property 14: Point value validation
describe('Property 14: Point value validation accepts only positive integers', () => {
  /**
   * **Validates: Requirements 5.5, 5.8**
   *
   * For any integer V where V ≥ 1, the point value validator SHALL accept it.
   * For any value that is non-numeric, non-integer, or less than 1,
   * the validator SHALL reject it.
   */

  it('accepts any positive integer ≥ 1 (number input)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000 }), (v) => {
        const result = validatePointValue(v)
        expect(result).toBeNull()
      }),
      { numRuns: 100 }
    )
  })

  it('rejects any integer < 1 (number input)', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1_000_000, max: 0 }), (v) => {
        const result = validatePointValue(v)
        expect(result).not.toBeNull()
        expect(typeof result).toBe('string')
      }),
      { numRuns: 100 }
    )
  })

  it('rejects any non-integer number (float input)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1_000_000, max: 1_000_000, noNaN: true, noDefaultInfinity: true })
          .filter(n => !Number.isInteger(n)),
        (v) => {
          const result = validatePointValue(v)
          expect(result).not.toBeNull()
          expect(typeof result).toBe('string')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('rejects NaN and Infinity', () => {
    expect(validatePointValue(NaN)).not.toBeNull()
    expect(validatePointValue(Infinity)).not.toBeNull()
    expect(validatePointValue(-Infinity)).not.toBeNull()
  })

  it('accepts string inputs that parse to valid integers ≥ 1', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000 }).map(String), (v) => {
        const result = validatePointValue(v)
        expect(result).toBeNull()
      }),
      { numRuns: 100 }
    )
  })

  it('rejects non-numeric strings', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter(s => {
          const num = Number(s)
          return isNaN(num) || s.trim() === ''
        }),
        (v) => {
          const result = validatePointValue(v)
          expect(result).not.toBeNull()
          expect(typeof result).toBe('string')
        }
      ),
      { numRuns: 100 }
    )
  })
})
