import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { builderStateToDraft, draftToBuilderState } from './builderConversion'
import { generateDefaultPointValues } from './builderFormStructure'
import type { MediaAttachment, ClueFormState, RoundFormState } from './builderFormStructure'

// ─── Generators ────────────────────────────────────────────────────────────────

const totalRoundsArb = fc.integer({ min: 1, max: 6 })
const categoriesPerRoundArb = fc.integer({ min: 1, max: 6 })

// Non-empty text (for filled state)
const nonEmptyText = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0)

// Valid clue value as string (positive integer 1-999999)
const validClueValueStr = fc.integer({ min: 1, max: 999999 }).map(String)

// Valid game name: 1-50 chars from allowed set [a-z0-9 \-_]
const validGameNameArb = fc
  .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789 -_'.split('')), {
    minLength: 1,
    maxLength: 50,
  })
  .map(chars => chars.join(''))

// Media attachment generator
const mediaAttachmentArb: fc.Arbitrary<MediaAttachment> = fc.record({
  type: fc.constantFrom('image' as const, 'audio' as const, 'youtube' as const),
  url: nonEmptyText,
  filename: fc.option(nonEmptyText, { nil: undefined }),
})

// Optional media array: sometimes empty, sometimes has 1-3 attachments
const optionalMediaArb: fc.Arbitrary<MediaAttachment[] | undefined> = fc.oneof(
  fc.constant(undefined),
  fc.array(mediaAttachmentArb, { minLength: 1, maxLength: 3 }),
)

// ClueFormState with optional media
const clueFormStateWithMediaArb: fc.Arbitrary<ClueFormState> = fc.record({
  value: validClueValueStr,
  clue: nonEmptyText,
  solution: nonEmptyText,
  dailyDouble: fc.boolean(),
  media: optionalMediaArb,
})

// Full valid BuilderFormState generator WITH media support
function validBuilderFormStateWithMediaArb() {
  return fc.tuple(totalRoundsArb, categoriesPerRoundArb).chain(([totalRounds, catsPerRound]) => {
    const categoryArb = fc.record({
      name: nonEmptyText,
      clues: fc.array(clueFormStateWithMediaArb, { minLength: 5, maxLength: 5 }),
      isDefaultName: fc.boolean(),
    })
    const roundArb = (roundIndex: number) => fc.record({
      categories: fc.array(categoryArb, { minLength: catsPerRound, maxLength: catsPerRound }),
      pointValues: fc.constant(generateDefaultPointValues(roundIndex + 1, 5)),
    })
    const roundsArb = fc.tuple(
      ...Array.from({ length: totalRounds }, (_, i) => roundArb(i))
    ) as fc.Arbitrary<RoundFormState[]>

    return fc.record({
      gameName: validGameNameArb,
      totalRounds: fc.constant(totalRounds),
      categoriesPerRound: fc.constant(catsPerRound),
      rounds: roundsArb,
      finalRound: fc.record({
        category: nonEmptyText,
        clue: nonEmptyText,
        solution: nonEmptyText,
        media: optionalMediaArb,
      }),
    })
  })
}

// ─── Feature: board-style-game-editor, Property 12: Draft serialization round-trip ───

