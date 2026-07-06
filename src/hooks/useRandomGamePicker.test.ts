import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { selectRandomGame } from './useRandomGamePicker'
import type { GameRecord } from '../types/game'

// ─── Generators ──────────────────────────────────────────────────────────────

/** Generate a valid GameRecord with a non-empty id string. */
const gameRecordArb: fc.Arbitrary<GameRecord> = fc.record({
  id: fc.uuid(),
  game_name: fc.string({ minLength: 1, maxLength: 80 }),
  total_rounds: fc.integer({ min: 1, max: 6 }),
  times_played: fc.integer({ min: 0, max: 9_999 }),
  winners: fc.array(fc.string({ minLength: 1, maxLength: 40 }), { maxLength: 10 }),
  created_by: fc.oneof(fc.constant(null), fc.integer({ min: 1, max: 2_147_483_647 })),
  source: fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 100 })),
  high_score: fc.oneof(fc.constant(null), fc.integer({ min: 0, max: 999_999 })),
  high_score_player: fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 80 })),
  creator_name: fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 80 })),
})

/** Generate a non-empty array of GameRecord objects. */
const nonEmptyGamesArb: fc.Arbitrary<GameRecord[]> = fc.array(gameRecordArb, {
  minLength: 1,
  maxLength: 200,
})

// ─── Property tests ───────────────────────────────────────────────────────────

describe('Property 11: Random game picker always selects a member of the input array', () => {
  /**
   * **Validates: Requirements 1.5**
   *
   * For any non-empty array of GameRecord objects, `selectRandomGame(games)` SHALL
   * return an element that is contained in `games`. The selection index is always
   * in `[0, games.length - 1]` and the returned object is reference-equal to one
   * of the input items.
   */
  it('always returns a reference-equal element from the input array', () => {
    fc.assert(
      fc.property(nonEmptyGamesArb, (games) => {
        const result = selectRandomGame(games)

        // The returned value must be reference-equal to one of the input items.
        // Array.prototype.includes uses SameValueZero (===) for object references.
        expect(games.includes(result)).toBe(true)
      }),
      { numRuns: 1000 }
    )
  })

  it('never returns an element outside the bounds of the input array', () => {
    fc.assert(
      fc.property(nonEmptyGamesArb, (games) => {
        const result = selectRandomGame(games)
        const index = games.indexOf(result)

        // The returned object must exist in the array (index >= 0)
        expect(index).toBeGreaterThanOrEqual(0)
        // The index must be within the valid range
        expect(index).toBeLessThan(games.length)
      }),
      { numRuns: 1000 }
    )
  })

  it('with a single-element array, always returns that element', () => {
    fc.assert(
      fc.property(gameRecordArb, (game) => {
        const result = selectRandomGame([game])
        expect(result).toBe(game)
      }),
      { numRuns: 500 }
    )
  })
})
