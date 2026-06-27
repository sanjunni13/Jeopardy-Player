import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { validateWager, getValidWagerRange, allPlayersSubmitted, canSubmitFinalJeopardy } from './finalJeopardyValidation'
import type { SessionPlayer, FinalJeopardySubmission } from '../types/session'

// Feature: final-jeopardy-and-buzzer, Property 7: Wager validation range

/**
 * **Validates: Requirements 5.2, 5.4**
 *
 * For any player score and wager value, `validateWager` SHALL accept the wager
 * if and only if it is a whole integer in the range [0, playerScore] when
 * playerScore > 0, or [0, 1000] when playerScore ≤ 0. All other values SHALL
 * be rejected.
 */

describe('Property 7: Wager validation range', () => {
  it('valid integer wagers within range are accepted (score > 0: wager in [0, score])', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100000 }).chain((playerScore) =>
          fc.integer({ min: 0, max: playerScore }).map((wager) => ({
            playerScore,
            wager,
          }))
        ),
        ({ playerScore, wager }) => {
          const result = validateWager(wager, playerScore)
          expect(result.valid).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('valid integer wagers within range are accepted (score <= 0: wager in [0, 1000])', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100000, max: 0 }),
        fc.integer({ min: 0, max: 1000 }),
        (playerScore, wager) => {
          const result = validateWager(wager, playerScore)
          expect(result.valid).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('wagers above the valid range are rejected', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100000, max: 100000 }),
        fc.integer({ min: 1, max: 100000 }),
        (playerScore, excess) => {
          const range = getValidWagerRange(playerScore)
          const wager = range.max + excess
          const result = validateWager(wager, playerScore)
          expect(result.valid).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('wagers below the valid range (negative) are rejected', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100000, max: 100000 }),
        fc.integer({ min: -100000, max: -1 }),
        (playerScore, negativeWager) => {
          const result = validateWager(negativeWager, playerScore)
          expect(result.valid).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('non-integer wagers are rejected (e.g., x.5)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100000, max: 100000 }),
        fc.double({ min: 0.01, max: 0.99, noNaN: true, noDefaultInfinity: true }),
        (playerScore, fractionalPart) => {
          const range = getValidWagerRange(playerScore)
          const baseWager = Math.min(Math.max(0, Math.floor(range.max / 2)), range.max)
          const wager = baseWager + fractionalPart

          // Only test if the fractional wager is not accidentally an integer
          fc.pre(!Number.isInteger(wager))

          const result = validateWager(wager, playerScore)
          expect(result.valid).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('boundary: wager exactly 0 is always accepted', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100000, max: 100000 }),
        (playerScore) => {
          const result = validateWager(0, playerScore)
          expect(result.valid).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('boundary: wager exactly equal to max is accepted', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100000, max: 100000 }),
        (playerScore) => {
          const range = getValidWagerRange(playerScore)
          const result = validateWager(range.max, playerScore)
          expect(result.valid).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// Feature: final-jeopardy-and-buzzer, Property 9: Single submission per player enforcement

/**
 * **Validates: Requirements 5.6**
 *
 * For any Final Jeopardy state that already contains a submission from player X,
 * attempting to add a second submission from player X SHALL be rejected,
 * preserving the original submission unchanged.
 */



const arbPlayerName = fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0)

const arbSubmission = fc.record({
  playerName: arbPlayerName,
  wager: fc.integer({ min: 0, max: 100000 }),
  answer: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0),
  submittedAt: fc.integer({ min: 946684800000, max: 4102444800000 }).map(ts => new Date(ts).toISOString()),
}) as fc.Arbitrary<FinalJeopardySubmission>

describe('Property 9: Single submission per player enforcement', () => {
  it('canSubmitFinalJeopardy returns false when a submission from the player already exists', () => {
    fc.assert(
      fc.property(
        arbSubmission,
        fc.array(arbSubmission, { minLength: 0, maxLength: 9 }),
        (existingSubmission, otherSubmissions) => {
          // Build a submissions array that includes the player's submission
          const submissions = [...otherSubmissions, existingSubmission]
          const result = canSubmitFinalJeopardy(submissions, existingSubmission.playerName)
          expect(result).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('canSubmitFinalJeopardy returns true when no submission from the player exists', () => {
    fc.assert(
      fc.property(
        arbPlayerName,
        fc.array(arbSubmission, { minLength: 0, maxLength: 9 }),
        (playerName, submissions) => {
          // Filter out any submissions that happen to match the player name
          const filteredSubmissions = submissions.filter(s => s.playerName !== playerName)
          const result = canSubmitFinalJeopardy(filteredSubmissions, playerName)
          expect(result).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })
})


// Feature: final-jeopardy-and-buzzer, Property 10: All-submissions-received detection

/**
 * **Validates: Requirements 6.3**
 *
 * For any set of registered players and set of Final Jeopardy submissions,
 * the all-submitted indicator SHALL be true if and only if every registered
 * player has exactly one corresponding submission.
 */

// Arbitraries for generating test data
const playerNameArb = fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0)

const uniquePlayerNamesArb = (minCount: number, maxCount: number) =>
  fc.uniqueArray(playerNameArb, { minLength: minCount, maxLength: maxCount })

const sessionPlayerArb = (name: string): SessionPlayer => ({
  name,
  score: 0,
  joinedAt: new Date().toISOString(),
})

const submissionForPlayer = (playerName: string): FinalJeopardySubmission => ({
  playerName,
  wager: 100,
  answer: 'What is test?',
  submittedAt: new Date().toISOString(),
})

describe('Property 10: All-submissions-received detection', () => {
  it('allPlayersSubmitted returns true when every player has a submission', () => {
    fc.assert(
      fc.property(
        uniquePlayerNamesArb(1, 10),
        (names) => {
          const players: SessionPlayer[] = names.map(sessionPlayerArb)
          const submissions: FinalJeopardySubmission[] = names.map(submissionForPlayer)

          expect(allPlayersSubmitted(players, submissions)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('allPlayersSubmitted returns false when at least one player is missing a submission', () => {
    fc.assert(
      fc.property(
        uniquePlayerNamesArb(2, 10).chain((names) =>
          fc.integer({ min: 0, max: names.length - 1 }).map((removeIndex) => ({
            names,
            removeIndex,
          }))
        ),
        ({ names, removeIndex }) => {
          const players: SessionPlayer[] = names.map(sessionPlayerArb)
          // Create submissions for all players except one
          const submissions: FinalJeopardySubmission[] = names
            .filter((_, i) => i !== removeIndex)
            .map(submissionForPlayer)

          expect(allPlayersSubmitted(players, submissions)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })
})
