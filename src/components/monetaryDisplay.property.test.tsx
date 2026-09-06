// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest'
import fc from 'fast-check'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import type {
  ClueState,
  GameSession,
  NormalizedGame,
  Player,
  RoundName,
} from '../types/game'
import { DEFAULT_TOGGLE_CONFIG } from '../types/game'
import type { EnrichedDDRecord } from '../utils/analyticsUtils'
import { formatCurrency, formatSignedChange } from '../utils/currency'
import {
  MIN_COMMITMENT,
  beginGamblingPhases,
  budgetTotal,
  type GamblingBudgetState,
  type PlayerBudgetView,
} from '../utils/gamblingAllowance'
import { computeGamblingStatsExpanded } from '../utils/gamblingScoring'
import { computeDailyDoubleWagerRange } from '../utils/gamblingScoring'
import {
  computeBalanceRelativeWagerRange,
  computeLowestPositiveBalance,
} from '../utils/gameToggles'

import { PlayerAuctionPanel } from './player/PlayerAuctionPanel'
import { CategoryAuction } from './game/CategoryAuction'
import { PlayerBettingPanel } from './player/PlayerBettingPanel'
import { BettingSideGames } from './game/BettingSideGames'
import { DailyDoubleWager } from './game/DailyDoubleWager'
import { WagerEntry } from './game/WagerEntry'
import { FinalJeopardyEntryPage } from './player/FinalJeopardyEntryPage'
import { AnalyticsScreen } from './game/AnalyticsScreen'
import { ClueHeatmap } from './game/ClueHeatmap'
import { GamblingAnalytics } from './game/GamblingAnalytics'
import { DailyDoubleBreakdown } from './game/DailyDoubleBreakdown'
import { BiggestComeback } from './game/BiggestComeback'
import { LongestLossStreak } from './game/LongestLossStreak'
import { AuctionResultView } from './host/AuctionResultView'
import { PlayerBalanceList } from './host/PlayerBalanceList'
import { BettingStatusView } from './host/BettingStatusView'
import { CategoryWinToast } from './player/CategoryWinToast'

// Feature: negative-balance-and-analytics-updates
// Property 22: Monetary displays emit formatter output verbatim
// **Validates: Requirements 5.5, 5.6, 5.7, 5.8, 5.9**

// ─── Mocks (infrastructure only — no display logic is mocked) ─────────────────

// `FinalJeopardyEntryPage` fetches the session on mount to restore a submitted
// wager and the persisted `wagerConfig`; the network call is replaced so the
// component reaches its wager-entry render.
vi.mock('../utils/sessionApi', () => ({
  fetchSession: vi.fn().mockResolvedValue({
    final_jeopardy_state: { wagers: [], submissions: [] },
  }),
  updateFinalJeopardyState: vi.fn().mockResolvedValue(undefined),
}))

// `AnalyticsScreen` fires confetti, posts stats, and animates its card. None of
// that is reachable in jsdom, and none of it is monetary display.
vi.mock('canvas-confetti', () => ({
  default: Object.assign(vi.fn(), { create: vi.fn(() => vi.fn()) }),
}))
vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, className, style }: React.HTMLAttributes<HTMLDivElement>) => (
      <div className={className} style={style}>{children}</div>
    ),
  },
}))
vi.mock('react-toastify', () => ({
  toast: { warning: vi.fn(), error: vi.fn(), success: vi.fn() },
}))
vi.mock('../utils/gameApi', () => ({
  updateGameStats: vi.fn().mockResolvedValue({ success: true }),
}))
vi.mock('../hooks/usePlayerProfileContext', () => ({
  usePlayerProfileContext: () => ({ profile: null, loading: false, refreshProfile: vi.fn() }),
}))

afterEach(cleanup)

// ─── Verbatim assertion ──────────────────────────────────────────────────────

/**
 * True when `formatted` appears in `text` as a standalone monetary token.
 *
 * Plain containment is too weak: `'$500'` is a substring of both `'-$500'` and
 * `'$500,000'`, so a display that dropped the sign or re-grouped the digits
 * would still pass. An occurrence counts only when the character before it is
 * not a sign, digit, or `$`, and the character after it neither continues the
 * number (a digit or a `,` group separator) nor opens a decimal fraction (a `.`
 * followed by a digit). A sentence-final `.` is not part of the amount.
 */
