import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { isDuplicateName } from './playerNameValidation'
import type { SessionPlayer } from '../types/session'

// Feature: final-jeopardy-and-buzzer, Property 4: Duplicate name detection (case-insensitive)

/**
 * **Validates: Requirements 1.7**
 *
 * For any existing player list and candidate name, the duplicate check SHALL
 * return true if and only if the candidate name matches an existing name under
 * case-insensitive comparison (e.g., "Alice" matches "alice" and "ALICE").
 */

/** Arbitrary that generates a non-empty list of SessionPlayers with unique names */
const playerListArb = fc
  .uniqueArray(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 10 })
  .map((names) =>
    names.map((name) => ({
      name,
      score: 0,
      joinedAt: new Date().toISOString(),
    }))
  )

describe('Property 4: Duplicate name detection (case-insensitive)', () => {
  it('returns true when candidateName.toLowerCase() equals any player name toLowerCase()', () => {
    fc.assert(
      fc.property(
        playerListArb,
        fc.nat().map((n) => n), // index selector
        (players, indexSeed) => {
          // Pick an existing player name and use it as the candidate
          const index = indexSeed % players.length
          const candidateName = players[index].name

          expect(isDuplicateName(players, candidateName)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('returns false when candidateName.toLowerCase() does NOT equal any player name toLowerCase()', () => {
    fc.assert(
      fc.property(
        playerListArb,
        fc.string({ minLength: 1, maxLength: 20 }),
        (players, candidate) => {
          // Only test when the candidate truly doesn't match any existing name
          const normalizedCandidate = candidate.toLowerCase()
          const isActuallyDuplicate = players.some(
            (p) => p.name.toLowerCase() === normalizedCandidate
          )

          // Pre-condition: skip if it happens to match
          fc.pre(!isActuallyDuplicate)

          expect(isDuplicateName(players, candidate)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('case variations of the same name always match (duplicate detected)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
        fc.func(fc.boolean()),
        (baseName, caseDecider) => {
          // Create a player list with the original name
          const players: SessionPlayer[] = [
            { name: baseName, score: 0, joinedAt: new Date().toISOString() },
          ]

          // Generate a case-varied version of the name
          const caseVaried = baseName
            .split('')
            .map((ch, i) => (caseDecider(i) ? ch.toUpperCase() : ch.toLowerCase()))
            .join('')

          // Case-insensitive match means both should normalize to the same value
          // Only assert if they truly are the same when lowercased
          if (baseName.toLowerCase() === caseVaried.toLowerCase()) {
            expect(isDuplicateName(players, caseVaried)).toBe(true)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
