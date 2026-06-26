// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { ProfileGuard } from './ProfileGuard'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}))

const mockUsePlayerProfileContext = vi.fn()

vi.mock('../hooks/usePlayerProfileContext', () => ({
  usePlayerProfileContext: () => mockUsePlayerProfileContext(),
}))

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ProfileGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading state while profile is loading', () => {
    mockUsePlayerProfileContext.mockReturnValue({
      profile: null,
      loading: true,
      refreshProfile: vi.fn(),
    })

    render(
      <ProfileGuard>
        <div>Protected Content</div>
      </ProfileGuard>
    )

    expect(screen.getByText('Loading profile…')).toBeInTheDocument()
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('redirects to /profile-setup when profile is null and not loading (Req 1.1)', () => {
    mockUsePlayerProfileContext.mockReturnValue({
      profile: null,
      loading: false,
      refreshProfile: vi.fn(),
    })

    render(
      <ProfileGuard>
        <div>Protected Content</div>
      </ProfileGuard>
    )

    expect(mockNavigate).toHaveBeenCalledWith({ to: '/profile-setup', replace: true })
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })

  it('renders children when profile exists (Req 1.9)', () => {
    mockUsePlayerProfileContext.mockReturnValue({
      profile: { playerId: 1, playerName: 'TestPlayer', authUuid: 'abc-123' },
      loading: false,
      refreshProfile: vi.fn(),
    })

    render(
      <ProfileGuard>
        <div>Protected Content</div>
      </ProfileGuard>
    )

    expect(screen.getByText('Protected Content')).toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