function containsVerbatim(text: string, formatted: string): boolean {
  if (formatted === '') return false
  for (let index = text.indexOf(formatted); index !== -1; index = text.indexOf(formatted, index + 1)) {
    const before = text[index - 1]
    const after = text[index + formatted.length]
    const afterNext = text[index + formatted.length + 1]
    const okBefore = before === undefined || !/[-+\d$]/.test(before)
    const startsFraction = after === '.' && afterNext !== undefined && /\d/.test(afterNext)
    const okAfter = after === undefined || (!/[\d,]/.test(after) && !startsFraction)
    if (okBefore && okAfter) return true
  }
  return false
}

/** Asserts the rendered text carries the formatter output verbatim. */
function expectVerbatim(text: string | null, formatted: string): void {
  expect(
    containsVerbatim(text ?? '', formatted),
    `expected ${JSON.stringify(text)} to contain ${JSON.stringify(formatted)} verbatim`,
  ).toBe(true)
}

function textOf(container: ParentNode, selector: string): string {
  const element = container.querySelector(selector)
  expect(element, `missing ${selector}`).not.toBeNull()
  return element!.textContent ?? ''
}

// ─── Generators ──────────────────────────────────────────────────────────────

/**
 * Monetary values across the domain: negatives, `0`, `-0`, and values large
 * enough to carry one, two, and three thousands separators.
 *
 * Only finite values are generated. Both formatters return `''` for a
 * non-finite input, and `''` is a substring of every string, so a non-finite
 * value cannot witness a verbatim-output property. The `''` contract is covered
 * by Properties 19 and 21, and the Category_Win_Toast fallback by Property 23.
 */
const monetaryArb: fc.Arbitrary<number> = fc.oneof(
  { weight: 4, arbitrary: fc.integer({ min: -9_999_999, max: 9_999_999 }) },
  {
    weight: 3,
    arbitrary: fc.constantFrom(
      0, -0, 1, -1, 999, -999, 1_000, -1_000, 12_345, -12_345,
      1_234_567, -1_234_567, 9_999_999, -9_999_999,
    ),
  },
)

/** Amounts a player can actually commit or be credited: $1 and up. */
const positiveMonetaryArb: fc.Arbitrary<number> = fc.oneof(
  { weight: 4, arbitrary: fc.integer({ min: MIN_COMMITMENT, max: 9_999_999 }) },
  { weight: 3, arbitrary: fc.constantFrom(1, 500, 999, 1_000, 12_345, 1_234_567, 9_999_999) },
)

/** A Spendable_Budget that is never negative, as the controllers guarantee. */
const budgetArb: fc.Arbitrary<number> = fc.oneof(
  { weight: 4, arbitrary: fc.integer({ min: 0, max: 9_999_999 }) },
  { weight: 3, arbitrary: fc.constantFrom(0, 1, 500, 1_000, 12_345, 1_234_567) },
)

const budgetViewArb: fc.Arbitrary<PlayerBudgetView> = fc.record({
  realBalance: monetaryArb,
  unspent: budgetArb,
  isAllowance: fc.boolean(),
})

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

const mockChannel = {
  send: vi.fn().mockResolvedValue('ok'),
} as unknown as import('@supabase/supabase-js').RealtimeChannel

/** A one-round board whose clue values are the generated monetary amounts. */
function makeGame(clueValues: number[]): NormalizedGame {
  return {
    rounds: {
      single: [
        {
          category: 'Science',
          clues: clueValues.map((value, index) => ({
            value,
            clue: `Q${index}`,
            solution: `A${index}`,
            dailyDouble: false,
            html: false,
          })),
        },
      ],
      double: [],
      triple: [],
      quadruple: [],
      quintuple: [],
      sextuple: [],
    },
    final: { category: 'Final', clue: 'Final Q', solution: 'Final A', html: false },
    totalRounds: 1,
  }
}

