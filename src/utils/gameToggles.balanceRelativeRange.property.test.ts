import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  computeBalanceRelativeWagerRange,
  computeLowestPositiveBalance,
} from './gameToggles'
import { computeCoopWagerRange, type CoopWagerRange } from './coopScoring'

// ─── Shared generators ────────────────────────────────────────────────────────
// Reused by Properties 14, 15, 16 and 18 in this file.

/** The configured wager floor: an integer from 1 through 10,000 (`WageringConfig`). */
const WAGER_FLOOR_MIN = 1
const WAGER_FLOOR_MAX = 10_000

/**
 * Configured wager floor, biased so both ends of the permitted 1–10,000 range
 * and the $100 default are always exercised.
 */
const wagerFloorArb = fc.oneof(
  { arbitrary: fc.constant(WAGER_FLOOR_MIN), weight: 2 },
  { arbitrary: fc.constant(WAGER_FLOOR_MAX), weight: 2 },
  { arbitrary: fc.constant(100), weight: 1 },
  { arbitrary: fc.integer({ min: WAGER_FLOOR_MIN, max: WAGER_FLOOR_MAX }), weight: 5 },
)

/** A Real_Balance strictly above $0, including exactly $1. */
const positiveBalanceArb = fc.oneof(
  { arbitrary: fc.constant(1), weight: 2 },
  { arbitrary: fc.integer({ min: 1, max: 10_000 }), weight: 3 },
  { arbitrary: fc.integer({ min: 10_001, max: 1_000_000 }), weight: 2 },
)

/** A Real_Balance at or below $0, including exactly $0 and deeply negative. */
const nonPositiveBalanceArb = fc.oneof(
  { arbitrary: fc.constant(0), weight: 2 },
  { arbitrary: fc.integer({ min: -10_000, max: 0 }), weight: 3 },
  { arbitrary: fc.integer({ min: -1_000_000, max: -10_001 }), weight: 2 },
)

/** Any Real_Balance. */
const balanceArb = fc.oneof(nonPositiveBalanceArb, positiveBalanceArb)

interface TestPlayer {
  name: string
  score: number
}

const playerFromScore = (score: number, index: number): TestPlayer => ({
  name: `P${index + 1}`,
  score,
})

const fieldFromScores = (scores: number[]): TestPlayer[] => scores.map(playerFromScore)

/** A session field of 1–8 players with arbitrary balances. */
const mixedFieldArb = fc
  .array(balanceArb, { minLength: 1, maxLength: 8 })
  .map(fieldFromScores)

/** A session field in which every balance is non-positive. */
const allNonPositiveFieldArb = fc
  .array(nonPositiveBalanceArb, { minLength: 1, maxLength: 8 })
  .map(fieldFromScores)

/** A session field in which at least one balance is strictly above $0. */
const fieldWithAPositiveBalanceArb = fc
  .tuple(
    positiveBalanceArb,
    fc.array(balanceArb, { minLength: 0, maxLength: 7 }),
  )
  .map(([positive, rest]) => fieldFromScores([positive, ...rest]))

/**
 * A session field whose Lowest_Positive_Balance is exactly $1: one player holds
 * $1 and every other player is either at or below $0 or above $1.
 */
const fieldWithLowestPositiveOfOneArb = fc
  .array(
    fc.oneof(nonPositiveBalanceArb, fc.integer({ min: 2, max: 1_000_000 })),
    { minLength: 0, maxLength: 7 },
  )
  .map(rest => fieldFromScores([1, ...rest]))

/** Any session field, biased toward the boundary shapes above. */
const fieldArb = fc.oneof(
  { arbitrary: mixedFieldArb, weight: 3 },
  { arbitrary: allNonPositiveFieldArb, weight: 2 },
  { arbitrary: fieldWithAPositiveBalanceArb, weight: 2 },
  { arbitrary: fieldWithLowestPositiveOfOneArb, weight: 2 },
)

// ─── Property 14: Balance-relative wager range ────────────────────────────────

