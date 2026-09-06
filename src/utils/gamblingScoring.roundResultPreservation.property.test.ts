import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { computeRoundResult } from './gamblingScoring'
import type { RoundResult } from './gamblingScoring'
import type { Player, ClueAnswerEvent, RoundTrackingData } from '../types/game'

/**
 * Preservation tests for spec `betting-submission-fixes`.
 *
 * Property 5: Preservation - All Other Round Result Fields Unchanged.
 *
 * The reference implementation below is a pinned copy of `computeRoundResult`
 * and every helper as they exist BEFORE the fix, so the fixed output can be
 * diffed field by field without depending on git history. Fix 1 only touches
 * `computeHighestSingleCluePlayer`; the other ten fields must stay identical,
 * and `highestSingleCluePlayer` itself must stay identical whenever every
 * correct event's credited points equal its raw `pointValue` (the complement
 * of bug condition `C_resolution`).
 *
 * These tests MUST PASS on unfixed code.
 *
 * NOTE: `earnedPoints` does not exist on `ClueAnswerEvent` yet (task 8.1 adds
 * it), so the intended shape is declared locally as
 * `ClueAnswerEventWithEarned`. No source file is modified.
 */

type ClueAnswerEventWithEarned = ClueAnswerEvent & {
  /** Points actually credited, including the category-ownership multiplier */
  earnedPoints?: number
}

/** The ten fields Fix 1 must leave completely alone */
const PRESERVED_FIELDS = [
  'roundLeader',
  'dailyDoubleFinderPlayer',
  'mostIncorrectPlayer',
  'sweepCategoryPlayer',
  'zeroScoreRoundPlayers',
  'noWrongAnswersPlayers',
  'mostCorrectPlayer',
  'firstIncorrectPlayer',
  'biggestEarnerPlayer',
  'bottomFeederPlayer',
] as const

function pickPreserved(result: RoundResult): Omit<RoundResult, 'highestSingleCluePlayer'> {
  const picked = {} as Record<string, unknown>
  for (const field of PRESERVED_FIELDS) {
    picked[field] = result[field]
  }
  return picked as Omit<RoundResult, 'highestSingleCluePlayer'>
}

// ─── Pinned reference implementation (pre-fix behavior) ───────────────────────

function computeRoundResult_original(data: RoundTrackingData): RoundResult {
  const { players, startOfRoundScores, answerEvents, dailyDoubleFinderPlayer, cluesPerCategory } = data

  return {
    roundLeader: computeRoundLeader_original(players),
    dailyDoubleFinderPlayer,
    mostIncorrectPlayer: computeMostIncorrectPlayer_original(players, answerEvents),
    sweepCategoryPlayer: computeSweepCategoryPlayer_original(answerEvents, cluesPerCategory),
    zeroScoreRoundPlayers: computeZeroScoreRoundPlayers_original(players, startOfRoundScores),
    noWrongAnswersPlayers: computeNoWrongAnswersPlayers_original(players, answerEvents),
    highestSingleCluePlayer: computeHighestSingleCluePlayer_original(answerEvents),
    mostCorrectPlayer: computeMostCorrectPlayer_original(answerEvents),
    firstIncorrectPlayer: computeFirstIncorrectPlayer_original(answerEvents),
    biggestEarnerPlayer: computeBiggestEarnerPlayer_original(players, answerEvents),
    bottomFeederPlayer: computeBottomFeederPlayer_original(players),
  }
}

function computeRoundLeader_original(players: Player[]): string | null {
  if (players.length === 0) return null

  let maxScore = -Infinity
  let leader: string | null = null
  let tied = false

  for (const player of players) {
    if (player.score > maxScore) {
      maxScore = player.score
      leader = player.name
      tied = false
    } else if (player.score === maxScore) {
      tied = true
    }
  }

  return tied ? null : leader
}

function computeMostIncorrectPlayer_original(
  players: Player[],
  answerEvents: ClueAnswerEvent[],
): string | null {
  const incorrectEvents = answerEvents.filter((e) => e.result === 'incorrect')
  if (incorrectEvents.length === 0) return null

  const counts: Record<string, number> = {}
  for (const event of incorrectEvents) {
    counts[event.playerName] = (counts[event.playerName] ?? 0) + 1
  }

  let maxCount = 0
  for (const count of Object.values(counts)) {
    if (count > maxCount) maxCount = count
  }

  for (const player of players) {
    if ((counts[player.name] ?? 0) === maxCount) {
      return player.name
    }
  }

  return null
}

