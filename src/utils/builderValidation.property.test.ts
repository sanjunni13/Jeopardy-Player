import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  validateGameName,
  validateClueValue,
  validateForPublish,
  validateForSave,
  type BuilderFormState,
  type ClueFormState,
  type CategoryFormState,
} from './builderValidation'

// ─── Helper Generators ─────────────────────────────────────────────────────

// Valid game name characters: word chars (\w), spaces, hyphens
const validGameNameChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_ -'
const validGameNameChar = fc.constantFrom(...validGameNameChars.split(''))
const validGameName = fc.array(validGameNameChar, { minLength: 1, maxLength: 100 }).map(chars => chars.join(''))

// Valid clue value string
const validClueValueStr = fc.integer({ min: 1, max: 999999 }).map(String)

// Non-empty text for required fields (clue text, solution, category name)
const nonEmptyText = fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim() !== '')

// Generator for a valid ClueFormState (all fields filled and valid)
const validClueFormState: fc.Arbitrary<ClueFormState> = fc.record({
  value: validClueValueStr,
  clue: nonEmptyText,
  solution: nonEmptyText,
  dailyDouble: fc.boolean(),
})

// Generator for a valid CategoryFormState (all fields filled and valid)
const validCategoryFormState: fc.Arbitrary<CategoryFormState> = fc.record({
  name: nonEmptyText,
  clues: fc.tuple(
    validClueFormState,
    validClueFormState,
    validClueFormState,
    validClueFormState,
    validClueFormState
  ),
})

// Generator for a fully valid BuilderFormState (all required fields filled)
const validBuilderFormState: fc.Arbitrary<BuilderFormState> = fc
  .record({
    totalRounds: fc.integer({ min: 1, max: 6 }),
    categoriesPerRound: fc.integer({ min: 1, max: 6 }),
  })
  .chain(({ totalRounds, categoriesPerRound }) =>
    fc.record({
      gameName: validGameName,
      totalRounds: fc.constant(totalRounds),
      categoriesPerRound: fc.constant(categoriesPerRound),
      rounds: fc.tuple(
        ...Array.from({ length: totalRounds }, () =>
          fc.tuple(
            ...Array.from({ length: categoriesPerRound }, () => validCategoryFormState)
          )
        )
      ),
      finalRound: fc.record({
        category: nonEmptyText,
        clue: nonEmptyText,
        solution: nonEmptyText,
      }),
    })
  )

// Generator for a ClueFormState with a mix of empty and non-empty fields
const mixedClueFormState: fc.Arbitrary<ClueFormState> = fc.record({
  value: fc.oneof(fc.constant(''), validClueValueStr),
  clue: fc.oneof(fc.constant(''), nonEmptyText),
  solution: fc.oneof(fc.constant(''), nonEmptyText),
  dailyDouble: fc.boolean(),
})

// Generator for a CategoryFormState with a mix of empty and non-empty fields
const mixedCategoryFormState: fc.Arbitrary<CategoryFormState> = fc.record({
  name: fc.oneof(fc.constant(''), nonEmptyText),
  clues: fc.tuple(
    mixedClueFormState,
    mixedClueFormState,
    mixedClueFormState,
    mixedClueFormState,
    mixedClueFormState
  ),
})

// Generator for a BuilderFormState with mixed fields (some empty, some filled)
const mixedBuilderFormState: fc.Arbitrary<BuilderFormState> = fc
  .record({
    totalRounds: fc.integer({ min: 1, max: 3 }),
    categoriesPerRound: fc.integer({ min: 1, max: 3 }),
  })
  .chain(({ totalRounds, categoriesPerRound }) =>
    fc.record({
      gameName: fc.oneof(fc.constant(''), validGameName),
      totalRounds: fc.constant(totalRounds),
      categoriesPerRound: fc.constant(categoriesPerRound),
      rounds: fc.tuple(
        ...Array.from({ length: totalRounds }, () =>
          fc.tuple(
            ...Array.from({ length: categoriesPerRound }, () => mixedCategoryFormState)
          )
        )
      ),
      finalRound: fc.record({
        category: fc.oneof(fc.constant(''), nonEmptyText),
        clue: fc.oneof(fc.constant(''), nonEmptyText),
        solution: fc.oneof(fc.constant(''), nonEmptyText),
      }),
    })
  )

// ─── Game Name Regex (mirrors the implementation) ──────────────────────────
const GAME_NAME_REGEX = /^[\w\s-]{1,100}$/

