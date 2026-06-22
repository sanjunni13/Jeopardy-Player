import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { generateEmptyFormState, generateRoundLabels } from './builderFormStructure'
import type { RoundName } from '../types/game'

// Feature: custom-game-builder, Property 2: Form Structure Invariants
describe('Property 2: Form Structure Invariants', () => {
  /**
   * **Validates: Requirements 1.4, 1.6, 1.7**
   *
   * For any valid configuration where totalRounds is between 1 and 6
   * and categoriesPerRound is between 1 and 6, the generated form state
   * SHALL contain exactly totalRounds round arrays, each containing exactly
   * categoriesPerRound categories, each containing exactly 5 clue entries.
   * The round labels SHALL be the first totalRounds elements of
   * ['single', 'double', 'triple', 'quadruple', 'quintuple', 'sextuple'] in that order.
   */

  const totalRoundsArb = fc.integer({ min: 1, max: 6 })
  const categoriesPerRoundArb = fc.integer({ min: 1, max: 6 })

  it('generateEmptyFormState produces exactly totalRounds round arrays', () => {
    fc.assert(
      fc.property(totalRoundsArb, categoriesPerRoundArb, (totalRounds, categoriesPerRound) => {
        const state = generateEmptyFormState(totalRounds, categoriesPerRound)
        expect(state.rounds).toHaveLength(totalRounds)
        expect(state.totalRounds).toBe(totalRounds)
        expect(state.categoriesPerRound).toBe(categoriesPerRound)
      }),
      { numRuns: 100 }
    )
  })

  it('each round contains exactly categoriesPerRound categories', () => {
    fc.assert(
      fc.property(totalRoundsArb, categoriesPerRoundArb, (totalRounds, categoriesPerRound) => {
        const state = generateEmptyFormState(totalRounds, categoriesPerRound)
        for (const round of state.rounds) {
          expect(round).toHaveLength(categoriesPerRound)
        }
      }),
      { numRuns: 100 }
    )
  })

  it('each category contains exactly 5 clues', () => {
    fc.assert(
      fc.property(totalRoundsArb, categoriesPerRoundArb, (totalRounds, categoriesPerRound) => {
        const state = generateEmptyFormState(totalRounds, categoriesPerRound)
        for (const round of state.rounds) {
          for (const category of round) {
            expect(category.clues).toHaveLength(5)
          }
        }
      }),
      { numRuns: 100 }
    )
  })

  it('all fields are empty strings or false', () => {
    fc.assert(
      fc.property(totalRoundsArb, categoriesPerRoundArb, (totalRounds, categoriesPerRound) => {
        const state = generateEmptyFormState(totalRounds, categoriesPerRound)

        // gameName is empty
        expect(state.gameName).toBe('')

        // finalRound fields are empty
        expect(state.finalRound.category).toBe('')
        expect(state.finalRound.clue).toBe('')
        expect(state.finalRound.solution).toBe('')

        // All round/category/clue fields are empty/false
        for (const round of state.rounds) {
          for (const category of round) {
            expect(category.name).toBe('')
            for (const clue of category.clues) {
              expect(clue.value).toBe('')
              expect(clue.clue).toBe('')
              expect(clue.solution).toBe('')
              expect(clue.dailyDouble).toBe(false)
            }
          }
        }
      }),
      { numRuns: 100 }
    )
  })

  it('generateRoundLabels returns the first totalRounds elements of the expected round names', () => {
    const expectedNames: RoundName[] = ['single', 'double', 'triple', 'quadruple', 'quintuple', 'sextuple']

    fc.assert(
      fc.property(totalRoundsArb, (totalRounds) => {
        const labels = generateRoundLabels(totalRounds)
        expect(labels).toHaveLength(totalRounds)
        expect(labels).toEqual(expectedNames.slice(0, totalRounds))
      }),
      { numRuns: 100 }
    )
  })
})