function computeSweepCategoryPlayer_original(
  answerEvents: ClueAnswerEvent[],
  cluesPerCategory: Record<number, number>,
): string | null {
  const correctEvents = answerEvents.filter((e) => e.result === 'correct')

  const categoryPlayerCounts: Record<number, Record<string, { count: number; maxOrder: number }>> = {}
  for (const event of correctEvents) {
    const catIdx = event.categoryIndex
    if (!categoryPlayerCounts[catIdx]) {
      categoryPlayerCounts[catIdx] = {}
    }
    const playerData = categoryPlayerCounts[catIdx][event.playerName]
    if (!playerData) {
      categoryPlayerCounts[catIdx][event.playerName] = { count: 1, maxOrder: event.chronologicalOrder }
    } else {
      playerData.count += 1
      if (event.chronologicalOrder > playerData.maxOrder) {
        playerData.maxOrder = event.chronologicalOrder
      }
    }
  }

  let bestSweeper: string | null = null
  let bestCompletionOrder = Infinity

  for (const catIdxStr of Object.keys(categoryPlayerCounts)) {
    const catIdx = Number(catIdxStr)
    const requiredClues = cluesPerCategory[catIdx]
    if (requiredClues === undefined || requiredClues <= 0) continue

    const playersInCat = categoryPlayerCounts[catIdx]
    for (const [playerName, data] of Object.entries(playersInCat)) {
      if (data.count >= requiredClues) {
        if (data.maxOrder < bestCompletionOrder) {
          bestCompletionOrder = data.maxOrder
          bestSweeper = playerName
        }
      }
    }
  }

  return bestSweeper
}

function computeZeroScoreRoundPlayers_original(
  players: Player[],
  startOfRoundScores: Record<string, number>,
): string[] {
  return players
    .filter((player) => {
      const startScore = startOfRoundScores[player.name] ?? 0
      const scoreDelta = player.score - startScore
      return scoreDelta <= 0
    })
    .map((player) => player.name)
}

function computeNoWrongAnswersPlayers_original(
  players: Player[],
  answerEvents: ClueAnswerEvent[],
): string[] {
  const playersWithIncorrect = new Set<string>()
  for (const event of answerEvents) {
    if (event.result === 'incorrect') {
      playersWithIncorrect.add(event.playerName)
    }
  }

  return players
    .filter((player) => !playersWithIncorrect.has(player.name))
    .map((player) => player.name)
}

/** Pre-fix resolution: compares the RAW `pointValue`, implicit array-order tie-break */
function computeHighestSingleCluePlayer_original(answerEvents: ClueAnswerEvent[]): string | null {
  const correctEvents = answerEvents.filter((e) => e.result === 'correct')
  if (correctEvents.length === 0) return null

  let maxValue = -Infinity
  let player: string | null = null

  for (const event of correctEvents) {
    if (event.pointValue > maxValue) {
      maxValue = event.pointValue
      player = event.playerName
    }
  }

  return player
}

function computeMostCorrectPlayer_original(answerEvents: ClueAnswerEvent[]): string | null {
  const correctEvents = answerEvents.filter((e) => e.result === 'correct')
  if (correctEvents.length === 0) return null

  const counts: Record<string, number> = {}
  for (const event of correctEvents) {
    counts[event.playerName] = (counts[event.playerName] ?? 0) + 1
  }

  let maxCount = 0
  let player: string | null = null
  for (const [name, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count
      player = name
    }
  }

  return player
}

function computeFirstIncorrectPlayer_original(answerEvents: ClueAnswerEvent[]): string | null {
  const incorrectEvents = answerEvents.filter((e) => e.result === 'incorrect')
  if (incorrectEvents.length === 0) return null

  let minOrder = Infinity
  let player: string | null = null

  for (const event of incorrectEvents) {
    if (event.chronologicalOrder < minOrder) {
      minOrder = event.chronologicalOrder
      player = event.playerName
    }
  }

  return player
}

/** Pre-fix earnings: sums the RAW `pointValue` (Req 3.2 keeps this unchanged) */
function computeBiggestEarnerPlayer_original(
  players: Player[],
  answerEvents: ClueAnswerEvent[],
): string | null {
  const correctEvents = answerEvents.filter((e) => e.result === 'correct')
  if (correctEvents.length === 0) return null

  const sums: Record<string, number> = {}
  for (const event of correctEvents) {
    sums[event.playerName] = (sums[event.playerName] ?? 0) + event.pointValue
  }

  let maxSum = 0
  for (const sum of Object.values(sums)) {
    if (sum > maxSum) maxSum = sum
  }

  for (const player of players) {
    if ((sums[player.name] ?? 0) === maxSum) {
      return player.name
    }
  }

  return null
}

