import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import type {
  FundingSource,
  GamblingLedger,
  GamblingLedgerEntry,
  GamblingLedgerEntryType,
  Player,
} from '../types/game'
import { computeGamblingStats, computeGamblingStatsExpanded } from './gamblingScoring'

// ─── Shared generators ────────────────────────────────────────────────────────

/** The non-monetary `Player` counters, which the stats computation must ignore. */
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

function makePlayer(name: string, score: number, counters: PlayerCounters): Player {
  return { name, score, ...counters }
}

/** A session field of 1–6 uniquely named players with generated balances. */
const playerFieldArb: fc.Arbitrary<Player[]> = fc
  .array(fc.tuple(fc.integer({ min: -5_000, max: 5_000 }), playerCountersArb), {
    minLength: 1,
    maxLength: 6,
  })
  .map(entries =>
    entries.map(([score, counters], index) => makePlayer(`P${index + 1}`, score, counters)),
  )

const entryTypeArb: fc.Arbitrary<GamblingLedgerEntryType> = fc.constantFrom(
  'bid',
  'bet_placed',
  'bet_won',
  'bet_lost',
  'ownership_bonus',
)

/**
 * A funding marker as it appears on a persisted entry: explicit, or absent
 * entirely for a ledger written before the field existed (Requirement 2.12).
 */
const fundedByArb: fc.Arbitrary<FundingSource | undefined> = fc.oneof(
  { arbitrary: fc.constant<FundingSource>('allowance'), weight: 3 },
  { arbitrary: fc.constant<FundingSource>('balance'), weight: 3 },
  { arbitrary: fc.constant(undefined), weight: 3 },
)

const labelArb = fc.constantFrom(
  'HISTORY',
  'SCIENCE',
  'POTPOURRI',
  'round_leader',
  'most_correct',
  'perfect_category',
)

/**
 * A ledger over the given field. Entry names are drawn from the field plus one
 * name that is not in the session, so entries for unknown players are exercised.
 * `order` is assigned sequentially, as the append helper does.
 */
function ledgerArb(
  players: Player[],
  fundedBySource: fc.Arbitrary<FundingSource | undefined> = fundedByArb,
): fc.Arbitrary<GamblingLedger> {
  const nameArb = fc.oneof(
    { arbitrary: fc.constantFrom(...players.map(p => p.name)), weight: 8 },
    { arbitrary: fc.constant('NotInSession'), weight: 1 },
  )

  return fc
    .array(
      fc.tuple(entryTypeArb, nameArb, fc.integer({ min: 1, max: 5_000 }), labelArb, fundedBySource),
      { minLength: 0, maxLength: 30 },
    )
    .map(entries =>
      entries.map(([type, playerName, amount, label, fundedBy], index) => {
        const base: GamblingLedgerEntry = { type, playerName, amount, label, order: index }
        return fundedBy === undefined ? base : { ...base, fundedBy }
      }),
    )
}

/** A field paired with a ledger drawn over that field's players. */
const fieldAndLedgerArb = playerFieldArb.chain(players =>
  ledgerArb(players).map(ledger => ({ players, ledger })),
)

/** A field paired with a ledger in which no entry carries `fundedBy` at all. */
const fieldAndLegacyLedgerArb = playerFieldArb.chain(players =>
  ledgerArb(players, fc.constant(undefined)).map(ledger => ({ players, ledger })),
)

// ─── Oracles ──────────────────────────────────────────────────────────────────

const entriesFor = (ledger: GamblingLedger, name: string, type: GamblingLedgerEntryType) =>
  ledger.filter(e => e.playerName === name && e.type === type)

const sumAmounts = (entries: GamblingLedgerEntry[]) => entries.reduce((sum, e) => sum + e.amount, 0)

/**
 * Independent restatement of Property 11: bet winnings plus ownership bonus,
 * minus only those bids and wagers whose recorded funding source is not the
 * Gambling_Allowance. An absent marker counts as Real_Balance spend.
 */
