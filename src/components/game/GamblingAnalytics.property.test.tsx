// @vitest-environment jsdom

import { describe, it, expect, afterEach } from 'vitest'
import fc from 'fast-check'
import { render, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { UserEvent } from '@testing-library/user-event'
import { GamblingAnalytics } from './GamblingAnalytics'
import type {
  GamblingLedger,
  GamblingLedgerEntry,
  GamblingLedgerEntryType,
  GameSession,
  NormalizedGame,
  Player,
  SideBetType,
} from '../../types/game'

// Feature: negative-balance-and-analytics-updates
// Property 30: Per-player sections are a disjoint total cover

afterEach(cleanup)

// ─── Fixture ──────────────────────────────────────────────────────────────────

const MOCK_GAME: NormalizedGame = {
  rounds: {
    single: [
      {
        category: 'Science',
        clues: [{ value: 200, clue: 'Q1', solution: 'A1', dailyDouble: false, html: false }],
      },
    ],
    double: [],
    triple: [],
    quadruple: [],
    quintuple: [],
    sextuple: [],
  },
  final: { category: 'Final', clue: 'FQ', solution: 'FA', html: false },
  totalRounds: 1,
}

function makePlayer(name: string): Player {
  return {
    name,
    score: 1000,
    correctCount: 0,
    incorrectCount: 0,
    correctDailyDoubles: 0,
    incorrectDailyDoubles: 0,
    correctFinalJeopardy: 0,
    incorrectFinalJeopardy: 0,
    totalEarned: 1000,
  }
}

function makeSession(playerNames: readonly string[], ledger: GamblingLedger): GameSession {
  return {
    game: MOCK_GAME,
    gameId: 'property-game',
    players: playerNames.map(makePlayer),
    currentRoundIndex: 0,
    orderedRoundNames: ['single'],
    clueStates: {},
    dailyDoubleRecords: [],
    toggleConfig: {
      coop: { enabled: false, targetPercentage: 75 },
      wagering: { enabled: false, wagerFloor: 100 },
      rulesEngine: {
        enabled: false,
        stealBonus: { enabled: false, bonusPoints: 200 },
        streakMultiplier: { enabled: false, threshold: 3, multiplier: 2 },
        penaltyDoubler: { enabled: false },
      },
      timedClues: { enabled: false, timerDuration: 30 },
      gambling: { enabled: true, startingBalance: 1000, auctionTimer: 20 },
    },
    streakCounts: {},
    perRoundIncorrect: {},
    activeWagers: null,
    teamPool: 0,
    targetScore: 0,
    boardTotal: 0,
    gamblingLedger: ledger,
    categoryOwnership: {},
    activeSideBets: [],
  }
}

// ─── Generators ───────────────────────────────────────────────────────────────

const ENTRY_TYPES: readonly GamblingLedgerEntryType[] = [
  'bid',
  'bet_placed',
  'bet_won',
  'bet_lost',
  'ownership_bonus',
]

const SIDE_BET_TYPES: readonly SideBetType[] = [
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

const CATEGORY_NAMES: readonly string[] = ['Science', 'History', 'Movie Quotes', 'Potent Potables']

/**
 * Player names as analytics actually receives them: a non-empty display string
 * with collapsed interior whitespace, so a section toggle's text can be
 * compared to the stats-table cell exactly.
 */
const playerNameArb: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 16 })
  .map((raw) => raw.replace(/\s+/g, ' ').trim())
  .filter((name) => name.length > 0)

/** One ledger entry minus its `order`, which is assigned session-wide below. */
function entryBodyArb(playerNames: readonly string[]): fc.Arbitrary<Omit<GamblingLedgerEntry, 'order'>> {
  return fc.record({
    type: fc.constantFrom(...ENTRY_TYPES),
    playerName: fc.constantFrom(...playerNames),
    amount: fc.integer({ min: 0, max: 5000 }),
    label: fc.oneof(fc.constantFrom(...SIDE_BET_TYPES), fc.constantFrom(...CATEGORY_NAMES)),
  })
}

/**
 * A session of 1 to 10 players plus a ledger whose `order` values are distinct
 * but unsorted, so the component has to sort before numbering. Ledgers may be
 * empty and players may draw no entries at all, which is exactly the
 * empty-section case Requirements 9.8 and 9.9 cover.
 */
const sessionArb = fc.uniqueArray(playerNameArb, { minLength: 1, maxLength: 10 }).chain((playerNames) =>
  fc.array(entryBodyArb(playerNames), { maxLength: 20 }).chain((bodies) =>
    fc
      .uniqueArray(fc.integer({ min: 0, max: 500 }), {
        minLength: bodies.length,
        maxLength: bodies.length,
      })
      .map((orders) => ({
        playerNames,
        ledger: bodies.map((body, index) => ({ ...body, order: orders[index] })) as GamblingLedger,
      }))
  )
)

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BET_TYPE_HEADING = 'Bet Type Breakdown'
const LEDGER_HEADING = 'Gambling Ledger'

const TOGGLE_SELECTOR = '.collapsible-player-section__toggle'
const NAME_SELECTOR = '.collapsible-player-section__name'

/** A user-event session without inter-event delays, so many runs stay quick. */
function setupUser(): UserEvent {
  return userEvent.setup({ delay: null })
}

/** The `.gambling-section-group` carrying a given heading. */
function sectionGroup(container: HTMLElement, heading: string): HTMLElement {
  const title = within(container).getByText(heading)
  return title.parentElement as HTMLElement
}

/** The section toggles of one group, in document order. */
function groupToggles(group: HTMLElement): HTMLButtonElement[] {
  return Array.from(group.querySelectorAll<HTMLButtonElement>(TOGGLE_SELECTOR))
}