describe('Property 12: Draft serialization round-trip preserves game state', () => {
  /**
   * **Validates: Requirements 9.3, 10.1**
   *
   * For any valid BuilderFormState, converting to BuilderDraft via builderStateToDraft
   * and back via draftToBuilderState SHALL produce a BuilderFormState with equivalent
   * game name, round structure, category names, clue text/solutions, and media references.
   */

  it('round-trip preserves game name', () => {
    fc.assert(
      fc.property(validBuilderFormStateWithMediaArb(), (state) => {
        const draft = builderStateToDraft(state)
        const restored = draftToBuilderState(draft)
        expect(restored.gameName).toBe(state.gameName)
      }),
      { numRuns: 100 }
    )
  })

  it('round-trip preserves round structure dimensions (totalRounds, categoriesPerRound)', () => {
    fc.assert(
      fc.property(validBuilderFormStateWithMediaArb(), (state) => {
        const draft = builderStateToDraft(state)
        const restored = draftToBuilderState(draft)

        expect(restored.totalRounds).toBe(state.totalRounds)
        expect(restored.categoriesPerRound).toBe(state.categoriesPerRound)
        expect(restored.rounds).toHaveLength(state.totalRounds)

        for (let r = 0; r < state.totalRounds; r++) {
          expect(restored.rounds[r].categories).toHaveLength(state.categoriesPerRound)
          for (let c = 0; c < state.categoriesPerRound; c++) {
            expect(restored.rounds[r].categories[c].clues).toHaveLength(5)
          }
        }
      }),
      { numRuns: 100 }
    )
  })

  it('round-trip preserves all category names', () => {
    fc.assert(
      fc.property(validBuilderFormStateWithMediaArb(), (state) => {
        const draft = builderStateToDraft(state)
        const restored = draftToBuilderState(draft)

        for (let r = 0; r < state.totalRounds; r++) {
          for (let c = 0; c < state.categoriesPerRound; c++) {
            expect(restored.rounds[r].categories[c].name).toBe(
              state.rounds[r].categories[c].name
            )
          }
        }
      }),
      { numRuns: 100 }
    )
  })

  it('round-trip preserves clue text, solution, and dailyDouble for all clues', () => {
    fc.assert(
      fc.property(validBuilderFormStateWithMediaArb(), (state) => {
        const draft = builderStateToDraft(state)
        const restored = draftToBuilderState(draft)

        for (let r = 0; r < state.totalRounds; r++) {
          for (let c = 0; c < state.categoriesPerRound; c++) {
            for (let i = 0; i < 5; i++) {
              const original = state.rounds[r].categories[c].clues[i]
              const restoredClue = restored.rounds[r].categories[c].clues[i]
              expect(restoredClue.clue).toBe(original.clue)
              expect(restoredClue.solution).toBe(original.solution)
              expect(restoredClue.dailyDouble).toBe(original.dailyDouble)
            }
          }
        }
      }),
      { numRuns: 100 }
    )
  })

  it('round-trip preserves point values (value goes through Number() then String())', () => {
    fc.assert(
      fc.property(validBuilderFormStateWithMediaArb(), (state) => {
        const draft = builderStateToDraft(state)
        const restored = draftToBuilderState(draft)

        for (let r = 0; r < state.totalRounds; r++) {
          for (let c = 0; c < state.categoriesPerRound; c++) {
            for (let i = 0; i < 5; i++) {
              const original = state.rounds[r].categories[c].clues[i]
              const restoredClue = restored.rounds[r].categories[c].clues[i]
              // Value goes through Number() then String() so compare numerically
              expect(restoredClue.value).toBe(String(Number(original.value)))
            }
          }
        }

        // Also verify pointValues array is reconstructed correctly
        for (let r = 0; r < state.totalRounds; r++) {
          // Point values are extracted from first category's clue values
          const expectedPointValues = state.rounds[r].categories[0].clues.map(
            c => Number(c.value)
          )
          expect(restored.rounds[r].pointValues).toEqual(expectedPointValues)
        }
      }),
      { numRuns: 100 }
    )
  })

  it('round-trip preserves media attachments on clues', () => {
    fc.assert(
      fc.property(validBuilderFormStateWithMediaArb(), (state) => {
        const draft = builderStateToDraft(state)
        const restored = draftToBuilderState(draft)

        for (let r = 0; r < state.totalRounds; r++) {
          for (let c = 0; c < state.categoriesPerRound; c++) {
            for (let i = 0; i < 5; i++) {
              const originalMedia = state.rounds[r].categories[c].clues[i].media
              const restoredMedia = restored.rounds[r].categories[c].clues[i].media

              if (originalMedia && originalMedia.length > 0) {
                expect(restoredMedia).toBeDefined()
                expect(restoredMedia).toHaveLength(originalMedia.length)
                for (let m = 0; m < originalMedia.length; m++) {
                  expect(restoredMedia![m].type).toBe(originalMedia[m].type)
                  expect(restoredMedia![m].url).toBe(originalMedia[m].url)
                  expect(restoredMedia![m].filename).toBe(originalMedia[m].filename)
                }
              } else {
                // No media or empty: restored should also have no media
                expect(restoredMedia ?? []).toHaveLength(0)
              }
            }
          }
        }
      }),
      { numRuns: 100 }
    )
  })

  it('round-trip preserves final round content and media', () => {
    fc.assert(
      fc.property(validBuilderFormStateWithMediaArb(), (state) => {
        const draft = builderStateToDraft(state)
        const restored = draftToBuilderState(draft)

        // Final round text fields
        expect(restored.finalRound.category).toBe(state.finalRound.category)
        expect(restored.finalRound.clue).toBe(state.finalRound.clue)
        expect(restored.finalRound.solution).toBe(state.finalRound.solution)

        // Final round media
        const originalMedia = state.finalRound.media
        const restoredMedia = restored.finalRound.media

        if (originalMedia && originalMedia.length > 0) {
          expect(restoredMedia).toBeDefined()
          expect(restoredMedia).toHaveLength(originalMedia.length)
          for (let m = 0; m < originalMedia.length; m++) {
            expect(restoredMedia![m].type).toBe(originalMedia[m].type)
            expect(restoredMedia![m].url).toBe(originalMedia[m].url)
            expect(restoredMedia![m].filename).toBe(originalMedia[m].filename)
          }
        } else {
          expect(restoredMedia ?? []).toHaveLength(0)
        }
      }),
      { numRuns: 100 }
    )
  })

  it('isDefaultName is always false after round-trip (draft does not preserve it)', () => {
    fc.assert(
      fc.property(validBuilderFormStateWithMediaArb(), (state) => {
        const draft = builderStateToDraft(state)
        const restored = draftToBuilderState(draft)

        for (let r = 0; r < state.totalRounds; r++) {
          for (let c = 0; c < state.categoriesPerRound; c++) {
            // draftToBuilderState always sets isDefaultName: false
            expect(restored.rounds[r].categories[c].isDefaultName).toBe(false)
          }
        }
      }),
      { numRuns: 100 }
    )
  })
})