describe('Property 14: Balance-relative wager range', () => {
  /**
   * **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
   *
   * For any player balance, configured wager floor from 1 through 10,000, and
   * set of session balances, the shared wager range calculation returns:
   * - positive balance → min = wager floor, max = max(wager floor, balance)
   * - non-positive balance, some player above $0 → min $1, max exactly the
   *   Lowest_Positive_Balance with no upward adjustment
   * - non-positive balance, no player above $0 → min $1, max the wager floor
   */

  it('a positive balance yields [wagerFloor, max(wagerFloor, balance)]', () => {
    fc.assert(
      fc.property(positiveBalanceArb, wagerFloorArb, fieldArb, (score, wagerFloor, field) => {
        const lowestPositive = computeLowestPositiveBalance(field)
        const range = computeBalanceRelativeWagerRange(score, wagerFloor, lowestPositive)

        expect(range).toEqual({ min: wagerFloor, max: Math.max(wagerFloor, score) })
        expect(range.min).toBeLessThanOrEqual(range.max)
      }),
      { numRuns: 500 },
    )
  })

  it('a non-positive balance with a positive balance in the field caps at exactly the Lowest_Positive_Balance', () => {
    fc.assert(
      fc.property(
        nonPositiveBalanceArb,
        wagerFloorArb,
        fieldWithAPositiveBalanceArb,
        (score, wagerFloor, field) => {
          const lowestPositive = computeLowestPositiveBalance(field)
          expect(lowestPositive).not.toBeNull()

          const range = computeBalanceRelativeWagerRange(score, wagerFloor, lowestPositive)

          expect(range).toEqual({ min: 1, max: lowestPositive })
        },
      ),
      { numRuns: 500 },
    )
  })

  it('a Lowest_Positive_Balance of exactly $1 is applied with no upward adjustment', () => {
    fc.assert(
      fc.property(
        nonPositiveBalanceArb,
        wagerFloorArb,
        fieldWithLowestPositiveOfOneArb,
        (score, wagerFloor, field) => {
          expect(computeLowestPositiveBalance(field)).toBe(1)

          expect(computeBalanceRelativeWagerRange(score, wagerFloor, 1)).toEqual({
            min: 1,
            max: 1,
          })
        },
      ),
      { numRuns: 500 },
    )
  })

  it('a non-positive balance in an all-non-positive field caps at the configured wager floor', () => {
    fc.assert(
      fc.property(
        nonPositiveBalanceArb,
        wagerFloorArb,
        allNonPositiveFieldArb,
        (score, wagerFloor, field) => {
          const lowestPositive = computeLowestPositiveBalance(field)
          expect(lowestPositive).toBeNull()

          expect(computeBalanceRelativeWagerRange(score, wagerFloor, lowestPositive)).toEqual({
            min: 1,
            max: wagerFloor,
          })
        },
      ),
      { numRuns: 500 },
    )
  })

  it('every computed minimum is at least $1 and no greater than the maximum', () => {
    fc.assert(
      fc.property(balanceArb, wagerFloorArb, fieldArb, (score, wagerFloor, field) => {
        const range = computeBalanceRelativeWagerRange(
          score,
          wagerFloor,
          computeLowestPositiveBalance(field),
        )

        expect(range.min).toBeGreaterThanOrEqual(1)
        expect(range.min).toBeLessThanOrEqual(range.max)
      }),
      { numRuns: 500 },
    )
  })
})

// ─── Property 15: A non-positive-balance player can never out-wager a ─────────
// ─── positive-balance player ──────────────────────────────────────────────────