function expectedNetProfit(ledger: GamblingLedger, name: string): number {
  const winnings = sumAmounts(entriesFor(ledger, name, 'bet_won'))
  const bonus = sumAmounts(entriesFor(ledger, name, 'ownership_bonus'))
  const realBalanceSpend = sumAmounts(
    ledger.filter(
      e =>
        e.playerName === name &&
        (e.type === 'bid' || e.type === 'bet_placed') &&
        e.fundedBy !== 'allowance',
    ),
  )
  return winnings + bonus - realBalanceSpend
}

// ─── Property 11: Net gambling profit excludes allowance-funded spend ─────────

describe('Property 11: Net gambling profit excludes allowance-funded spend', () => {
  /**
   * **Validates: Requirements 2.12**
   *
   * For any gambling ledger and player list, each player's computed net
   * gambling profit equals total bet winnings plus ownership bonus, minus the
   * sum of only those bids and wagers whose recorded funding source is not the
   * Gambling_Allowance.
   */

  it('charges only non-allowance-funded bids and wagers against net profit', () => {
    fc.assert(
      fc.property(fieldAndLedgerArb, ({ players, ledger }) => {
        const stats = computeGamblingStats(ledger, players)

        expect(stats.map(s => s.playerName)).toEqual(players.map(p => p.name))
        for (const playerStats of stats) {
          expect(playerStats.netGamblingProfit).toBe(
            expectedNetProfit(ledger, playerStats.playerName),
          )
        }
      }),
      { numRuns: 300 },
    )
  })

  it('accumulates allowanceSpend as exactly the allowance-funded bids and wagers', () => {
    fc.assert(
      fc.property(fieldAndLedgerArb, ({ players, ledger }) => {
        const stats = computeGamblingStats(ledger, players)

        for (const playerStats of stats) {
          const allowanceFunded = ledger.filter(
            e =>
              e.playerName === playerStats.playerName &&
              (e.type === 'bid' || e.type === 'bet_placed') &&
              e.fundedBy === 'allowance',
          )
          expect(playerStats.allowanceSpend).toBe(sumAmounts(allowanceFunded))

          // The displayed bid columns still count every bid, allowance or not.
          const bids = entriesFor(ledger, playerStats.playerName, 'bid')
          expect(playerStats.categoriesOwned).toBe(bids.length)
          expect(playerStats.totalBidSpend).toBe(sumAmounts(bids))
        }
      }),
      { numRuns: 300 },
    )
  })

  it('computes a ledger with no fundedBy markers exactly as it did before the field existed', () => {
    fc.assert(
      fc.property(fieldAndLegacyLedgerArb, ({ players, ledger }) => {
        const legacyStats = computeGamblingStats(ledger, players)
        const explicitBalanceLedger: GamblingLedger = ledger.map(e => ({
          ...e,
          fundedBy: 'balance' as const,
        }))

        expect(legacyStats).toEqual(computeGamblingStats(explicitBalanceLedger, players))

        for (const playerStats of legacyStats) {
          const name = playerStats.playerName
          // The pre-allowance formula: every bid and wager is Real_Balance spend.
          const preAllowanceProfit =
            sumAmounts(entriesFor(ledger, name, 'bet_won')) +
            sumAmounts(entriesFor(ledger, name, 'ownership_bonus')) -
            (sumAmounts(entriesFor(ledger, name, 'bid')) +
              sumAmounts(entriesFor(ledger, name, 'bet_placed')))

          expect(playerStats.allowanceSpend).toBe(0)
          expect(playerStats.netGamblingProfit).toBe(preAllowanceProfit)
        }
      }),
      { numRuns: 300 },
    )
  })

  it('carries the same net profit and allowance spend through the expanded stats', () => {
    fc.assert(
      fc.property(fieldAndLedgerArb, ({ players, ledger }) => {
        const expanded = computeGamblingStatsExpanded(ledger, players)

        for (const playerStats of expanded) {
          expect(playerStats.netGamblingProfit).toBe(
            expectedNetProfit(ledger, playerStats.playerName),
          )
          expect(playerStats.allowanceSpend).toBe(
            sumAmounts(
              ledger.filter(
                e =>
                  e.playerName === playerStats.playerName &&
                  (e.type === 'bid' || e.type === 'bet_placed') &&
                  e.fundedBy === 'allowance',
              ),
            ),
          )
        }
      }),
      { numRuns: 300 },
    )
  })
})
