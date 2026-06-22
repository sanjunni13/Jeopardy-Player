import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import type { DraftMetadata } from './draftApi'

// ─── Helper Functions Under Test ──────────────────────────────────────────────

/**
 * Returns the display name for a draft.
 * Uses game_name if non-empty, otherwise "Untitled".
 */
export function getDisplayName(draft: DraftMetadata): string {
  return draft.game_name !== '' ? draft.game_name : 'Untitled'
}

/**
 * Sorts an array of DraftMetadata by updated_at in descending order
 * (most recently updated first).
 */
export function sortDraftsByUpdatedAt(drafts: DraftMetadata[]): DraftMetadata[] {
  return [...drafts].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  )
}

// ─── Generators ───────────────────────────────────────────────────────────────

// Generate valid ISO date strings using integer timestamps
// Range: 2000-01-01 to 2099-12-31 in milliseconds
const MIN_TIMESTAMP = new Date('2000-01-01T00:00:00.000Z').getTime()
const MAX_TIMESTAMP = new Date('2099-12-31T23:59:59.999Z').getTime()

const validDateArb = fc
  .integer({ min: MIN_TIMESTAMP, max: MAX_TIMESTAMP })
  .map((ts) => new Date(ts).toISOString())

const draftMetadataArb = fc.record({
  id: fc.uuid(),
  game_name: fc.oneof(fc.constant(''), fc.string({ minLength: 1, maxLength: 100 })),
  created_by: fc.emailAddress(),
  created_at: validDateArb,
  updated_at: validDateArb,
})

// For Property 9: array of drafts with DISTINCT updated_at values
const distinctDraftsArb = fc.uniqueArray(draftMetadataArb, {
  minLength: 2,
  maxLength: 20,
  comparator: (a, b) => a.updated_at === b.updated_at,
})

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('draftApi property tests', () => {
  // Feature: custom-game-builder, Property 9: Draft List Sorting
  describe('Property 9: Draft List Sorting', () => {
    it('sorted drafts are in strictly descending order by updated_at', () => {
      // **Validates: Requirements 7.1**
      fc.assert(
        fc.property(distinctDraftsArb, (drafts) => {
          const sorted = sortDraftsByUpdatedAt(drafts)

          // Verify strictly descending order
          for (let i = 0; i < sorted.length - 1; i++) {
            const currentTime = new Date(sorted[i].updated_at).getTime()
            const nextTime = new Date(sorted[i + 1].updated_at).getTime()
            expect(currentTime).toBeGreaterThan(nextTime)
          }
        }),
        { numRuns: 100 }
      )
    })

    it('sorting preserves all original elements', () => {
      // **Validates: Requirements 7.1**
      fc.assert(
        fc.property(distinctDraftsArb, (drafts) => {
          const sorted = sortDraftsByUpdatedAt(drafts)

          expect(sorted.length).toBe(drafts.length)

          // Every element in original should appear in sorted
          const sortedIds = sorted.map((d) => d.id)
          for (const draft of drafts) {
            expect(sortedIds).toContain(draft.id)
          }
        }),
        { numRuns: 100 }
      )
    })

    it('sorting does not mutate the original array', () => {
      // **Validates: Requirements 7.1**
      fc.assert(
        fc.property(distinctDraftsArb, (drafts) => {
          const originalCopy = [...drafts]
          sortDraftsByUpdatedAt(drafts)

          expect(drafts).toEqual(originalCopy)
        }),
        { numRuns: 100 }
      )
    })
  })

  // Feature: custom-game-builder, Property 10: Draft Display Name
  describe('Property 10: Draft Display Name', () => {
    it('returns game_name when non-empty', () => {
      // **Validates: Requirements 7.2**
      const nonEmptyNameDraftArb = fc.record({
        id: fc.uuid(),
        game_name: fc.string({ minLength: 1, maxLength: 100 }),
        created_by: fc.emailAddress(),
        created_at: validDateArb,
        updated_at: validDateArb,
      })

      fc.assert(
        fc.property(nonEmptyNameDraftArb, (draft) => {
          const displayName = getDisplayName(draft)
          expect(displayName).toBe(draft.game_name)
        }),
        { numRuns: 100 }
      )
    })

    it('returns "Untitled" when game_name is empty', () => {
      // **Validates: Requirements 7.2**
      const emptyNameDraftArb = fc.record({
        id: fc.uuid(),
        game_name: fc.constant(''),
        created_by: fc.emailAddress(),
        created_at: validDateArb,
        updated_at: validDateArb,
      })

      fc.assert(
        fc.property(emptyNameDraftArb, (draft) => {
          const displayName = getDisplayName(draft)
          expect(displayName).toBe('Untitled')
        }),
        { numRuns: 100 }
      )
    })

    it('display name is always either the game_name or "Untitled"', () => {
      // **Validates: Requirements 7.2**
      fc.assert(
        fc.property(draftMetadataArb, (draft) => {
          const displayName = getDisplayName(draft)

          if (draft.game_name === '') {
            expect(displayName).toBe('Untitled')
          } else {
            expect(displayName).toBe(draft.game_name)
          }
        }),
        { numRuns: 100 }
      )
    })
  })
})