describe('Property 15: A non-positive-balance player can never out-wager a positive-balance player', () => {
  /**
   * **Validates: Requirements 4.3**
   *
   * For any set of session balances and any configured wager floor, the maximum
   * wager of every player above $0 is greater than or equal to the maximum wager
   * of every player at or below $0, and every computed minimum is at least $1
   * and no greater than the matching maximum.
   */

  /** Ranges for a whole field, all derived from one frozen Lowest_Positive_Balance. */
  const rangesFor = (field: TestPlayer[], wagerFloor: number) => {
    const lowestPositive = computeLowestPositiveBalance(field)
    return field.map(player => ({
      player,
      range: computeBalanceRelativeWagerRange(player.score, wagerFloor, lowestPositive),
    }))
  }

  it('every positive-balance maximum is at least every non-positive-balance maximum', () => {
    fc.assert(
      fc.property(fieldArb, wagerFloorArb, (field, wagerFloor) => {
        const ranges = rangesFor(field, wagerFloor)
        const positiveMaxima = ranges.filter(r => r.player.score > 0).map(r => r.range.max)
        const nonPositiveMaxima = ranges.filter(r => r.player.score <= 0).map(r => r.range.max)

        for (const positiveMax of positiveMaxima) {
          for (const nonPositiveMax of nonPositiveMaxima) {
            expect(positiveMax).toBeGreaterThanOrEqual(nonPositiveMax)
          }
        }
      }),
      { numRuns: 500 },
    )
  })

  it('holds when the field mixes positive and non-positive balances', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          positiveBalanceArb,
          nonPositiveBalanceArb,
          fc.array(balanceArb, { minLength: 0, maxLength: 6 }),
        ),
        wagerFloorArb,
        ([positive, nonPositive, rest], wagerFloor) => {
          const field = fieldFromScores([positive, nonPositive, ...rest])
          const ranges = rangesFor(field, wagerFloor)

          const worstPositiveMax = Math.min(
            ...ranges.filter(r => r.player.score > 0).map(r => r.range.max),
          )
          const bestNonPositiveMax = Math.max(
            ...ranges.filter(r => r.player.score <= 0).map(r => r.range.max),
          )

          expect(worstPositiveMax).toBeGreaterThanOrEqual(bestNonPositiveMax)
        },
      ),
      { numRuns: 500 },
    )
  })

  it('every minimum is at least $1 and no greater than its own maximum', () => {
    fc.assert(
      fc.property(fieldArb, wagerFloorArb, (field, wagerFloor) => {
        for (const { range } of rangesFor(field, wagerFloor)) {
          expect(range.min).toBeGreaterThanOrEqual(1)
          expect(range.min).toBeLessThanOrEqual(range.max)
        }
      }),
      { numRuns: 500 },
    )
  })

  it('reproduces the Requirement 4.3 worked example', () => {
    const field = fieldFromScores([-5_000, 100, 5_000])

    expect(rangesFor(field, 100).map(r => r.range)).toEqual([
      { min: 1, max: 100 },
      { min: 100, max: 100 },
      { min: 100, max: 5_000 },
    ])
  })
})

// ─── Property 16: Wager range parity and immutability across the phase ────────

