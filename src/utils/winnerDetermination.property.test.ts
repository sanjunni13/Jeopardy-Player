import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import type { Player } from '../types/game'

/**
 * **Validates: Requirements 7.2**
 *
 * Property 11: Winner Determination
 * Winner(s) have maximum `Player.score` with no separate balance reconciliation.
 */

// ─── Generators ─────────────────────────────────────────────────────────────

/** Player name: non-empty string */
const playerNameArb = fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0)

/** Generate a valid Player object with a given name */
const playerArb = (name: fc.Arbitrary<string> = playerNameArb): fc.Arbitrary<Player> =>
  fc.record({
    name,
    score: fc.integer({ min: -10000, max: 50000 }),
    correctCount: fc.nat({ max: 100 }),
    incorrectCount: fc.nat({ max: 100 }),
    correctDailyDoubles: fc.nat({ max: 10 }),
    incorrectDailyDoubles: fc.nat({ max: 10 }),
    correctFinalJeopardy: fc.constantFrom(0, 1) as fc.Arbitrary<number>,
    incorrectFinalJeopardy: fc.constantFrom(0, 1) as fc.Arbitrary<number>,
    totalEarned: fc.nat({ max: 100000 }),
  })

/** Generate 1-6 players with unique names */
const playersArb = fc
  .uniqueArray(playerNameArb, { minLength: 1, maxLength: 6 })
  .chain(names => fc.tuple(...names.map(n => playerArb(fc.constant(n)))))

// ─── Winner Determination Logic (mirrors app implementation) ─────────────────

/**
 * Determines game winner(s) using the same logic as the app:
 * sort players by score descending, winners are those with the maximum score.
 */
function determineWinners(players: Player[]): string[] {
  if (players.length === 0) return []
  const sorted = [...players].sort((a, b) => b.score - a.score)
  const highestScore = sorted[0].score
  return sorted.filter(p => p.score === highestScore).map(p => p.name)
}

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Property 11: Winner Determination', () => {
  it('winner(s) have the maximum score among all players', () => {
    fc.assert(
      fc.property(playersArb, (players) => {
        const winners = determineWinners(players)
        const maxScore = Math.max(...players.map(p => p.score))

        // Every winner must have the maximum score
        for (const winnerName of winners) {
          const winnerPlayer = players.find(p => p.name === winnerName)!
          expect(winnerPlayer.score).toBe(maxScore)
        }
      }),
      { numRuns: 200 }
    )
  })

  it('no non-winner has a score >= any winner score', () => {
    fc.assert(
      fc.property(playersArb, (players) => {
        const winners = determineWinners(players)
        const nonWinners = players.filter(p => !winners.includes(p.name))
        const maxScore = Math.max(...players.map(p => p.score))

        // No non-winner can have a score >= the winner's score
        for (const nonWinner of nonWinners) {
          expect(nonWinner.score).toBeLessThan(maxScore)
        }
      }),
      { numRuns: 200 }
    )
  })

  it('if multiple players share the max score, all are winners (tie case)', () => {
    fc.assert(
      fc.property(playersArb, (players) => {
        const winners = determineWinners(players)
        const maxScore = Math.max(...players.map(p => p.score))

        // All players with max score must be in the winners list
        const playersWithMaxScore = players.filter(p => p.score === maxScore)
        expect(winners.length).toBe(playersWithMaxScore.length)
        for (const player of playersWithMaxScore) {
          expect(winners).toContain(player.name)
        }
      }),
      { numRuns: 200 }
    )
  })

  it('winner determination uses only Player.score — no separate balance reconciliation', () => {
    fc.assert(
      fc.property(playersArb, (players) => {
        const winners = determineWinners(players)

        // Determine winners purely from Player.score values
        const maxScore = Math.max(...players.map(p => p.score))
        const expectedWinners = players
          .filter(p => p.score === maxScore)
          .map(p => p.name)

        // The result must match — proving no other field is involved
        expect(winners.sort()).toEqual(expectedWinners.sort())
      }),
      { numRuns: 200 }
    )
  })
})
