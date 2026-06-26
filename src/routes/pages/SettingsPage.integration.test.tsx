// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { SettingsPage } from './SettingsPage'
import { PreferencesSection } from './settings/PreferencesSection'
import { PreferencesProvider } from '../../contexts/PreferencesProvider'
import { PREFERENCES_KEY } from '../../utils/preferencesStore'

// ─── Mock window.matchMedia (jsdom doesn't provide it) ────────────────────────

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

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('../../utils/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: {
            email: 'test@example.com',
            created_at: '2024-01-15T00:00:00Z',
          },
        },
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
  },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    session: { user: { id: 'test-uuid' } },
    loading: false,
    signedOut: false,
  }),
}))

vi.mock('../../hooks/usePlayerProfileContext', () => ({
  usePlayerProfileContext: () => ({
    profile: { playerId: 1, playerName: 'TestPlayer', authUuid: 'test-uuid' },
    loading: false,
    refreshProfile: vi.fn().mockResolvedValue(undefined),
  }),
}))

// Mock __APP_VERSION__ global used by SupportSection
vi.stubGlobal('__APP_VERSION__', '1.0.0')

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderWithPreferencesProvider(ui: React.ReactNode) {
  return render(<PreferencesProvider>{ui}</PreferencesProvider>)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SettingsPage Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    // Reset document element state
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.classList.remove('reduced-motion')
  })

  afterEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.classList.remove('reduced-motion')
  })

  // ─── Requirement 1.3: Settings page renders sections ────────────────────────

  describe('Settings page renders sections', () => {
    it('renders Profile and Support headings', () => {
      renderWithPreferencesProvider(<SettingsPage />)

      expect(screen.getByRole('heading', { name: 'Profile' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Support' })).toBeInTheDocument()
    })
  })

  // ─── Theme toggle (PreferencesSection standalone) ───────────────────────────

  describe('Theme toggle applies data-theme attribute', () => {
    it('toggles data-theme from dark to light when dark mode is toggled off', () => {
      localStorage.setItem(
        PREFERENCES_KEY,
        JSON.stringify({ theme: 'dark', reducedAnimations: false, defaultRounds: 2 })
      )

      renderWithPreferencesProvider(<PreferencesSection />)

      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')

      const darkModeToggle = screen.getByRole('switch', { name: 'Dark Mode' })
      expect(darkModeToggle).toHaveAttribute('aria-checked', 'true')

      fireEvent.click(darkModeToggle)

      expect(document.documentElement.getAttribute('data-theme')).toBe('light')
      expect(darkModeToggle).toHaveAttribute('aria-checked', 'false')
    })

    it('toggles data-theme from light to dark when dark mode is toggled on', () => {
      localStorage.setItem(
        PREFERENCES_KEY,
        JSON.stringify({ theme: 'light', reducedAnimations: false, defaultRounds: 2 })
      )

      renderWithPreferencesProvider(<PreferencesSection />)

      expect(document.documentElement.getAttribute('data-theme')).toBe('light')

      const darkModeToggle = screen.getByRole('switch', { name: 'Dark Mode' })
      expect(darkModeToggle).toHaveAttribute('aria-checked', 'false')

      fireEvent.click(darkModeToggle)

      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
      expect(darkModeToggle).toHaveAttribute('aria-checked', 'true')
    })
  })

  // ─── Reduced animations toggle (PreferencesSection standalone) ──────────────

  describe('Reduced animations toggle applies .reduced-motion class', () => {
    it('adds .reduced-motion class when toggled on', () => {
      localStorage.setItem(
        PREFERENCES_KEY,
        JSON.stringify({ theme: 'dark', reducedAnimations: false, defaultRounds: 2 })
      )

      renderWithPreferencesProvider(<PreferencesSection />)

      expect(document.documentElement.classList.contains('reduced-motion')).toBe(false)

      const animationsToggle = screen.getByRole('switch', { name: 'Reduce Animations' })
      expect(animationsToggle).toHaveAttribute('aria-checked', 'false')

      fireEvent.click(animationsToggle)

      expect(document.documentElement.classList.contains('reduced-motion')).toBe(true)
      expect(animationsToggle).toHaveAttribute('aria-checked', 'true')
    })

    it('removes .reduced-motion class when toggled off', () => {
      localStorage.setItem(
        PREFERENCES_KEY,
        JSON.stringify({ theme: 'dark', reducedAnimations: true, defaultRounds: 2 })
      )

      renderWithPreferencesProvider(<PreferencesSection />)

      expect(document.documentElement.classList.contains('reduced-motion')).toBe(true)

      const animationsToggle = screen.getByRole('switch', { name: 'Reduce Animations' })
      expect(animationsToggle).toHaveAttribute('aria-checked', 'true')

      fireEvent.click(animationsToggle)

      expect(document.documentElement.classList.contains('reduced-motion')).toBe(false)
      expect(animationsToggle).toHaveAttribute('aria-checked', 'false')
    })
  })

  // ─── Requirement 1.4: Back button navigates correctly ───────────────────────

  describe('Back button navigates correctly', () => {
    it('calls window.history.back() when history length > 1', () => {
      const historyBackSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {})
      Object.defineProperty(window.history, 'length', { value: 3, writable: true })

      renderWithPreferencesProvider(<SettingsPage />)

      const backButton = screen.getByRole('button', { name: 'Go back' })
      fireEvent.click(backButton)

      expect(historyBackSpy).toHaveBeenCalled()
      expect(mockNavigate).not.toHaveBeenCalled()

      historyBackSpy.mockRestore()
    })

    it('navigates to /home when no history entries exist', () => {
      Object.defineProperty(window.history, 'length', { value: 1, writable: true })

      renderWithPreferencesProvider(<SettingsPage />)

      const backButton = screen.getByRole('button', { name: 'Go back' })
      fireEvent.click(backButton)

      expect(mockNavigate).toHaveBeenCalledWith({ to: '/home' })
    })
  })

  // ─── Requirement 1.1: Settings icon is rendered in the header ───────────────

  describe('Settings icon component', () => {
    it('renders a button with aria-label "Settings"', async () => {
      const { SettingsIcon } = await import('../../components/SettingsIcon')

      render(<SettingsIcon />)

      const settingsButton = screen.getByRole('button', { name: 'Settings' })
      expect(settingsButton).toBeInTheDocument()
    })

    it('navigates to /home/settings when clicked', async () => {
      const { SettingsIcon } = await import('../../components/SettingsIcon')

      render(<SettingsIcon />)

      const settingsButton = screen.getByRole('button', { name: 'Settings' })
      fireEvent.click(settingsButton)

      expect(mockNavigate).toHaveBeenCalledWith({ to: '/home/settings' })
    })
  })
})
