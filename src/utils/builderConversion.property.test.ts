import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  isDirtyState,
  builderStateToNormalizedGame,
  builderStateToDraft,
  draftToBuilderState,
} from './builderConversion'
import { generateEmptyFormState } from './builderFormStructure'
import type { BuilderFormState, ClueFormState } from './builderFormStructure'
import type { RoundName } from '../types/game'

// ─── Generators ────────────────────────────────────────────────────────────────

const totalRoundsArb = fc.integer({ min: 1, max: 6 })
const categoriesPerRoundArb = fc.integer({ min: 1, max: 6 })

// Valid clue value as string (positive integer 1-999999)
const validClueValueStr = fc.integer({ min: 1, max: 999999 }).map(String)

// Non-empty text (for filled state)
const nonEmptyText = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0)

// Valid ClueFormState
const clueFormStateArb = fc.record({
  value: validClueValueStr,
  clue: nonEmptyText,
  solution: nonEmptyText,
  dailyDouble: fc.boolean(),
})

// Valid game name: 1-50 chars from allowed set [a-z0-9 \-_]
const validGameNameArb = fc
  .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789 -_'.split('')), {
    minLength: 1,
    maxLength: 50,
  })
  .map(chars => chars.join(''))

// Full valid BuilderFormState generator
function validBuilderFormStateArb() {
  return fc.tuple(totalRoundsArb, categoriesPerRoundArb).chain(([totalRounds, catsPerRound]) => {
    const categoryArb = fc.record({
      name: nonEmptyText,
      clues: fc.tuple(
        clueFormStateArb,
        clueFormStateArb,
        clueFormStateArb,
        clueFormStateArb,
        clueFormStateArb
      ) as fc.Arbitrary<[ClueFormState, ClueFormState, ClueFormState, ClueFormState, ClueFormState]>,
    })
    const roundArb = fc.array(categoryArb, { minLength: catsPerRound, maxLength: catsPerRound })
    const roundsArb = fc.array(roundArb, { minLength: totalRounds, maxLength: totalRounds })

    return fc.record({
      gameName: validGameNameArb,
      totalRounds: fc.constant(totalRounds),
      categoriesPerRound: fc.constant(catsPerRound),
      rounds: roundsArb,
      finalRound: fc.record({
        category: nonEmptyText,
        clue: nonEmptyText,
        solution: nonEmptyText,
      }),
    })
  })
}

const ROUND_NAMES: RoundName[] = ['single', 'double', 'triple', 'quadruple', 'quintuple', 'sextuple']