function makeSession(
  players: Player[],
  overrides: Partial<GameSession> = {},
): GameSession {
  return {
    game: makeGame([200, 400]),
    gameId: 'game-1',
    players,
    currentRoundIndex: 0,
    orderedRoundNames: ['single'] as RoundName[],
    clueStates: {} as Record<string, ClueState>,
    dailyDoubleRecords: [],
    toggleConfig: DEFAULT_TOGGLE_CONFIG,
    streakCounts: {},
    perRoundIncorrect: {},
    activeWagers: null,
    teamPool: 0,
    targetScore: 0,
    boardTotal: 0,
    gamblingLedger: [],
    categoryOwnership: {},
    activeSideBets: [],
    ...overrides,
  }
}

/** The frozen budget state the auction and betting surfaces are driven by. */
function makeBudgetState(players: Player[]): GamblingBudgetState {
  return beginGamblingPhases(players)
}

const RENDER_RUNS = 100

// ─── Property 22 — Auction_UI (Requirement 5.5) ──────────────────────────────

describe('Property 22: Monetary displays emit formatter output verbatim — Auction_UI (Req 5.5)', () => {
  it('PlayerAuctionPanel renders budget, balance, range hint, and bid error via formatCurrency', () => {
    fc.assert(
      fc.property(budgetViewArb, (budget) => {
        const { container } = render(
          <PlayerAuctionPanel
            category="Science"
            categoryIndex={0}
            roundName="single"
            playerBalance={budget.realBalance}
            timerDuration={30}
            channel={mockChannel}
            playerName="Alice"
            onBidSubmitted={vi.fn()}
            budget={budget}
          />
        )
        try {
          const budgetLine = budget.isAllowance
            ? textOf(container, '.auction-panel__allowance')
            : textOf(container, '.auction-panel__available')
          expectVerbatim(budgetLine, formatCurrency(budget.unspent))
          expectVerbatim(textOf(container, '.auction-panel__balance'), formatCurrency(budget.realBalance))

          const hint = textOf(container, '#auction-bid-hint')
          expectVerbatim(hint, formatCurrency(MIN_COMMITMENT))
          expectVerbatim(hint, formatCurrency(budget.unspent))

          // A bid above the budget is rejected with the remaining budget named
          // by the Currency_Formatter (Requirement 5.5, error-message case).
          const overBudget = budget.unspent + 1
          fireEvent.change(screen.getByLabelText('Your Bid'), { target: { value: String(overBudget) } })
          fireEvent.click(screen.getByRole('button', { name: 'Place Bid' }))
          expectVerbatim(textOf(container, '#auction-bid-error'), formatCurrency(budget.unspent))
        } finally {
          cleanup()
        }
      }),
      { numRuns: RENDER_RUNS }
    )
  })

  it('CategoryAuction renders each row budget and balance via formatCurrency', () => {
    fc.assert(
      fc.property(fc.array(monetaryArb, { minLength: 1, maxLength: 3 }), (scores) => {
        const players = scores.map((score, index) => makePlayer(`Player${index}`, score))
        const budgetState = makeBudgetState(players)
        const { container } = render(
          <CategoryAuction
            categories={['Science']}
            roundName="single"
            players={players}
            budgetState={budgetState}
            auctionTimer={30}
            onAuctionComplete={vi.fn()}
          />
        )
        try {
          const rows = container.querySelectorAll('.auction-player-row')
          expect(rows).toHaveLength(players.length)

          players.forEach((player, index) => {
            const row = rows[index]
            const unspent = budgetTotal(budgetState, player.name)
            const budgetLine = player.score <= 0
              ? textOf(row, '.auction-player-row__allowance')
              : textOf(row, '.auction-player-row__available')
            expectVerbatim(budgetLine, formatCurrency(unspent))
            expectVerbatim(textOf(row, '.auction-player-row__balance'), formatCurrency(player.score))
          })
        } finally {
          cleanup()
        }
      }),
      { numRuns: RENDER_RUNS }
    )
  })
})

// ─── Property 22 — Betting_UI (Requirement 5.6) ──────────────────────────────

