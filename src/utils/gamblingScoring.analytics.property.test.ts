import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { computeGamblingStatsExpanded } from './gamblingScoring'
import type { Player, GamblingLedger, GamblingLedgerEntryType, SideBetType } from '../types/game'

// ─── Generators ─────────────────────────────────────────────────────────────

/** All 11 valid SideBetType values (used as labels on bet entries) */
const ALL_BET_TYPES: SideBetType[] = [
  'round_leader',
  'daily_double_finder',
  'most_incorrect',
  'sweep_category',
  'zero_score_round',
  'no_wrong_answers',
  'highest_single_clue',
  'most_correct',
  'first_incorrect',
  'biggest_earner',
  'bottom_feeder',
]

const betTypeLabelArb: fc.Arbitrary<string> = fc.constantFrom(...ALL_BET_TYPES)

/** Player name: non-empty alphanumeric string */
const playerNameArb = fc.string({ minLength: 1, maxLength: 15 }).filter(s => s.trim().length > 0)

/** Positive integer for amounts */
const positiveAmountArb = fc.integer({ min: 1, max: 5000 })

/** Ledger entry types relevant to betting */
const betLedgerEntryTypeArb: fc.Arbitrary<GamblingLedgerEntryType> = fc.constantFrom(
  'bet_placed', 'bet_won', 'bet_lost'
)

/** Generate a list of unique player names (1-5 players) */
const uniquePlayerNamesArb = fc.array(playerNameArb, { minLength: 1, maxLength: 5 })
  .map(names => [...new Set(names)])
  .filter(names => names.length >= 1)

// ─── Property 5: Analytics Aggregation Correctness ──────────────────────────

describe('Feature: expanded-bet-types, Property 5: Analytics Aggregation Correctness', () => {
  /**
   * **Validates: Requirements 8.1, 8.2, 8.4**
   *
   * For any gambling ledger containing bet_won and bet_lost entries with bet type labels,
   * computeGamblingStatsExpanded produces per-player per-bet-type counts that match the
   * actual ledger entry counts, and only includes bet types where the player has at least
   * one bet_placed entry.
   */

  it('per-player per-bet-type won/lost counts match actual ledger entry counts', () => {
    fc.assert(
      fc.property(
        uniquePlayerNamesArb,
        fc.array(
          fc.record({
            type: betLedgerEntryTypeArb,
            amount: positiveAmountArb,
            label: betTypeLabelArb,
          }),
          { minLength: 0, maxLength: 30 }
        ),
        (playerNames, entryTemplates) => {
          // Create players
          const players: Player[] = playerNames.map(name => ({
            name,
            score: 1000,
            correctCount: 0,
            incorrectCount: 0,
            correctDailyDoubles: 0,
            incorrectDailyDoubles: 0,
            correctFinalJeopardy: 0,
            incorrectFinalJeopardy: 0,
            totalEarned: 0,
          }))

          // Create ledger entries assigned round-robin to players
          const ledger: GamblingLedger = entryTemplates.map((tmpl, idx) => ({
            ...tmpl,
            playerName: playerNames[idx % playerNames.length],
            order: idx,
          }))

          const result = computeGamblingStatsExpanded(ledger, players)

          // Verify for each player
          for (const playerName of playerNames) {
            const playerStats = result.find(s => s.playerName === playerName)!
            const playerEntries = ledger.filter(e => e.playerName === playerName)

            // For each bet type in the breakdown, verify won/lost counts
            for (const btStat of playerStats.betTypeBreakdown) {
              const expectedWon = playerEntries.filter(
                e => e.type === 'bet_won' && e.label === btStat.betType
              ).length

              const expectedLost = playerEntries.filter(
                e => e.type === 'bet_lost' && e.label === btStat.betType
              ).length

              expect(btStat.won).toBe(expectedWon)
              expect(btStat.lost).toBe(expectedLost)
            }
          }
        }
      ),
      { numRuns: 200 }
    )
  })

  it('only bet types with at least one bet_placed entry appear in breakdown', () => {
    fc.assert(
      fc.property(
        uniquePlayerNamesArb,
        fc.array(
          fc.record({
            type: betLedgerEntryTypeArb,
            amount: positiveAmountArb,
            label: betTypeLabelArb,
          }),
          { minLength: 0, maxLength: 30 }
        ),
        (playerNames, entryTemplates) => {
          // Create players
          const players: Player[] = playerNames.map(name => ({
            name,
            score: 1000,
            correctCount: 0,
            incorrectCount: 0,
            correctDailyDoubles: 0,
            incorrectDailyDoubles: 0,
            correctFinalJeopardy: 0,
            incorrectFinalJeopardy: 0,
            totalEarned: 0,
          }))

          // Create ledger entries assigned round-robin to players
          const ledger: GamblingLedger = entryTemplates.map((tmpl, idx) => ({
            ...tmpl,
            playerName: playerNames[idx % playerNames.length],
            order: idx,
          }))

          const result = computeGamblingStatsExpanded(ledger, players)

          // Verify for each player: every bet type in the breakdown has at least one bet_placed
          for (const playerName of playerNames) {
            const playerStats = result.find(s => s.playerName === playerName)!
            const playerEntries = ledger.filter(e => e.playerName === playerName)

            // Get the set of bet types where this player has bet_placed
            const placedBetTypes = new Set<string>()
            for (const entry of playerEntries) {
              if (entry.type === 'bet_placed') {
                placedBetTypes.add(entry.label)
              }
            }

            // Every bet type in breakdown must be in placedBetTypes
            for (const btStat of playerStats.betTypeBreakdown) {
              expect(placedBetTypes.has(btStat.betType)).toBe(true)
            }

            // Every bet type in placedBetTypes must appear in breakdown
            for (const betType of placedBetTypes) {
              const found = playerStats.betTypeBreakdown.find(bt => bt.betType === betType)
              expect(found).toBeDefined()
            }
          }
        }
      ),
      { numRuns: 200 }
    )
  })

  it('no extra bet types appear (no bet types with zero bet_placed entries)', () => {
    fc.assert(
      fc.property(
        uniquePlayerNamesArb,
        fc.array(
          fc.record({
            type: betLedgerEntryTypeArb,
            amount: positiveAmountArb,
            label: betTypeLabelArb,
          }),
          { minLength: 1, maxLength: 30 }
        ),
        (playerNames, entryTemplates) => {
          // Create players
          const players: Player[] = playerNames.map(name => ({
            name,
            score: 1000,
            correctCount: 0,
            incorrectCount: 0,
            correctDailyDoubles: 0,
            incorrectDailyDoubles: 0,
            correctFinalJeopardy: 0,
            incorrectFinalJeopardy: 0,
            totalEarned: 0,
          }))

          // Create ledger entries assigned round-robin to players
          const ledger: GamblingLedger = entryTemplates.map((tmpl, idx) => ({
            ...tmpl,
            playerName: playerNames[idx % playerNames.length],
            order: idx,
          }))

          const result = computeGamblingStatsExpanded(ledger, players)

          // For each player, no bet type should appear in breakdown unless that player
          // has at least one bet_placed entry with that label
          for (const playerName of playerNames) {
            const playerStats = result.find(s => s.playerName === playerName)!
            const playerEntries = ledger.filter(e => e.playerName === playerName)

            for (const btStat of playerStats.betTypeBreakdown) {
              const placedCount = playerEntries.filter(
                e => e.type === 'bet_placed' && e.label === btStat.betType
              ).length
              expect(placedCount).toBeGreaterThan(0)
            }
          }
        }
      ),
      { numRuns: 200 }
    )
  })
})