// Feature: custom-game-builder, Property 6: Dirty Tracking Correctness
describe('Property 6: Dirty Tracking Correctness', () => {
  /**
   * **Validates: Requirements 4.4, 5.8**
   *
   * For any BuilderFormState and corresponding "last saved" snapshot,
   * isDirtyState SHALL return false if and only if the current state
   * is deeply equal to the last saved state.
   */

  it('isDirtyState returns false for a state and its deep clone', () => {
    fc.assert(
      fc.property(validBuilderFormStateArb(), (state) => {
        const clone: BuilderFormState = JSON.parse(JSON.stringify(state))
        expect(isDirtyState(state, clone)).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('isDirtyState returns true after modifying any field in the clone', () => {
    fc.assert(
      fc.property(validBuilderFormStateArb(), (state) => {
        const modified: BuilderFormState = JSON.parse(JSON.stringify(state))
        // Modify the gameName to ensure difference
        modified.gameName = modified.gameName + '_changed'
        expect(isDirtyState(modified, state)).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it('for an empty state with null lastSaved, isDirtyState returns false', () => {
    fc.assert(
      fc.property(totalRoundsArb, categoriesPerRoundArb, (totalRounds, categoriesPerRound) => {
        const emptyState = generateEmptyFormState(totalRounds, categoriesPerRound)
        expect(isDirtyState(emptyState, null)).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('for a non-empty state with null lastSaved, isDirtyState returns true', () => {
    fc.assert(
      fc.property(validBuilderFormStateArb(), (state) => {
        // A valid builder state has non-empty fields, so isDirtyState with null should be true
        expect(isDirtyState(state, null)).toBe(true)
      }),
      { numRuns: 100 }
    )
  })
})

// Feature: custom-game-builder, Property 7: Builder State to NormalizedGame Conversion
describe('Property 7: Builder State to NormalizedGame Conversion', () => {
  /**
   * **Validates: Requirements 6.3**
   *
   * For any valid BuilderFormState (all clue values are valid positive integers
   * as strings, all text fields non-empty), builderStateToNormalizedGame output
   * has totalRounds equal to state.totalRounds, output rounds record has exactly
   * state.totalRounds keys, each round has state.categoriesPerRound categories,
   * each category has 5 clues with numeric values, and the final round matches
   * the form's final jeopardy fields.
   */

  it('output totalRounds equals state.totalRounds', () => {
    fc.assert(
      fc.property(validBuilderFormStateArb(), (state) => {
        const result = builderStateToNormalizedGame(state)
        expect(result.totalRounds).toBe(state.totalRounds)
      }),
      { numRuns: 100 }
    )
  })

  it('output rounds record has exactly state.totalRounds keys', () => {
    fc.assert(
      fc.property(validBuilderFormStateArb(), (state) => {
        const result = builderStateToNormalizedGame(state)
        const roundKeys = Object.keys(result.rounds)
        expect(roundKeys).toHaveLength(state.totalRounds)

        // Keys should match the first N round names
        const expectedKeys = ROUND_NAMES.slice(0, state.totalRounds)
        for (const key of expectedKeys) {
          expect(result.rounds).toHaveProperty(key)
        }
      }),
      { numRuns: 100 }
    )
  })

  it('each round has state.categoriesPerRound categories with 5 numeric clues', () => {
    fc.assert(
      fc.property(validBuilderFormStateArb(), (state) => {
        const result = builderStateToNormalizedGame(state)
        const expectedKeys = ROUND_NAMES.slice(0, state.totalRounds)

        for (const key of expectedKeys) {
          const categories = result.rounds[key]
          expect(categories).toHaveLength(state.categoriesPerRound)

          for (const category of categories) {
            expect(category.clues).toHaveLength(5)
            for (const clue of category.clues) {
              expect(typeof clue.value).toBe('number')
              expect(clue.value).toBeGreaterThan(0)
              expect(Number.isInteger(clue.value)).toBe(true)
            }
          }
        }
      }),
      { numRuns: 100 }
    )
  })

  it('final round matches form final jeopardy fields', () => {
    fc.assert(
      fc.property(validBuilderFormStateArb(), (state) => {
        const result = builderStateToNormalizedGame(state)
        expect(result.final.category).toBe(state.finalRound.category)
        expect(result.final.clue).toBe(state.finalRound.clue)
        expect(result.final.solution).toBe(state.finalRound.solution)
      }),
      { numRuns: 100 }
    )
  })
})

// Feature: custom-game-builder, Property 8: Draft Serialization Round-Trip
describe('Property 8: Draft Serialization Round-Trip', () => {
  /**
   * **Validates: Requirements 8.1, 10.1**
   *
   * For any valid BuilderFormState, draftToBuilderState(builderStateToDraft(state))
   * produces a state deeply equal to the original.
   */

  it('round-trip through builderStateToDraft and draftToBuilderState preserves state', () => {
    fc.assert(
      fc.property(validBuilderFormStateArb(), (state) => {
        const draft = builderStateToDraft(state)
        const restored = draftToBuilderState(draft)

        // Verify all top-level fields
        expect(restored.gameName).toBe(state.gameName)
        expect(restored.totalRounds).toBe(state.totalRounds)
        expect(restored.categoriesPerRound).toBe(state.categoriesPerRound)

        // Verify final round
        expect(restored.finalRound.category).toBe(state.finalRound.category)
        expect(restored.finalRound.clue).toBe(state.finalRound.clue)
        expect(restored.finalRound.solution).toBe(state.finalRound.solution)

        // Verify rounds structure dimensions
        expect(restored.rounds).toHaveLength(state.totalRounds)
        for (let r = 0; r < state.totalRounds; r++) {
          expect(restored.rounds[r]).toHaveLength(state.categoriesPerRound)
          for (let c = 0; c < state.categoriesPerRound; c++) {
            expect(restored.rounds[r][c].name).toBe(state.rounds[r][c].name)
            expect(restored.rounds[r][c].clues).toHaveLength(5)
            for (let i = 0; i < 5; i++) {
              const originalClue = state.rounds[r][c].clues[i]
              const restoredClue = restored.rounds[r][c].clues[i]
              // Value goes through Number() then String() so compare numerically
              expect(restoredClue.value).toBe(String(Number(originalClue.value)))
              expect(restoredClue.clue).toBe(originalClue.clue)
              expect(restoredClue.solution).toBe(originalClue.solution)
              expect(restoredClue.dailyDouble).toBe(originalClue.dailyDouble)
            }
          }
        }
      }),
      { numRuns: 100 }
    )
  })
})