// Feature: custom-game-builder, Property 1: Game Name Validation Correctness
describe('Property 1: Game Name Validation Correctness', () => {
  /**
   * **Validates: Requirements 1.2, 2.1**
   *
   * For any string input, validateGameName returns null if and only if
   * the input matches /^[\w\s\-]{1,100}$/.
   */
  it('returns null iff input matches the game name regex', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 200 }), (input) => {
        const result = validateGameName(input)
        const matchesRegex = GAME_NAME_REGEX.test(input)

        if (matchesRegex) {
          expect(result).toBeNull()
        } else {
          expect(result).not.toBeNull()
          expect(typeof result).toBe('string')
        }
      }),
      { numRuns: 100 }
    )
  })

  it('always returns null for valid game name strings', () => {
    fc.assert(
      fc.property(validGameName, (name) => {
        expect(validateGameName(name)).toBeNull()
      }),
      { numRuns: 100 }
    )
  })

  it('returns error for empty string', () => {
    expect(validateGameName('')).not.toBeNull()
  })

  it('returns error for strings exceeding 100 characters of valid chars', () => {
    fc.assert(
      fc.property(
        fc.array(validGameNameChar, { minLength: 101, maxLength: 200 }).map(chars => chars.join('')),
        (longName) => {
          expect(validateGameName(longName)).not.toBeNull()
        }
      ),
      { numRuns: 100 }
    )
  })
})

