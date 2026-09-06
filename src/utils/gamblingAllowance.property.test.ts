import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import type { GamblingLedgerEntry, Player } from '../types/game'
import {
  GAMBLING_ALLOWANCE_AMOUNT,
  MIN_COMMITMENT,
  beginGamblingPhases,
  budgetTotal,
  budgetViews,
  commit,
  discardGamblingPhases,
  eligibleBidders,
  fundingSourceFor,
  isAdmissibleCommitment,
  isAdmissibleCumulativeCommitment,
  isAllowancePlayer,
  unspentBudget,
} from './gamblingAllowance'

// ─── Shared generators ────────────────────────────────────────────────────────
// Reused by every gamblingAllowance property in this file (Properties 1–6).

/** A Real_Balance at or below $0, including exactly $0 and deeply negative. */
const nonPositiveBalanceArb = fc.oneof(
  { arbitrary: fc.constant(0), weight: 3 },
  { arbitrary: fc.integer({ min: -1_000, max: 0 }), weight: 3 },
  { arbitrary: fc.integer({ min: -1_000_000, max: -1_001 }), weight: 2 },
)

/** A Real_Balance strictly above $0, including exactly $1 and below the allowance. */
const positiveBalanceArb = fc.oneof(
  { arbitrary: fc.constant(1), weight: 2 },
  { arbitrary: fc.integer({ min: 1, max: GAMBLING_ALLOWANCE_AMOUNT }), weight: 3 },
  { arbitrary: fc.integer({ min: GAMBLING_ALLOWANCE_AMOUNT + 1, max: 1_000_000 }), weight: 3 },
)

/** Any recorded Real_Balance, biased toward the $0 boundary. */
const balanceArb = fc.oneof(
  { arbitrary: nonPositiveBalanceArb, weight: 1 },
  { arbitrary: positiveBalanceArb, weight: 1 },
)

/**
 * A score entry as it reaches the budget module: a recorded Real_Balance, or
 * `undefined` for a player who joined the session mid-game and holds no
 * recorded score, whose Real_Balance is treated as $0 (Requirement 1.1).
 */
const scoreEntryArb: fc.Arbitrary<number | undefined> = fc.oneof(
  { arbitrary: balanceArb as fc.Arbitrary<number | undefined>, weight: 6 },
  { arbitrary: fc.constant(undefined), weight: 2 },
)

/** The non-monetary `Player` counters, which the budget functions must ignore. */
const playerCountersArb = fc.record({
  correctCount: fc.nat({ max: 30 }),
  incorrectCount: fc.nat({ max: 30 }),
  correctDailyDoubles: fc.nat({ max: 3 }),
  incorrectDailyDoubles: fc.nat({ max: 3 }),
  correctFinalJeopardy: fc.integer({ min: 0, max: 1 }),
  incorrectFinalJeopardy: fc.integer({ min: 0, max: 1 }),
  totalEarned: fc.nat({ max: 1_000_000 }),
})

type PlayerCounters = Omit<Player, 'name' | 'score'>

/**
 * Reusable `Player` factory. A `score` of `undefined` omits the property
 * entirely, modelling the mid-game joiner who holds no recorded score.
 */
function makePlayer(name: string, score: number | undefined, counters: PlayerCounters): Player {
  const base = { name, ...counters }
  return (score === undefined ? base : { ...base, score }) as Player
}

/** Reusable `Player` factory arbitrary for one named player. */
function playerArb(
  name: string,
  scoreArb: fc.Arbitrary<number | undefined> = scoreEntryArb,
): fc.Arbitrary<Player> {
  return fc
    .tuple(scoreArb, playerCountersArb)
    .map(([score, counters]) => makePlayer(name, score, counters))
}

interface FieldOptions {
  minLength?: number
  maxLength?: number
}

/**
 * A session field of players with unique names (`P1`, `P2`, …) and generated
 * balances drawn from `scoreArb`.
 */
function playerFieldArb(
  scoreArb: fc.Arbitrary<number | undefined> = scoreEntryArb,
  { minLength = 1, maxLength = 8 }: FieldOptions = {},
): fc.Arbitrary<Player[]> {
  return fc
    .array(fc.tuple(scoreArb, playerCountersArb), { minLength, maxLength })
    .map(entries =>
      entries.map(([score, counters], index) => makePlayer(`P${index + 1}`, score, counters)),
    )
}

/** Renames a field so appended players keep unique names. */
function renumber(players: Player[]): Player[] {
  return players.map((player, index) => ({ ...player, name: `P${index + 1}` }))
}

/** A field guaranteed to contain a player whose Real_Balance is exactly $0. */
const fieldWithZeroBalanceArb = fc
  .tuple(playerArb('P0', fc.constant(0)), playerFieldArb(scoreEntryArb, { minLength: 0, maxLength: 7 }))
  .map(([zeroPlayer, rest]) => renumber([zeroPlayer, ...rest]))

/** A field guaranteed to contain a player who holds no recorded score. */
const fieldWithMissingScoreArb = fc
  .tuple(
    playerArb('PJoiner', fc.constant(undefined)),
    playerFieldArb(scoreEntryArb, { minLength: 0, maxLength: 7 }),
  )
  .map(([joiner, rest]) => renumber([joiner, ...rest]))

/** A field in which every player holds a Real_Balance above $0. */
const allPositiveFieldArb = playerFieldArb(
  positiveBalanceArb as fc.Arbitrary<number | undefined>,
)

/** A field in which every player is at or below $0. */
const allNonPositiveFieldArb = playerFieldArb(
  nonPositiveBalanceArb as fc.Arbitrary<number | undefined>,
)

/** Any session field, biased toward the boundary shapes above. */
const fieldArb = fc.oneof(
  { arbitrary: playerFieldArb(), weight: 4 },
  { arbitrary: fieldWithZeroBalanceArb, weight: 2 },
  { arbitrary: fieldWithMissingScoreArb, weight: 2 },
  { arbitrary: allPositiveFieldArb, weight: 1 },
  { arbitrary: allNonPositiveFieldArb, weight: 1 },
)

/** The Real_Balance the module must read for a player: `score ?? 0`. */
const realBalanceOf = (player: Player): number => player.score ?? 0

// ─── Property 1: Allowance classification and budget derivation ───────────────

