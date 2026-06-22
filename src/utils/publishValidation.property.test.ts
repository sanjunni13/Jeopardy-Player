import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { validateForPublish } from './builderValidation'
import { generateDefaultPointValues } from './builderFormStructure'
import type {
  BuilderFormState,
  ClueFormState,
  CategoryFormState,
  RoundFormState,
} from './builderFormStructure'

// ─── Helper Generators ─────────────────────────────────────────────────────

/** Non-empty text suitable for required fields */
const nonEmptyText = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim() !== '')

/** Valid game name (word chars, spaces, hyphens, 1–100 chars) */
const validGameNameChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_ -'
const validGameNameChar = fc.constantFrom(...validGameNameChars.split(''))
const validGameName = fc.array(validGameNameChar, { minLength: 1, maxLength: 50 }).map(chars => chars.join(''))

/** Valid clue value string (positive integer 1–999999) */
const validClueValueStr = fc.integer({ min: 1, max: 999999 }).map(String)

/** Generate a valid ClueFormState (all fields filled) */
const validClueFormState: fc.Arbitrary<ClueFormState> = fc.record({
  value: validClueValueStr,
  clue: nonEmptyText,
  solution: nonEmptyText,
  dailyDouble: fc.boolean(),
})

/** Generate a valid CategoryFormState with custom name */
const validCategoryFormState: fc.Arbitrary<CategoryFormState> = fc.record({
  name: nonEmptyText,
  clues: fc.array(validClueFormState, { minLength: 5, maxLength: 5 }),
  isDefaultName: fc.constant(false),
})

// ─── Counting helpers ──────────────────────────────────────────────────────

/**
 * Counts expected error fields for a given BuilderFormState.
 * This mirrors the logic of validateForPublish to predict how many errors should exist.
 */
function countExpectedErrors(state: BuilderFormState): number {
  let count = 0

  // Game name: validateGameName checks length === 0 first, then regex
  if (state.gameName.length === 0 || !/^[\w\s-]{1,100}$/.test(state.gameName)) {
    count++
  }

  // Rounds
  for (let roundIdx = 0; roundIdx < state.rounds.length; roundIdx++) {
    const round = state.rounds[roundIdx]

    // Point values
    for (let rowIdx = 0; rowIdx < round.pointValues.length; rowIdx++) {
      const pv = round.pointValues[rowIdx]
      const num = typeof pv === 'string' ? Number(pv) : pv
      if (isNaN(num) || !Number.isFinite(num) || !Number.isInteger(num) || num < 1) {
        count++
      }
    }

    for (let catIdx = 0; catIdx < round.categories.length; catIdx++) {
      const category = round.categories[catIdx]

      // Category name: empty OR isDefaultName
      if (category.name.trim() === '') {
        count++
      } else if (category.isDefaultName) {
        count++
      }

      for (let clueIdx = 0; clueIdx < category.clues.length; clueIdx++) {
        const clue = category.clues[clueIdx]

        // Clue value
        if (clue.value.trim() === '') {
          count++
        } else {
          const num = Number(clue.value)
          if (!Number.isInteger(num) || num < 1 || num > 999999) {
            count++
          }
        }

        // Clue text
        if (clue.clue.trim() === '') {
          count++
        }

        // Solution text
        if (clue.solution.trim() === '') {
          count++
        }
      }
    }
  }

  // Final round
  if (state.finalRound.category.trim() === '') count++
  if (state.finalRound.clue.trim() === '') count++
  if (state.finalRound.solution.trim() === '') count++

  return count
}

/**
 * Collects all expected error keys for a given BuilderFormState.
 */
function collectExpectedErrorKeys(state: BuilderFormState): Set<string> {
  const keys = new Set<string>()

  if (state.gameName.length === 0 || !/^[\w\s-]{1,100}$/.test(state.gameName)) {
    keys.add('gameName')
  }

  for (let roundIdx = 0; roundIdx < state.rounds.length; roundIdx++) {
    const round = state.rounds[roundIdx]

    for (let rowIdx = 0; rowIdx < round.pointValues.length; rowIdx++) {
      const pv = round.pointValues[rowIdx]
      const num = typeof pv === 'string' ? Number(pv) : pv
      if (isNaN(num) || !Number.isFinite(num) || !Number.isInteger(num) || num < 1) {
        keys.add(`rounds.${roundIdx}.pointValues.${rowIdx}`)
      }
    }

    for (let catIdx = 0; catIdx < round.categories.length; catIdx++) {
      const category = round.categories[catIdx]

      if (category.name.trim() === '') {
        keys.add(`rounds.${roundIdx}.${catIdx}.name`)
      } else if (category.isDefaultName) {
        keys.add(`rounds.${roundIdx}.${catIdx}.name`)
      }

      for (let clueIdx = 0; clueIdx < category.clues.length; clueIdx++) {
        const clue = category.clues[clueIdx]

        if (clue.value.trim() === '') {
          keys.add(`rounds.${roundIdx}.${catIdx}.clues.${clueIdx}.value`)
        } else {
          const num = Number(clue.value)
          if (!Number.isInteger(num) || num < 1 || num > 999999) {
            keys.add(`rounds.${roundIdx}.${catIdx}.clues.${clueIdx}.value`)
          }
        }

        if (clue.clue.trim() === '') {
          keys.add(`rounds.${roundIdx}.${catIdx}.clues.${clueIdx}.clue`)
        }

        if (clue.solution.trim() === '') {
          keys.add(`rounds.${roundIdx}.${catIdx}.clues.${clueIdx}.solution`)
        }
      }
    }
  }

  if (state.finalRound.category.trim() === '') keys.add('final.category')
  if (state.finalRound.clue.trim() === '') keys.add('final.clue')
  if (state.finalRound.solution.trim() === '') keys.add('final.solution')

  return keys
}

