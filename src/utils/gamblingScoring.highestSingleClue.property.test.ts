import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { computeRoundResult } from './gamblingScoring'
import type { Player, ClueAnswerEvent, RoundTrackingData } from '../types/game'

/**
 * Bug condition exploration test for spec `betting-submission-fixes`.
 *
 * Bug Condition `C_resolution`: a round is scored where at least one correct
 * answer credited more points than its raw `pointValue` (a category owner
 * answering correctly in Gambling Problem mode banks 2x the face value).
 * `computeHighestSingleCluePlayer` ranks on the raw `pointValue`, so it can
 * name a player who earned strictly fewer points.
 *
 * These tests encode the EXPECTED behavior and are expected to FAIL on the
 * unfixed implementation. Tasks 8.1/8.2 add `earnedPoints` to
 * `ClueAnswerEvent` and make resolution compare on it.
 *
 * NOTE: `earnedPoints` does not exist on `ClueAnswerEvent` yet (task 8.1 adds
 * it), so this file declares the intended shape locally as
 * `ClueAnswerEventWithEarned` and passes those events through where
 * `ClueAnswerEvent[]` is expected. No source file is modified.
 */

// ─── Intended event shape (task 8.1 will add `earnedPoints` to the real type) ──

type ClueAnswerEventWithEarned = ClueAnswerEvent & {
  /** Points actually credited, including the category-ownership multiplier */
  earnedPoints?: number
}

/** Credited points for an event, falling back to raw face value when absent */
function credited(event: ClueAnswerEventWithEarned): number {
  return event.earnedPoints ?? event.pointValue
}

/**
 * Expected `highestSingleCluePlayer`: greatest credited points among correct
 * events, ties broken by the lowest `chronologicalOrder`, null when there are
 * no correct events.
 */
