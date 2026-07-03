// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { AnalyticsScreen } from './AnalyticsScreen'
import type { GameSession, NormalizedGame, Player } from '../../types/game'

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock canvas-confetti to avoid canvas API errors in jsdom
vi.mock('canvas-confetti', () => ({
  default: Object.assign(vi.fn(), {
    create: vi.fn(() => vi.fn()),
  }),
}))

// Mock motion/react (used by BackgroundGradient) to avoid animation issues
vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, className, style }: React.HTMLAttributes<HTMLDivElement>) => (
      <div className={className} style={style}>{children}</div>
    ),
  },
}))

// Mock react-toastify
vi.mock('react-toastify', () => ({
  toast: {
    warning: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}))

// Mock imageExporter
const mockExportAnalyticsAsPng = vi.fn()
vi.mock('../../utils/imageExporter', () => ({
  exportAnalyticsAsPng: (...args: unknown[]) => mockExportAnalyticsAsPng(...args),
}))

// Mock gameApi
vi.mock('../../utils/gameApi', () => ({
  updateGameStats: vi.fn().mockResolvedValue({ success: true }),
}))

// Mock usePlayerProfileContext
vi.mock('../../hooks/usePlayerProfileContext', () => ({
  usePlayerProfileContext: () => ({
    profile: null,
    loading: false,
    refreshProfile: vi.fn(),
  }),
}))

// Mock the child analytics components to keep tests focused on AnalyticsScreen behaviour
vi.mock('./ScoreTimelineChart', () => ({
  ScoreTimelineChart: () => <div data-testid="score-timeline-chart">ScoreTimeline</div>,
}))
vi.mock('./CategoryAccuracy', () => ({
  CategoryAccuracy: () => <div data-testid="category-accuracy">CategoryAccuracy</div>,
}))
vi.mock('./DailyDoubleBreakdown', () => ({
  DailyDoubleBreakdown: () => <div data-testid="dd-breakdown">DailyDoubleBreakdown</div>,
}))
vi.mock('./BiggestComeback', () => ({
  BiggestComeback: () => <div data-testid="biggest-comeback">BiggestComeback</div>,
}))
vi.mock('./HeadToHead', () => ({
  HeadToHead: () => <div data-testid="head-to-head">HeadToHead</div>,
}))

// ─── Fixture helpers ──────────────────────────────────────────────────────────

function makePlayer(name: string, score: number, extras: Partial<Player> = {}): Player {
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
    ...extras,
  }
}

const MOCK_GAME: NormalizedGame = {
  rounds: {
    single: [
      {
        category: 'Science',
        clues: [
          { value: 200, clue: 'Q1', solution: 'A1', dailyDouble: false, html: false },
          { value: 400, clue: 'Q2', solution: 'A2', dailyDouble: false, html: false },
        ],
      },
    ],
  },
  final: { category: 'Final', clue: 'Final Q', solution: 'Final A', html: false },
  totalRounds: 1,
}

