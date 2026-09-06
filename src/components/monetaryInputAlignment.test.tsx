// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { FinalRound, Player } from '../types/game'
import { beginGamblingPhases } from '../utils/gamblingAllowance'

import { PlayerAuctionPanel } from './player/PlayerAuctionPanel'
import { PlayerBettingPanel } from './player/PlayerBettingPanel'
import { CategoryAuction } from './game/CategoryAuction'
import { BettingSideGames } from './game/BettingSideGames'
import { DailyDoubleWager } from './game/DailyDoubleWager'
import { WagerEntry } from './game/WagerEntry'
import { FinalJeopardy } from './game/FinalJeopardy'
import { FinalJeopardyEntryPage } from './player/FinalJeopardyEntryPage'

// `FinalJeopardyEntryPage` fetches the session on mount purely to restore a
// previously submitted wager; the network call is replaced so the component
// reaches its wager-entry render synchronously.
vi.mock('../utils/sessionApi', () => ({
  fetchSession: vi.fn().mockResolvedValue({
    final_jeopardy_state: { wagers: [], submissions: [] },
  }),
  updateFinalJeopardyState: vi.fn().mockResolvedValue(undefined),
}))

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makePlayer(name: string, score: number): Player {
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

const FINAL_ROUND: FinalRound = {
  category: 'World Capitals',
  clue: 'This city sits on the Seine.',
  solution: 'Paris',
  html: false,
}

const mockChannel = {
  send: vi.fn().mockResolvedValue('ok'),
} as unknown as import('@supabase/supabase-js').RealtimeChannel

// ─── Shared assertion ────────────────────────────────────────────────────────

/**
 * Requirement 6.1–6.4: a Monetary_Input carries the one shared `monetary-input`
 * class and no per-component inline horizontal alignment, so alignment comes
 * from the single stylesheet rule for every surface.
 */
function expectSharedAlignmentClass(input: HTMLElement) {
  expect(input).toHaveClass('monetary-input')
  expect(input.style.textAlign).toBe('')
  expect(input.getAttribute('style') ?? '').not.toMatch(/text-align/i)
}

// ─── Stylesheet rule ─────────────────────────────────────────────────────────

/** Returns the declaration block for an exact selector, or `null`. */
function ruleBody(css: string, selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(css)
  return match ? match[1] : null
}

describe('Monetary_Input shared alignment rule (Req 6.1, 6.2, 6.4)', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/routes/index.css'), 'utf-8')

  it('right-aligns the typed value via the shared .monetary-input rule', () => {
    const body = ruleBody(css, '.monetary-input')
    expect(body).not.toBeNull()
    expect(body).toMatch(/text-align\s*:\s*right\s*;?/)
  })

  it('right-aligns the placeholder via .monetary-input::placeholder', () => {
    const body = ruleBody(css, '.monetary-input::placeholder')
    expect(body).not.toBeNull()
    expect(body).toMatch(/text-align\s*:\s*right\s*;?/)
  })

  it('declares both rules in the shared stylesheet rather than per component', () => {
    const occurrences = css.match(/\.monetary-input(::placeholder)?\s*\{/g) ?? []
    expect(occurrences).toHaveLength(2)
  })
})

// ─── Auction_UI (Req 6.3, 6.4) ───────────────────────────────────────────────

describe('Auction_UI monetary inputs (Req 6.3, 6.4)', () => {
  it('PlayerAuctionPanel bid input uses the shared class with no inline alignment', () => {
    render(
      <PlayerAuctionPanel
        category="Science"
        categoryIndex={0}
        roundName="round-1"
        playerBalance={1000}
        timerDuration={30}
        channel={mockChannel}
        playerName="Alice"
        onBidSubmitted={vi.fn()}
      />
    )

    expectSharedAlignmentClass(screen.getByLabelText('Your Bid'))
  })

  it('CategoryAuction bid input uses the shared class with no inline alignment', () => {
    const auctionPlayers = [makePlayer('Alice', 1000), makePlayer('Bob', 800)]
    render(
      <CategoryAuction
        categories={['Science', 'History']}
        roundName="round-1"
        players={auctionPlayers}
        budgetState={beginGamblingPhases(auctionPlayers)}
        auctionTimer={30}
        onAuctionComplete={vi.fn()}
      />
    )

    expectSharedAlignmentClass(screen.getByLabelText('Bid for Alice'))
    expectSharedAlignmentClass(screen.getByLabelText('Bid for Bob'))
  })
})

// ─── Betting_UI (Req 6.3, 6.4) ───────────────────────────────────────────────

describe('Betting_UI monetary inputs (Req 6.3, 6.4)', () => {
  it('PlayerBettingPanel wager input uses the shared class with no inline alignment', () => {
    render(
      <PlayerBettingPanel
        availableBets={[{ betType: 'round_leader', description: 'Who will lead?' }]}
        playerBalance={1000}
        timerDuration={60}
        channel={mockChannel}
        playerName="Alice"
        players={['Alice', 'Bob']}
        onBettingDone={vi.fn()}
      />
    )

    expectSharedAlignmentClass(screen.getByLabelText('Wager'))
  })

  it('BettingSideGames wager input uses the shared class with no inline alignment', () => {
    const bettingPlayers = [makePlayer('Alice', 1000), makePlayer('Bob', 800)]
    const { container } = render(
      <BettingSideGames
        players={bettingPlayers}
        budgetState={beginGamblingPhases(bettingPlayers)}
        roundHasDailyDouble={false}
        onBettingComplete={vi.fn()}
      />
    )

    // The wager field only appears once a bet type (and its default prediction)
    // has been chosen for the current player.
    const betTypeButton = container.querySelector('.betting-side-games__bet-type-btn')
    expect(betTypeButton).not.toBeNull()
    fireEvent.click(betTypeButton as Element)

    expectSharedAlignmentClass(screen.getByLabelText('Wager for Alice'))
  })
})

// ─── Daily_Double_Wager_Form (Req 6.3, 6.4) ──────────────────────────────────

describe('Daily_Double_Wager_Form monetary input (Req 6.3, 6.4)', () => {
  it('DailyDoubleWager input uses the shared class with no inline alignment', () => {
    render(
      <DailyDoubleWager
        player={makePlayer('Alice', 1200)}
        categoryName="Science"
        onSubmit={vi.fn()}
      />
    )

    expectSharedAlignmentClass(screen.getByPlaceholderText('Enter wager...'))
  })
})

// ─── Final_Jeopardy_Wager_Form (Req 6.3, 6.4) ────────────────────────────────

describe('Final_Jeopardy_Wager_Form monetary inputs (Req 6.3, 6.4)', () => {
  it('WagerEntry inputs use the shared class with no inline alignment', () => {
    render(
      <WagerEntry
        players={[makePlayer('Alice', 1000), makePlayer('Bob', -400)]}
        wagerFloor={100}
        onReveal={vi.fn()}
      />
    )

    expectSharedAlignmentClass(screen.getByLabelText('Wager for Alice'))
    expectSharedAlignmentClass(screen.getByLabelText('Wager for Bob'))
  })

  it('FinalJeopardyEntryPage wager input uses the shared class with no inline alignment', async () => {
    render(
      <FinalJeopardyEntryPage
        sessionId="session-1"
        playerName="Alice"
        playerScore={1000}
        channel={mockChannel}
      />
    )

    const input = await waitFor(() => screen.getByLabelText('Wager'))
    expectSharedAlignmentClass(input)
  })

  it('FinalJeopardy co-op team wager input uses the shared class with no inline alignment', () => {
    const { container } = render(
      <FinalJeopardy
        finalRound={FINAL_ROUND}
        players={[makePlayer('Alice', 1000)]}
        onComplete={vi.fn()}
        coopMode
        teamPool={5000}
        onCoopWagerSubmit={vi.fn()}
      />
    )

    const input = container.querySelector('#coop-wager-input')
    expect(input).not.toBeNull()
    expectSharedAlignmentClass(input as HTMLElement)
  })
})

// ─── Cross-surface consistency (Req 6.3, 6.4) ────────────────────────────────

describe('All four surfaces share one alignment mechanism (Req 6.3, 6.4)', () => {
  it('no monetary input component declares an inline textAlign in its source', () => {
    const sources = [
      'src/components/player/PlayerAuctionPanel.tsx',
      'src/components/game/CategoryAuction.tsx',
      'src/components/player/PlayerBettingPanel.tsx',
      'src/components/game/BettingSideGames.tsx',
      'src/components/game/DailyDoubleWager.tsx',
      'src/components/game/WagerEntry.tsx',
      'src/components/player/FinalJeopardyEntryPage.tsx',
      'src/components/game/FinalJeopardy.tsx',
    ]

    for (const path of sources) {
      const source = readFileSync(resolve(process.cwd(), path), 'utf-8')
      expect(source, `${path} must not set textAlign inline`).not.toMatch(/textAlign/)
    }
  })
})
