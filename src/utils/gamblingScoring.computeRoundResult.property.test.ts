import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { computeRoundResult } from './gamblingScoring'
import type { Player, ClueAnswerEvent, RoundTrackingData } from '../types/game'

// ─── Generators ─────────────────────────────────────────────────────────────

/** Generate a player name from a fixed pool to ensure uniqueness is manageable */
const playerNameArb = fc.stringMatching(/^[A-Za-z][A-Za-z0-9]{1,10}$/)

/** Generate a valid Player object with a specific name and score */
function makePlayer(name: string, score: number): Player {
  return {
    name,
    score,
    correctCount: 0,
    incorrectCount: 0,
    correctDailyDoubles: 0,
    incorrectDailyDoubles: 0,
    correctFinalJeopardy: 0,
    incorrectFinalJeopardy: 0,
    totalEarned: 0,
  }
}

/** Generate a list of unique player names (at least 2 for tie scenarios) */
const uniquePlayerNamesArb = (minLength = 2, maxLength = 5): fc.Arbitrary<string[]> =>
  fc.array(playerNameArb, { minLength: minLength + 2, maxLength: maxLength + 5 })
    .map(names => [...new Set(names)])
    .filter(names => names.length >= minLength)
    .map(names => names.slice(0, maxLength))

// ─── Property 4: Deterministic Tie-Breaking ─────────────────────────────────