// ─── Generators for varied/incomplete states ───────────────────────────────

/** Clue with randomly empty/filled fields */
const mixedClueFormState: fc.Arbitrary<ClueFormState> = fc.record({
  value: fc.oneof(fc.constant(''), validClueValueStr),
  clue: fc.oneof(fc.constant(''), nonEmptyText),
  solution: fc.oneof(fc.constant(''), nonEmptyText),
  dailyDouble: fc.boolean(),
})

/** Category with random empty/default name and mixed clues */
const mixedCategoryFormState = (rowCount: number): fc.Arbitrary<CategoryFormState> =>
  fc.record({
    name: fc.oneof(fc.constant(''), nonEmptyText),
    clues: fc.array(mixedClueFormState, { minLength: rowCount, maxLength: rowCount }),
    isDefaultName: fc.boolean(),
  })

/** BuilderFormState with varying board sizes and random empty fields */
const incompleteBuilderFormState: fc.Arbitrary<BuilderFormState> = fc
  .record({
    totalRounds: fc.integer({ min: 1, max: 4 }),
    categoriesPerRound: fc.integer({ min: 2, max: 8 }),
    rowCount: fc.integer({ min: 3, max: 7 }),
  })
  .chain(({ totalRounds, categoriesPerRound, rowCount }) => {
    const roundArb = (roundIndex: number): fc.Arbitrary<RoundFormState> =>
      fc.record({
        categories: fc.array(mixedCategoryFormState(rowCount), {
          minLength: categoriesPerRound,
          maxLength: categoriesPerRound,
        }),
        pointValues: fc.constant(generateDefaultPointValues(roundIndex + 1, rowCount)),
      })

    const roundsArb = fc.tuple(
      ...Array.from({ length: totalRounds }, (_, i) => roundArb(i))
    ) as fc.Arbitrary<RoundFormState[]>

    return fc.record({
      gameName: fc.oneof(fc.constant(''), validGameName),
      totalRounds: fc.constant(totalRounds),
      categoriesPerRound: fc.constant(categoriesPerRound),
      rounds: roundsArb,
      finalRound: fc.record({
        category: fc.oneof(fc.constant(''), nonEmptyText),
        clue: fc.oneof(fc.constant(''), nonEmptyText),
        solution: fc.oneof(fc.constant(''), nonEmptyText),
      }),
    })
  })

/** State guaranteed to have at least one empty required field */
const stateWithAtLeastOneError: fc.Arbitrary<BuilderFormState> = incompleteBuilderFormState.filter(
  (state) => countExpectedErrors(state) > 0
)

/** State guaranteed to have isDefaultName categories (triggers validation error) */
const stateWithDefaultNames: fc.Arbitrary<BuilderFormState> = fc
  .record({
    totalRounds: fc.integer({ min: 1, max: 3 }),
    categoriesPerRound: fc.integer({ min: 2, max: 6 }),
  })
  .chain(({ totalRounds, categoriesPerRound }) => {
    // At least one category per round with isDefaultName: true and a non-empty name
    const defaultNameCategory: fc.Arbitrary<CategoryFormState> = fc.record({
      name: nonEmptyText,
      clues: fc.array(validClueFormState, { minLength: 5, maxLength: 5 }),
      isDefaultName: fc.constant(true),
    })

    const roundArb = (roundIndex: number): fc.Arbitrary<RoundFormState> =>
      fc.record({
        categories: fc
          .tuple(
            defaultNameCategory,
            ...Array.from({ length: categoriesPerRound - 1 }, () => validCategoryFormState)
          )
          .map(([first, ...rest]) => [first, ...rest]),
        pointValues: fc.constant(generateDefaultPointValues(roundIndex + 1, 5)),
      })

    const roundsArb = fc.tuple(
      ...Array.from({ length: totalRounds }, (_, i) => roundArb(i))
    ) as fc.Arbitrary<RoundFormState[]>

    return fc.record({
      gameName: validGameName,
      totalRounds: fc.constant(totalRounds),
      categoriesPerRound: fc.constant(categoriesPerRound),
      rounds: roundsArb,
      finalRound: fc.record({
        category: nonEmptyText,
        clue: nonEmptyText,
        solution: nonEmptyText,
      }),
    })
  })