describe('Property 16: Wager range parity and immutability across the phase', () => {
  /**
   * **Validates: Requirements 4.7, 4.8, 4.9, 4.10**
   *
   * For any set of session balances and configured wager floor, the host surface
   * and the player surface compute the identical minimum and maximum for every
   * player; and for any sequence of balance changes applied after the wager
   * phase begins, every already-computed range is unchanged.
   */

  /** The frozen config the host persists into `FinalJeopardyState` at phase start. */
  interface WagerConfig {
    wagerFloor: number
    lowestPositiveBalance: number | null
  }

  /** Requirement 4.9 — computed once, from the balances held at that instant. */
  const freezeWagerConfig = (field: TestPlayer[], wagerFloor: number): WagerConfig => ({
    wagerFloor,
    lowestPositiveBalance: computeLowestPositiveBalance(field),
  })

  /** Host surface (`WagerEntry`): one row per player, all from the frozen config. */
  const hostRanges = (field: TestPlayer[], config: WagerConfig) =>
    field.map(player =>
      computeBalanceRelativeWagerRange(
        player.score,
        config.wagerFloor,
        config.lowestPositiveBalance,
      ),
    )

  /** Player surface (`FinalJeopardyEntryPage`): its own player, same frozen config. */
  const playerSurfaceRange = (score: number, config: WagerConfig) =>
    computeBalanceRelativeWagerRange(score, config.wagerFloor, config.lowestPositiveBalance)

  interface BalanceChange {
    playerIndex: number
    delta: number
  }

  /**
   * A single mid-phase balance change. Deltas span both signs and magnitudes
   * large enough to flip a player across $0 in either direction, so sequences
   * routinely move the live Lowest_Positive_Balance.
   */
  const balanceChangeArb: fc.Arbitrary<BalanceChange> = fc.record({
    playerIndex: fc.nat({ max: 7 }),
    delta: fc.oneof(
      { arbitrary: fc.integer({ min: -1_000_000, max: 1_000_000 }), weight: 4 },
      { arbitrary: fc.constantFrom(-1, 1, -100, 100, -1_000, 1_000), weight: 3 },
    ),
  })

  /** A non-empty sequence of balance changes applied after the phase begins. */
  const balanceChangesArb = fc.array(balanceChangeArb, { minLength: 1, maxLength: 12 })

  /** Applies the sequence without mutating the input field or its players. */
  const applyChanges = (field: TestPlayer[], changes: BalanceChange[]): TestPlayer[] =>
    changes.reduce<TestPlayer[]>(
      (current, { playerIndex, delta }) =>
        current.map((player, index) =>
          index === playerIndex % current.length
            ? { ...player, score: player.score + delta }
            : player,
        ),
      field,
    )

  it('both wager surfaces compute the identical range for every player', () => {
    fc.assert(
      fc.property(fieldArb, wagerFloorArb, (field, wagerFloor) => {
        const config = freezeWagerConfig(field, wagerFloor)
        const host = hostRanges(field, config)

        field.forEach((player, index) => {
          expect(playerSurfaceRange(player.score, config)).toEqual(host[index])
        })
      }),
      { numRuns: 500 },
    )
  })

  it('the player surface fallback, computing the field itself, matches the host', () => {
    fc.assert(
      fc.property(fieldArb, wagerFloorArb, (field, wagerFloor) => {
        const host = hostRanges(field, freezeWagerConfig(field, wagerFloor))

        // No persisted `wagerConfig`: the page derives the same value locally
        // from the same session players.
        const fallbackConfig: WagerConfig = {
          wagerFloor,
          lowestPositiveBalance: computeLowestPositiveBalance(field),
        }

        field.forEach((player, index) => {
          expect(playerSurfaceRange(player.score, fallbackConfig)).toEqual(host[index])
        })
      }),
      { numRuns: 500 },
    )
  })

  it('the frozen Lowest_Positive_Balance is unchanged by any sequence of balance changes', () => {
    fc.assert(
      fc.property(
        fieldArb,
        wagerFloorArb,
        balanceChangesArb,
        (field, wagerFloor, changes) => {
          const config = freezeWagerConfig(field, wagerFloor)
          const frozenValue = config.lowestPositiveBalance

          applyChanges(field, changes)

          expect(config.lowestPositiveBalance).toBe(frozenValue)
          expect(config.lowestPositiveBalance).toBe(computeLowestPositiveBalance(field))
          expect(config.wagerFloor).toBe(wagerFloor)
        },
      ),
      { numRuns: 500 },
    )
  })

  it('every already-computed range is unchanged after any sequence of balance changes', () => {
    fc.assert(
      fc.property(
        fieldArb,
        wagerFloorArb,
        balanceChangesArb,
        (field, wagerFloor, changes) => {
          const config = freezeWagerConfig(field, wagerFloor)
          const computedAtPhaseStart = hostRanges(field, config)
          const snapshot = computedAtPhaseStart.map(range => ({ ...range }))

          const changedField = applyChanges(field, changes)

          // The ranges held for the phase are untouched by the live balances,
          // and re-deriving from the frozen inputs reproduces them exactly.
          expect(computedAtPhaseStart).toEqual(snapshot)
          expect(hostRanges(field, config)).toEqual(snapshot)
          field.forEach((player, index) => {
            expect(playerSurfaceRange(player.score, config)).toEqual(snapshot[index])
          })

          // The live field really did move, yet nothing above depended on it.
          expect(changedField).toHaveLength(field.length)
        },
      ),
      { numRuns: 500 },
    )
  })

  it('parity between the two surfaces survives mid-phase balance changes', () => {
    fc.assert(
      fc.property(
        fieldArb,
        wagerFloorArb,
        balanceChangesArb,
        (field, wagerFloor, changes) => {
          const config = freezeWagerConfig(field, wagerFloor)
          const host = hostRanges(field, config)

          applyChanges(field, changes)

          field.forEach((player, index) => {
            expect(playerSurfaceRange(player.score, config)).toEqual(host[index])
          })
        },
      ),
      { numRuns: 500 },
    )
  })

  it('computing ranges mutates neither the session field nor the frozen config', () => {
    fc.assert(
      fc.property(fieldArb, wagerFloorArb, (field, wagerFloor) => {
        const fieldBefore = field.map(player => ({ ...player }))
        const config = freezeWagerConfig(field, wagerFloor)
        const configBefore = { ...config }

        hostRanges(field, config)
        field.forEach(player => playerSurfaceRange(player.score, config))

        expect(field).toEqual(fieldBefore)
        expect(config).toEqual(configBefore)
      }),
      { numRuns: 500 },
    )
  })
})