describe('Property 1: Allowance classification and budget derivation', () => {
  /**
   * **Validates: Requirements 1.1, 1.2**
   *
   * For any list of players, `beginGamblingPhases` classifies exactly those
   * players whose Real_Balance is at or below $0 (a missing score reading as
   * $0) as Allowance_Players, gives each of them a budget total of exactly
   * $500, gives every other player a budget total equal to that player's
   * Real_Balance, and sets every player's committed amount to $0.
   */

  it('classifies exactly the players at or below $0 as Allowance_Players', () => {
    fc.assert(
      fc.property(fieldArb, players => {
        const state = beginGamblingPhases(players)

        for (const player of players) {
          expect(isAllowancePlayer(state, player.name)).toBe(realBalanceOf(player) <= 0)
        }

        const classified = Object.keys(state.allowancePlayers).filter(
          name => state.allowancePlayers[name],
        )
        const expected = players.filter(p => realBalanceOf(p) <= 0).map(p => p.name)
        expect(new Set(classified)).toEqual(new Set(expected))
      }),
      { numRuns: 500 },
    )
  })

  it('gives every Allowance_Player a budget total of exactly $500', () => {
    fc.assert(
      fc.property(fieldArb, players => {
        const state = beginGamblingPhases(players)

        for (const player of players.filter(p => realBalanceOf(p) <= 0)) {
          expect(budgetTotal(state, player.name)).toBe(GAMBLING_ALLOWANCE_AMOUNT)
        }
      }),
      { numRuns: 500 },
    )
  })

  it('gives every other player a budget total equal to their Real_Balance', () => {
    fc.assert(
      fc.property(fieldArb, players => {
        const state = beginGamblingPhases(players)

        for (const player of players.filter(p => realBalanceOf(p) > 0)) {
          expect(budgetTotal(state, player.name)).toBe(realBalanceOf(player))
        }
      }),
      { numRuns: 500 },
    )
  })

  it('treats a balance of exactly $0 and a missing score identically', () => {
    fc.assert(
      fc.property(
        fc.oneof(fieldWithZeroBalanceArb, fieldWithMissingScoreArb),
        players => {
          const state = beginGamblingPhases(players)
          const boundaryPlayers = players.filter(p => p.score === 0 || p.score === undefined)

          expect(boundaryPlayers.length).toBeGreaterThan(0)
          for (const player of boundaryPlayers) {
            expect(isAllowancePlayer(state, player.name)).toBe(true)
            expect(budgetTotal(state, player.name)).toBe(GAMBLING_ALLOWANCE_AMOUNT)
            expect(state.startBalances[player.name]).toBe(0)
          }
        },
      ),
      { numRuns: 500 },
    )
  })

  it('snapshots every player once with a committed amount of $0', () => {
    fc.assert(
      fc.property(fieldArb, players => {
        const state = beginGamblingPhases(players)
        const names = players.map(p => p.name)

        expect(new Set(Object.keys(state.committed))).toEqual(new Set(names))
        expect(new Set(Object.keys(state.startBalances))).toEqual(new Set(names))
        expect(new Set(Object.keys(state.allowancePlayers))).toEqual(new Set(names))

        for (const player of players) {
          expect(state.committed[player.name]).toBe(0)
          expect(state.startBalances[player.name]).toBe(realBalanceOf(player))
          expect(unspentBudget(state, player.name)).toBe(budgetTotal(state, player.name))
        }
      }),
      { numRuns: 500 },
    )
  })
})

// ─── Property 2: Budget admissibility window ──────────────────────────────────

/**
 * An unspent budget, biased toward the boundaries: an exhausted or negative
 * budget, a budget inside the $500 allowance, and a large Real_Balance budget.
 */
const unspentArb = fc.oneof(
  { arbitrary: fc.constant(0), weight: 2 },
  { arbitrary: fc.integer({ min: -1_000, max: 0 }), weight: 2 },
  { arbitrary: fc.constant(MIN_COMMITMENT), weight: 1 },
  { arbitrary: fc.integer({ min: 1, max: GAMBLING_ALLOWANCE_AMOUNT }), weight: 4 },
  { arbitrary: fc.integer({ min: GAMBLING_ALLOWANCE_AMOUNT + 1, max: 1_000_000 }), weight: 2 },
)

/** A submitted amount, biased toward $0, the $1 floor, and negative amounts. */
const amountArb = fc.oneof(
  { arbitrary: fc.constant(0), weight: 2 },
  { arbitrary: fc.integer({ min: -1_000, max: -1 }), weight: 2 },
  { arbitrary: fc.constant(MIN_COMMITMENT), weight: 2 },
  { arbitrary: fc.integer({ min: 1, max: GAMBLING_ALLOWANCE_AMOUNT }), weight: 4 },
  { arbitrary: fc.integer({ min: GAMBLING_ALLOWANCE_AMOUNT + 1, max: 1_000_000 }), weight: 2 },
)

/** An already-committed running total for the phase, including invalid negatives. */
const alreadyCommittedArb = fc.oneof(
  { arbitrary: fc.constant(0), weight: 3 },
  { arbitrary: fc.integer({ min: 1, max: GAMBLING_ALLOWANCE_AMOUNT }), weight: 4 },
  { arbitrary: fc.integer({ min: GAMBLING_ALLOWANCE_AMOUNT + 1, max: 1_000_000 }), weight: 1 },
  { arbitrary: fc.integer({ min: -1_000, max: -1 }), weight: 1 },
)

const nonFiniteArb = fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY)