describe('Property 22: Monetary displays emit formatter output verbatim — Betting_UI (Req 5.6)', () => {
  it('PlayerBettingPanel renders budget, balance, wager limit, placeholder, and error via formatCurrency', () => {
    fc.assert(
      fc.property(budgetViewArb, (budget) => {
        const { container } = render(
          <PlayerBettingPanel
            availableBets={[{ betType: 'round_leader', description: 'Who will lead?' }]}
            playerBalance={budget.realBalance}
            timerDuration={60}
            channel={mockChannel}
            playerName="Alice"
            players={['Alice', 'Bob']}
            onBettingDone={vi.fn()}
            budget={budget}
          />
        )
        try {
          const budgetLine = budget.isAllowance
            ? textOf(container, '.betting-panel__allowance')
            : textOf(container, '.betting-panel__available')
          expectVerbatim(budgetLine, formatCurrency(budget.unspent))
          expectVerbatim(textOf(container, '.betting-panel__balance'), formatCurrency(budget.realBalance))
          expectVerbatim(textOf(container, '#wager-hint'), formatCurrency(budget.unspent))

          const input = screen.getByLabelText('Wager') as HTMLInputElement
          expect(input.placeholder).toBe(formatCurrency(0))

          // The over-budget rejection names the remaining budget. The field is
          // disabled once nothing can be committed, so this case needs $1 of room.
          if (budget.unspent >= MIN_COMMITMENT) {
            fireEvent.change(input, { target: { value: String(budget.unspent + 1) } })
            fireEvent.click(screen.getByRole('button', { name: 'Add Bet' }))
            expectVerbatim(textOf(container, '#wager-error'), formatCurrency(budget.unspent))
          }
        } finally {
          cleanup()
        }
      }),
      { numRuns: RENDER_RUNS }
    )
  })

  it('BettingSideGames renders budget, balance, and wager placeholder via formatCurrency', () => {
    fc.assert(
      fc.property(monetaryArb, monetaryArb, (scoreA, scoreB) => {
        const players = [makePlayer('Alice', scoreA), makePlayer('Bob', scoreB)]
        const budgetState = makeBudgetState(players)
        const { container } = render(
          <BettingSideGames
            players={players}
            budgetState={budgetState}
            roundHasDailyDouble={false}
            onBettingComplete={vi.fn()}
          />
        )
        try {
          const unspent = budgetTotal(budgetState, 'Alice')
          const budgetLine = scoreA <= 0
            ? textOf(container, '.betting-side-games__allowance')
            : textOf(container, '.betting-side-games__available')
          expectVerbatim(budgetLine, formatCurrency(unspent))
          expectVerbatim(textOf(container, '.betting-side-games__player-balance'), formatCurrency(scoreA))

          // The Monetary_Input placeholder appears once a bet type is chosen.
          const betTypeButton = container.querySelector('.betting-side-games__bet-type-btn')
          expect(betTypeButton).not.toBeNull()
          fireEvent.click(betTypeButton as Element)
          const input = screen.getByLabelText('Wager for Alice') as HTMLInputElement
          expect(input.placeholder).toBe(
            `${formatCurrency(MIN_COMMITMENT)} – ${formatCurrency(unspent)}`
          )

          // The over-budget rejection names the remaining budget.
          fireEvent.change(input, { target: { value: String(unspent + 1) } })
          fireEvent.click(screen.getByRole('button', { name: 'Place Bet' }))
          expectVerbatim(textOf(container, '.betting-side-games__error'), formatCurrency(unspent))
        } finally {
          cleanup()
        }
      }),
      { numRuns: RENDER_RUNS }
    )
  })
})

// ─── Property 22 — wager forms (Requirement 5.7) ─────────────────────────────

