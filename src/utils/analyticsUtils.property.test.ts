import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  computeScoreTimeline,
  computeCategoryAccuracy,
  enrichDailyDoubleRecords,
  computeBiggestComebacks,
  computeHeadToHead,
  ROUND_LABELS,
  type ScoreTimelinePoint,
} from './analyticsUtils'
import type {
  Player,
  NormalizedGame,
  ClueState,
  DailyDoubleRecord,
  RoundName,
} from '../types/game'

// ─── Generators ───────────────────────────────────────────────────────────────

/** Non-empty player name */
const playerNameArb = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((s) => s.trim().length > 0)

/** Arbitrary marking: correct, incorrect, or null */
const markingArb = fc.oneof(
  fc.constant('correct' as const),
  fc.constant('incorrect' as const),
  fc.constant(null),
)

/** Build a Player whose score is consistent with the given clueStates and game */
function buildConsistentPlayer(
  playerName: string,
  game: NormalizedGame,
  roundNames: RoundName[],
  clueStates: Record<string, ClueState>,
): Player {
  let score = 0
  let correctCount = 0
  let incorrectCount = 0

  for (const roundName of roundNames) {
    const categories = game.rounds[roundName as RoundName]
    if (!categories) continue
    for (let catIdx = 0; catIdx < categories.length; catIdx++) {
      for (let clueIdx = 0; clueIdx < categories[catIdx].clues.length; clueIdx++) {
        const key = `${roundName}-${catIdx}-${clueIdx}`
        const clue = categories[catIdx].clues[clueIdx]
        const marking = clueStates[key]?.playerMarkings[playerName]
        if (marking === 'correct') {
          score += clue.value
          correctCount++
        } else if (marking === 'incorrect') {
          score -= clue.value
          incorrectCount++
        }
      }
    }
  }

  return {
    name: playerName,
    score,
    correctCount,
    incorrectCount,
    correctDailyDoubles: 0,
    incorrectDailyDoubles: 0,
    correctFinalJeopardy: 0,
    incorrectFinalJeopardy: 0,
    totalEarned: 0,
  }
}

// ─── Property 1: Score timeline always begins at the origin ──────────────────

describe('Property 1: Score timeline always begins at { ordinal: 0, score: 0 }', () => {
  /**
   * **Validates: Requirements 5.1**
   *
   * For any valid GameSession and any player in that session,
   * computeScoreTimeline SHALL return a sequence whose first element is
   * { ordinal: 0, score: 0 }, regardless of how many clues were answered.
   */
  it('first point is always { ordinal: 0, score: 0 }', () => {
    fc.assert(
      fc.property(
        playerNameArb,
        fc.array(markingArb, { minLength: 0, maxLength: 6 }),
        (playerName, markings) => {
          const game: NormalizedGame = {
            rounds: {
              single: [
                {
                  category: 'Test',
                  clues: markings.map((_, i) => ({
                    value: (i + 1) * 200,
                    clue: `Q${i}`,
                    solution: `A${i}`,
                    dailyDouble: false,
                    html: false,
                  })),
                },
              ],
            },
            final: { category: 'Final', clue: '', solution: '', html: false },
            totalRounds: 1,
          }

          const clueStates: Record<string, ClueState> = {}
          for (let i = 0; i < markings.length; i++) {
            clueStates[`single-0-${i}`] = {
              chosen: true,
              playerMarkings: { [playerName]: markings[i] },
            }
          }

          const player = buildConsistentPlayer(playerName, game, ['single'], clueStates)
          const timeline = computeScoreTimeline(
            playerName,
            ['single'],
            game,
            clueStates,
            [player],
            [],
          )

          expect(timeline[0]).toEqual({ ordinal: 0, score: 0 })
        },
      ),
      { numRuns: 200 },
    )
  })
})

// ─── Property 2: Score timeline ordinals are strictly increasing ──────────────