describe('Property 2: Budget admissibility window', () => {
  /**
   * **Validates: Requirements 1.3, 1.4, 1.5, 1.6, 2.10**
   *
   * For any budget state, player, and integer amount, a single commitment is
   * admissible if and only if the amount is at least $1 and at most that
   * player's unspent budget; and for any sequence of wagers, a new wager is
   * admissible if and only if it is at least $1 and the sum of it and all
   * wagers already placed in the phase is at most the unspent budget.
   */

  it('admits a single commitment exactly when $1 ≤ amount ≤ unspent budget', () => {
    fc.assert(
      fc.property(amountArb, unspentArb, (amount, unspent) => {
        expect(isAdmissibleCommitment(amount, unspent)).toBe(
          amount >= MIN_COMMITMENT && amount <= unspent,
        )
      }),
      { numRuns: 500 },
    )
  })

  it('admits both bounds and rejects immediately outside them', () => {
    fc.assert(
      fc.property(fc.integer({ min: MIN_COMMITMENT, max: 1_000_000 }), unspent => {
        // The $1 floor and the unspent budget itself are both inside the window.
        expect(isAdmissibleCommitment(MIN_COMMITMENT, unspent)).toBe(true)
        expect(isAdmissibleCommitment(unspent, unspent)).toBe(true)
        // One dollar below the floor and one above the budget are both outside.
        expect(isAdmissibleCommitment(MIN_COMMITMENT - 1, unspent)).toBe(false)
        expect(isAdmissibleCommitment(unspent + 1, unspent)).toBe(false)
      }),
      { numRuns: 300 },
    )
  })

  it('rejects every amount of $0 or less regardless of budget', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000, max: 0 }),
        unspentArb,
        (amount, unspent) => {
          expect(isAdmissibleCommitment(amount, unspent)).toBe(false)
          expect(isAdmissibleCumulativeCommitment(0, amount, unspent)).toBe(false)
        },
      ),
      { numRuns: 300 },
    )
  })

  it('rejects every amount once the budget is exhausted', () => {
    fc.assert(
      fc.property(
        amountArb,
        fc.integer({ min: -1_000_000, max: MIN_COMMITMENT - 1 }),
        (amount, unspent) => {
          expect(isAdmissibleCommitment(amount, unspent)).toBe(false)
          expect(isAdmissibleCumulativeCommitment(0, amount, unspent)).toBe(false)
        },
      ),
      { numRuns: 300 },
    )
  })

  it('admits a cumulative wager exactly when it clears $1 and the running total fits', () => {
    fc.assert(
      fc.property(
        alreadyCommittedArb,
        amountArb,
        unspentArb,
        (already, amount, unspent) => {
          expect(isAdmissibleCumulativeCommitment(already, amount, unspent)).toBe(
            already >= 0 && amount >= MIN_COMMITMENT && already + amount <= unspent,
          )
        },
      ),
      { numRuns: 500 },
    )
  })

  it('matches the single-commitment window when nothing has been committed yet', () => {
    fc.assert(
      fc.property(amountArb, unspentArb, (amount, unspent) => {
        expect(isAdmissibleCumulativeCommitment(0, amount, unspent)).toBe(
          isAdmissibleCommitment(amount, unspent),
        )
      }),
      { numRuns: 500 },
    )
  })

  it('accepts a wager sequence exactly while the running total stays within the budget', () => {
    fc.assert(
      fc.property(
        playerArb('P1'),
        fc.array(amountArb, { minLength: 1, maxLength: 12 }),
        (player, wagers) => {
          const state = beginGamblingPhases([player])
          const unspent = unspentBudget(state, player.name)
          let running = 0

          for (const wager of wagers) {
            const admissible = isAdmissibleCumulativeCommitment(running, wager, unspent)
            expect(admissible).toBe(
              wager >= MIN_COMMITMENT && running + wager <= unspent,
            )
            // A rejected wager leaves the running total untouched (Requirement 1.5).
            if (admissible) running += wager
            expect(running).toBeLessThanOrEqual(Math.max(unspent, 0))
          }
        },
      ),
      { numRuns: 300 },
    )
  })

  it('narrows the window as accepted commitments draw the shared pool down', () => {
    fc.assert(
      fc.property(
        playerArb('P1'),
        fc.array(amountArb, { minLength: 1, maxLength: 8 }),
        (player, amounts) => {
          let state = beginGamblingPhases([player])

          for (const amount of amounts) {
            const before = unspentBudget(state, player.name)
            const admissible = isAdmissibleCommitment(amount, before)

            state = commit(state, player.name, amount)
            const after = unspentBudget(state, player.name)

            expect(after).toBe(admissible ? before - amount : before)
            expect(isAdmissibleCommitment(after + 1, after)).toBe(false)
            if (after >= MIN_COMMITMENT) {
              expect(isAdmissibleCommitment(after, after)).toBe(true)
            }
          }
        },
      ),
      { numRuns: 300 },
    )
  })

  it('never admits a non-finite amount or budget', () => {
    fc.assert(
      fc.property(
        fc.oneof(nonFiniteArb, amountArb),
        fc.oneof(nonFiniteArb, unspentArb),
        (amount, unspent) => {
          if (Number.isFinite(amount) && Number.isFinite(unspent)) return
          expect(isAdmissibleCommitment(amount, unspent)).toBe(false)
          expect(isAdmissibleCumulativeCommitment(0, amount, unspent)).toBe(false)
        },
      ),
      { numRuns: 300 },
    )
  })
})
// ─── Property 3: Rejected commitments change nothing ──────────────────────────

/**
 * A budget state carrying a history of commitments, so the rejection tests run
 * against partly drawn-down pools rather than only against fresh states.
 */
const committedStateArb = fc
  .tuple(fieldArb, fc.array(fc.tuple(fc.nat({ max: 7 }), amountArb), { maxLength: 10 }))
  .map(([players, commitments]) => {
    let state = beginGamblingPhases(players)
    for (const [index, amount] of commitments) {
      state = commit(state, players[index % players.length].name, amount)
    }
    return { players, state }
  })

/** A name in the state, or a name the state has never seen. */
const targetNameArb = fc.oneof(
  { arbitrary: fc.nat({ max: 7 }).map(index => ({ kind: 'known' as const, index })), weight: 4 },
  {
    arbitrary: fc.constantFrom('PGhost', 'P99', '').map(name => ({ kind: 'unknown' as const, name })),
    weight: 1,
  },
)

type TargetName = { kind: 'known'; index: number } | { kind: 'unknown'; name: string }

function resolveName(target: TargetName, players: Player[]): string {
  return target.kind === 'known' ? players[target.index % players.length].name : target.name
}

/**
 * The shapes an inadmissible amount can take: at or below the $0 floor, a
 * fractional amount below the $1 minimum, above the unspent budget, and
 * non-finite.
 */
type InadmissibleKind =
  | 'zero'
  | 'negative'
  | 'fractionBelowFloor'
  | 'justOverBudget'
  | 'farOverBudget'
  | 'nonFinite'