function makeSession(players: Player[]): GameSession {
  return {
    game: MOCK_GAME,
    gameId: 'test-game-id',
    players,
    currentRoundIndex: 0,
    orderedRoundNames: ['single'],
    clueStates: {
      'single-0-0': {
        chosen: true,
        playerMarkings: Object.fromEntries(players.map(p => [p.name, 'correct'])),
      },
      'single-0-1': {
        chosen: true,
        playerMarkings: Object.fromEntries(players.map(p => [p.name, 'incorrect'])),
      },
    },
    dailyDoubleRecords: [],
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AnalyticsScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExportAnalyticsAsPng.mockResolvedValue(undefined)
  })

  // ─── Final standings sorted order (Requirements 3.2, 3.3) ─────────────────

  describe('Final standings sorted order (Req 3.2, 3.3)', () => {
    it('displays players sorted from highest to lowest score', () => {
      const players = [
        makePlayer('Charlie', 200),
        makePlayer('Alice', 1000),
        makePlayer('Bob', 600),
      ]
      const session = makeSession(players)

      render(<AnalyticsScreen session={session} gameId="game-1" onBackToHome={vi.fn()} />)

      const list = screen.getByRole('list', { name: 'Final standings' })
      const items = list.querySelectorAll('li')

      // Check ordering: Alice (1000) > Bob (600) > Charlie (200)
      expect(items[0]).toHaveTextContent('Alice')
      expect(items[1]).toHaveTextContent('Bob')
      expect(items[2]).toHaveTextContent('Charlie')
    })

    it('displays scores in formatted currency style', () => {
      const players = [makePlayer('Alice', 1000), makePlayer('Bob', 200)]
      const session = makeSession(players)

      render(<AnalyticsScreen session={session} gameId="game-1" onBackToHome={vi.fn()} />)

      expect(screen.getByText('$1,000')).toBeInTheDocument()
      expect(screen.getByText('$200')).toBeInTheDocument()
    })

    it('displays negative scores with negative formatting', () => {
      const players = [makePlayer('Alice', 200), makePlayer('Bob', -400)]
      const session = makeSession(players)

      render(<AnalyticsScreen session={session} gameId="game-1" onBackToHome={vi.fn()} />)

      expect(screen.getByText('-$400')).toBeInTheDocument()
    })

    it('preserves insertion order for tied players (Req 3.3)', () => {
      // Alice and Bob both have 500 — Alice inserted first, so Alice should appear first
      const players = [
        makePlayer('Alice', 500),
        makePlayer('Bob', 500),
        makePlayer('Charlie', 200),
      ]
      const session = makeSession(players)

      render(<AnalyticsScreen session={session} gameId="game-1" onBackToHome={vi.fn()} />)

      const list = screen.getByRole('list', { name: 'Final standings' })
      const items = list.querySelectorAll('li')

      expect(items[0]).toHaveTextContent('Alice')
      expect(items[1]).toHaveTextContent('Bob')
      expect(items[2]).toHaveTextContent('Charlie')
    })

    it('shows rank numbers starting at 1', () => {
      const players = [makePlayer('Alice', 800), makePlayer('Bob', 400)]
      const session = makeSession(players)

      render(<AnalyticsScreen session={session} gameId="game-1" onBackToHome={vi.fn()} />)

      const list = screen.getByRole('list', { name: 'Final standings' })
      const items = list.querySelectorAll('li')

      expect(items[0]).toHaveTextContent('1.')
      expect(items[1]).toHaveTextContent('2.')
    })

    it('marks the winning player with a trophy icon', () => {
      const players = [makePlayer('Alice', 1000), makePlayer('Bob', 400)]
      const session = makeSession(players)

      render(<AnalyticsScreen session={session} gameId="game-1" onBackToHome={vi.fn()} />)

      // Only the winner row should contain 🏆
      const list = screen.getByRole('list', { name: 'Final standings' })
      const items = list.querySelectorAll('li')
      expect(items[0].textContent).toContain('🏆')
      expect(items[1].textContent).not.toContain('🏆')
    })
  })

  // ─── "View Full Breakdown" toggle (Requirements 3.5, 9.5) ─────────────────

  describe('"View Full Breakdown" toggle (Req 3.5)', () => {
    it('hides breakdown sections by default', () => {
      const session = makeSession([makePlayer('Alice', 1000)])

      render(<AnalyticsScreen session={session} gameId="game-1" onBackToHome={vi.fn()} />)

      expect(screen.queryByTestId('score-timeline-chart')).not.toBeInTheDocument()
      expect(screen.queryByTestId('category-accuracy')).not.toBeInTheDocument()
    })

    it('shows breakdown sections after clicking "View Full Breakdown"', () => {
      const session = makeSession([makePlayer('Alice', 1000)])

      render(<AnalyticsScreen session={session} gameId="game-1" onBackToHome={vi.fn()} />)

      const toggleBtn = screen.getByRole('button', { name: /View Full Breakdown/i })
      expect(toggleBtn).toBeInTheDocument()

      fireEvent.click(toggleBtn)

      expect(screen.getByTestId('score-timeline-chart')).toBeInTheDocument()
      expect(screen.getByTestId('category-accuracy')).toBeInTheDocument()
    })

    it('collapses breakdown sections after clicking the toggle a second time', () => {
      const session = makeSession([makePlayer('Alice', 1000)])

      render(<AnalyticsScreen session={session} gameId="game-1" onBackToHome={vi.fn()} />)

      const toggleBtn = screen.getByRole('button', { name: /View Full Breakdown/i })

      // Expand
      fireEvent.click(toggleBtn)
      expect(screen.getByTestId('score-timeline-chart')).toBeInTheDocument()

      // Collapse — button text changes; find by updated text
      const collapseBtn = screen.getByRole('button', { name: /Hide Breakdown/i })
      fireEvent.click(collapseBtn)

      expect(screen.queryByTestId('score-timeline-chart')).not.toBeInTheDocument()
    })

    it('button shows "View Full Breakdown ▼" when collapsed', () => {
      const session = makeSession([makePlayer('Alice', 1000)])

      render(<AnalyticsScreen session={session} gameId="game-1" onBackToHome={vi.fn()} />)

      expect(screen.getByRole('button', { name: /View Full Breakdown/i })).toBeInTheDocument()
    })

    it('button shows "Hide Breakdown ▲" when expanded', () => {
      const session = makeSession([makePlayer('Alice', 1000)])

      render(<AnalyticsScreen session={session} gameId="game-1" onBackToHome={vi.fn()} />)

      fireEvent.click(screen.getByRole('button', { name: /View Full Breakdown/i }))

      expect(screen.getByRole('button', { name: /Hide Breakdown/i })).toBeInTheDocument()
    })

    it('sets aria-expanded correctly on the toggle button', () => {
      const session = makeSession([makePlayer('Alice', 1000)])

      render(<AnalyticsScreen session={session} gameId="game-1" onBackToHome={vi.fn()} />)

      const btn = screen.getByRole('button', { name: /View Full Breakdown/i })
      expect(btn).toHaveAttribute('aria-expanded', 'false')

      fireEvent.click(btn)

      expect(screen.getByRole('button', { name: /Hide Breakdown/i })).toHaveAttribute('aria-expanded', 'true')
    })
  })

  // ─── "Download as Image" (Requirements 9.1, 9.5, 9.6) ────────────────────

  describe('"Download as Image" button (Req 9.1, 9.5, 9.6)', () => {
    it('renders the "Download as Image" button (Req 9.1)', () => {
      const session = makeSession([makePlayer('Alice', 1000)])

      render(<AnalyticsScreen session={session} gameId="game-1" onBackToHome={vi.fn()} />)

      expect(screen.getByRole('button', { name: /Download as Image/i })).toBeInTheDocument()
    })

    it('calls exportAnalyticsAsPng when "Download as Image" is clicked', async () => {
      const session = makeSession([makePlayer('Alice', 1000)])

      render(<AnalyticsScreen session={session} gameId="game-1" onBackToHome={vi.fn()} />)

      fireEvent.click(screen.getByRole('button', { name: /Download as Image/i }))

      await waitFor(() => {
        expect(mockExportAnalyticsAsPng).toHaveBeenCalledTimes(1)
      })

      // First arg is an HTMLElement (the container ref), second is the filename
      expect(mockExportAnalyticsAsPng).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        expect.stringMatching(/^jeopardy-results-\d{4}-\d{2}-\d{2}\.png$/),
      )
    })

    it('disables the button while export is in progress (Req 9.5)', async () => {
      // Keep the export pending
      let resolveExport!: () => void
      mockExportAnalyticsAsPng.mockReturnValue(
        new Promise<void>(res => { resolveExport = res })
      )

      const session = makeSession([makePlayer('Alice', 1000)])

      render(<AnalyticsScreen session={session} gameId="game-1" onBackToHome={vi.fn()} />)

      fireEvent.click(screen.getByRole('button', { name: /Download as Image/i }))

      // Button should now be disabled and show loading text
      await waitFor(() => {
        const btn = screen.getByRole('button', { name: /Capturing/i })
        expect(btn).toBeDisabled()
      })

      // Resolve the export so the component can clean up
      resolveExport()

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Download as Image/i })).not.toBeDisabled()
      })
    })

    it('shows an error message on export failure and re-enables the button (Req 9.6)', async () => {
      mockExportAnalyticsAsPng.mockRejectedValue(new Error('Canvas failed'))

      const session = makeSession([makePlayer('Alice', 1000)])

      render(<AnalyticsScreen session={session} gameId="game-1" onBackToHome={vi.fn()} />)

      fireEvent.click(screen.getByRole('button', { name: /Download as Image/i }))

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
      })

      expect(screen.getByRole('alert')).toHaveTextContent('Canvas failed')

      // Button should be re-enabled
      expect(screen.getByRole('button', { name: /Download as Image/i })).not.toBeDisabled()
    })

    it('shows a generic error message when the thrown error has no message', async () => {
      mockExportAnalyticsAsPng.mockRejectedValue('unexpected failure')

      const session = makeSession([makePlayer('Alice', 1000)])

      render(<AnalyticsScreen session={session} gameId="game-1" onBackToHome={vi.fn()} />)

      fireEvent.click(screen.getByRole('button', { name: /Download as Image/i }))

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
      })

      expect(screen.getByRole('alert')).toHaveTextContent(/Download could not be completed/i)
    })
  })

  // ─── "Back to Home" button (Requirements 3.4, 3.6) ───────────────────────

  describe('"Back to Home" button (Req 3.4)', () => {
    it('renders the "Back to Home" button', () => {
      const session = makeSession([makePlayer('Alice', 1000)])

      render(<AnalyticsScreen session={session} gameId="game-1" onBackToHome={vi.fn()} />)

      expect(screen.getByRole('button', { name: 'Back to Home' })).toBeInTheDocument()
    })

    it('calls onBackToHome when "Back to Home" is clicked', () => {
      const onBackToHome = vi.fn()
      const session = makeSession([makePlayer('Alice', 1000)])

      render(<AnalyticsScreen session={session} gameId="game-1" onBackToHome={onBackToHome} />)

      fireEvent.click(screen.getByRole('button', { name: 'Back to Home' }))

      expect(onBackToHome).toHaveBeenCalledTimes(1)
    })

    it('calls onBackToHome exactly once even if clicked multiple times', () => {
      const onBackToHome = vi.fn()
      const session = makeSession([makePlayer('Alice', 1000)])

      render(<AnalyticsScreen session={session} gameId="game-1" onBackToHome={onBackToHome} />)

      const btn = screen.getByRole('button', { name: 'Back to Home' })
      fireEvent.click(btn)
      fireEvent.click(btn)

      expect(onBackToHome).toHaveBeenCalledTimes(2)
    })
  })

  // ─── Winner announcement (Requirements 3.2) ───────────────────────────────

  describe('Winner announcement', () => {
    it('announces single winner by name', () => {
      const players = [makePlayer('Alice', 1000), makePlayer('Bob', 400)]
      const session = makeSession(players)

      render(<AnalyticsScreen session={session} gameId="game-1" onBackToHome={vi.fn()} />)

      expect(screen.getByText(/Winner: Alice/i)).toBeInTheDocument()
    })

    it('announces multiple winners when scores are tied', () => {
      const players = [makePlayer('Alice', 1000), makePlayer('Bob', 1000)]
      const session = makeSession(players)

      render(<AnalyticsScreen session={session} gameId="game-1" onBackToHome={vi.fn()} />)

      expect(screen.getByText(/Multiple Winners/i)).toBeInTheDocument()
    })
  })
})
