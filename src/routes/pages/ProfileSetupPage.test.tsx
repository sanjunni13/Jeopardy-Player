// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { ProfileSetupPage } from './ProfileSetupPage'
import { PlayerProfileContext } from '../../contexts/PlayerProfileContext'
import type { PlayerProfileContextValue } from '../../contexts/PlayerProfileContext'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    session: { user: { id: 'test-auth-uuid-123' } },
    loading: false,
  }),
}))

const mockInsert = vi.fn()

vi.mock('../../utils/supabase', () => ({
  supabase: {
    from: () => ({
      insert: (...args: unknown[]) => mockInsert(...args),
    }),
  },
}))

const mockCheckPlayerNameAvailability = vi.fn()
const mockClaimExistingPlayer = vi.fn()

vi.mock('../../utils/playerProfile', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/playerProfile')>()
  return {
    ...actual,
    checkPlayerNameAvailability: (...args: unknown[]) => mockCheckPlayerNameAvailability(...args),
    claimExistingPlayer: (...args: unknown[]) => mockClaimExistingPlayer(...args),
  }
})

vi.mock('../../components/ui/background-gradient', () => ({
  BackgroundGradient: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderWithProfileContext(profileCtx?: Partial<PlayerProfileContextValue>) {
  const contextValue: PlayerProfileContextValue = {
    profile: null,
    loading: false,
    refreshProfile: vi.fn().mockResolvedValue(undefined),
    ...profileCtx,
  }

  return render(
    <PlayerProfileContext.Provider value={contextValue}>
      <ProfileSetupPage />
    </PlayerProfileContext.Provider>
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ProfileSetupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckPlayerNameAvailability.mockResolvedValue({ available: true })
    mockClaimExistingPlayer.mockResolvedValue(true)
    mockInsert.mockResolvedValue({ error: null })
  })

  // ─── Requirement 1.2: Form rendering ───────────────────────────────────────

  it('renders the form with a player name input and submit button', () => {
    renderWithProfileContext()

    expect(screen.getByLabelText('Player Name')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Enter your player name')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument()
  })

  // ─── Requirement 1.3: Validation error for empty submission ─────────────────

  it('shows validation error when submitting empty input', async () => {
    renderWithProfileContext()

    fireEvent.submit(screen.getByRole('button', { name: 'Continue' }).closest('form')!)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Player name cannot be empty')
    })

    // Should not call the availability check or insert
    expect(mockCheckPlayerNameAvailability).not.toHaveBeenCalled()
    expect(mockInsert).not.toHaveBeenCalled()
  })

  // ─── Requirement 1.3: Validation error for invalid characters ───────────────

  it('shows validation error for invalid characters (e.g. special symbols)', async () => {
    renderWithProfileContext()

    const input = screen.getByLabelText('Player Name')
    fireEvent.change(input, { target: { value: 'Player@Name!' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Continue' }).closest('form')!)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Player name can only contain letters, numbers, spaces, hyphens, and underscores'
      )
    })

    expect(mockCheckPlayerNameAvailability).not.toHaveBeenCalled()
    expect(mockInsert).not.toHaveBeenCalled()
  })

  // ─── Requirement 1.6: Duplicate name error ─────────────────────────────────

  it('shows "name is already taken" error when checkPlayerNameAvailability returns unavailable', async () => {
    mockCheckPlayerNameAvailability.mockResolvedValue({ available: false })

    renderWithProfileContext()

    const input = screen.getByLabelText('Player Name')
    fireEvent.change(input, { target: { value: 'TakenName' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Continue' }).closest('form')!)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('This name is already taken')
    })

    expect(mockInsert).not.toHaveBeenCalled()
  })

  // ─── Requirement 1.6: Unique constraint violation (code 23505) ─────────────

  it('handles unique constraint violation (code 23505) as duplicate name', async () => {
    mockInsert.mockResolvedValue({
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    })

    renderWithProfileContext()

    const input = screen.getByLabelText('Player Name')
    fireEvent.change(input, { target: { value: 'RaceName' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Continue' }).closest('form')!)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('This name is already taken')
    })
  })

  // ─── Requirement 1.7: Generic error on DB/network failure ──────────────────

  it('shows generic error on DB/network failure during insert', async () => {
    mockInsert.mockResolvedValue({
      error: { code: '500', message: 'Internal server error' },
    })

    renderWithProfileContext()

    const input = screen.getByLabelText('Player Name')
    fireEvent.change(input, { target: { value: 'ValidName' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Continue' }).closest('form')!)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong, please try again')
    })
  })

  // ─── Requirement 1.7: Network exception shows generic error ────────────────

  it('shows generic error when checkPlayerNameAvailability throws a network error', async () => {
    mockCheckPlayerNameAvailability.mockRejectedValue(new Error('fetch failed'))

    renderWithProfileContext()

    const input = screen.getByLabelText('Player Name')
    fireEvent.change(input, { target: { value: 'NetworkTest' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Continue' }).closest('form')!)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong, please try again')
    })
  })

  // ─── Requirement 1.5: Successful submission flow ───────────────────────────

  it('successful submission calls refreshProfile and navigates to /home', async () => {
    const mockRefreshProfile = vi.fn().mockResolvedValue(undefined)

    renderWithProfileContext({ refreshProfile: mockRefreshProfile })

    const input = screen.getByLabelText('Player Name')
    fireEvent.change(input, { target: { value: 'NewPlayer' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Continue' }).closest('form')!)

    await waitFor(() => {
      expect(mockRefreshProfile).toHaveBeenCalled()
    })

    expect(mockNavigate).toHaveBeenCalledWith({ to: '/home', replace: true })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  // ─── Claiming an existing unclaimed player ─────────────────────────────────

  it('claims an existing unclaimed player row instead of inserting a new one', async () => {
    mockCheckPlayerNameAvailability.mockResolvedValue({ available: true, unclaimedPlayerId: 42 })
    const mockRefreshProfile = vi.fn().mockResolvedValue(undefined)

    renderWithProfileContext({ refreshProfile: mockRefreshProfile })

    const input = screen.getByLabelText('Player Name')
    fireEvent.change(input, { target: { value: 'Luis' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Continue' }).closest('form')!)

    await waitFor(() => {
      expect(mockClaimExistingPlayer).toHaveBeenCalledWith(42, 'test-auth-uuid-123', expect.anything())
    })

    // Should NOT insert a new row
    expect(mockInsert).not.toHaveBeenCalled()

    expect(mockRefreshProfile).toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/home', replace: true })
  })

  it('shows error when claiming an existing player fails', async () => {
    mockCheckPlayerNameAvailability.mockResolvedValue({ available: true, unclaimedPlayerId: 42 })
    mockClaimExistingPlayer.mockRejectedValue(new Error('DB error'))

    renderWithProfileContext()

    const input = screen.getByLabelText('Player Name')
    fireEvent.change(input, { target: { value: 'Luis' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Continue' }).closest('form')!)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong, please try again')
    })

    expect(mockInsert).not.toHaveBeenCalled()
  })
})