const inadmissibleKindArb = fc.constantFrom<InadmissibleKind[]>(
  'zero',
  'negative',
  'fractionBelowFloor',
  'justOverBudget',
  'farOverBudget',
  'nonFinite',
)

/** Derives an amount guaranteed to fall outside the admissibility window. */
function inadmissibleAmountFor(
  kind: InadmissibleKind,
  unspent: number,
  magnitude: number,
  nonFinite: number,
): number {
  switch (kind) {
    case 'zero':
      return 0
    case 'negative':
      return -magnitude
    case 'fractionBelowFloor':
      return magnitude / (magnitude + 1)
    case 'justOverBudget':
      return unspent + 1
    case 'farOverBudget':
      return unspent + magnitude
    case 'nonFinite':
      return nonFinite
  }
}

/** A state paired with a target player and an amount that state must reject. */
const rejectionCaseArb = fc
  .tuple(
    committedStateArb,
    targetNameArb,
    inadmissibleKindArb,
    fc.integer({ min: 1, max: 1_000_000 }),
    nonFiniteArb,
  )
  .map(([{ players, state }, target, kind, magnitude, nonFinite]) => {
    const playerName = resolveName(target, players)
    const amount = inadmissibleAmountFor(kind, unspentBudget(state, playerName), magnitude, nonFinite)
    return { players, state, playerName, amount }
  })

describe('Property 3: Rejected commitments change nothing', () => {
  /**
   * **Validates: Requirements 1.5, 1.6, 2.10**
   *
   * For any budget state, player, and inadmissible amount, `commit` returns a
   * budget state deep-equal to the input, leaving that player's unspent budget,
   * every other player's unspent budget, and every previously accepted
   * commitment unchanged, and appends no ledger entry.
   */

  it('returns a state deep-equal to the input for every inadmissible amount', () => {
    fc.assert(
      fc.property(rejectionCaseArb, ({ state, playerName, amount }) => {
        // Construction sanity check: the generated amount really is inadmissible.
        expect(isAdmissibleCommitment(amount, unspentBudget(state, playerName))).toBe(false)

        const before = structuredClone(state)
        const after = commit(state, playerName, amount)

        expect(after).toEqual(before)
        // Reference equality also holds: nothing is rebuilt on the rejected path.
        expect(after).toBe(state)
        // The input state itself is never mutated.
        expect(state).toEqual(before)
      }),
      { numRuns: 500 },
    )
  })

  it('leaves the target player and every other player’s unspent budget unchanged', () => {
    fc.assert(
      fc.property(rejectionCaseArb, ({ players, state, playerName, amount }) => {
        const unspentBefore = players.map(p => unspentBudget(state, p.name))
        const targetBefore = unspentBudget(state, playerName)

        const after = commit(state, playerName, amount)

        expect(unspentBudget(after, playerName)).toBe(targetBefore)
        for (const [index, player] of players.entries()) {
          expect(unspentBudget(after, player.name)).toBe(unspentBefore[index])
        }
      }),
      { numRuns: 500 },
    )
  })

  it('leaves every previously accepted commitment untouched', () => {
    fc.assert(
      fc.property(rejectionCaseArb, ({ state, playerName, amount }) => {
        const committedBefore = { ...state.committed }

        const after = commit(state, playerName, amount)

        expect(after.committed).toEqual(committedBefore)
        expect(after.allowancePlayers).toEqual(state.allowancePlayers)
        expect(after.startBalances).toEqual(state.startBalances)
        // A name the state never held is not introduced by a rejected commitment.
        expect(Object.keys(after.committed)).toEqual(Object.keys(committedBefore))
      }),
      { numRuns: 500 },
    )
  })

  it('rejects every amount of $0 or less whatever the budget holds', () => {
    fc.assert(
      fc.property(
        committedStateArb,
        fc.nat({ max: 7 }),
        fc.integer({ min: -1_000_000, max: 0 }),
        ({ players, state }, index, amount) => {
          const playerName = players[index % players.length].name

          const after = commit(state, playerName, amount)

          expect(after).toBe(state)
          expect(after).toEqual(state)
          expect(unspentBudget(after, playerName)).toBe(unspentBudget(state, playerName))
        },
      ),
      { numRuns: 300 },
    )
  })

  it('appends no ledger entry for a rejected commitment', () => {
    fc.assert(
      fc.property(
        fieldArb,
        fc.array(fc.tuple(fc.nat({ max: 7 }), amountArb), { minLength: 1, maxLength: 12 }),
        (players, submissions) => {
          let state = beginGamblingPhases(players)
          // The host appends a ledger entry only for a commitment the budget
          // state accepted, so a rejected amount leaves the ledger untouched.
          const ledger: { player: string; amount: number }[] = []
          let accepted = 0

          for (const [index, amount] of submissions) {
            const playerName = players[index % players.length].name
            const admissible = isAdmissibleCommitment(amount, unspentBudget(state, playerName))
            const next = commit(state, playerName, amount)

            if (admissible) {
              accepted += 1
              ledger.push({ player: playerName, amount })
            } else {
              expect(next).toBe(state)
            }
            state = next
          }

          expect(ledger).toHaveLength(accepted)
          for (const entry of ledger) {
            expect(entry.amount).toBeGreaterThanOrEqual(MIN_COMMITMENT)
          }

          // Every accepted amount, and nothing else, shows up in `committed`.
          const expectedCommitted: Record<string, number> = {}
          for (const player of players) expectedCommitted[player.name] = 0
          for (const entry of ledger) expectedCommitted[entry.player] += entry.amount
          expect(state.committed).toEqual(expectedCommitted)
        },
      ),
      { numRuns: 300 },
    )
  })

  it('leaves an accepted commitment behaving as if the rejections never happened', () => {
    fc.assert(
      fc.property(
        committedStateArb,
        fc.nat({ max: 7 }),
        fc.array(fc.tuple(inadmissibleKindArb, fc.integer({ min: 1, max: 1_000_000 })), {
          minLength: 1,
          maxLength: 6,
        }),
        nonFiniteArb,
        ({ players, state }, index, rejections, nonFinite) => {
          const playerName = players[index % players.length].name
          const unspent = unspentBudget(state, playerName)

          let rejected = state
          for (const [kind, magnitude] of rejections) {
            const amount = inadmissibleAmountFor(kind, unspentBudget(rejected, playerName), magnitude, nonFinite)
            rejected = commit(rejected, playerName, amount)
          }

          expect(rejected).toEqual(state)

          // An admissible amount then draws the pool down from the same point.
          if (unspent >= MIN_COMMITMENT) {
            expect(commit(rejected, playerName, unspent).committed[playerName]).toBe(
              commit(state, playerName, unspent).committed[playerName],
            )
          }
        },
      ),
      { numRuns: 300 },
    )
  })
})
// ─── Property 4: Bidder eligibility follows unspent budget ────────────────────