function expectedHighestSingleCluePlayer(
  events: ClueAnswerEventWithEarned[],
): string | null {
  const correct = events.filter((e) => e.result === 'correct')
  if (correct.length === 0) return null

  let best = correct[0]
  for (const event of correct.slice(1)) {
    const value = credited(event)
    const bestValue = credited(best)
    if (value > bestValue) {
      best = event
    } else if (value === bestValue && event.chronologicalOrder < best.chronologicalOrder) {
      best = event
    }
  }
  return best.playerName
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

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

function makeTrackingData(events: ClueAnswerEventWithEarned[]): RoundTrackingData {
  const names = [...new Set(events.map((e) => e.playerName))]
  const players = names.map((name) => makePlayer(name))
  return {
    players,
    startOfRoundScores: Object.fromEntries(players.map((p) => [p.name, 0])),
    answerEvents: events,
    dailyDoubleFinderPlayer: null,
    // Deliberately empty so sweep detection cannot interfere
    cluesPerCategory: {},
  }
}

// ─── Generators ──────────────────────────────────────────────────────────────

const PLAYER_POOL = ['Alice', 'Bob', 'Carol', 'Dave']

/**
 * An event where `earnedPoints` and `pointValue` vary independently: the
 * credited amount may equal the face value (gambling mode off), be the
 * ownership double, be an arbitrary unrelated amount, or be absent entirely.
 */
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

type EventDraft = {
  playerName: string
  result: 'correct' | 'incorrect'
  pointValue: number
  earned: 'same' | 'double' | 'absent' | number
  categoryIndex: number
}

/**
 * Build events from drafts. `chronologicalOrder` is assigned in generation
 * order, then the array is rotated by `rotation` so array order and
 * chronological order can diverge — exactly what happens after a re-marking.
 */
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

const eventsArb = fc
  .tuple(
    fc.array(eventDraftArb, { minLength: 0, maxLength: 12 }),
    fc.nat({ max: 20 }),
  )
  .map(([drafts, rotation]) => buildEvents(drafts as EventDraft[], rotation))

// ─── Property 1: Bug Condition ───────────────────────────────────────────────

describe('Feature: betting-submission-fixes, Property 1: Bug Condition - Highest Single Clue Resolves On Credited Points', () => {
  /**
   * **Validates: Requirements 1.2, 2.2, 3.4, 3.5**
   */

  it('pinned counterexample: category owner banking $800 on a $400 clue beats a $600 raw answer', () => {
    // Alice owns the category, so her $400 clue credited $800.
    // Bob answered a $600 clue in an unowned category, crediting $600.
    const events: ClueAnswerEventWithEarned[] = [
      {
        playerName: 'Alice',
        clueKey: 'round1-0-0',
        result: 'correct',
        pointValue: 400,
        earnedPoints: 800,
        chronologicalOrder: 0,
        categoryIndex: 0,
      },
      {
        playerName: 'Bob',
        clueKey: 'round1-1-1',
        result: 'correct',
        pointValue: 600,
        earnedPoints: 600,
        chronologicalOrder: 1,
        categoryIndex: 1,
      },
    ]

    const result = computeRoundResult(makeTrackingData(events))
    expect(result.highestSingleCluePlayer).toBe('Alice')
  })

  it('resolves to the player of the correct event with the greatest credited points, ties to lowest chronologicalOrder, null when no correct events', () => {
    fc.assert(
      fc.property(eventsArb, (events) => {
        const result = computeRoundResult(makeTrackingData(events))
        expect(result.highestSingleCluePlayer).toBe(expectedHighestSingleCluePlayer(events))
      }),
      { numRuns: 300 },
    )
  })

  it('resolves to null when there are no correct answer events', () => {
    fc.assert(
      fc.property(
        eventsArb.map((events) =>
          events.map((event) => ({ ...event, result: 'incorrect' as const })),
        ),
        (events) => {
          const result = computeRoundResult(makeTrackingData(events))
          expect(result.highestSingleCluePlayer).toBeNull()
        },
      ),
      { numRuns: 100 },
    )
  })

  it('breaks an exact tie on credited points in favor of the earlier answer even when array order diverges', () => {
    // Chronologically Alice answered first, but the array holds Bob first
    // (as happens after a re-marking filters and re-appends an event).
    const events: ClueAnswerEventWithEarned[] = [
      {
        playerName: 'Bob',
        clueKey: 'round1-1-1',
        result: 'correct',
        pointValue: 800,
        earnedPoints: 800,
        chronologicalOrder: 5,
        categoryIndex: 1,
      },
      {
        playerName: 'Alice',
        clueKey: 'round1-0-0',
        result: 'correct',
        pointValue: 400,
        earnedPoints: 800,
        chronologicalOrder: 2,
        categoryIndex: 0,
      },
    ]

    const result = computeRoundResult(makeTrackingData(events))
    expect(result.highestSingleCluePlayer).toBe('Alice')
  })
})

// ─── Edge case (Testing Strategy case 7): DD wager already compared ──────────

describe('Feature: betting-submission-fixes, edge case: Daily Double wager already compares at the wager amount', () => {
  /**
   * **Validates: Requirements 2.2**
   *
   * `pointValue` is reassigned to the Daily Double wager before the event is
   * built, so this is expected to PASS on unfixed code — narrowing the defect
   * to the missing ownership multiplier.
   */
  it('a $1,500 Daily Double wager outranks a $1,000 clue on unfixed code', () => {
    const events: ClueAnswerEventWithEarned[] = [
      {
        playerName: 'Carol',
        clueKey: 'round1-2-0',
        result: 'correct',
        // Daily Double: pointValue is the wager, not the clue face value
        pointValue: 1500,
        earnedPoints: 1500,
        chronologicalOrder: 0,
        categoryIndex: 2,
      },
      {
        playerName: 'Dave',
        clueKey: 'round1-3-1',
        result: 'correct',
        pointValue: 1000,
        earnedPoints: 1000,
        chronologicalOrder: 1,
        categoryIndex: 3,
      },
    ]

    const result = computeRoundResult(makeTrackingData(events))
    expect(result.highestSingleCluePlayer).toBe('Carol')
  })
})