// Feature: custom-game-builder, Property 3: Clue Value Validation Correctness
describe('Property 3: Clue Value Validation Correctness', () => {
  /**
   * **Validates: Requirements 2.2**
   *
   * For any string input, validateClueValue returns null if and only if
   * the string is empty OR represents a positive integer between 1 and 999999 inclusive.
   */
  it('returns null for empty string', () => {
    expect(validateClueValue('')).toBeNull()
  })

  it('returns null for valid integers between 1 and 999999', () => {
    fc.assert(
      fc.property(validClueValueStr, (value) => {
        expect(validateClueValue(value)).toBeNull()
      }),
      { numRuns: 100 }
    )
  })

  it('returns error for zero', () => {
    expect(validateClueValue('0')).not.toBeNull()
  })

  it('returns error for negative integers', () => {
    fc.assert(
      fc.property(fc.integer({ min: -999999, max: -1 }).map(String), (value) => {
        expect(validateClueValue(value)).not.toBeNull()
      }),
      { numRuns: 100 }
    )
  })

  it('returns error for values greater than 999999', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1000000, max: 10000000 }).map(String), (value) => {
        expect(validateClueValue(value)).not.toBeNull()
      }),
      { numRuns: 100 }
    )
  })

  it('returns error for floating point numbers', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 999998.9, noNaN: true, noDefaultInfinity: true })
          .filter(n => !Number.isInteger(n))
          .map(String),
        (value) => {
          expect(validateClueValue(value)).not.toBeNull()
        }
      ),
      { numRuns: 100 }
    )
  })

  it('returns error for non-numeric strings', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter(s => isNaN(Number(s)) || s.trim() === ''),
        (value) => {
          if (value !== '') {
            expect(validateClueValue(value)).not.toBeNull()
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('returns null iff empty OR valid integer 1-999999', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(''),
          validClueValueStr,
          fc.integer({ min: -100, max: 0 }).map(String),
          fc.integer({ min: 1000000, max: 2000000 }).map(String),
          fc.constantFrom('abc', '1.5', '-1', '0', 'NaN', '  ', '1e5'),
        ),
        (input) => {
          const result = validateClueValue(input)
          const isValid =
            input === '' ||
            (Number.isInteger(Number(input)) && Number(input) >= 1 && Number(input) <= 999999)

          if (isValid) {
            expect(result).toBeNull()
          } else {
            expect(result).not.toBeNull()
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

// Feature: custom-game-builder, Property 4: Publish Validation Completeness
describe('Property 4: Publish Validation Completeness', () => {
  /**
   * **Validates: Requirements 2.3, 6.2**
   *
   * For any BuilderFormState with all required fields non-empty and valid,
   * validateForPublish returns an empty record.
   * For any BuilderFormState with at least one empty or invalid required field,
   * validateForPublish returns a non-empty errors record.
   */
  it('returns empty errors for a fully valid state', () => {
    fc.assert(
      fc.property(validBuilderFormState, (state) => {
        const errors = validateForPublish(state)
        expect(Object.keys(errors)).toHaveLength(0)
      }),
      { numRuns: 100 }
    )
  })

  it('returns non-empty errors when game name is empty', () => {
    fc.assert(
      fc.property(validBuilderFormState, (state) => {
        const invalidState = { ...state, gameName: '' }
        const errors = validateForPublish(invalidState)
        expect(Object.keys(errors).length).toBeGreaterThan(0)
        expect(errors['gameName']).toBeDefined()
      }),
      { numRuns: 100 }
    )
  })

  it('returns non-empty errors when a category name is empty', () => {
    fc.assert(
      fc.property(validBuilderFormState, (state) => {
        // Make the first category name empty
        const modified = structuredClone(state)
        modified.rounds[0][0].name = ''
        const errors = validateForPublish(modified)
        expect(Object.keys(errors).length).toBeGreaterThan(0)
        expect(errors['rounds.0.0.name']).toBeDefined()
      }),
      { numRuns: 100 }
    )
  })

  it('returns non-empty errors when a clue value is empty', () => {
    fc.assert(
      fc.property(validBuilderFormState, (state) => {
        const modified = structuredClone(state)
        modified.rounds[0][0].clues[0].value = ''
        const errors = validateForPublish(modified)
        expect(Object.keys(errors).length).toBeGreaterThan(0)
        expect(errors['rounds.0.0.clues.0.value']).toBeDefined()
      }),
      { numRuns: 100 }
    )
  })

  it('returns non-empty errors when final round fields are empty', () => {
    fc.assert(
      fc.property(validBuilderFormState, (state) => {
        const modified = structuredClone(state)
        modified.finalRound.category = ''
        modified.finalRound.clue = ''
        modified.finalRound.solution = ''
        const errors = validateForPublish(modified)
        expect(errors['final.category']).toBeDefined()
        expect(errors['final.clue']).toBeDefined()
        expect(errors['final.solution']).toBeDefined()
      }),
      { numRuns: 100 }
    )
  })

  it('returns errors for invalid clue values even when non-empty', () => {
    fc.assert(
      fc.property(validBuilderFormState, (state) => {
        const modified = structuredClone(state)
        modified.rounds[0][0].clues[0].value = 'abc'
        const errors = validateForPublish(modified)
        expect(errors['rounds.0.0.clues.0.value']).toBeDefined()
      }),
      { numRuns: 100 }
    )
  })
})

// Feature: custom-game-builder, Property 5: Save Validation Permits Empty Fields
describe('Property 5: Save Validation Permits Empty Fields', () => {
  /**
   * **Validates: Requirements 2.4**
   *
   * For any BuilderFormState, validateForSave never includes errors for fields that are empty.
   * For states where all non-empty fields have valid formats, validateForSave returns empty record.
   */
  it('never errors on empty fields', () => {
    fc.assert(
      fc.property(mixedBuilderFormState, (state) => {
        const errors = validateForSave(state)

        // If gameName is empty, there should be no gameName error
        if (state.gameName === '') {
          expect(errors['gameName']).toBeUndefined()
        }

        // Check that no error exists for empty clue values
        for (let r = 0; r < state.rounds.length; r++) {
          for (let c = 0; c < state.rounds[r].length; c++) {
            for (let cl = 0; cl < state.rounds[r][c].clues.length; cl++) {
              if (state.rounds[r][c].clues[cl].value.trim() === '') {
                expect(errors[`rounds.${r}.${c}.clues.${cl}.value`]).toBeUndefined()
              }
            }
          }
        }
      }),
      { numRuns: 100 }
    )
  })

  it('returns empty errors when all non-empty fields have valid formats', () => {
    fc.assert(
      fc.property(validBuilderFormState, (state) => {
        // A fully valid state has all non-empty fields with valid formats
        const errors = validateForSave(state)
        expect(Object.keys(errors)).toHaveLength(0)
      }),
      { numRuns: 100 }
    )
  })

  it('returns empty errors for a completely empty state', () => {
    const emptyState: BuilderFormState = {
      gameName: '',
      totalRounds: 1,
      categoriesPerRound: 1,
      rounds: [[{
        name: '',
        clues: [
          { value: '', clue: '', solution: '', dailyDouble: false },
          { value: '', clue: '', solution: '', dailyDouble: false },
          { value: '', clue: '', solution: '', dailyDouble: false },
          { value: '', clue: '', solution: '', dailyDouble: false },
          { value: '', clue: '', solution: '', dailyDouble: false },
        ],
      }]],
      finalRound: { category: '', clue: '', solution: '' },
    }
    const errors = validateForSave(emptyState)
    expect(Object.keys(errors)).toHaveLength(0)
  })

  it('only errors on non-empty fields with invalid formats', () => {
    fc.assert(
      fc.property(mixedBuilderFormState, (state) => {
        const errors = validateForSave(state)

        // Every error key should correspond to a non-empty field with invalid format
        for (const key of Object.keys(errors)) {
          if (key === 'gameName') {
            // gameName error means it's non-empty and doesn't match regex
            expect(state.gameName).not.toBe('')
            expect(GAME_NAME_REGEX.test(state.gameName)).toBe(false)
          } else if (key.includes('.value')) {
            // Clue value error means it's non-empty and invalid
            const parts = key.split('.')
            const roundIdx = Number(parts[1])
            const catIdx = Number(parts[2])
            const clueIdx = Number(parts[4])
            const value = state.rounds[roundIdx][catIdx].clues[clueIdx].value
            expect(value.trim()).not.toBe('')
          }
        }
      }),
      { numRuns: 100 }
    )
  })
})