/**
 * Players the budget state has never seen — a device that joined after the
 * Auction_Phase began. Their unspent budget reads as $0, so they are ineligible.
 */
const unknownPlayersArb: fc.Arbitrary<Player[]> = fc
  .array(fc.tuple(scoreEntryArb, playerCountersArb), { maxLength: 3 })
  .map(entries =>
    entries.map(([score, counters], index) => makePlayer(`PGhost${index + 1}`, score, counters)),
  )

/** Stable reordering by generated priorities, so the input order varies. */
function reorder(players: Player[], priorities: number[]): Player[] {
  return players
    .map((player, index) => ({ player, index, priority: priorities[index] ?? index }))
    .sort((a, b) => a.priority - b.priority || a.index - b.index)
    .map(entry => entry.player)
}

/**
 * A drawn-down budget state paired with a player list in a generated order that
 * may include players the state never snapshotted.
 */
const eligibilityCaseArb = fc
  .tuple(committedStateArb, unknownPlayersArb, fc.array(fc.nat({ max: 1_000 }), { maxLength: 12 }))
  .map(([{ players, state }, ghosts, priorities]) => ({
    state,
    players: reorder([...players, ...ghosts], priorities),
  }))

describe('Property 4: Bidder eligibility follows unspent budget', () => {
  /**
   * **Validates: Requirements 1.8**
   *
   * For any budget state and player list, `eligibleBidders` returns exactly
   * those players whose unspent budget is at least $1, in the input player
   * order.
   */

  it('returns exactly the players whose unspent budget is at least $1', () => {
    fc.assert(
      fc.property(eligibilityCaseArb, ({ state, players }) => {
        const eligible = eligibleBidders(state, players)
        const eligibleNames = new Set(eligible.map(p => p.name))

        for (const player of players) {
          const unspent = unspentBudget(state, player.name)
          expect(eligibleNames.has(player.name)).toBe(unspent >= MIN_COMMITMENT)
        }

        expect(eligible.map(p => p.name)).toEqual(
          players.filter(p => unspentBudget(state, p.name) >= MIN_COMMITMENT).map(p => p.name),
        )
      }),
      { numRuns: 500 },
    )
  })

  it('preserves the input player order as a subsequence', () => {
    fc.assert(
      fc.property(eligibilityCaseArb, ({ state, players }) => {
        const eligible = eligibleBidders(state, players)

        // Every returned player is the same object from the input list, and the
        // positions they came from strictly increase.
        let previousIndex = -1
        for (const player of eligible) {
          const index = players.indexOf(player)
          expect(index).toBeGreaterThan(previousIndex)
          previousIndex = index
        }

        expect(eligible.length).toBeLessThanOrEqual(players.length)
      }),
      { numRuns: 500 },
    )
  })

  it('is eligible at exactly $1 unspent and ineligible at $0', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          playerArb('P1', positiveBalanceArb as fc.Arbitrary<number | undefined>),
          playerArb('P1', nonPositiveBalanceArb as fc.Arbitrary<number | undefined>),
        ),
        player => {
          const fresh = beginGamblingPhases([player])
          const total = budgetTotal(fresh, player.name)

          // A budget of $500 (allowance) or a positive Real_Balance is always
          // at least $1, so a fresh state makes the player eligible.
          expect(total).toBeGreaterThanOrEqual(MIN_COMMITMENT)
          expect(eligibleBidders(fresh, [player]).map(p => p.name)).toEqual([player.name])

          // Drawing the pool down to exactly $1 keeps the player eligible.
          if (total > MIN_COMMITMENT) {
            const nearlySpent = commit(fresh, player.name, total - MIN_COMMITMENT)
            expect(unspentBudget(nearlySpent, player.name)).toBe(MIN_COMMITMENT)
            expect(eligibleBidders(nearlySpent, [player])).toEqual([player])
          }

          // Exhausting the pool removes the player.
          const spent = commit(fresh, player.name, total)
          expect(unspentBudget(spent, player.name)).toBe(0)
          expect(eligibleBidders(spent, [player])).toEqual([])
        },
      ),
      { numRuns: 300 },
    )
  })

  it('excludes a player the budget state never snapshotted', () => {
    fc.assert(
      fc.property(fieldArb, unknownPlayersArb, (players, ghosts) => {
        const state = beginGamblingPhases(players)
        const eligible = eligibleBidders(state, [...players, ...ghosts])

        for (const ghost of ghosts) {
          expect(unspentBudget(state, ghost.name)).toBe(0)
          expect(eligible.some(p => p.name === ghost.name)).toBe(false)
        }
      }),
      { numRuns: 300 },
    )
  })

  it('tracks the pool as commitments draw it down', () => {
    fc.assert(
      fc.property(
        fieldArb,
        fc.array(fc.tuple(fc.nat({ max: 7 }), amountArb), { minLength: 1, maxLength: 10 }),
        (players, submissions) => {
          let state = beginGamblingPhases(players)

          for (const [index, amount] of submissions) {
            state = commit(state, players[index % players.length].name, amount)

            const eligible = eligibleBidders(state, players)
            expect(eligible.map(p => p.name)).toEqual(
              players.filter(p => unspentBudget(state, p.name) >= MIN_COMMITMENT).map(p => p.name),
            )
            for (const player of eligible) {
              expect(unspentBudget(state, player.name)).toBeGreaterThanOrEqual(MIN_COMMITMENT)
            }
          }
        },
      ),
      { numRuns: 300 },
    )
  })

  it('is idempotent and leaves the input list untouched', () => {
    fc.assert(
      fc.property(eligibilityCaseArb, ({ state, players }) => {
        const before = [...players]
        const eligible = eligibleBidders(state, players)

        expect(eligibleBidders(state, eligible)).toEqual(eligible)
        expect(players).toEqual(before)
        expect(players).toHaveLength(before.length)
      }),
      { numRuns: 500 },
    )
  })
})
// ─── Property 5: The allowance is frozen for both phases and discarded ────────

