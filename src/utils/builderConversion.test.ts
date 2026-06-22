import { describe, it, expect } from 'vitest'
import {
  builderStateToNormalizedGame,
  builderStateToDraft,
  draftToBuilderState,
  isDirtyState,
} from './builderConversion'
import { generateEmptyFormState } from './builderFormStructure'
import type { BuilderFormState } from './builderFormStructure'

describe('builderConversion', () => {
  const sampleState: BuilderFormState = {
    gameName: 'Test Game',
    totalRounds: 2,
    categoriesPerRound: 2,
    rounds: [
      [
        {
          name: 'History',
          clues: [
            { value: '200', clue: 'Q1', solution: 'A1', dailyDouble: false },
            { value: '400', clue: 'Q2', solution: 'A2', dailyDouble: false },
            { value: '600', clue: 'Q3', solution: 'A3', dailyDouble: true },
            { value: '800', clue: 'Q4', solution: 'A4', dailyDouble: false },
            { value: '1000', clue: 'Q5', solution: 'A5', dailyDouble: false },
          ],
        },
        {
          name: 'Science',
          clues: [
            { value: '200', clue: 'S1', solution: 'SA1', dailyDouble: false },
            { value: '400', clue: 'S2', solution: 'SA2', dailyDouble: false },
            { value: '600', clue: 'S3', solution: 'SA3', dailyDouble: false },
            { value: '800', clue: 'S4', solution: 'SA4', dailyDouble: false },
            { value: '1000', clue: 'S5', solution: 'SA5', dailyDouble: false },
          ],
        },
      ],
      [
        {
          name: 'Art',
          clues: [
            { value: '400', clue: 'AR1', solution: 'ARA1', dailyDouble: false },
            { value: '800', clue: 'AR2', solution: 'ARA2', dailyDouble: false },
            { value: '1200', clue: 'AR3', solution: 'ARA3', dailyDouble: false },
            { value: '1600', clue: 'AR4', solution: 'ARA4', dailyDouble: true },
            { value: '2000', clue: 'AR5', solution: 'ARA5', dailyDouble: false },
          ],
        },
        {
          name: 'Music',
          clues: [
            { value: '400', clue: 'M1', solution: 'MA1', dailyDouble: false },
            { value: '800', clue: 'M2', solution: 'MA2', dailyDouble: false },
            { value: '1200', clue: 'M3', solution: 'MA3', dailyDouble: false },
            { value: '1600', clue: 'M4', solution: 'MA4', dailyDouble: false },
            { value: '2000', clue: 'M5', solution: 'MA5', dailyDouble: false },
          ],
        },
      ],
    ],
    finalRound: {
      category: 'Final Category',
      clue: 'Final Clue',
      solution: 'Final Solution',
    },
  }

  describe('builderStateToNormalizedGame', () => {
    it('produces correct NormalizedGame structure with numeric values', () => {
      const result = builderStateToNormalizedGame(sampleState)

      expect(result.totalRounds).toBe(2)
      expect(Object.keys(result.rounds)).toContain('single')
      expect(Object.keys(result.rounds)).toContain('double')
      expect(result.rounds.single).toHaveLength(2)
      expect(result.rounds.double).toHaveLength(2)

      // Check numeric conversion
      expect(result.rounds.single[0].clues[0].value).toBe(200)
      expect(result.rounds.single[0].clues[2].dailyDouble).toBe(true)
      expect(result.rounds.single[0].category).toBe('History')

      // Check final round
      expect(result.final.category).toBe('Final Category')
      expect(result.final.clue).toBe('Final Clue')
      expect(result.final.solution).toBe('Final Solution')
      expect(result.final.html).toBe(false)

      // All clues have html: false
      expect(result.rounds.single[0].clues[0].html).toBe(false)
    })
  })

  describe('builderStateToDraft', () => {
    it('produces correct BuilderDraft structure', () => {
      const result = builderStateToDraft(sampleState)

      expect(result.gameName).toBe('Test Game')
      expect(result.totalRounds).toBe(2)
      expect(result.categoriesPerRound).toBe(2)
      expect(result.rounds.single).toHaveLength(2)
      expect(result.rounds.double).toHaveLength(2)
      expect(result.rounds.single[0].clues[0].value).toBe(200)
      expect(result.final.category).toBe('Final Category')
      expect(result.final.html).toBe(false)
    })
  })

  describe('draftToBuilderState', () => {
    it('correctly reconstructs BuilderFormState from a draft', () => {
      const draft = builderStateToDraft(sampleState)
      const result = draftToBuilderState(draft)

      expect(result.gameName).toBe('Test Game')
      expect(result.totalRounds).toBe(2)
      expect(result.categoriesPerRound).toBe(2)
      expect(result.rounds).toHaveLength(2)
      expect(result.rounds[0]).toHaveLength(2)
      expect(result.rounds[0][0].name).toBe('History')
      // Values should be strings
      expect(result.rounds[0][0].clues[0].value).toBe('200')
      expect(result.rounds[0][0].clues[2].dailyDouble).toBe(true)
      expect(result.finalRound.category).toBe('Final Category')
    })
  })

  describe('round-trip: draftToBuilderState(builderStateToDraft(state))', () => {
    it('produces a state deeply equal to the original', () => {
      const roundTripped = draftToBuilderState(builderStateToDraft(sampleState))
      expect(roundTripped).toEqual(sampleState)
    })
  })

  describe('isDirtyState', () => {
    it('returns false when states are equal', () => {
      expect(isDirtyState(sampleState, sampleState)).toBe(false)
    })

    it('returns true when states differ', () => {
      const modified = { ...sampleState, gameName: 'Changed' }
      expect(isDirtyState(modified, sampleState)).toBe(true)
    })

    it('returns false for empty state with null lastSaved', () => {
      const emptyState = generateEmptyFormState(1, 1)
      expect(isDirtyState(emptyState, null)).toBe(false)
    })

    it('returns true for non-empty state with null lastSaved', () => {
      expect(isDirtyState(sampleState, null)).toBe(true)
    })

    it('returns true when only gameName has content with null lastSaved', () => {
      const state = generateEmptyFormState(1, 1)
      state.gameName = 'Something'
      expect(isDirtyState(state, null)).toBe(true)
    })

    it('returns true when only finalRound has content with null lastSaved', () => {
      const state = generateEmptyFormState(1, 1)
      state.finalRound.clue = 'Some clue'
      expect(isDirtyState(state, null)).toBe(true)
    })
  })
})
