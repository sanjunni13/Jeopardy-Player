import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { canRegisterPlayer } from './sessionRegistration'

// Feature: final-jeopardy-and-buzzer, Property 12: Player registration eligibility

// ─── Generators ─────────────────────────────────────────────────────────────

/** Generate a valid player count (0 to 15 to cover both under and over max) */
const playerCountArb = fc.integer({ min: 0, max: 15 })

/** The maximum number of players allowed in a session */
const MAX_PLAYERS = 10

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Property 12: Player registration eligibility', () => {
  /**
   * **Validates: Requirements 8.2, 8.5, 8.7**
   *
   * For any session with `is_locked` status and current player count:
   * registration SHALL be accepted if and only if `is_locked` is false
   * AND player count is less than 10. Registration SHALL be rejected
   * when `is_locked` is true (regardless of count) or when player count
   * has reached 10 (regardless of lock status).
   */

  it('canRegisterPlayer returns true iff isLocked===false AND playerCount < maxPlayers', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        playerCountArb,
        (isLocked, playerCount) => {
          const result = canRegisterPlayer(isLocked, playerCount, MAX_PLAYERS)
          const expected = !isLocked && playerCount < MAX_PLAYERS

          expect(result).toBe(expected)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('canRegisterPlayer returns false when isLocked===true (any count)', () => {
    fc.assert(
      fc.property(
        playerCountArb,
        (playerCount) => {
          const result = canRegisterPlayer(true, playerCount, MAX_PLAYERS)

          expect(result).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('canRegisterPlayer returns false when playerCount >= maxPlayers (any lock state)', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.integer({ min: MAX_PLAYERS, max: 100 }),
        (isLocked, playerCount) => {
          const result = canRegisterPlayer(isLocked, playerCount, MAX_PLAYERS)

          expect(result).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })
})