/**
 * The ways a Real_Balance can move while the Auction_Phase or Betting_Phase is
 * in progress: a clue credit or debit, a fall to exactly $0, a fall deep below
 * $0, a rise above $0, and the loss of a recorded score entirely.
 */
type BalanceChangeKind = 'delta' | 'toZero' | 'toNonPositive' | 'toPositive' | 'clear'

interface BalanceChange {
  index: number
  kind: BalanceChangeKind
  magnitude: number
}

const balanceChangeArb: fc.Arbitrary<BalanceChange> = fc.record({
  index: fc.nat({ max: 7 }),
  kind: fc.constantFrom<BalanceChangeKind[]>(
    'delta',
    'toZero',
    'toNonPositive',
    'toPositive',
    'clear',
  ),
  magnitude: fc.integer({ min: -1_000_000, max: 1_000_000 }),
})

/**
 * Applies one Real_Balance change in place, exactly as board play mutates the
 * live session player list underneath the budget state.
 */
function applyBalanceChange(players: Player[], change: BalanceChange): void {
  const player = players[change.index % players.length]

  switch (change.kind) {
    case 'delta':
      player.score = realBalanceOf(player) + change.magnitude
      break
    case 'toZero':
      player.score = 0
      break
    case 'toNonPositive':
      player.score = -Math.abs(change.magnitude)
      break
    case 'toPositive':
      player.score = Math.abs(change.magnitude) + 1
      break
    case 'clear':
      delete (player as Partial<Player>).score
      break
  }
}

/** A private copy of a generated field, safe to mutate during a property run. */
function liveCopy(players: Player[]): Player[] {
  return players.map(player => ({ ...player }))
}

describe('Property 5: The allowance is frozen for both phases and discarded at the end', () => {
  /**
   * **Validates: Requirements 1.9, 1.11, 1.12, 2.11**
   *
   * For any budget state and any sequence of Real_Balance changes applied to the
   * players after the Auction_Phase began, every player's Allowance_Player
   * classification, budget total, and funding source are unchanged from the
   * values fixed at Auction_Phase start; and discarding the budget state leaves
   * every player's Real_Balance exactly as it was.
   */

  it('keeps classification, budget total, and funding source frozen through any balance changes', () => {
    fc.assert(
      fc.property(
        fieldArb,
        fc.array(balanceChangeArb, { minLength: 1, maxLength: 12 }),
        (players, changes) => {
          const live = liveCopy(players)
          const state = beginGamblingPhases(live)

          const frozen = live.map(player => ({
            name: player.name,
            isAllowance: isAllowancePlayer(state, player.name),
            total: budgetTotal(state, player.name),
            source: fundingSourceFor(state, player.name),
          }))
          const snapshot = structuredClone(state)

          for (const change of changes) {
            applyBalanceChange(live, change)

            for (const entry of frozen) {
              expect(isAllowancePlayer(state, entry.name)).toBe(entry.isAllowance)
              expect(budgetTotal(state, entry.name)).toBe(entry.total)
              expect(fundingSourceFor(state, entry.name)).toBe(entry.source)
              // Requirement 2.11 — the funding source is the frozen classification.
              expect(entry.source).toBe(entry.isAllowance ? 'allowance' : 'balance')
            }

            // The state reads only its own snapshot: no live balance leaks in.
            expect(state).toEqual(snapshot)
          }
        },
      ),
      { numRuns: 300 },
    )
  })

  it('keeps the allowance as the only Spendable_Budget when a Real_Balance rises above $0', () => {
    fc.assert(
      fc.property(
        allNonPositiveFieldArb,
        fc.array(fc.integer({ min: 1, max: 1_000_000 }), { minLength: 1, maxLength: 10 }),
        (players, raises) => {
          const live = liveCopy(players)
          const state = beginGamblingPhases(live)

          for (const player of live) {
            expect(isAllowancePlayer(state, player.name)).toBe(true)
          }

          for (const [index, raise] of raises.entries()) {
            const player = live[index % live.length]
            player.score = raise

            // Requirement 1.11 — the $500 allowance stays the whole budget; no
            // part of the risen Real_Balance is added to it.
            expect(realBalanceOf(player)).toBeGreaterThan(0)
            expect(isAllowancePlayer(state, player.name)).toBe(true)
            expect(budgetTotal(state, player.name)).toBe(GAMBLING_ALLOWANCE_AMOUNT)
            expect(unspentBudget(state, player.name)).toBe(GAMBLING_ALLOWANCE_AMOUNT)
            expect(fundingSourceFor(state, player.name)).toBe('allowance')
          }
        },
      ),
      { numRuns: 300 },
    )
  })

  it('grants no allowance to a player whose Real_Balance falls to $0 or below mid-round', () => {
    fc.assert(
      fc.property(
        allPositiveFieldArb,
        fc.array(fc.integer({ min: 0, max: 1_000_000 }), { minLength: 1, maxLength: 10 }),
        (players, drops) => {
          const live = liveCopy(players)
          const state = beginGamblingPhases(live)
          const startBalances = new Map(live.map(player => [player.name, realBalanceOf(player)]))

          for (const [index, drop] of drops.entries()) {
            const player = live[index % live.length]
            // A fall to exactly $0 when `drop` is 0, deep below it otherwise.
            player.score = -drop

            // Requirement 1.12 — no allowance is granted for the rest of the round.
            expect(realBalanceOf(player)).toBeLessThanOrEqual(0)
            expect(isAllowancePlayer(state, player.name)).toBe(false)
            expect(fundingSourceFor(state, player.name)).toBe('balance')
            expect(budgetTotal(state, player.name)).toBe(startBalances.get(player.name))
            expect(unspentBudget(state, player.name)).toBe(startBalances.get(player.name))
          }
        },
      ),
      { numRuns: 300 },
    )
  })

  it('draws only the frozen pool down while Real_Balance moves underneath', () => {
    fc.assert(
      fc.property(
        fieldArb,
        fc.array(fc.tuple(fc.nat({ max: 7 }), amountArb, balanceChangeArb), {
          minLength: 1,
          maxLength: 10,
        }),
        (players, steps) => {
          const live = liveCopy(players)
          let state = beginGamblingPhases(live)
          const totals = new Map(live.map(player => [player.name, budgetTotal(state, player.name)]))
          const accepted = new Map(live.map(player => [player.name, 0]))

          for (const [index, amount, change] of steps) {
            const player = live[index % live.length]
            const before = unspentBudget(state, player.name)

            if (isAdmissibleCommitment(amount, before)) {
              accepted.set(player.name, (accepted.get(player.name) ?? 0) + amount)
            }
            state = commit(state, player.name, amount)
            applyBalanceChange(live, change)

            for (const name of totals.keys()) {
              // Only accepted commitments move the budget; balance changes never do.
              expect(budgetTotal(state, name)).toBe(totals.get(name))
              expect(unspentBudget(state, name)).toBe(
                (totals.get(name) ?? 0) - (accepted.get(name) ?? 0),
              )
            }
          }
        },
      ),
      { numRuns: 300 },
    )
  })

  it('reports the live Real_Balance alongside the frozen classification and budget', () => {
    fc.assert(
      fc.property(
        fieldArb,
        fc.array(balanceChangeArb, { minLength: 1, maxLength: 8 }),
        (players, changes) => {
          const live = liveCopy(players)
          const state = beginGamblingPhases(live)
          const frozenViews = budgetViews(state, live)

          for (const change of changes) {
            applyBalanceChange(live, change)
            const views = budgetViews(state, live)

            for (const player of live) {
              const view = views[player.name]
              expect(view.isAllowance).toBe(frozenViews[player.name].isAllowance)
              expect(view.unspent).toBe(frozenViews[player.name].unspent)
              // Real_Balance is the only part of the view that tracks the session.
              expect(view.realBalance).toBe(realBalanceOf(player))
            }
          }
        },
      ),
      { numRuns: 300 },
    )
  })

  it('discards the allowance and leaves every Real_Balance untouched', () => {
    fc.assert(
      fc.property(
        fieldArb,
        fc.array(fc.tuple(fc.nat({ max: 7 }), amountArb), { maxLength: 10 }),
        fc.array(balanceChangeArb, { maxLength: 8 }),
        (players, commitments, changes) => {
          const live = liveCopy(players)
          let phaseState = beginGamblingPhases(live)

          for (const [index, amount] of commitments) {
            phaseState = commit(phaseState, live[index % live.length].name, amount)
          }
          for (const change of changes) {
            applyBalanceChange(live, change)
          }

          const balancesBefore = live.map(player => realBalanceOf(player))
          const spentBefore = live.map(player => phaseState.committed[player.name] ?? 0)

          // Requirement 1.9 — the Betting_Phase ends and the allowance is discarded.
          const discarded = discardGamblingPhases()

          expect(discarded).toBeNull()
          expect(live.map(player => realBalanceOf(player))).toEqual(balancesBefore)

          // Nothing carries into the next round: the next Auction_Phase derives
          // every budget from criteria 1 and 2 alone.
          const next = beginGamblingPhases(live)
          for (const [index, player] of live.entries()) {
            const balance = balancesBefore[index]
            expect(next.committed[player.name]).toBe(0)
            expect(isAllowancePlayer(next, player.name)).toBe(balance <= 0)
            expect(budgetTotal(next, player.name)).toBe(
              balance <= 0 ? GAMBLING_ALLOWANCE_AMOUNT : balance,
            )
            // The freshly derived pool ignores whatever the discarded state spent.
            expect(unspentBudget(next, player.name)).toBe(budgetTotal(next, player.name))
            expect(spentBefore[index]).toBeGreaterThanOrEqual(0)
          }
        },
      ),
      { numRuns: 300 },
    )
  })
})
// ─── Property 6: A player who commits nothing ends where they started ─────────