describe('Property 2: Score timeline ordinals are strictly increasing', () => {
  /**
   * **Validates: Requirements 5.1**
   *
   * Every consecutive pair of points in the computed ScoreTimelinePoint[]
   * SHALL satisfy points[i+1].ordinal > points[i].ordinal.
   */
  it('every consecutive pair has strictly increasing ordinals', () => {
    fc.assert(
      fc.property(
        playerNameArb,
        fc.array(markingArb, { minLength: 1, maxLength: 10 }),
        (playerName, markings) => {
          const game: NormalizedGame = {
            rounds: {
              single: [
                {
                  category: 'Test',
                  clues: markings.map((_, i) => ({
                    value: (i + 1) * 200,
                    clue: `Q${i}`,
                    solution: `A${i}`,
                    dailyDouble: false,
                    html: false,
                  })),
                },
              ],
            },
            final: { category: 'Final', clue: '', solution: '', html: false },
            totalRounds: 1,
          }

          const clueStates: Record<string, ClueState> = {}
          for (let i = 0; i < markings.length; i++) {
            clueStates[`single-0-${i}`] = {
              chosen: true,
              playerMarkings: { [playerName]: markings[i] },
            }
          }

          const player = buildConsistentPlayer(playerName, game, ['single'], clueStates)
          const timeline = computeScoreTimeline(
            playerName,
            ['single'],
            game,
            clueStates,
            [player],
            [],
          )

          for (let i = 1; i < timeline.length; i++) {
            expect(timeline[i].ordinal).toBeGreaterThan(timeline[i - 1].ordinal)
          }
        },
      ),
      { numRuns: 200 },
    )
  })
})

// ─── Property 3: Timeline final score matches authoritative Player.score ──────

describe('Property 3: Timeline final score matches Player.score', () => {
  /**
   * **Validates: Requirements 5.1, 10.1**
   *
   * For any player whose Player.score is S, the last point in their
   * ScoreTimelinePoint[] SHALL have score === S.
   */
  it('last timeline point score matches Player.score', () => {
    fc.assert(
      fc.property(
        playerNameArb,
        fc.array(markingArb, { minLength: 1, maxLength: 10 }),
        (playerName, markings) => {
          const game: NormalizedGame = {
            rounds: {
              single: [
                {
                  category: 'Test',
                  clues: markings.map((_, i) => ({
                    value: (i + 1) * 200,
                    clue: `Q${i}`,
                    solution: `A${i}`,
                    dailyDouble: false,
                    html: false,
                  })),
                },
              ],
            },
            final: { category: 'Final', clue: '', solution: '', html: false },
            totalRounds: 1,
          }

          const clueStates: Record<string, ClueState> = {}
          for (let i = 0; i < markings.length; i++) {
            clueStates[`single-0-${i}`] = {
              chosen: true,
              playerMarkings: { [playerName]: markings[i] },
            }
          }

          const player = buildConsistentPlayer(playerName, game, ['single'], clueStates)
          const timeline = computeScoreTimeline(
            playerName,
            ['single'],
            game,
            clueStates,
            [player],
            [],
          )

          const lastPoint = timeline[timeline.length - 1] as ScoreTimelinePoint
          expect(lastPoint.score).toBe(player.score)
        },
      ),
      { numRuns: 200 },
    )
  })
})

// ─── Property 4: Category accuracy correct never exceeds total ────────────────

describe('Property 4: Category accuracy correct never exceeds total', () => {
  /**
   * **Validates: Requirements 4.1**
   *
   * For any player and any CategoryAccuracyRow returned by computeCategoryAccuracy,
   * the correct field SHALL be <= the total field.
   */
  it('correct <= total for every row', () => {
    fc.assert(
      fc.property(
        playerNameArb,
        fc.array(markingArb, { minLength: 1, maxLength: 10 }),
        (playerName, markings) => {
          const game: NormalizedGame = {
            rounds: {
              single: [
                {
                  category: 'Cat A',
                  clues: markings.map((_, i) => ({
                    value: (i + 1) * 200,
                    clue: `Q${i}`,
                    solution: `A${i}`,
                    dailyDouble: false,
                    html: false,
                  })),
                },
              ],
            },
            final: { category: 'Final', clue: '', solution: '', html: false },
            totalRounds: 1,
          }

          const clueStates: Record<string, ClueState> = {}
          for (let i = 0; i < markings.length; i++) {
            clueStates[`single-0-${i}`] = {
              chosen: true,
              playerMarkings: { [playerName]: markings[i] },
            }
          }

          const player = buildConsistentPlayer(playerName, game, ['single'], clueStates)
          const rows = computeCategoryAccuracy(
            playerName,
            ['single'],
            game,
            clueStates,
            false,
            player,
          )

          for (const row of rows) {
            expect(row.correct).toBeLessThanOrEqual(row.total)
          }
        },
      ),
      { numRuns: 200 },
    )
  })
})

// ─── Property 5: Category accuracy omits categories with no answered clues ───