describe('Feature: expanded-bet-types, Property 4: Deterministic Tie-Breaking', () => {
  /**
   * **Validates: Requirements 5.1, 5.3, 5.4, 5.5, 5.6, 5.7**
   *
   * Generate scenarios with tied statistics across multiple players.
   * Verify:
   * - roundLeader is null on ties
   * - mostIncorrectPlayer and biggestEarnerPlayer use player-order tie-break
   * - highestSingleCluePlayer, mostCorrectPlayer, bottomFeederPlayer are members of the tied set
   */

  it('roundLeader is null when multiple players share the top cumulative score', () => {
    fc.assert(
      fc.property(
        uniquePlayerNamesArb(2, 5),
        fc.integer({ min: -5000, max: 5000 }),
        fc.array(fc.integer({ min: -5000, max: -1 }), { minLength: 0, maxLength: 3 }),
        (names, tiedScore, lowerScoreOffsets) => {
          // Create players where at least the first 2 share the same top score
          const players: Player[] = names.map((name, idx) => {
            if (idx < 2) {
              return makePlayer(name, tiedScore)
            }
            // Others have lower scores
            const offset = lowerScoreOffsets[idx - 2] ?? -1
            return makePlayer(name, tiedScore + offset)
          })

          const data: RoundTrackingData = {
            players,
            startOfRoundScores: Object.fromEntries(players.map(p => [p.name, p.score - 100])),
            answerEvents: [],
            dailyDoubleFinderPlayer: null,
            cluesPerCategory: {},
          }

          const result = computeRoundResult(data)
          expect(result.roundLeader).toBeNull()
        }
      ),
      { numRuns: 100 }
    )
  })

  it('mostIncorrectPlayer uses player-order tie-break (first in players array wins)', () => {
    fc.assert(
      fc.property(
        uniquePlayerNamesArb(2, 5),
        fc.integer({ min: 1, max: 10 }),
        (names, incorrectCount) => {
          // All players get the same number of incorrect answers
          const players: Player[] = names.map(name => makePlayer(name, 1000))
          const startOfRoundScores = Object.fromEntries(players.map(p => [p.name, p.score]))

          // Generate answer events: each player gets the same incorrectCount
          const answerEvents: ClueAnswerEvent[] = []
          let chronoOrder = 0
          for (let i = 0; i < incorrectCount; i++) {
            for (const player of players) {
              answerEvents.push({
                playerName: player.name,
                clueKey: `round1-0-${chronoOrder}`,
                result: 'incorrect',
                pointValue: 200,
                chronologicalOrder: chronoOrder++,
                categoryIndex: 0,
              })
            }
          }

          const data: RoundTrackingData = {
            players,
            startOfRoundScores,
            answerEvents,
            dailyDoubleFinderPlayer: null,
            cluesPerCategory: {},
          }

          const result = computeRoundResult(data)
          // Should be the first player in the array (player-order tie-break)
          expect(result.mostIncorrectPlayer).toBe(players[0].name)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('biggestEarnerPlayer uses player-order tie-break (first in players array wins)', () => {
    fc.assert(
      fc.property(
        uniquePlayerNamesArb(2, 5),
        fc.integer({ min: 100, max: 1000 }),
        fc.integer({ min: 1, max: 5 }),
        (names, pointValue, correctCount) => {
          // All players earn the same total from correct answers
          const players: Player[] = names.map(name => makePlayer(name, 1000))
          const startOfRoundScores = Object.fromEntries(players.map(p => [p.name, p.score]))

          // Give each player the same number of correct answers with same point values
          const answerEvents: ClueAnswerEvent[] = []
          let chronoOrder = 0
          for (let i = 0; i < correctCount; i++) {
            for (const player of players) {
              answerEvents.push({
                playerName: player.name,
                clueKey: `round1-${i}-${chronoOrder}`,
                result: 'correct',
                pointValue,
                chronologicalOrder: chronoOrder++,
                categoryIndex: i % 6,
              })
            }
          }

          const data: RoundTrackingData = {
            players,
            startOfRoundScores,
            answerEvents,
            dailyDoubleFinderPlayer: null,
            cluesPerCategory: { 0: 5, 1: 5, 2: 5, 3: 5, 4: 5, 5: 5 },
          }

          const result = computeRoundResult(data)
          // Should be the first player in the array (player-order tie-break)
          expect(result.biggestEarnerPlayer).toBe(players[0].name)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('highestSingleCluePlayer is one of the tied players when multiple share max clue value', () => {
    fc.assert(
      fc.property(
        uniquePlayerNamesArb(2, 5),
        fc.integer({ min: 200, max: 2000 }),
        (names, maxPointValue) => {
          const players: Player[] = names.map(name => makePlayer(name, 1000))
          const startOfRoundScores = Object.fromEntries(players.map(p => [p.name, p.score]))

          // Give each player one correct answer with the same max point value
          const answerEvents: ClueAnswerEvent[] = players.map((player, idx) => ({
            playerName: player.name,
            clueKey: `round1-0-${idx}`,
            result: 'correct' as const,
            pointValue: maxPointValue,
            chronologicalOrder: idx,
            categoryIndex: 0,
          }))

          const data: RoundTrackingData = {
            players,
            startOfRoundScores,
            answerEvents,
            dailyDoubleFinderPlayer: null,
            cluesPerCategory: { 0: 5 },
          }

          const result = computeRoundResult(data)
          // The result should be one of the tied players
          const tiedPlayerNames = players.map(p => p.name)
          expect(tiedPlayerNames).toContain(result.highestSingleCluePlayer)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('mostCorrectPlayer is one of the tied players when multiple share max correct count', () => {
    fc.assert(
      fc.property(
        uniquePlayerNamesArb(2, 5),
        fc.integer({ min: 1, max: 8 }),
        (names, correctCount) => {
          const players: Player[] = names.map(name => makePlayer(name, 1000))
          const startOfRoundScores = Object.fromEntries(players.map(p => [p.name, p.score]))

          // Give each player the same number of correct answers
          const answerEvents: ClueAnswerEvent[] = []
          let chronoOrder = 0
          for (let i = 0; i < correctCount; i++) {
            for (const player of players) {
              answerEvents.push({
                playerName: player.name,
                clueKey: `round1-${i}-${chronoOrder}`,
                result: 'correct',
                pointValue: 200 * (i + 1),
                chronologicalOrder: chronoOrder++,
                categoryIndex: i % 6,
              })
            }
          }

          const data: RoundTrackingData = {
            players,
            startOfRoundScores,
            answerEvents,
            dailyDoubleFinderPlayer: null,
            cluesPerCategory: { 0: 5, 1: 5, 2: 5, 3: 5, 4: 5, 5: 5 },
          }

          const result = computeRoundResult(data)
          const tiedPlayerNames = players.map(p => p.name)
          expect(tiedPlayerNames).toContain(result.mostCorrectPlayer)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('bottomFeederPlayer is one of the tied players when multiple share the lowest score', () => {
    fc.assert(
      fc.property(
        uniquePlayerNamesArb(2, 5),
        fc.integer({ min: -5000, max: 5000 }),
        fc.array(fc.integer({ min: 1, max: 5000 }), { minLength: 0, maxLength: 3 }),
        (names, tiedLowScore, higherScoreOffsets) => {
          // Create players where at least the first 2 share the lowest score
          const players: Player[] = names.map((name, idx) => {
            if (idx < 2) {
              return makePlayer(name, tiedLowScore)
            }
            // Others have higher scores
            const offset = higherScoreOffsets[idx - 2] ?? 1
            return makePlayer(name, tiedLowScore + offset)
          })

          const data: RoundTrackingData = {
            players,
            startOfRoundScores: Object.fromEntries(players.map(p => [p.name, p.score])),
            answerEvents: [],
            dailyDoubleFinderPlayer: null,
            cluesPerCategory: {},
          }

          const result = computeRoundResult(data)
          // bottomFeederPlayer should be one of the players with the lowest score
          const minScore = Math.min(...players.map(p => p.score))
          const tiedPlayerNames = players.filter(p => p.score === minScore).map(p => p.name)
          expect(tiedPlayerNames).toContain(result.bottomFeederPlayer)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('combined: all tie-breaking rules hold simultaneously in a fully-tied scenario', () => {
    fc.assert(
      fc.property(
        uniquePlayerNamesArb(2, 4),
        fc.integer({ min: 500, max: 5000 }),
        fc.integer({ min: 200, max: 1000 }),
        fc.integer({ min: 1, max: 3 }),
        fc.integer({ min: 1, max: 3 }),
        (names, score, pointValue, correctPerPlayer, incorrectPerPlayer) => {
          // All players have same score, same correct count, same incorrect count,
          // same max point value, same earned sum
          const players: Player[] = names.map(name => makePlayer(name, score))
          const startOfRoundScores = Object.fromEntries(players.map(p => [p.name, p.score]))

          const answerEvents: ClueAnswerEvent[] = []
          let chronoOrder = 0

          // Give each player the same correct answers with the same point value
          for (let i = 0; i < correctPerPlayer; i++) {
            for (const player of players) {
              answerEvents.push({
                playerName: player.name,
                clueKey: `round1-correct-${i}-${player.name}`,
                result: 'correct',
                pointValue,
                chronologicalOrder: chronoOrder++,
                categoryIndex: i % 6,
              })
            }
          }

          // Give each player the same incorrect answers
          for (let i = 0; i < incorrectPerPlayer; i++) {
            for (const player of players) {
              answerEvents.push({
                playerName: player.name,
                clueKey: `round1-incorrect-${i}-${player.name}`,
                result: 'incorrect',
                pointValue: 200,
                chronologicalOrder: chronoOrder++,
                categoryIndex: i % 6,
              })
            }
          }

          const data: RoundTrackingData = {
            players,
            startOfRoundScores,
            answerEvents,
            dailyDoubleFinderPlayer: null,
            cluesPerCategory: { 0: 5, 1: 5, 2: 5, 3: 5, 4: 5, 5: 5 },
          }

          const result = computeRoundResult(data)

          // roundLeader: null (all same score)
          expect(result.roundLeader).toBeNull()

          // mostIncorrectPlayer: first in players array (player-order tie-break)
          expect(result.mostIncorrectPlayer).toBe(players[0].name)

          // biggestEarnerPlayer: first in players array (player-order tie-break)
          expect(result.biggestEarnerPlayer).toBe(players[0].name)

          // highestSingleCluePlayer: one of the tied players
          const allNames = players.map(p => p.name)
          expect(allNames).toContain(result.highestSingleCluePlayer)

          // mostCorrectPlayer: one of the tied players
          expect(allNames).toContain(result.mostCorrectPlayer)

          // bottomFeederPlayer: one of the tied players (all same score)
          expect(allNames).toContain(result.bottomFeederPlayer)
        }
      ),
      { numRuns: 100 }
    )
  })
})