/** The player name each toggle in a group carries, in document order. */
function toggleNames(group: HTMLElement): string[] {
  return groupToggles(group).map((toggle) => toggle.querySelector(NAME_SELECTOR)?.textContent ?? '')
}

/** Player names down the always-visible stats table, in render order. */
function statsTableOrder(container: HTMLElement): string[] {
  const statsTable = within(container).getByRole('table', { name: 'Gambling statistics per player' })
  return within(statsTable)
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0].textContent ?? '')
}

/** Expands every section in a group, left to right. */
async function expandAll(user: UserEvent, group: HTMLElement): Promise<void> {
  for (const toggle of groupToggles(group)) {
    await user.click(toggle)
  }
}

/** The oracle: the whole ledger sorted by `order`, numbered from 1. */
function expectedSequences(ledger: GamblingLedger): Map<string, number[]> {
  const byPlayer = new Map<string, number[]>()
  ;[...ledger]
    .sort((a, b) => a.order - b.order)
    .forEach((entry, index) => {
      const sequences = byPlayer.get(entry.playerName) ?? []
      sequences.push(index + 1)
      byPlayer.set(entry.playerName, sequences)
    })
  return byPlayer
}

/** Distinct bet types a player actually placed, which is what breakdown rows cover. */
function expectedPlacedBetTypes(ledger: GamblingLedger, playerName: string): Set<string> {
  const placed = new Set<string>()
  for (const entry of ledger) {
    if (entry.playerName === playerName && entry.type === 'bet_placed') placed.add(entry.label)
  }
  return placed
}

// ─── Property 30: Per-player sections are a disjoint total cover ──────────────

describe('Property 30: Per-player sections are a disjoint total cover', () => {
  /**
   * **Validates: Requirements 9.1, 9.2, 9.8, 9.9**
   *
   * For any gambling ledger and player list, the per-player bet type breakdown
   * sections and per-player ledger sections appear in the same order as the
   * per-player summary stats table; each ledger entry naming a player in the
   * session appears in exactly one section, within that section in ascending
   * `order`, labelled with its position in the session-wide ascending `order`
   * sequence; and every player receives a section whose toggle is present even
   * when they have no rows.
   */

  it('gives every player a section in stats-table order and partitions the ledger across them', async () => {
    await fc.assert(
      fc.asyncProperty(sessionArb, async ({ playerNames, ledger }) => {
        cleanup()
        const user = setupUser()
        const { container } = render(<GamblingAnalytics session={makeSession(playerNames, ledger)} />)

        // Both groups run one section per player, in stats-table order — Requirement 9.1
        const statsOrder = statsTableOrder(container)
        expect(statsOrder).toEqual([...playerNames])

        const betTypeGroup = sectionGroup(container, BET_TYPE_HEADING)
        const ledgerGroup = sectionGroup(container, LEDGER_HEADING)
        expect(toggleNames(betTypeGroup)).toEqual(statsOrder)
        expect(toggleNames(ledgerGroup)).toEqual(statsOrder)

        await expandAll(user, ledgerGroup)
        await expandAll(user, betTypeGroup)

        const oracle = expectedSequences(ledger)
        const seenSequences: number[] = []

        for (const playerName of statsOrder) {
          const expectedForPlayer = oracle.get(playerName) ?? []
          const ledgerSection = groupToggles(ledgerGroup)
            .find((toggle) => toggle.querySelector(NAME_SELECTOR)?.textContent === playerName)
            ?.closest('.collapsible-player-section') as HTMLElement
          expect(ledgerSection).toBeTruthy()

          if (expectedForPlayer.length === 0) {
            // A player with no entries still gets a toggle and says so — Requirement 9.9
            expect(within(ledgerSection).getByText('No gambling actions recorded')).toBeTruthy()
            expect(ledgerSection.querySelector('.gambling-ledger-table')).toBeNull()
          } else {
            const table = within(ledgerSection).getByRole('table', {
              name: `${playerName} gambling ledger`,
            })
            const rows = within(table).getAllByRole('row').slice(1)
            // Each row's `#` is its session-wide position, ascending — Requirement 9.2
            const sequences = rows.map((row) =>
              Number(within(row).getAllByRole('cell')[0].textContent)
            )
            expect(sequences).toEqual(expectedForPlayer)
            expect([...sequences].sort((a, b) => a - b)).toEqual(sequences)
            seenSequences.push(...sequences)
          }

          const betTypeSection = groupToggles(betTypeGroup)
            .find((toggle) => toggle.querySelector(NAME_SELECTOR)?.textContent === playerName)
            ?.closest('.collapsible-player-section') as HTMLElement
          expect(betTypeSection).toBeTruthy()

          const placedBetTypes = expectedPlacedBetTypes(ledger, playerName)
          if (placedBetTypes.size === 0) {
            // A player with no bets still gets a toggle and says so — Requirement 9.8
            expect(within(betTypeSection).getByText('No bets placed')).toBeTruthy()
            expect(betTypeSection.querySelector('table')).toBeNull()
          } else {
            const table = within(betTypeSection).getByRole('table', {
              name: `${playerName} bet type breakdown`,
            })
            expect(within(table).getAllByRole('row').slice(1)).toHaveLength(placedBetTypes.size)
          }
        }

        // Disjoint and total: every entry landed in exactly one section, numbered
        // 1..n across the session with no gaps and no repeats — Requirement 9.2
        expect(seenSequences).toHaveLength(ledger.length)
        expect([...seenSequences].sort((a, b) => a - b)).toEqual(
          Array.from({ length: ledger.length }, (_, index) => index + 1)
        )
      }),
      { numRuns: 100 }
    )
  }, 360_000)
})