describe('Property 22: Monetary displays emit formatter output verbatim — wager forms (Req 5.7)', () => {
  it('DailyDoubleWager renders the score, both bounds, and the range error via formatCurrency', () => {
    fc.assert(
      fc.property(monetaryArb, (score) => {
        const { container } = render(
          <DailyDoubleWager
            player={makePlayer('Alice', score)}
            categoryName="Science"
            onSubmit={vi.fn()}
          />
        )
        try {
          const { min, max } = computeDailyDoubleWagerRange(score)
          const info = textOf(container, '.dd-wager-info')
          expectVerbatim(info, formatCurrency(score))
          expectVerbatim(info, formatCurrency(min))
          expectVerbatim(info, formatCurrency(max))

          const input = screen.getByPlaceholderText('Enter wager...')
          fireEvent.change(input, { target: { value: String(max + 1) } })
          fireEvent.click(screen.getByRole('button', { name: 'Submit Wager' }))
          const error = textOf(container, '.dd-wager-error')
          expectVerbatim(error, formatCurrency(min))
          expectVerbatim(error, formatCurrency(max))
        } finally {
          cleanup()
        }
      }),
      { numRuns: RENDER_RUNS }
    )
  })

  it('WagerEntry renders each score and both range bounds via formatCurrency', () => {
    fc.assert(
      fc.property(
        fc.array(monetaryArb, { minLength: 1, maxLength: 3 }),
        fc.integer({ min: 1, max: 10_000 }),
        (scores, wagerFloor) => {
          const players = scores.map((score, index) => makePlayer(`Player${index}`, score))
          const { container } = render(
            <WagerEntry players={players} wagerFloor={wagerFloor} onReveal={vi.fn()} />
          )
          try {
            const lowestPositive = computeLowestPositiveBalance(players)
            const rows = container.querySelectorAll('.wager-entry-row')
            expect(rows).toHaveLength(players.length)

            players.forEach((player, index) => {
              const row = rows[index]
              const { min, max } = computeBalanceRelativeWagerRange(
                player.score,
                wagerFloor,
                lowestPositive,
              )
              expect(textOf(row, '.wager-entry-player-score')).toBe(formatCurrency(player.score))
              const range = textOf(row, '.wager-entry-range')
              expectVerbatim(range, formatCurrency(min))
              expectVerbatim(range, formatCurrency(max))
            })
          } finally {
            cleanup()
          }
        }
      ),
      { numRuns: RENDER_RUNS }
    )
  })

  it('FinalJeopardyEntryPage renders the score and both range bounds via formatCurrency', async () => {
    await fc.assert(
      fc.asyncProperty(monetaryArb, async (score) => {
        const { container } = render(
          <FinalJeopardyEntryPage
            sessionId="session-1"
            playerName="Alice"
            playerScore={score}
            channel={mockChannel}
          />
        )
        try {
          await waitFor(() => screen.getByLabelText('Wager'))
          const { min, max } = computeBalanceRelativeWagerRange(
            score,
            DEFAULT_TOGGLE_CONFIG.wagering.wagerFloor,
            computeLowestPositiveBalance([]),
          )
          const header = textOf(container, '.fj-entry__header')
          expectVerbatim(header, formatCurrency(score))
          expectVerbatim(header, formatCurrency(min))
          expectVerbatim(header, formatCurrency(max))

          // The out-of-range rejection names both bounds (Requirement 5.7, error case).
          fireEvent.change(screen.getByLabelText('Wager'), { target: { value: String(max + 1) } })
          fireEvent.click(screen.getByRole('button', { name: 'Submit Wager' }))
          const error = await waitFor(() => {
            const node = container.querySelector('#fj-wager-error')
            expect(node).not.toBeNull()
            return node!.textContent ?? ''
          })
          expectVerbatim(error, formatCurrency(min))
          expectVerbatim(error, formatCurrency(max))
        } finally {
          cleanup()
        }
      }),
      { numRuns: RENDER_RUNS }
    )
  })
})

// ─── Property 22 — Analytics_Screen and analytics components (Requirement 5.8) ─

