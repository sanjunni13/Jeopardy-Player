import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { orientComparison } from './analyticsUtils'
import type { HeadToHeadResult } from './analyticsUtils'

// Feature: negative-balance-and-analytics-updates
// Property 31 — head-to-head comparisons are oriented to their section.

/** Names used for participants. Six so multi-comparison sections are reachable. */
const NAME_POOL = ['Alice', 'Bob', 'Cara', 'Dan', 'Eve', 'Frank']

/** The five A/B statistic pairs that must swap together with the two names. */
const STAT_PAIRS = [
  ['correctA', 'correctB'],
  ['incorrectA', 'incorrectB'],
  ['ddAttemptedA', 'ddAttemptedB'],
  ['ddWonA', 'ddWonB'],
  ['finalScoreA', 'finalScoreB'],
] as const

/** Every field of the interface, so a field left behind by a swap is caught. */
const ALL_FIELDS: readonly (keyof HeadToHeadResult)[] = [
  'playerA',
  'playerB',
  ...STAT_PAIRS.flat(),
]

// ─── Generators ───────────────────────────────────────────────────────────────

/** Clue counts: 0 included so a player who answered nothing is covered. */
const genCount = fc.nat({ max: 60 })

/** Final scores span negative balances, exactly $0, and large positives. */
const genScore = fc.integer({ min: -20000, max: 60000 })

/** A comparison between two distinct participants, as `computeHeadToHead` emits. */
const genComparison: fc.Arbitrary<HeadToHeadResult> = fc
  .tuple(
    fc.uniqueArray(fc.constantFrom(...NAME_POOL), {
      minLength: 2,
      maxLength: 2,
    }),
    genCount,
    genCount,
    genCount,
    genCount,
    genCount,
    genCount,
    genCount,
    genCount,
    genScore,
    genScore,
  )
  .map(
    ([
      [nameA, nameB],
      correctA,
      correctB,
      incorrectA,
      incorrectB,
      ddAttemptedA,
      ddAttemptedB,
      ddWonA,
      ddWonB,
      finalScoreA,
      finalScoreB,
    ]) => ({
      playerA: nameA,
      playerB: nameB,
      correctA,
      correctB,
      incorrectA,
      incorrectB,
      ddAttemptedA,
      ddAttemptedB,
      ddWonA,
      ddWonB,
      finalScoreA,
      finalScoreB,
    }),
  )

/** A comparison paired with one of its two participants to orient toward. */
const genComparisonAndParticipant = genComparison.chain((result) =>
  fc
    .constantFrom(result.playerA, result.playerB)
    .map((player) => ({ result, player })),
)

/**
 * A set of comparisons over 2–6 players covering every unique pair exactly once,
 * mirroring the shape `computeHeadToHead` produces for a session.
 */
const genComparisonSet = fc
  .uniqueArray(fc.constantFrom(...NAME_POOL), { minLength: 2, maxLength: 6 })
  .chain((names) => {
    const pairs: [string, string][] = []
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        pairs.push([names[i], names[j]])
      }
    }
    return fc
      .tuple(
        ...pairs.map(([a, b]) =>
          genComparison.map((base) => ({ ...base, playerA: a, playerB: b })),
        ),
      )
      .map((comparisons) => ({ names, comparisons: comparisons as HeadToHeadResult[] }))
  })

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** The pipeline `HeadToHead` uses: filter to the section's player, then orient. */
function sectionFor(
  comparisons: HeadToHeadResult[],
  player: string,
): HeadToHeadResult[] {
  return comparisons
    .filter((r) => r.playerA === player || r.playerB === player)
    .map((r) => orientComparison(r, player))
}