function computeBottomFeederPlayer_original(players: Player[]): string | null {
  if (players.length === 0) return null

  let minScore = Infinity
  let player: string | null = null

  for (const p of players) {
    if (p.score < minScore) {
      minScore = p.score
      player = p.name
    }
  }

  return player
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const PLAYER_POOL = ['Alice', 'Bob', 'Carol', 'Dave']

function makePlayer(name: string, score = 0): Player {
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

function credited(event: ClueAnswerEventWithEarned): number {
  return event.earnedPoints ?? event.pointValue
}

/** True when the round is OUTSIDE bug condition `C_resolution` */
function creditedEqualsRawEverywhere(events: ClueAnswerEventWithEarned[]): boolean {
  return events
    .filter((e) => e.result === 'correct')
    .every((e) => credited(e) === e.pointValue)
}

// ─── Generators ──────────────────────────────────────────────────────────────

type EventDraft = {
  playerName: string
  result: 'correct' | 'incorrect'
  pointValue: number
  earned: 'same' | 'double' | 'absent' | number
  categoryIndex: number
}

const scoreArb = fc.integer({ min: -20, max: 50 }).map((n) => n * 100)

const playersArb = fc
  .uniqueArray(
    fc.record({ name: fc.constantFrom(...PLAYER_POOL), score: scoreArb }),
    { selector: (p) => p.name, minLength: 0, maxLength: 4 },
  )
  .map((list) => list.map((p) => makePlayer(p.name, p.score)))

/** Credited points may match, double, be unrelated, or be absent entirely */
const eventDraftArb = fc.record({
  playerName: fc.constantFrom(...PLAYER_POOL),
  result: fc.constantFrom<'correct' | 'incorrect'>('correct', 'incorrect'),
  pointValue: fc.integer({ min: 1, max: 10 }).map((n) => n * 200),
  earned: fc.oneof(
    fc.constant<'same'>('same'),
    fc.constant<'double'>('double'),
    fc.constant<'absent'>('absent'),
    fc.integer({ min: 1, max: 20 }).map((n) => n * 100),
  ),
  categoryIndex: fc.integer({ min: 0, max: 5 }),
})

/** Credited points always equal the raw face value — outside `C_resolution` */
const nonDivergentEventDraftArb = fc.record({
  playerName: fc.constantFrom(...PLAYER_POOL),
  result: fc.constantFrom<'correct' | 'incorrect'>('correct', 'incorrect'),
  pointValue: fc.integer({ min: 1, max: 10 }).map((n) => n * 200),
  earned: fc.constantFrom<'same' | 'absent'>('same', 'absent'),
  categoryIndex: fc.integer({ min: 0, max: 5 }),
})

function buildEvents(drafts: EventDraft[], rotation: number): ClueAnswerEventWithEarned[] {
  const events: ClueAnswerEventWithEarned[] = drafts.map((draft, index) => {
    const base: ClueAnswerEventWithEarned = {
      playerName: draft.playerName,
      clueKey: `round1-${draft.categoryIndex}-${index}`,
      result: draft.result,
      pointValue: draft.pointValue,
      chronologicalOrder: index,
      categoryIndex: draft.categoryIndex,
    }
    if (draft.earned === 'absent') return base
    if (draft.earned === 'same') return { ...base, earnedPoints: draft.pointValue }
    if (draft.earned === 'double') return { ...base, earnedPoints: draft.pointValue * 2 }
    return { ...base, earnedPoints: draft.earned }
  })

  if (events.length === 0) return events
  const offset = rotation % events.length
  return [...events.slice(offset), ...events.slice(0, offset)]
}

/** Array order may diverge from chronological order (as after a re-marking) */
const eventsArb = fc
  .tuple(fc.array(eventDraftArb, { minLength: 0, maxLength: 12 }), fc.nat({ max: 20 }))
  .map(([drafts, rotation]) => buildEvents(drafts as EventDraft[], rotation))

/**
 * Events outside `C_resolution`, kept in chronological order — the documented
 * invariant for `RoundTrackingData.answerEvents`.
 */
const nonDivergentEventsArb = fc
  .array(nonDivergentEventDraftArb, { minLength: 0, maxLength: 12 })
  .map((drafts) => buildEvents(drafts as EventDraft[], 0))

const cluesPerCategoryArb = fc
  .dictionary(fc.constantFrom('0', '1', '2', '3', '4', '5'), fc.integer({ min: 0, max: 4 }))
  .map((dict) => dict as unknown as Record<number, number>)

function trackingArbFrom(
  events: fc.Arbitrary<ClueAnswerEventWithEarned[]>,
): fc.Arbitrary<RoundTrackingData> {
  return playersArb.chain((players) =>
    fc
      .record({
        events,
        startOffsets: fc.array(scoreArb, { minLength: players.length, maxLength: players.length }),
        omitStart: fc.array(fc.boolean(), { minLength: players.length, maxLength: players.length }),
        dailyDoubleFinderPlayer: fc.oneof(fc.constant(null), fc.constantFrom(...PLAYER_POOL)),
        cluesPerCategory: cluesPerCategoryArb,
      })
      .map(({ events: answerEvents, startOffsets, omitStart, dailyDoubleFinderPlayer, cluesPerCategory }) => {
        const startOfRoundScores: Record<string, number> = {}
        players.forEach((player, index) => {
          // Some players legitimately have no start-of-round entry (joined mid-game)
          if (!omitStart[index]) {
            startOfRoundScores[player.name] = player.score - startOffsets[index]
          }
        })
        return {
          players,
          startOfRoundScores,
          answerEvents,
          dailyDoubleFinderPlayer,
          cluesPerCategory,
        } satisfies RoundTrackingData
      }),
  )
}

const trackingArb = trackingArbFrom(eventsArb)
const nonDivergentTrackingArb = trackingArbFrom(nonDivergentEventsArb)

// ─── Property 5: Preservation ────────────────────────────────────────────────

describe('Feature: betting-submission-fixes, Property 5: Preservation - All Other Round Result Fields Unchanged', () => {
  /**
   * **Validates: Requirements 3.2, 3.3, 3.4, 3.5**
   */

  it('all ten non-highest_single_clue fields match the pinned reference field for field', () => {
    fc.assert(
      fc.property(trackingArb, (data) => {
        const actual = computeRoundResult(data)
        const reference = computeRoundResult_original(data)
        expect(pickPreserved(actual)).toEqual(pickPreserved(reference))
      }),
      { numRuns: 400 },
    )
  })

  it('biggestEarnerPlayer keeps summing raw pointValue even when credited points diverge', () => {
    fc.assert(
      fc.property(trackingArb, (data) => {
        const events = data.answerEvents as ClueAnswerEventWithEarned[]
        const correct = events.filter((e) => e.result === 'correct')

        let expected: string | null = null
        if (correct.length > 0) {
          const sums: Record<string, number> = {}
          for (const event of correct) {
            sums[event.playerName] = (sums[event.playerName] ?? 0) + event.pointValue
          }
          let maxSum = 0
          for (const sum of Object.values(sums)) {
            if (sum > maxSum) maxSum = sum
          }
          for (const player of data.players) {
            if ((sums[player.name] ?? 0) === maxSum) {
              expected = player.name
              break
            }
          }
        }

        expect(computeRoundResult(data).biggestEarnerPlayer).toBe(expected)
      }),
      { numRuns: 300 },
    )
  })

  it('dailyDoubleFinderPlayer passes through untouched (Req 3.3)', () => {
    fc.assert(
      fc.property(trackingArb, (data) => {
        expect(computeRoundResult(data).dailyDoubleFinderPlayer).toBe(data.dailyDoubleFinderPlayer)
      }),
      { numRuns: 200 },
    )
  })

  it('highestSingleCluePlayer matches the reference whenever credited points equal raw pointValue', () => {
    fc.assert(
      fc.property(nonDivergentTrackingArb, (data) => {
        const events = data.answerEvents as ClueAnswerEventWithEarned[]
        // Precondition: outside bug condition C_resolution
        expect(creditedEqualsRawEverywhere(events)).toBe(true)

        const actual = computeRoundResult(data)
        const reference = computeRoundResult_original(data)
        expect(actual.highestSingleCluePlayer).toBe(reference.highestSingleCluePlayer)
      }),
      { numRuns: 400 },
    )
  })

  it('the entire RoundResult matches the reference outside the bug condition', () => {
    fc.assert(
      fc.property(nonDivergentTrackingArb, (data) => {
        expect(computeRoundResult(data)).toEqual(computeRoundResult_original(data))
      }),
      { numRuns: 300 },
    )
  })
})

// ─── Boundary cases ──────────────────────────────────────────────────────────

describe('Feature: betting-submission-fixes, Property 5 boundary cases', () => {
  /**
   * **Validates: Requirements 3.2, 3.3, 3.4, 3.5**
   */

  function tracking(
    players: Player[],
    events: ClueAnswerEventWithEarned[],
    overrides: Partial<RoundTrackingData> = {},
  ): RoundTrackingData {
    return {
      players,
      startOfRoundScores: Object.fromEntries(players.map((p) => [p.name, 0])),
      answerEvents: events,
      dailyDoubleFinderPlayer: null,
      cluesPerCategory: {},
      ...overrides,
    }
  }

  function event(
    partial: Partial<ClueAnswerEventWithEarned> & { playerName: string },
  ): ClueAnswerEventWithEarned {
    return {
      clueKey: 'round1-0-0',
      result: 'correct',
      pointValue: 400,
      chronologicalOrder: 0,
      categoryIndex: 0,
      ...partial,
    }
  }

  it('no events: every field matches the reference', () => {
    const data = tracking([makePlayer('Alice', 800), makePlayer('Bob', 200)], [])
    expect(computeRoundResult(data)).toEqual(computeRoundResult_original(data))
    expect(computeRoundResult(data).highestSingleCluePlayer).toBeNull()
  })

  it('only incorrect events: highestSingleCluePlayer is null and firstIncorrectPlayer is preserved', () => {
    const events = [
      event({ playerName: 'Bob', result: 'incorrect', chronologicalOrder: 1, pointValue: 600 }),
      event({ playerName: 'Alice', result: 'incorrect', chronologicalOrder: 0, pointValue: 400 }),
    ]
    const data = tracking([makePlayer('Alice'), makePlayer('Bob')], events)
    const actual = computeRoundResult(data)
    expect(actual).toEqual(computeRoundResult_original(data))
    expect(actual.highestSingleCluePlayer).toBeNull()
    expect(actual.firstIncorrectPlayer).toBe('Alice')
  })

  it('single correct event: every field matches the reference', () => {
    const events = [event({ playerName: 'Carol', pointValue: 800, earnedPoints: 800 })]
    const data = tracking([makePlayer('Carol', 800), makePlayer('Dave')], events)
    const actual = computeRoundResult(data)
    expect(actual).toEqual(computeRoundResult_original(data))
    expect(actual.highestSingleCluePlayer).toBe('Carol')
  })

  it('exact tie on chronologicalOrder: resolution is stable and matches the reference', () => {
    const events = [
      event({ playerName: 'Alice', pointValue: 600, earnedPoints: 600, chronologicalOrder: 3 }),
      event({
        playerName: 'Bob',
        pointValue: 600,
        earnedPoints: 600,
        chronologicalOrder: 3,
        categoryIndex: 1,
        clueKey: 'round1-1-1',
      }),
    ]
    const data = tracking([makePlayer('Alice'), makePlayer('Bob')], events)
    const actual = computeRoundResult(data)
    expect(actual).toEqual(computeRoundResult_original(data))
    expect(actual.highestSingleCluePlayer).toBe('Alice')
  })

  it('event with earnedPoints absent: resolution falls back to pointValue', () => {
    const events = [
      event({ playerName: 'Alice', pointValue: 400 }),
      event({
        playerName: 'Bob',
        pointValue: 1000,
        chronologicalOrder: 1,
        categoryIndex: 1,
        clueKey: 'round1-1-1',
      }),
    ]
    const data = tracking([makePlayer('Alice'), makePlayer('Bob')], events)
    const actual = computeRoundResult(data)
    expect(actual).toEqual(computeRoundResult_original(data))
    expect(actual.highestSingleCluePlayer).toBe('Bob')
  })

  it('sweep and zero-score fields are preserved with a populated cluesPerCategory', () => {
    const events = [
      event({ playerName: 'Alice', pointValue: 200, chronologicalOrder: 0, categoryIndex: 0 }),
      event({
        playerName: 'Alice',
        pointValue: 400,
        chronologicalOrder: 1,
        categoryIndex: 0,
        clueKey: 'round1-0-1',
      }),
      event({
        playerName: 'Bob',
        result: 'incorrect',
        pointValue: 400,
        chronologicalOrder: 2,
        categoryIndex: 1,
        clueKey: 'round1-1-2',
      }),
    ]
    const players = [makePlayer('Alice', 600), makePlayer('Bob', -400)]
    const data = tracking(players, events, {
      startOfRoundScores: { Alice: 0, Bob: 0 },
      cluesPerCategory: { 0: 2, 1: 2 },
    })
    const actual = computeRoundResult(data)
    expect(actual).toEqual(computeRoundResult_original(data))
    expect(actual.sweepCategoryPlayer).toBe('Alice')
    expect(actual.zeroScoreRoundPlayers).toEqual(['Bob'])
    expect(actual.noWrongAnswersPlayers).toEqual(['Alice'])
  })
})
