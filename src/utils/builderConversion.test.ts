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
      {
        categories: [
          {
            name: 'History',
            clues: [
              { value: '200', clue: 'Q1', solution: 'A1', dailyDouble: false },
              { value: '400', clue: 'Q2', solution: 'A2', dailyDouble: false },
              { value: '600', clue: 'Q3', solution: 'A3', dailyDouble: true },
              { value: '800', clue: 'Q4', solution: 'A4', dailyDouble: false },
              { value: '1000', clue: 'Q5', solution: 'A5', dailyDouble: false },
            ],
            isDefaultName: false,
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
            isDefaultName: false,
          },
        ],
        pointValues: [200, 400, 600, 800, 1000],
      },
      {
        categories: [
          {
            name: 'Art',
            clues: [
              { value: '400', clue: 'AR1', solution: 'ARA1', dailyDouble: false },
              { value: '800', clue: 'AR2', solution: 'ARA2', dailyDouble: false },
              { value: '1200', clue: 'AR3', solution: 'ARA3', dailyDouble: false },
              { value: '1600', clue: 'AR4', solution: 'ARA4', dailyDouble: true },
              { value: '2000', clue: 'AR5', solution: 'ARA5', dailyDouble: false },
            ],
            isDefaultName: false,
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
            isDefaultName: false,
          },
        ],
        pointValues: [400, 800, 1200, 1600, 2000],
      },
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

    it('does not include media field when no media attachments exist', () => {
      const result = builderStateToDraft(sampleState)
      expect(result.media).toBeUndefined()
    })

    it('collects media attachments into manifest keyed by clue path', () => {
      const stateWithMedia: BuilderFormState = {
        ...sampleState,
        rounds: [
          {
            ...sampleState.rounds[0],
            categories: [
              {
                ...sampleState.rounds[0].categories[0],
                clues: sampleState.rounds[0].categories[0].clues.map((c, idx) =>
                  idx === 1
                    ? { ...c, media: [{ type: 'image' as const, url: 'https://example.com/img.png', filename: 'img.png' }] }
                    : c
                ),
              },
              sampleState.rounds[0].categories[1],
            ],
          },
          sampleState.rounds[1],
        ],
        finalRound: {
          ...sampleState.finalRound,
          media: [{ type: 'youtube' as const, url: 'https://youtube.com/watch?v=abc123' }],
        },
      }

      const result = builderStateToDraft(stateWithMedia)
      expect(result.media).toBeDefined()
      expect(result.media!['round.0.cat.0.clue.1']).toEqual([
        { type: 'image', url: 'https://example.com/img.png', filename: 'img.png' },
      ])
      expect(result.media!['final']).toEqual([
        { type: 'youtube', url: 'https://youtube.com/watch?v=abc123' },
      ])
      // Other keys should not exist
      expect(result.media!['round.0.cat.0.clue.0']).toBeUndefined()
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
      expect(result.rounds[0].categories).toHaveLength(2)
      expect(result.rounds[0].categories[0].name).toBe('History')
      // Values should be strings
      expect(result.rounds[0].categories[0].clues[0].value).toBe('200')
      expect(result.rounds[0].categories[0].clues[2].dailyDouble).toBe(true)
      expect(result.finalRound.category).toBe('Final Category')
    })

    it('generates pointValues from stored clue values in old-format drafts', () => {
      // Old-format draft: has clue values but no separate pointValues field
      const oldDraft: BuilderDraft = {
        gameName: 'Old Game',
        totalRounds: 1,
        categoriesPerRound: 2,
        rounds: {
          single: [
            {
              category: 'Cat A',
              clues: [
                { value: 200, clue: 'Q1', solution: 'A1', dailyDouble: false, html: false },
                { value: 400, clue: 'Q2', solution: 'A2', dailyDouble: false, html: false },
                { value: 600, clue: 'Q3', solution: 'A3', dailyDouble: false, html: false },
                { value: 800, clue: 'Q4', solution: 'A4', dailyDouble: false, html: false },
                { value: 1000, clue: 'Q5', solution: 'A5', dailyDouble: false, html: false },
              ],
            },
            {
              category: 'Cat B',
              clues: [
                { value: 200, clue: 'Q1', solution: 'A1', dailyDouble: false, html: false },
                { value: 400, clue: 'Q2', solution: 'A2', dailyDouble: false, html: false },
                { value: 600, clue: 'Q3', solution: 'A3', dailyDouble: false, html: false },
                { value: 800, clue: 'Q4', solution: 'A4', dailyDouble: false, html: false },
                { value: 1000, clue: 'Q5', solution: 'A5', dailyDouble: false, html: false },
              ],
            },
          ],
        } as any,
        final: { category: 'Final', clue: 'FC', solution: 'FS', html: false },
      }

      const result = draftToBuilderState(oldDraft)
      expect(result.rounds[0].pointValues).toEqual([200, 400, 600, 800, 1000])
      expect(result.rounds[0].categories[0].isDefaultName).toBe(false)
    })

    it('defaults pointValues for empty drafts', () => {
      const emptyDraft: BuilderDraft = {
        gameName: '',
        totalRounds: 1,
        categoriesPerRound: 1,
        rounds: {
          single: [
            {
              category: 'Category 1',
              clues: [
                { value: 0, clue: '', solution: '', dailyDouble: false, html: false },
                { value: 0, clue: '', solution: '', dailyDouble: false, html: false },
                { value: 0, clue: '', solution: '', dailyDouble: false, html: false },
                { value: 0, clue: '', solution: '', dailyDouble: false, html: false },
                { value: 0, clue: '', solution: '', dailyDouble: false, html: false },
              ],
            },
          ],
        } as any,
        final: { category: '', clue: '', solution: '', html: false },
      }

      const result = draftToBuilderState(emptyDraft)
      // All clue values are 0, so falls back to defaults
      expect(result.rounds[0].pointValues).toEqual([200, 400, 600, 800, 1000])
    })

    it('reads media from manifest and attaches to clues', () => {
      const draftWithMedia: BuilderDraft = {
        gameName: 'Media Game',
        totalRounds: 1,
        categoriesPerRound: 1,
        rounds: {
          single: [
            {
              category: 'Cat A',
              clues: [
                { value: 200, clue: 'Q1', solution: 'A1', dailyDouble: false, html: false },
                { value: 400, clue: 'Q2', solution: 'A2', dailyDouble: false, html: false },
              ],
            },
          ],
        } as any,
        final: { category: 'Final', clue: 'FC', solution: 'FS', html: false },
        media: {
          'round.0.cat.0.clue.1': [{ type: 'audio', url: 'https://storage.example.com/clip.mp3', filename: 'clip.mp3' }],
          'final': [{ type: 'image', url: 'https://storage.example.com/img.jpg' }],
        },
      }

      const result = draftToBuilderState(draftWithMedia)
      // First clue has no media
      expect(result.rounds[0].categories[0].clues[0].media).toBeUndefined()
      // Second clue has audio media
      expect(result.rounds[0].categories[0].clues[1].media).toEqual([
        { type: 'audio', url: 'https://storage.example.com/clip.mp3', filename: 'clip.mp3' },
      ])
      // Final round has image media
      expect(result.finalRound.media).toEqual([
        { type: 'image', url: 'https://storage.example.com/img.jpg' },
      ])
    })

    it('handles old-format draft with no media field', () => {
      const oldDraft: BuilderDraft = {
        gameName: 'No Media',
        totalRounds: 1,
        categoriesPerRound: 1,
        rounds: {
          single: [
            {
              category: 'Cat A',
              clues: [
                { value: 200, clue: 'Q1', solution: 'A1', dailyDouble: false, html: false },
              ],
            },
          ],
        } as any,
        final: { category: 'Final', clue: 'FC', solution: 'FS', html: false },
        // No media field at all
      }

      const result = draftToBuilderState(oldDraft)
      expect(result.rounds[0].categories[0].clues[0].media).toBeUndefined()
      expect(result.finalRound.media).toBeUndefined()
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

    it('returns true when clue has media attachment with null lastSaved', () => {
      const state = generateEmptyFormState(1, 1)
      state.rounds[0].categories[0].clues[0].media = [
        { type: 'image', url: 'https://example.com/img.png' },
      ]
      expect(isDirtyState(state, null)).toBe(true)
    })

    it('returns true when finalRound has media attachment with null lastSaved', () => {
      const state = generateEmptyFormState(1, 1)
      state.finalRound.media = [
        { type: 'youtube', url: 'https://youtube.com/watch?v=abc' },
      ]
      expect(isDirtyState(state, null)).toBe(true)
    })
  })
})
