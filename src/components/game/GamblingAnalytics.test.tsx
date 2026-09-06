// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { GamblingAnalytics } from './GamblingAnalytics'
import type { GameSession, NormalizedGame, Player, GamblingLedger } from '../../types/game'

// ─── Fixture Helpers ──────────────────────────────────────────────────────────

function makePlayer(name: string, score = 1000): Player {
  return {
    name,
    score,
    correctCount: 0,
    incorrectCount: 0,
    correctDailyDoubles: 0,
    incorrectDailyDoubles: 0,
    correctFinalJeopardy: 0,
    incorrectFinalJeopardy: 0,
    totalEarned: score > 0 ? score : 0,
  }
}

const MOCK_GAME: NormalizedGame = {
  rounds: {
    single: [
      {
        category: 'Science',
        clues: [
          { value: 200, clue: 'Q1', solution: 'A1', dailyDouble: false, html: false },
        ],
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

function makeSession(players: Player[], ledger: GamblingLedger = []): GameSession {
  return {
    game: MOCK_GAME,
    gameId: 'test-game',
    players,
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

/** The `.gambling-section-group` wrapping a given heading. */
function sectionGroup(heading: string): HTMLElement {
  return screen.getByText(heading).parentElement as HTMLElement
}

/** Expands one player's section inside the named group and returns the group. */
async function expandPlayer(heading: string, playerName: string): Promise<HTMLElement> {
  const group = sectionGroup(heading)
  await userEvent.click(within(group).getByRole('button', { name: playerName }))
  return group
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GamblingAnalytics', () => {
  describe('renders correctly with populated ledger', () => {
    const players = [makePlayer('Alice', 1200), makePlayer('Bob', 800)]
    const ledger: GamblingLedger = [
      { type: 'bid', playerName: 'Alice', amount: 300, label: 'Science', order: 0 },
      { type: 'bet_placed', playerName: 'Bob', amount: 200, label: 'round_leader', order: 1 },
      { type: 'bet_won', playerName: 'Bob', amount: 400, label: 'round_leader', order: 2 },
      { type: 'ownership_bonus', playerName: 'Alice', amount: 200, label: 'Science', order: 3 },
      { type: 'bet_placed', playerName: 'Alice', amount: 150, label: 'daily_double_found', order: 4 },
      { type: 'bet_lost', playerName: 'Alice', amount: 150, label: 'daily_double_found', order: 5 },
    ]

    it('displays player names in the stats table', () => {
      render(<GamblingAnalytics session={makeSession(players, ledger)} />)

      const statsTable = screen.getByRole('table', { name: 'Gambling statistics per player' })
      expect(within(statsTable).getByText('Alice')).toBeInTheDocument()
      expect(within(statsTable).getByText('Bob')).toBeInTheDocument()
    })

    it('renders correct stats values per player', () => {
      render(<GamblingAnalytics session={makeSession(players, ledger)} />)

      const statsTable = screen.getByRole('table', { name: 'Gambling statistics per player' })
      const rows = within(statsTable).getAllByRole('row')

      // Row[0] = header, Row[1] = Alice, Row[2] = Bob
      const aliceRow = rows[1]
      const bobRow = rows[2]

      // Alice: categoriesOwned=1, ownershipBonus=$200, bidSpend=$300, betsPlaced=1, betsWon=0, betsLost=1
      const aliceCells = within(aliceRow).getAllByRole('cell')
      expect(aliceCells[0]).toHaveTextContent('Alice')
      expect(aliceCells[1]).toHaveTextContent('1')   // categoriesOwned
      expect(aliceCells[2]).toHaveTextContent('$200') // ownership bonus
      expect(aliceCells[3]).toHaveTextContent('$300') // bid spend
      expect(aliceCells[4]).toHaveTextContent('1')   // bets placed
      expect(aliceCells[5]).toHaveTextContent('0')   // bets won
      expect(aliceCells[6]).toHaveTextContent('1')   // bets lost

      // Bob: categoriesOwned=0, ownershipBonus=$0, bidSpend=$0, betsPlaced=1, betsWon=1, betsLost=0
      const bobCells = within(bobRow).getAllByRole('cell')
      expect(bobCells[0]).toHaveTextContent('Bob')
      expect(bobCells[1]).toHaveTextContent('0')   // categoriesOwned
      expect(bobCells[4]).toHaveTextContent('1')   // bets placed
      expect(bobCells[5]).toHaveTextContent('1')   // bets won
      expect(bobCells[6]).toHaveTextContent('0')   // bets lost
    })

    it('renders each player their own ledger section holding only their entries', async () => {
      render(<GamblingAnalytics session={makeSession(players, ledger)} />)

      await expandPlayer('Gambling Ledger', 'Alice')
      const aliceTable = screen.getByRole('table', { name: 'Alice gambling ledger' })
      const aliceRows = within(aliceTable).getAllByRole('row').slice(1)
      expect(aliceRows).toHaveLength(4)
      expect(within(aliceRows[0]).getByText('Bid')).toBeInTheDocument()
      expect(within(aliceRows[1]).getByText('Ownership Bonus')).toBeInTheDocument()
      expect(within(aliceRows[2]).getByText('Bet Placed')).toBeInTheDocument()
      expect(within(aliceRows[3]).getByText('Bet Lost')).toBeInTheDocument()

      await expandPlayer('Gambling Ledger', 'Bob')
      const bobTable = screen.getByRole('table', { name: 'Bob gambling ledger' })
      const bobRows = within(bobTable).getAllByRole('row').slice(1)
      expect(bobRows).toHaveLength(2)
      expect(within(bobRows[0]).getByText('Bet Placed')).toBeInTheDocument()
      expect(within(bobRows[1]).getByText('Bet Won')).toBeInTheDocument()
    })

    it('numbers entries by their session-wide position', async () => {
      render(<GamblingAnalytics session={makeSession(players, ledger)} />)

      await expandPlayer('Gambling Ledger', 'Alice')
      await expandPlayer('Gambling Ledger', 'Bob')

      const aliceRows = within(screen.getByRole('table', { name: 'Alice gambling ledger' }))
        .getAllByRole('row')
        .slice(1)
      const bobRows = within(screen.getByRole('table', { name: 'Bob gambling ledger' }))
        .getAllByRole('row')
        .slice(1)

      // Alice holds orders 0, 3, 4, 5 → sequences 1, 4, 5, 6
      expect(aliceRows.map((row) => within(row).getAllByRole('cell')[0].textContent))
        .toEqual(['1', '4', '5', '6'])
      // Bob holds orders 1, 2 → sequences 2, 3
      expect(bobRows.map((row) => within(row).getAllByRole('cell')[0].textContent))
        .toEqual(['2', '3'])
    })

    it('renders exactly the four ledger headers and no Player column', async () => {
      render(<GamblingAnalytics session={makeSession(players, ledger)} />)

      await expandPlayer('Gambling Ledger', 'Alice')
      const headers = within(screen.getByRole('table', { name: 'Alice gambling ledger' }))
        .getAllByRole('columnheader')
      expect(headers.map((header) => header.textContent)).toEqual(['#', 'Type', 'Amount', 'Detail'])
    })

    it('renders no Player header in any per-player ledger table', async () => {
      render(<GamblingAnalytics session={makeSession(players, ledger)} />)

      await expandPlayer('Gambling Ledger', 'Alice')
      await expandPlayer('Gambling Ledger', 'Bob')

      for (const name of ['Alice', 'Bob']) {
        const table = within(screen.getByRole('table', { name: `${name} gambling ledger` }))
        expect(table.queryByRole('columnheader', { name: 'Player' })).not.toBeInTheDocument()
        // Order is stable per player, not just for the first section rendered
        expect(table.getAllByRole('columnheader').map((header) => header.textContent))
          .toEqual(['#', 'Type', 'Amount', 'Detail'])
      }
    })

    it('renders the stats table outside every collapsible player section', () => {
      render(<GamblingAnalytics session={makeSession(players, ledger)} />)

      const statsTable = screen.getByRole('table', { name: 'Gambling statistics per player' })
      expect(statsTable.closest('.collapsible-player-section')).toBeNull()
      expect(statsTable.closest('.gambling-section-group')).toBeNull()
    })

    it('renders exactly one stats table, visible with no section expanded', () => {
      render(<GamblingAnalytics session={makeSession(players, ledger)} />)

      // Every collapsible section starts collapsed, so nothing has been opened here
      for (const toggle of screen.getAllByRole('button')) {
        expect(toggle).toHaveAttribute('aria-expanded', 'false')
      }

      const statsTables = screen.getAllByRole('table', { name: 'Gambling statistics per player' })
      expect(statsTables).toHaveLength(1)
      expect(statsTables[0]).toBeVisible()
      // The stats table is the only table on the page while all sections are collapsed
      expect(screen.getAllByRole('table')).toHaveLength(1)
    })

    it('keeps the stats table outside the sections after a player is expanded', async () => {
      render(<GamblingAnalytics session={makeSession(players, ledger)} />)

      await expandPlayer('Gambling Ledger', 'Alice')

      const statsTable = screen.getByRole('table', { name: 'Gambling statistics per player' })
      expect(statsTable.closest('.collapsible-player-section')).toBeNull()
      expect(
        screen.getAllByRole('table', { name: 'Gambling statistics per player' }),
      ).toHaveLength(1)
    })

    it('renders human-readable detail text for bet and category entries', async () => {
      render(<GamblingAnalytics session={makeSession(players, ledger)} />)

      await expandPlayer('Gambling Ledger', 'Bob')
      const bobTable = screen.getByRole('table', { name: 'Bob gambling ledger' })
      // `round_leader` maps through the ledger label map
      expect(within(bobTable).getAllByText('Round Leader')).toHaveLength(2)

      await expandPlayer('Gambling Ledger', 'Alice')
      const aliceTable = screen.getByRole('table', { name: 'Alice gambling ledger' })
      // Category names pass through unmodified
      expect(within(aliceTable).getAllByText('Science')).toHaveLength(2)
      // An unmapped bet key is title-cased
      expect(within(aliceTable).getAllByText('Daily Double Found')).toHaveLength(2)
    })

    it('renders one bet type breakdown section per player with only that player rows', async () => {
      render(<GamblingAnalytics session={makeSession(players, ledger)} />)

      await expandPlayer('Bet Type Breakdown', 'Bob')
      const bobTable = screen.getByRole('table', { name: 'Bob bet type breakdown' })
      const bobRows = within(bobTable).getAllByRole('row').slice(1)
      expect(bobRows).toHaveLength(1)
      const bobCells = within(bobRows[0]).getAllByRole('cell')
      expect(bobCells[1]).toHaveTextContent('1') // won
      expect(bobCells[2]).toHaveTextContent('0') // lost
    })
  })

  describe('empty ledger displays appropriate message', () => {
    it('shows "No gambling actions recorded" inside an expanded player section', async () => {
      const players = [makePlayer('Alice'), makePlayer('Bob')]
      render(<GamblingAnalytics session={makeSession(players, [])} />)

      const group = await expandPlayer('Gambling Ledger', 'Alice')
      expect(within(group).getByText('No gambling actions recorded')).toBeInTheDocument()
    })

    it('shows "No bets placed" for a player who placed no side bets', async () => {
      const players = [makePlayer('Alice')]
      render(<GamblingAnalytics session={makeSession(players, [])} />)

      const group = await expandPlayer('Bet Type Breakdown', 'Alice')
      expect(within(group).getByText('No bets placed')).toBeInTheDocument()
    })

    it('does not render a ledger table when the player has no entries', async () => {
      const players = [makePlayer('Alice')]
      render(<GamblingAnalytics session={makeSession(players, [])} />)

      await expandPlayer('Gambling Ledger', 'Alice')
      expect(screen.queryByRole('table', { name: 'Alice gambling ledger' })).not.toBeInTheDocument()
    })

    it('still renders the stats table with zero values for empty ledger', () => {
      const players = [makePlayer('Alice')]
      render(<GamblingAnalytics session={makeSession(players, [])} />)

      const statsTable = screen.getByRole('table', { name: 'Gambling statistics per player' })
      expect(statsTable).toBeInTheDocument()
      expect(within(statsTable).getByText('Alice')).toBeInTheDocument()
    })
  })

  describe('net profit calculation display', () => {
    it('displays positive profit with +$ prefix and positive styling', () => {
      const players = [makePlayer('Alice')]
      // Alice: bet_won $400, no debits → netProfit = +400
      const ledger: GamblingLedger = [
        { type: 'bet_won', playerName: 'Alice', amount: 400, label: 'round_leader', order: 0 },
      ]
      render(<GamblingAnalytics session={makeSession(players, ledger)} />)

      const statsTable = screen.getByRole('table', { name: 'Gambling statistics per player' })
      const profitCell = within(statsTable).getByText('+$400')
      expect(profitCell).toBeInTheDocument()
      expect(profitCell).toHaveClass('gambling-stats-profit--positive')
    })

    it('displays negative profit with -$ prefix and negative styling', () => {
      const players = [makePlayer('Alice')]
      // Alice: bid $500, no credits → netProfit = -500
      const ledger: GamblingLedger = [
        { type: 'bid', playerName: 'Alice', amount: 500, label: 'History', order: 0 },
      ]
      render(<GamblingAnalytics session={makeSession(players, ledger)} />)

      const statsTable = screen.getByRole('table', { name: 'Gambling statistics per player' })
      const profitCell = within(statsTable).getByText('-$500')
      expect(profitCell).toBeInTheDocument()
      expect(profitCell).toHaveClass('gambling-stats-profit--negative')
    })

    it('displays zero profit with $0 and zero styling', () => {
      const players = [makePlayer('Alice')]
      // Alice: bid $200 + bet_won $200 → netProfit = 0
      const ledger: GamblingLedger = [
        { type: 'bid', playerName: 'Alice', amount: 200, label: 'Science', order: 0 },
        { type: 'bet_won', playerName: 'Alice', amount: 200, label: 'round_leader', order: 1 },
      ]
      render(<GamblingAnalytics session={makeSession(players, ledger)} />)

      const statsTable = screen.getByRole('table', { name: 'Gambling statistics per player' })
      const rows = within(statsTable).getAllByRole('row')
      // Row[0] = header, Row[1] = Alice
      const aliceCells = within(rows[1]).getAllByRole('cell')
      // Net Profit is the last cell (index 7)
      const profitCell = aliceCells[7]
      expect(profitCell).toHaveTextContent('$0')
      expect(profitCell).toHaveClass('gambling-stats-profit--zero')
    })

    it('correctly calculates net profit across multiple entry types', () => {
      const players = [makePlayer('Alice')]
      // Alice: bid=$300, bet_placed=$150, bet_won=$600, ownership_bonus=$200
      // Net = (600 + 200) - (300 + 150) = 350
      const ledger: GamblingLedger = [
        { type: 'bid', playerName: 'Alice', amount: 300, label: 'Science', order: 0 },
        { type: 'bet_placed', playerName: 'Alice', amount: 150, label: 'round_leader', order: 1 },
        { type: 'bet_won', playerName: 'Alice', amount: 600, label: 'round_leader', order: 2 },
        { type: 'ownership_bonus', playerName: 'Alice', amount: 200, label: 'Science', order: 3 },
      ]
      render(<GamblingAnalytics session={makeSession(players, ledger)} />)

      const statsTable = screen.getByRole('table', { name: 'Gambling statistics per player' })
      expect(within(statsTable).getByText('+$350')).toBeInTheDocument()
    })
  })
})
