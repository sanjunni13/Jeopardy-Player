import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { canPlayerBuzz, orderBuzzQueue } from './buzzerLogic'
import type { BuzzEvent, BuzzState } from '../types/session'

// Feature: final-jeopardy-and-buzzer, Property 5: Buzz eligibility determination

/**
 * **Validates: Requirements 2.3, 2.4, 3.3, 3.6, 4.3, 4.5, 4.6**
 *
 * For any buzz state and player name, `canPlayerBuzz` SHALL return true if and only if
 * all of the following hold: `clueActive` is true, `systemLocked` is false, the player
 * name is not in the `queue`, and the player name is not in `lockedOut`. If any condition
 * fails, it SHALL return false.
 */
describe('Property 5: Buzz eligibility determination', () => {
  const playerNameArb = fc.string({ minLength: 1, maxLength: 20 })

  const buzzEventArb: fc.Arbitrary<BuzzEvent> = fc.record({
    playerName: fc.string({ minLength: 1, maxLength: 20 }),
    timestamp: fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
  })

  const buzzStateArb: fc.Arbitrary<BuzzState> = fc.record({
    clueActive: fc.boolean(),
    queue: fc.array(buzzEventArb, { minLength: 0, maxLength: 10 }),
    lockedOut: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 10 }),
    systemLocked: fc.boolean(),
  })

  it('canPlayerBuzz returns true iff clueActive && !systemLocked && not in queue && not in lockedOut', () => {
    fc.assert(
      fc.property(buzzStateArb, playerNameArb, (buzzState, playerName) => {
        const result = canPlayerBuzz(buzzState, playerName)
        const inQueue = buzzState.queue.some(e => e.playerName === playerName)
        const inLockedOut = buzzState.lockedOut.includes(playerName)
        const expected =
          buzzState.clueActive &&
          !buzzState.systemLocked &&
          !inQueue &&
          !inLockedOut
        expect(result).toEqual(expected)
      }),
      { numRuns: 100 }
    )
  })

  it('canPlayerBuzz returns false when systemLocked is true (regardless of other conditions)', () => {
    fc.assert(
      fc.property(buzzStateArb, playerNameArb, (buzzState, playerName) => {
        const lockedState: BuzzState = { ...buzzState, systemLocked: true }
        expect(canPlayerBuzz(lockedState, playerName)).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('canPlayerBuzz returns false when clueActive is false (regardless of other conditions)', () => {
    fc.assert(
      fc.property(buzzStateArb, playerNameArb, (buzzState, playerName) => {
        const inactiveState: BuzzState = { ...buzzState, clueActive: false }
        expect(canPlayerBuzz(inactiveState, playerName)).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('canPlayerBuzz returns false when player is already in the queue', () => {
    fc.assert(
      fc.property(buzzStateArb, playerNameArb, (buzzState, playerName) => {
        const event: BuzzEvent = { playerName, timestamp: Date.now() }
        const stateWithPlayer: BuzzState = {
          ...buzzState,
          queue: [...buzzState.queue, event],
        }
        expect(canPlayerBuzz(stateWithPlayer, playerName)).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('canPlayerBuzz returns false when player is locked out', () => {
    fc.assert(
      fc.property(buzzStateArb, playerNameArb, (buzzState, playerName) => {
        const stateWithLockedOut: BuzzState = {
          ...buzzState,
          lockedOut: [...buzzState.lockedOut, playerName],
        }
        expect(canPlayerBuzz(stateWithLockedOut, playerName)).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('canPlayerBuzz returns true only when all four conditions are met simultaneously', () => {
    fc.assert(
      fc.property(playerNameArb, (playerName) => {
        const idealState: BuzzState = {
          clueActive: true,
          systemLocked: false,
          queue: [],
          lockedOut: [],
        }
        expect(canPlayerBuzz(idealState, playerName)).toBe(true)
      }),
      { numRuns: 100 }
    )
  })
})

// Feature: final-jeopardy-and-buzzer, Property 6: Buzz queue chronological ordering

/**
 * **Validates: Requirements 3.2, 4.1**
 *
 * For any list of buzz events with timestamps, `orderBuzzQueue` SHALL return
 * them sorted in ascending timestamp order such that for every adjacent pair
 * (a, b), `a.timestamp <= b.timestamp`.
 */
describe('Property 6: Buzz queue chronological ordering', () => {
  const buzzEventArb: fc.Arbitrary<BuzzEvent> = fc.record({
    playerName: fc.string({ minLength: 1, maxLength: 20 }),
    timestamp: fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
  })

  const buzzEventsArb = fc.array(buzzEventArb, { minLength: 0, maxLength: 50 })

  it('output is sorted ascending by timestamp (every adjacent pair satisfies a.timestamp <= b.timestamp)', () => {
    fc.assert(
      fc.property(buzzEventsArb, (events) => {
        const sorted = orderBuzzQueue(events)
        for (let i = 0; i < sorted.length - 1; i++) {
          expect(sorted[i].timestamp).toBeLessThanOrEqual(sorted[i + 1].timestamp)
        }
      }),
      { numRuns: 100 }
    )
  })

  it('output contains the same elements as the input (no elements added or removed)', () => {
    fc.assert(
      fc.property(buzzEventsArb, (events) => {
        const sorted = orderBuzzQueue(events)
        // Sort both by a stable key to compare element-by-element
        const sortedByKey = [...sorted].sort((a, b) =>
          a.playerName.localeCompare(b.playerName) || a.timestamp - b.timestamp
        )
        const inputByKey = [...events].sort((a, b) =>
          a.playerName.localeCompare(b.playerName) || a.timestamp - b.timestamp
        )
        expect(sortedByKey).toEqual(inputByKey)
      }),
      { numRuns: 100 }
    )
  })

  it('output length equals input length', () => {
    fc.assert(
      fc.property(buzzEventsArb, (events) => {
        const sorted = orderBuzzQueue(events)
        expect(sorted.length).toEqual(events.length)
      }),
      { numRuns: 100 }
    )
  })
})