describe('Property 31: Head-to-head comparisons are oriented to their section', () => {
  /**
   * **Property 31: Head-to-head comparisons are oriented to their section**
   *
   * **Validates: Requirements 9.3**
   *
   * Orienting a comparison to a participant places that participant on side A
   * with every side-A statistic equal to their own value and every side-B
   * statistic equal to the opponent's value.
   */
  it('places the target participant on side A with their own statistics', () => {
    fc.assert(
      fc.property(genComparisonAndParticipant, ({ result, player }) => {
        const oriented = orientComparison(result, player)

        expect(oriented.playerA).toBe(player)
        expect(oriented.playerB).toBe(
          player === result.playerA ? result.playerB : result.playerA,
        )

        const targetWasA = player === result.playerA
        for (const [aKey, bKey] of STAT_PAIRS) {
          expect(oriented[aKey]).toBe(targetWasA ? result[aKey] : result[bKey])
          expect(oriented[bKey]).toBe(targetWasA ? result[bKey] : result[aKey])
        }
      }),
      { numRuns: 300 },
    )
  })

  /**
   * **Property 31: Head-to-head comparisons are oriented to their section**
   *
   * **Validates: Requirements 9.3**
   *
   * Every A/B field pair swaps together: the oriented result carries exactly the
   * same field set, and orienting to side B swaps all six pairs, leaving none
   * behind.
   */
  it('swaps every A/B field pair together and adds no field', () => {
    fc.assert(
      fc.property(genComparisonAndParticipant, ({ result, player }) => {
        const oriented = orientComparison(result, player)

        expect(Object.keys(oriented).sort()).toEqual([...ALL_FIELDS].sort())

        if (player === result.playerB) {
          expect(oriented).toEqual({
            playerA: result.playerB,
            playerB: result.playerA,
            correctA: result.correctB,
            correctB: result.correctA,
            incorrectA: result.incorrectB,
            incorrectB: result.incorrectA,
            ddAttemptedA: result.ddAttemptedB,
            ddAttemptedB: result.ddAttemptedA,
            ddWonA: result.ddWonB,
            ddWonB: result.ddWonA,
            finalScoreA: result.finalScoreB,
            finalScoreB: result.finalScoreA,
          })
        } else {
          expect(oriented).toEqual(result)
        }
      }),
      { numRuns: 300 },
    )
  })

  /**
   * **Property 31: Head-to-head comparisons are oriented to their section**
   *
   * **Validates: Requirements 9.3**
   *
   * Orienting twice to the same participant is identical to orienting once.
   */
  it('is idempotent when oriented twice to the same participant', () => {
    fc.assert(
      fc.property(genComparisonAndParticipant, ({ result, player }) => {
        const once = orientComparison(result, player)
        const twice = orientComparison(once, player)

        expect(twice).toEqual(once)
      }),
      { numRuns: 300 },
    )
  })

  /**
   * **Property 31: Head-to-head comparisons are oriented to their section**
   *
   * **Validates: Requirements 9.3**
   *
   * Orienting to one participant then the other returns the original
   * comparison, so mirroring a pair under both sections loses nothing.
   */
  it('returns to the original when oriented to each participant in turn', () => {
    fc.assert(
      fc.property(genComparison, (result) => {
        const toB = orientComparison(result, result.playerB)
        const backToA = orientComparison(toB, result.playerA)

        expect(backToA).toEqual(result)
      }),
      { numRuns: 200 },
    )
  })

  /**
   * **Property 31: Head-to-head comparisons are oriented to their section**
   *
   * **Validates: Requirements 9.3**
   *
   * The input comparison is never mutated, so the same comparison can be
   * oriented for both of its sections.
   */
  it('never mutates the input comparison', () => {
    fc.assert(
      fc.property(genComparison, (result) => {
        const before = { ...result }

        orientComparison(result, result.playerA)
        orientComparison(result, result.playerB)

        expect(result).toEqual(before)
      }),
      { numRuns: 200 },
    )
  })

  /**
   * **Property 31: Head-to-head comparisons are oriented to their section**
   *
   * **Validates: Requirements 9.3**
   *
   * Each player's section holds exactly one comparison against each other
   * player it has a comparison with, always with that player on side A.
   */
  it('gives each section one comparison per opponent, always on side A', () => {
    fc.assert(
      fc.property(genComparisonSet, ({ names, comparisons }) => {
        for (const player of names) {
          const section = sectionFor(comparisons, player)
          const opponents = section.map((r) => r.playerB)

          expect(section.every((r) => r.playerA === player)).toBe(true)
          expect(new Set(opponents).size).toBe(opponents.length)
          expect([...opponents].sort()).toEqual(
            names.filter((n) => n !== player).sort(),
          )
        }
      }),
      { numRuns: 150 },
    )
  })
})