describe('Property 22: Monetary displays emit formatter output verbatim — analytics (Req 5.8)', () => {
  it('AnalyticsScreen renders every final standing via formatCurrency', () => {
    fc.assert(
      fc.property(fc.array(monetaryArb, { minLength: 1, maxLength: 4 }), (scores) => {
        const players = scores.map((score, index) => makePlayer(`Player${index}`, score))
        const { container } = render(
          <AnalyticsScreen session={makeSession(players)} gameId="game-1" onBackToHome={vi.fn()} />
        )
        try {
          const items = container.querySelectorAll('.analytics-standings .analytics-player')
          expect(items).toHaveLength(players.length)

          const rendered = new Map<string, string>()
          items.forEach((item) => {
            rendered.set(
              textOf(item, '.analytics-player-name'),
              textOf(item, '.analytics-score'),
            )
          })

          for (const player of players) {
            expect(rendered.get(player.name)).toBe(formatCurrency(player.score))
          }
        } finally {
          cleanup()
        }
      }),
      { numRuns: RENDER_RUNS }
    )
  })

  it('ClueHeatmap renders every cell value via formatCurrency', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            { weight: 4, arbitrary: fc.integer({ min: 0, max: 9_999_999 }) },
            { weight: 3, arbitrary: fc.constantFrom(0, 200, 1_000, 12_345, 1_234_567) },
          ),
          { minLength: 1, maxLength: 5 }
        ),
        (clueValues) => {
          const session = makeSession([makePlayer('Alice', 0)], { game: makeGame(clueValues) })
          const { container } = render(<ClueHeatmap session={session} />)
          try {
            const cells = container.querySelectorAll('.clue-heatmap-cell')
            expect(cells).toHaveLength(clueValues.length)
            clueValues.forEach((value, index) => {
              expect(cells[index].textContent).toBe(formatCurrency(value))
            })
          } finally {
            cleanup()
          }
        }
      ),
      { numRuns: RENDER_RUNS }
    )
  })

  it('GamblingAnalytics renders stats amounts, net profit, and ledger amounts verbatim', () => {
    fc.assert(
      fc.property(positiveMonetaryArb, positiveMonetaryArb, (bidAmount, bonusAmount) => {
        const players = [makePlayer('Alice', 0)]
        const ledger = [
          { type: 'bid' as const, playerName: 'Alice', amount: bidAmount, label: 'Science', order: 0 },
          { type: 'ownership_bonus' as const, playerName: 'Alice', amount: bonusAmount, label: 'Science', order: 1 },
        ]
        const session = makeSession(players, {
          gamblingLedger: ledger,
          toggleConfig: {
            ...DEFAULT_TOGGLE_CONFIG,
            gambling: { enabled: true, startingBalance: 1000, auctionTimer: 20 },
          },
        })
        const [stats] = computeGamblingStatsExpanded(ledger, players)
        const { container } = render(<GamblingAnalytics session={session} />)
        try {
          // Per-player stats table — always visible.
          const cells = container.querySelectorAll('.gambling-stats-table .gambling-stats-td')
          expect(cells[2].textContent).toBe(formatCurrency(stats.ownershipBonusEarned))
          expect(cells[3].textContent).toBe(formatCurrency(stats.totalBidSpend))
          expect(cells[7].textContent).toBe(formatSignedChange(stats.netGamblingProfit))

          // Ledger section — the Amount column, once the section is expanded.
          const ledgerGroup = container.querySelectorAll('.gambling-section-group')[1]
          fireEvent.click(ledgerGroup.querySelector('.collapsible-player-section__toggle') as Element)
          const amounts = ledgerGroup.querySelectorAll('.gambling-ledger-amount')
          expect(amounts).toHaveLength(ledger.length)
          ledger.forEach((entry, index) => {
            expect(amounts[index].textContent).toBe(formatCurrency(entry.amount))
          })
        } finally {
          cleanup()
        }
      }),
      { numRuns: RENDER_RUNS }
    )
  })

  it('DailyDoubleBreakdown renders the wager via formatCurrency and net impact via formatSignedChange', () => {
    fc.assert(
      fc.property(positiveMonetaryArb, monetaryArb, (wager, netImpact) => {
        const record: EnrichedDDRecord = {
          clueKey: 'single-0-0',
          playerName: 'Alice',
          wager,
          outcome: netImpact >= 0 ? 'correct' : 'incorrect',
          roundDisplayName: 'Single Jeopardy',
          categoryName: 'Science',
          clueValue: wager,
          netImpact,
        }
        const { container } = render(<DailyDoubleBreakdown records={[record]} />)
        try {
          const cells = container.querySelectorAll('.dd-breakdown-td')
          expect(cells[3].textContent).toBe(formatCurrency(wager))
          expect(cells[5].textContent).toBe(formatSignedChange(netImpact))
        } finally {
          cleanup()
        }
      }),
      { numRuns: RENDER_RUNS }
    )
  })

  it('BiggestComeback renders the delta via formatSignedChange and the low point via formatCurrency', () => {
    fc.assert(
      fc.property(positiveMonetaryArb, monetaryArb, (delta, lowestScore) => {
        const { container } = render(
          <BiggestComeback comebacks={[{ playerName: 'Alice', delta, lowestScore }]} />
        )
        try {
          expect(textOf(container, '.biggest-comeback-delta')).toBe(formatSignedChange(delta))
          expectVerbatim(textOf(container, '.biggest-comeback-low'), formatCurrency(lowestScore))
        } finally {
          cleanup()
        }
      }),
      { numRuns: RENDER_RUNS }
    )
  })

  it('LongestLossStreak renders the amount lost via formatSignedChange and the low point via formatCurrency', () => {
    fc.assert(
      fc.property(positiveMonetaryArb, monetaryArb, (totalLost, lowestScore) => {
        const { container } = render(
          <LongestLossStreak
            streaks={[{ playerName: 'Alice', streakLength: 3, totalLost, lowestScore }]}
          />
        )
        try {
          expectVerbatim(textOf(container, '.loss-streak-lost'), formatSignedChange(-totalLost))
          expectVerbatim(textOf(container, '.loss-streak-low'), formatCurrency(lowestScore))
        } finally {
          cleanup()
        }
      }),
      { numRuns: RENDER_RUNS }
    )
  })
})