describe('Property 5: Category accuracy omits categories with total === 0', () => {
  /**
   * **Validates: Requirements 4.3**
   *
   * computeCategoryAccuracy SHALL return no row where total === 0.
   * Every returned row has at least one non-null player marking.
   */
  it('no row has total === 0', () => {
    fc.assert(
      fc.property(
        playerNameArb,
        fc.array(markingArb, { minLength: 0, maxLength: 10 }),
        (playerName, markings) => {
          const game: NormalizedGame = {
            rounds: {
              single: [
                {
                  category: 'Cat A',
                  clues: markings.map((_, i) => ({
                    value: (i + 1) * 200,
                    clue: `Q${i}`,
                    solution: `A${i}`,
                    dailyDouble: false,
                    html: false,
                  })),
                },
              ],
            },
            final: { category: 'Final', clue: '', solution: '', html: false },
            totalRounds: 1,
          }

          const clueStates: Record<string, ClueState> = {}
          for (let i = 0; i < markings.length; i++) {
            clueStates[`single-0-${i}`] = {
              chosen: true,
              playerMarkings: { [playerName]: markings[i] },
            }
          }

          const player = buildConsistentPlayer(playerName, game, ['single'], clueStates)
          const rows = computeCategoryAccuracy(
            playerName,
            ['single'],
            game,
            clueStates,
            false,
            player,
          )

          for (const row of rows) {
            expect(row.total).toBeGreaterThan(0)
          }
        },
      ),
      { numRuns: 200 },
    )
  })
})

// ─── Property 6: Enriched DD records length is preserved ─────────────────────

describe('Property 6: Enriched DD records length equals input length', () => {
  /**
   * **Validates: Requirements 6.2**
   *
   * For any session with n DailyDoubleRecord entries, enrichDailyDoubleRecords
   * SHALL return exactly n EnrichedDDRecord entries.
   */
  it('output length equals input length', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            roundName: fc.constantFrom<RoundName>('single', 'double'),
            catIdx: fc.integer({ min: 0, max: 1 }),
            clueIdx: fc.integer({ min: 0, max: 2 }),
            playerName: playerNameArb,
            wager: fc.integer({ min: 0, max: 10000 }),
            outcome: fc.constantFrom<'correct' | 'incorrect'>('correct', 'incorrect'),
          }),
          { minLength: 0, maxLength: 10 },
        ),
        (ddInputs) => {
          // Build a game that covers all the referenced indices
          const maxCatIdx = Math.max(0, ...ddInputs.map((d) => d.catIdx))
          const maxClueIdx = Math.max(0, ...ddInputs.map((d) => d.clueIdx))

          const makeCats = (roundName: RoundName) =>
            Array.from({ length: maxCatIdx + 1 }, (_, catIdx) => ({
              category: `Cat-${roundName}-${catIdx}`,
              clues: Array.from({ length: maxClueIdx + 1 }, (_, clueIdx) => ({
                value: (clueIdx + 1) * 200,
                clue: `Q`,
                solution: `A`,
                dailyDouble: true,
                html: false as const,
              })),
            }))

          const game: NormalizedGame = {
            rounds: {
              single: makeCats('single'),
              double: makeCats('double'),
            },
            final: { category: 'Final', clue: '', solution: '', html: false },
            totalRounds: 2,
          }

          const records: DailyDoubleRecord[] = ddInputs.map((d) => ({
            clueKey: `${d.roundName}-${d.catIdx}-${d.clueIdx}`,
            playerName: d.playerName,
            wager: d.wager,
            outcome: d.outcome,
          }))

          const enriched = enrichDailyDoubleRecords(records, game, ['single', 'double'])

          expect(enriched).toHaveLength(records.length)
        },
      ),
      { numRuns: 200 },
    )
  })
})

// ─── Property 7: DD net impact sign matches outcome ───────────────────────────

describe('Property 7: DD net impact sign matches outcome', () => {
  /**
   * **Validates: Requirements 6.4**
   *
   * For any enriched Daily Double record where wager > 0:
   * - netImpact > 0 when outcome === 'correct'
   * - netImpact < 0 when outcome === 'incorrect'
   */
  it('netImpact is positive for correct and negative for incorrect when wager > 0', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),
        fc.constantFrom<'correct' | 'incorrect'>('correct', 'incorrect'),
        playerNameArb,
        (wager, outcome, playerName) => {
          const game: NormalizedGame = {
            rounds: {
              single: [
                {
                  category: 'DD Cat',
                  clues: [
                    {
                      value: 400,
                      clue: 'Q',
                      solution: 'A',
                      dailyDouble: true,
                      html: false,
                    },
                  ],
                },
              ],
            },
            final: { category: 'Final', clue: '', solution: '', html: false },
            totalRounds: 1,
          }

          const records: DailyDoubleRecord[] = [
            {
              clueKey: 'single-0-0',
              playerName,
              wager,
              outcome,
            },
          ]

          const [enriched] = enrichDailyDoubleRecords(records, game, ['single'])

          if (outcome === 'correct') {
            expect(enriched.netImpact).toBeGreaterThan(0)
          } else {
            expect(enriched.netImpact).toBeLessThan(0)
          }
        },
      ),
      { numRuns: 200 },
    )
  })
})