/**
 * How a fellow player's submission resolves. A losing bid is never deducted
 * (Requirement 2.8), so it draws nothing from the pool and appends no entry.
 */
type SubmissionKind = 'winningBid' | 'losingBid' | 'betWon' | 'betLost'

interface OtherSubmission {
  index: number
  amount: number
  kind: SubmissionKind
}

/** A bid or wager submitted by one of the players who is *not* abstaining. */
const otherSubmissionArb: fc.Arbitrary<OtherSubmission> = fc.record({
  index: fc.nat({ max: 7 }),
  amount: amountArb,
  kind: fc.constantFrom<SubmissionKind[]>('winningBid', 'losingBid', 'betWon', 'betLost'),
})

/**
 * The abstaining player: an Allowance_Player at or below $0, including exactly
 * $0 and the mid-game joiner who holds no recorded score.
 */
const abstainingPlayerArb = fc.oneof(
  {
    arbitrary: playerArb('PAbstain', nonPositiveBalanceArb as fc.Arbitrary<number | undefined>),
    weight: 4,
  },
  { arbitrary: playerArb('PAbstain', fc.constant(undefined)), weight: 1 },
)

interface AbstainerCase {
  abstainer: Player
  others: Player[]
  submissions: OtherSubmission[]
}

/** An abstaining Allowance_Player alongside a field that bids and bets freely. */
const abstainerCaseArb: fc.Arbitrary<AbstainerCase> = fc
  .tuple(
    abstainingPlayerArb,
    playerFieldArb(scoreEntryArb, { minLength: 0, maxLength: 6 }),
    fc.array(otherSubmissionArb, { maxLength: 14 }),
  )
  .map(([abstainer, others, submissions]) => ({ abstainer, others, submissions }))

type BudgetState = ReturnType<typeof beginGamblingPhases>

interface PhaseRun {
  live: Player[]
  abstainer: Player
  others: Player[]
  state: BudgetState
  ledger: GamblingLedgerEntry[]
  startBalances: Record<string, number>
}

const BET_LABEL = 'highest_single_clue'

/**
 * Runs one Auction_Phase plus Betting_Phase in which every player except
 * `PAbstain` bids and bets. A ledger entry is appended only for a commitment
 * the budget state accepted, and each accepted commitment settles against the
 * committing player's Real_Balance exactly as the controllers settle it, so
 * `PAbstain` is the one player nothing in either phase touches.
 */