// ─── Property 22 — host views and Category_Win_Toast (Requirement 5.9) ───────

describe('Property 22: Monetary displays emit formatter output verbatim — host views and toast (Req 5.9)', () => {
  it('AuctionResultView renders the winning bid and every balance via formatCurrency', () => {
    fc.assert(
      fc.property(
        positiveMonetaryArb,
        fc.array(monetaryArb, { minLength: 1, maxLength: 3 }),
        (winningBid, scores) => {
          const players = scores.map((score, index) => makePlayer(`Player${index}`, score))
          const { container } = render(
            <AuctionResultView
              result={{
                winner: players[0].name,
                winningBid,
                categoryName: 'Science',
                isTied: false,
                isReleased: false,
              }}
              players={players}
            />
          )
          try {
            expectVerbatim(textOf(container, '.auction-status__category'), formatCurrency(winningBid))

            const balances = container.querySelectorAll('.auction-status__player-balance')
            expect(balances).toHaveLength(players.length)
            players.forEach((player, index) => {
              expect(balances[index].textContent).toBe(formatCurrency(player.score))
            })
          } finally {
            cleanup()
          }
        }
      ),
      { numRuns: RENDER_RUNS }
    )
  })

  it('PlayerBalanceList renders every Real_Balance via formatCurrency', () => {
    fc.assert(
      fc.property(fc.array(monetaryArb, { minLength: 1, maxLength: 4 }), (scores) => {
        const players = scores.map((score, index) => makePlayer(`Player${index}`, score))
        const { container } = render(<PlayerBalanceList players={players} />)
        try {
          const balances = container.querySelectorAll('.player-balance-list__player-balance')
          expect(balances).toHaveLength(players.length)
          players.forEach((player, index) => {
            expect(balances[index].textContent).toBe(formatCurrency(player.score))
          })
        } finally {
          cleanup()
        }
      }),
      { numRuns: RENDER_RUNS }
    )
  })

  it('BettingStatusView renders each total wagered via formatCurrency', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(monetaryArb, positiveMonetaryArb), { minLength: 1, maxLength: 3 }),
        (rows) => {
          const players = rows.map(([score], index) => makePlayer(`Player${index}`, score))
          const receivedBets = Object.fromEntries(
            rows.map(([, totalWagered], index) => [
              `Player${index}`,
              { count: 2, totalWagered },
            ])
          )
          const { container } = render(
            <BettingStatusView
              players={players}
              receivedBets={receivedBets}
              playersDone={new Set(players.map((p) => p.name))}
              onForceEnd={vi.fn()}
            />
          )
          try {
            const statuses = container.querySelectorAll('.betting-status-view__player-status')
            expect(statuses).toHaveLength(players.length)
            rows.forEach(([, totalWagered], index) => {
              expectVerbatim(statuses[index].textContent, formatCurrency(totalWagered))
            })
          } finally {
            cleanup()
          }
        }
      ),
      { numRuns: RENDER_RUNS }
    )
  })

  it('CategoryWinToast renders the winning bid via formatCurrency', () => {
    fc.assert(
      fc.property(positiveMonetaryArb, (winningBid) => {
        const { container } = render(
          <CategoryWinToast category="Science" winningBid={winningBid} onDismiss={vi.fn()} />
        )
        try {
          expectVerbatim(textOf(container, '.category-win-toast'), formatCurrency(winningBid))
        } finally {
          cleanup()
        }
      }),
      { numRuns: RENDER_RUNS }
    )
  })
})