// ─── Property 18: Co-op team wager range ──────────────────────────────────────

describe('Property 18: Co-op team wager range', () => {
  /**
   * **Validates: Requirements 4.11**
   *
   * For any team pool, the co-op Final Jeopardy range has a minimum of exactly
   * $1 and a maximum of exactly the greater of the team pool and $1,000, and no
   * Lowest_Positive_Balance value influences it.
   *
   * The shared `computeCoopWagerRange` in `coopScoring.ts` is the single source
   * of the co-op range: `FinalJeopardy.tsx` and `getCoopDailyDoubleMaxWager`
   * both read it. It takes only the team pool, so the wrapper below threads the
   * rest of the wager environment — the configured wager floor and the
   * Lowest_Positive_Balance the non-co-op branch uses — past it, precisely so
   * the tests can show the returned range depends on neither.
   */

  const coopRangeIn = (
    teamPool: number,
    wagerFloor: number,
    lowestPositiveBalance: number | null,
  ): CoopWagerRange => {
    // Deliberately unread: the co-op branch derives nothing from either.
    void wagerFloor
    void lowestPositiveBalance

    return computeCoopWagerRange(teamPool)
  }

  /**
   * A team pool. Co-op pools start at $0 and can fall below it, so both signs
   * are generated, with the $1,000 boundary and $0 always exercised.
   */
  const teamPoolArb = fc.oneof(
    { arbitrary: fc.constant(0), weight: 2 },
    { arbitrary: fc.constantFrom(1, 999, 1_000, 1_001), weight: 3 },
    { arbitrary: fc.integer({ min: -1_000_000, max: 0 }), weight: 3 },
    { arbitrary: fc.integer({ min: 1, max: 1_000_000 }), weight: 4 },
  )

  it('the minimum is exactly $1 and the maximum exactly max(teamPool, $1,000)', () => {
    fc.assert(
      fc.property(teamPoolArb, wagerFloorArb, fieldArb, (teamPool, wagerFloor, field) => {
        const range = coopRangeIn(
          teamPool,
          wagerFloor,
          computeLowestPositiveBalance(field),
        )

        expect(range).toEqual({ min: 1, max: Math.max(teamPool, 1_000) })
        expect(range.min).toBe(1)
        expect(range.max).toBeGreaterThanOrEqual(range.min)
      }),
      { numRuns: 500 },
    )
  })

  it('the maximum is never below $1,000 and never below the team pool', () => {
    fc.assert(
      fc.property(teamPoolArb, wagerFloorArb, fieldArb, (teamPool, wagerFloor, field) => {
        const { max } = coopRangeIn(
          teamPool,
          wagerFloor,
          computeLowestPositiveBalance(field),
        )

        expect(max).toBeGreaterThanOrEqual(1_000)
        expect(max).toBeGreaterThanOrEqual(teamPool)
        // A pool at or above $1,000 is spendable in full; below it the team can
        // still wager the recovery $1,000.
        expect(max).toBe(teamPool >= 1_000 ? teamPool : 1_000)
      }),
      { numRuns: 500 },
    )
  })

  it('a pool at or below $0 still yields a minimum of $1, never $0', () => {
    fc.assert(
      fc.property(
        nonPositiveBalanceArb,
        wagerFloorArb,
        fieldArb,
        (teamPool, wagerFloor, field) => {
          const range = coopRangeIn(
            teamPool,
            wagerFloor,
            computeLowestPositiveBalance(field),
          )

          expect(range).toEqual({ min: 1, max: 1_000 })
          expect(range.min).not.toBe(0)
        },
      ),
      { numRuns: 500 },
    )
  })

  it('no Lowest_Positive_Balance value influences the range', () => {
    fc.assert(
      fc.property(
        teamPoolArb,
        wagerFloorArb,
        fieldArb,
        fieldArb,
        (teamPool, wagerFloor, fieldA, fieldB) => {
          const withFieldA = coopRangeIn(
            teamPool,
            wagerFloor,
            computeLowestPositiveBalance(fieldA),
          )
          const withFieldB = coopRangeIn(
            teamPool,
            wagerFloor,
            computeLowestPositiveBalance(fieldB),
          )
          const withNoPositiveBalance = coopRangeIn(teamPool, wagerFloor, null)

          expect(withFieldB).toEqual(withFieldA)
          expect(withNoPositiveBalance).toEqual(withFieldA)
        },
      ),
      { numRuns: 500 },
    )
  })

  it('the co-op range ignores the Lowest_Positive_Balance cap the non-co-op branch applies', () => {
    // A non-positive holder in this field is capped at its Lowest_Positive_Balance,
    // which is below $1,000; the co-op branch caps at $1,000 regardless.
    const lowPositiveBalanceArb = fc.integer({ min: 1, max: 999 })

    fc.assert(
      fc.property(
        nonPositiveBalanceArb,
        wagerFloorArb,
        lowPositiveBalanceArb,
        (teamPool, wagerFloor, lowestPositive) => {
          const coop = coopRangeIn(teamPool, wagerFloor, lowestPositive)
          const nonCoop = computeBalanceRelativeWagerRange(teamPool, wagerFloor, lowestPositive)

          expect(nonCoop.max).toBe(lowestPositive)
          expect(coop.max).toBe(1_000)
          expect(coop.max).toBeGreaterThan(nonCoop.max)
        },
      ),
      { numRuns: 500 },
    )
  })

  it('the range is independent of the configured wager floor', () => {
    fc.assert(
      fc.property(
        teamPoolArb,
        wagerFloorArb,
        wagerFloorArb,
        fieldArb,
        (teamPool, floorA, floorB, field) => {
          const lowestPositive = computeLowestPositiveBalance(field)

          expect(coopRangeIn(teamPool, floorB, lowestPositive)).toEqual(
            coopRangeIn(teamPool, floorA, lowestPositive),
          )
        },
      ),
      { numRuns: 500 },
    )
  })

  it('reproduces the criterion 4.11 boundary examples', () => {
    const anyFloor = 100
    const anyLowestPositive = 250

    expect(coopRangeIn(0, anyFloor, anyLowestPositive)).toEqual({ min: 1, max: 1_000 })
    expect(coopRangeIn(-5_000, anyFloor, anyLowestPositive)).toEqual({
      min: 1,
      max: 1_000,
    })
    expect(coopRangeIn(999, anyFloor, null)).toEqual({ min: 1, max: 1_000 })
    expect(coopRangeIn(1_000, anyFloor, null)).toEqual({ min: 1, max: 1_000 })
    expect(coopRangeIn(7_500, anyFloor, null)).toEqual({ min: 1, max: 7_500 })
  })
})