function runPhasesWithAbstainer({ abstainer, others, submissions }: AbstainerCase): PhaseRun {
  const live = liveCopy([abstainer, ...others])
  const [abstainingPlayer, ...otherPlayers] = live
  let state = beginGamblingPhases(live)
  const startBalances = { ...state.startBalances }
  const ledger: GamblingLedgerEntry[] = []

  for (const submission of submissions) {
    if (otherPlayers.length === 0) break

    const player = otherPlayers[submission.index % otherPlayers.length]
    const { amount, kind } = submission

    // A bid that loses its auction is never deducted, so it changes nothing.
    if (kind === 'losingBid') continue
    if (!isAdmissibleCommitment(amount, unspentBudget(state, player.name))) continue

    const fundedBy = fundingSourceFor(state, player.name)
    state = commit(state, player.name, amount)
    ledger.push({
      type: kind === 'winningBid' ? 'bid' : 'bet_placed',
      playerName: player.name,
      amount,
      label: kind === 'winningBid' ? 'Category' : BET_LABEL,
      order: ledger.length,
      fundedBy,
    })

    // A Real_Balance-funded commitment is deducted up front; an allowance-funded
    // one leaves Real_Balance alone (Requirements 2.1, 2.3).
    if (fundedBy === 'balance') player.score = realBalanceOf(player) - amount

    if (kind === 'betWon') {
      // Gross 2× payout on balance funding, +1× credit on allowance funding, so
      // net profit is `+wager` either way (Requirement 2.4).
      player.score = realBalanceOf(player) + (fundedBy === 'balance' ? amount * 2 : amount)
      ledger.push({
        type: 'bet_won',
        playerName: player.name,
        amount,
        label: BET_LABEL,
        order: ledger.length,
      })
    } else if (kind === 'betLost') {
      ledger.push({
        type: 'bet_lost',
        playerName: player.name,
        amount,
        label: BET_LABEL,
        order: ledger.length,
      })
    }
  }

  return {
    live,
    abstainer: abstainingPlayer,
    others: otherPlayers,
    state,
    ledger,
    startBalances,
  }
}

describe('Property 6: A player who commits nothing ends where they started', () => {
  /**
   * **Validates: Requirements 1.10**
   *
   * For any player who is granted a Gambling_Allowance and places no bids and
   * no bets, that player's Real_Balance when board play begins equals that
   * player's Real_Balance when the Auction_Phase began, and the ledger contains
   * no `bid` and no `bet_placed` entry naming that player for that round.
   */

  it('leaves the abstaining player’s committed amount at $0 with the allowance fully unspent', () => {
    fc.assert(
      fc.property(abstainerCaseArb, phaseCase => {
        const { state, abstainer } = runPhasesWithAbstainer(phaseCase)

        expect(isAllowancePlayer(state, abstainer.name)).toBe(true)
        expect(state.committed[abstainer.name]).toBe(0)
        expect(budgetTotal(state, abstainer.name)).toBe(GAMBLING_ALLOWANCE_AMOUNT)
        expect(unspentBudget(state, abstainer.name)).toBe(GAMBLING_ALLOWANCE_AMOUNT)
        expect(fundingSourceFor(state, abstainer.name)).toBe('allowance')
      }),
      { numRuns: 300 },
    )
  })

  it('leaves the abstaining player’s Real_Balance at the start-of-phase value when board play begins', () => {
    fc.assert(
      fc.property(abstainerCaseArb, phaseCase => {
        const { abstainer, startBalances } = runPhasesWithAbstainer(phaseCase)

        // Board play begins with the Real_Balance the Auction_Phase started from.
        expect(realBalanceOf(abstainer)).toBe(startBalances[abstainer.name])
        expect(realBalanceOf(abstainer)).toBeLessThanOrEqual(0)
      }),
      { numRuns: 300 },
    )
  })

  it('appends no `bid` and no `bet_placed` ledger entry naming the abstaining player', () => {
    fc.assert(
      fc.property(abstainerCaseArb, phaseCase => {
        const { ledger, abstainer, others } = runPhasesWithAbstainer(phaseCase)

        expect(
          ledger.filter(
            entry =>
              entry.playerName === abstainer.name &&
              (entry.type === 'bid' || entry.type === 'bet_placed'),
          ),
        ).toEqual([])
        // No entry of any type names the abstaining player for this round.
        expect(ledger.some(entry => entry.playerName === abstainer.name)).toBe(false)

        const otherNames = new Set(others.map(player => player.name))
        for (const entry of ledger) {
          expect(otherNames.has(entry.playerName)).toBe(true)
          expect(entry.amount).toBeGreaterThanOrEqual(MIN_COMMITMENT)
        }
      }),
      { numRuns: 300 },
    )
  })

  it('holds for every player who commits nothing, not only the abstaining one', () => {
    fc.assert(
      fc.property(abstainerCaseArb, phaseCase => {
        const { live, state, ledger, startBalances } = runPhasesWithAbstainer(phaseCase)

        for (const player of live) {
          if (state.committed[player.name] !== 0) continue

          expect(realBalanceOf(player)).toBe(startBalances[player.name])
          expect(unspentBudget(state, player.name)).toBe(budgetTotal(state, player.name))
          expect(ledger.some(entry => entry.playerName === player.name)).toBe(false)
        }
      }),
      { numRuns: 300 },
    )
  })

  it('discards the allowance with the abstaining player’s Real_Balance still at the start-of-phase value', () => {
    fc.assert(
      fc.property(abstainerCaseArb, phaseCase => {
        const { live, abstainer, startBalances } = runPhasesWithAbstainer(phaseCase)
        const startBalance = startBalances[abstainer.name]

        // Requirement 1.9 — the Betting_Phase ends and the allowance is discarded.
        expect(discardGamblingPhases()).toBeNull()
        expect(realBalanceOf(abstainer)).toBe(startBalance)

        // The next round derives the same budget from the same untouched balance.
        const next = beginGamblingPhases(live)
        expect(next.committed[abstainer.name]).toBe(0)
        expect(next.startBalances[abstainer.name]).toBe(startBalance)
        expect(isAllowancePlayer(next, abstainer.name)).toBe(true)
        expect(budgetTotal(next, abstainer.name)).toBe(GAMBLING_ALLOWANCE_AMOUNT)
        expect(unspentBudget(next, abstainer.name)).toBe(GAMBLING_ALLOWANCE_AMOUNT)
      }),
      { numRuns: 300 },
    )
  })
})