// ─── Property 8: Biggest comeback delta is non-negative ──────────────────────

describe('Property 8: Biggest comeback delta is non-negative', () => {
  /**
   * **Validates: Requirements 7.1, 7.2**
   *
   * computeBiggestComebacks SHALL produce a delta value of
   * Math.max(0, finalScore - lowestScore) >= 0 for every player.
   */
  it('delta is always >= 0', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.array(
            fc.integer({ min: -10000, max: 10000 }),
            { minLength: 1, maxLength: 10 },
          ),
          { minLength: 1, maxLength: 5 },
        ),
        (playerScoreArrays) => {
          // Build timelines from raw score arrays (each element is a cumulative score)
          const timelines = new Map<string, ScoreTimelinePoint[]>()

          playerScoreArrays.forEach((scores, idx) => {
            const playerName = `Player${idx}`
            const points: ScoreTimelinePoint[] = [{ ordinal: 0, score: 0 }]
            scores.forEach((score, i) => {
              points.push({ ordinal: i + 1, score })
            })
            timelines.set(playerName, points)
          })

          const comebacks = computeBiggestComebacks(timelines)

          for (const cb of comebacks) {
            expect(cb.delta).toBeGreaterThanOrEqual(0)
          }
        },
      ),
      { numRuns: 200 },
    )
  })
})

// ─── Property 9: Head-to-head count equals n*(n-1)/2 ─────────────────────────

describe('Property 9: Head-to-head count equals n*(n-1)/2', () => {
  /**
   * **Validates: Requirements 8.3**
   *
   * For any array of n >= 2 players, computeHeadToHead SHALL return exactly
   * n * (n - 1) / 2 HeadToHeadResult entries.
   */
  it('result count equals n*(n-1)/2', () => {
    fc.assert(
      fc.property(
        fc
          .array(playerNameArb, { minLength: 2, maxLength: 6 })
          .chain((names) => {
            // Deduplicate names to ensure all players are distinct
            const unique = [...new Set(names)]
            if (unique.length < 2) return fc.constant(null)

            const players: Player[] = unique.map((name) => ({
              name,
              score: 0,
              correctCount: 0,
              incorrectCount: 0,
              correctDailyDoubles: 0,
              incorrectDailyDoubles: 0,
              correctFinalJeopardy: 0,
              incorrectFinalJeopardy: 0,
              totalEarned: 0,
            }))
            return fc.constant(players)
          }),
        (players) => {
          if (players === null) return // skip if deduplication left < 2 players

          const n = players.length
          const expected = (n * (n - 1)) / 2

          const results = computeHeadToHead(players, [])

          expect(results).toHaveLength(expected)
        },
      ),
      { numRuns: 200 },
    )
  })
})

// ─── Property 10: Head-to-head player names are alphabetically ordered ────────

describe('Property 10: Head-to-head playerA comes before playerB alphabetically', () => {
  /**
   * **Validates: Requirements 8.3**
   *
   * For any HeadToHeadResult, playerA SHALL come before playerB in
   * lexicographic order (playerA.localeCompare(playerB) < 0).
   */
  it('playerA.localeCompare(playerB) < 0 for every result', () => {
    fc.assert(
      fc.property(
        fc
          .array(playerNameArb, { minLength: 2, maxLength: 6 })
          .chain((names) => {
            const unique = [...new Set(names)]
            if (unique.length < 2) return fc.constant(null)

            const players: Player[] = unique.map((name) => ({
              name,
              score: 0,
              correctCount: 0,
              incorrectCount: 0,
              correctDailyDoubles: 0,
              incorrectDailyDoubles: 0,
              correctFinalJeopardy: 0,
              incorrectFinalJeopardy: 0,
              totalEarned: 0,
            }))
            return fc.constant(players)
          }),
        (players) => {
          if (players === null) return // skip if deduplication left < 2

          const results = computeHeadToHead(players, [])

          for (const result of results) {
            expect(result.playerA.localeCompare(result.playerB)).toBeLessThan(0)
          }
        },
      ),
      { numRuns: 200 },
    )
  })
})

// ─── Sanity: ROUND_LABELS covers all RoundName values ────────────────────────

describe('ROUND_LABELS covers all RoundName values', () => {
  it('every RoundName has a display label', () => {
    const roundNames: RoundName[] = [
      'single',
      'double',
      'triple',
      'quadruple',
      'quintuple',
      'sextuple',
    ]
    for (const name of roundNames) {
      expect(ROUND_LABELS[name]).toBeTruthy()
    }
  })
})
