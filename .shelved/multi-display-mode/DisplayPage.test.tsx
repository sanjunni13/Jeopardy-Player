// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock window.matchMedia for components that use it (e.g., prefers-reduced-motion)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ sessionId: 'test-session-123' }),
}))

vi.mock('../../hooks/useDisplaySession', () => ({
  useDisplaySession: vi.fn(),
}))

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    h1: ({ children, ...props }: Record<string, unknown>) => <h1 {...props}>{children}</h1>,
    div: ({ children, ...props }: Record<string, unknown>) => <div {...props}>{children}</div>,
    span: ({ children, ...props }: Record<string, unknown>) => <span {...props}>{children}</span>,
  },
  AnimatePresence: ({ children }: Record<string, unknown>) => <>{children}</>,
  useReducedMotion: () => false,
}))

// Mock canvas-confetti
vi.mock('canvas-confetti', () => ({
  default: vi.fn(),
}))

import { DisplayPage } from './DisplayPage'
import { useDisplaySession } from '../../hooks/useDisplaySession'

const mockUseDisplaySession = useDisplaySession as ReturnType<typeof vi.fn>

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createMockDisplayState(overrides: Record<string, unknown> = {}) {
  return {
    phase: 'waiting' as const,
    game: null,
    currentRoundIndex: 0,
    currentRoundName: 'single',
    chosenClues: new Set<string>(),
    players: [],
    activeClue: null,
    answerRevealed: false,
    buzzedPlayer: null,
    buzzResult: null,
    timerRemaining: null,
    timerActive: false,
    dailyDoublePlayer: null,
    dailyDoubleWager: null,
    fjState: null,
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DisplayPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders loading state when connection is connecting', () => {
    mockUseDisplaySession.mockReturnValue({
      displayState: createMockDisplayState(),
      connectionState: 'connecting',
      error: null,
    })

    render(<DisplayPage />)

    expect(screen.getByText('Connecting to game...')).toBeInTheDocument()
  })

  it('renders error state when error is present', () => {
    mockUseDisplaySession.mockReturnValue({
      displayState: createMockDisplayState(),
      connectionState: 'error',
      error: 'Session not found or has ended.',
    })

    render(<DisplayPage />)

    expect(screen.getByText('Session not found or has ended.')).toBeInTheDocument()
  })

  it('renders waiting state when phase is waiting', () => {
    mockUseDisplaySession.mockReturnValue({
      displayState: createMockDisplayState({ phase: 'waiting' }),
      connectionState: 'connected',
      error: null,
    })

    render(<DisplayPage />)

    expect(screen.getByText('Waiting for game to begin')).toBeInTheDocument()
  })

  it('renders board phase with game data', () => {
    const mockGame = {
      rounds: {
        single: [
          { category: 'History', clues: [{ clue: 'Q1', value: 200, solution: 'A1', html: false }] },
          { category: 'Science', clues: [{ clue: 'Q2', value: 200, solution: 'A2', html: false }] },
        ],
      },
      final: { category: 'Final', clue: 'FQ', solution: 'FA' },
      totalRounds: 1,
    }

    mockUseDisplaySession.mockReturnValue({
      displayState: createMockDisplayState({
        phase: 'board',
        game: mockGame,
        currentRoundName: 'single',
      }),
      connectionState: 'connected',
      error: null,
    })

    render(<DisplayPage />)

    expect(screen.getByText('History')).toBeInTheDocument()
    expect(screen.getByText('Science')).toBeInTheDocument()
    expect(screen.getByText('Jeopardy!')).toBeInTheDocument()
  })

  it('renders clue phase with active clue', () => {
    mockUseDisplaySession.mockReturnValue({
      displayState: createMockDisplayState({
        phase: 'clue',
        activeClue: {
          category: 'History',
          value: 400,
          clueText: 'This ancient city was buried by Vesuvius.',
          html: false,
          solution: 'Pompeii',
        },
        answerRevealed: false,
      }),
      connectionState: 'connected',
      error: null,
    })

    render(<DisplayPage />)

    expect(screen.getByText('History')).toBeInTheDocument()
    expect(screen.getByText('$400')).toBeInTheDocument()
    expect(screen.getByText('This ancient city was buried by Vesuvius.')).toBeInTheDocument()
    expect(screen.queryByText('Pompeii')).not.toBeInTheDocument()
  })

  it('renders clue phase with answer revealed', () => {
    mockUseDisplaySession.mockReturnValue({
      displayState: createMockDisplayState({
        phase: 'clue',
        activeClue: {
          category: 'History',
          value: 400,
          clueText: 'This ancient city was buried by Vesuvius.',
          html: false,
          solution: 'Pompeii',
        },
        answerRevealed: true,
      }),
      connectionState: 'connected',
      error: null,
    })

    render(<DisplayPage />)

    expect(screen.getByText('Pompeii')).toBeInTheDocument()
  })

  it('renders game-over phase with player scores', () => {
    mockUseDisplaySession.mockReturnValue({
      displayState: createMockDisplayState({
        phase: 'game-over',
        players: [
          { name: 'Alice', score: 5000 },
          { name: 'Bob', score: 3200 },
          { name: 'Charlie', score: 1800 },
        ],
      }),
      connectionState: 'connected',
      error: null,
    })

    render(<DisplayPage />)

    expect(screen.getByText('Game Over')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByText('Charlie')).toBeInTheDocument()
  })

  it('passes sessionId to useDisplaySession hook', () => {
    mockUseDisplaySession.mockReturnValue({
      displayState: createMockDisplayState(),
      connectionState: 'connecting',
      error: null,
    })

    render(<DisplayPage />)

    expect(mockUseDisplaySession).toHaveBeenCalledWith('test-session-123')
  })
})