// ─── Property Tests ────────────────────────────────────────────────────────

// Feature: board-style-game-editor, Property 15: Publish validation identifies all incomplete fields
describe('Property 15: Publish validation identifies all incomplete required fields', () => {
  /**
   * **Validates: Requirements 9.5**
   *
   * For any BuilderFormState with at least one empty required field (game name,
   * category names, clue text, solutions, point values, final round fields),
   * validateForPublish SHALL return an error entry for every empty required field path.
   */

  it('error count matches the count of empty/invalid required fields', () => {
    fc.assert(
      fc.property(incompleteBuilderFormState, (state) => {
        const errors = validateForPublish(state)
        const expectedCount = countExpectedErrors(state)
        expect(Object.keys(errors).length).toBe(expectedCount)
      }),
      { numRuns: 100 }
    )
  })

  it('every expected error key is present in the returned errors', () => {
    fc.assert(
      fc.property(stateWithAtLeastOneError, (state) => {
        const errors = validateForPublish(state)
        const expectedKeys = collectExpectedErrorKeys(state)

        for (const key of expectedKeys) {
          expect(errors[key]).toBeDefined()
        }
      }),
      { numRuns: 100 }
    )
  })

  it('no error key is returned for a valid non-empty field', () => {
    fc.assert(
      fc.property(incompleteBuilderFormState, (state) => {
        const errors = validateForPublish(state)
        const expectedKeys = collectExpectedErrorKeys(state)

        // Every key in errors should be in the expected set
        for (const key of Object.keys(errors)) {
          expect(expectedKeys.has(key)).toBe(true)
        }
      }),
      { numRuns: 100 }
    )
  })

  it('categories with isDefaultName: true produce a name error even when name is non-empty', () => {
    fc.assert(
      fc.property(stateWithDefaultNames, (state) => {
        const errors = validateForPublish(state)

        // Every category with isDefaultName true should have a name error
        for (let roundIdx = 0; roundIdx < state.rounds.length; roundIdx++) {
          for (let catIdx = 0; catIdx < state.rounds[roundIdx].categories.length; catIdx++) {
            const category = state.rounds[roundIdx].categories[catIdx]
            if (category.isDefaultName && category.name.trim() !== '') {
              expect(errors[`rounds.${roundIdx}.${catIdx}.name`]).toBeDefined()
            }
          }
        }
      }),
      { numRuns: 100 }
    )
  })

  it('works with larger board sizes (multiple rounds, varying categories per round)', () => {
    // Generate states with 3-4 rounds, 4-8 categories, and 5-7 rows
    const largeBoard: fc.Arbitrary<BuilderFormState> = fc
      .record({
        totalRounds: fc.integer({ min: 3, max: 4 }),
        categoriesPerRound: fc.integer({ min: 4, max: 8 }),
        rowCount: fc.integer({ min: 5, max: 7 }),
      })
      .chain(({ totalRounds, categoriesPerRound, rowCount }) => {
        const roundArb = (roundIndex: number): fc.Arbitrary<RoundFormState> =>
          fc.record({
            categories: fc.array(mixedCategoryFormState(rowCount), {
              minLength: categoriesPerRound,
              maxLength: categoriesPerRound,
            }),
            pointValues: fc.constant(generateDefaultPointValues(roundIndex + 1, rowCount)),
          })

        const roundsArb = fc.tuple(
          ...Array.from({ length: totalRounds }, (_, i) => roundArb(i))
        ) as fc.Arbitrary<RoundFormState[]>

        return fc.record({
          gameName: fc.oneof(fc.constant(''), validGameName),
          totalRounds: fc.constant(totalRounds),
          categoriesPerRound: fc.constant(categoriesPerRound),
          rounds: roundsArb,
          finalRound: fc.record({
            category: fc.oneof(fc.constant(''), nonEmptyText),
            clue: fc.oneof(fc.constant(''), nonEmptyText),
            solution: fc.oneof(fc.constant(''), nonEmptyText),
          }),
        })
      })

    fc.assert(
      fc.property(largeBoard, (state) => {
        const errors = validateForPublish(state)
        const expectedCount = countExpectedErrors(state)
        expect(Object.keys(errors).length).toBe(expectedCount)
      }),
      { numRuns: 100 }
    )
  })
})
