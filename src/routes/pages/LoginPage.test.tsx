// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { LoginPage } from './LoginPage'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ session: null, loading: false }),
}))

const mockResetPasswordForEmail = vi.fn()

vi.mock('../../utils/supabase', () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: (...args: unknown[]) => mockResetPasswordForEmail(...args),
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
      signUp: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}))

vi.mock('../../components/ui/background-gradient', () => ({
  BackgroundGradient: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}))

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LoginPage — Forgot Password Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResetPasswordForEmail.mockResolvedValue({ error: null })
  })

  // ─── Requirement 8.1: "Forgot password?" link visible in sign-in mode ──────

  it('displays "Forgot password?" link in sign-in mode', () => {
    render(<LoginPage />)
    expect(screen.getByText('Forgot password?')).toBeInTheDocument()
  })

  // ─── Requirement 8.1 → 8.2: Mode transition from sign-in to forgot_password ─

  it('transitions to forgot_password mode when "Forgot password?" is clicked', () => {
    render(<LoginPage />)
    fireEvent.click(screen.getByText('Forgot password?'))

    expect(screen.getByText('Reset your password')).toBeInTheDocument()
    expect(screen.getByText('Send reset link')).toBeInTheDocument()
  })

  // ─── Requirement 8.2: Form rendering in forgot_password mode ────────────────

  it('renders the correct form elements in forgot_password mode', () => {
    render(<LoginPage />)
    fireEvent.click(screen.getByText('Forgot password?'))

    // Heading
    expect(screen.getByRole('heading', { name: 'Reset your password' })).toBeInTheDocument()
    // Email input
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    // Submit button
    expect(screen.getByRole('button', { name: 'Send reset link' })).toBeInTheDocument()
    // Back link
    expect(screen.getByText('← Back to sign in')).toBeInTheDocument()
    // Password field should NOT be present
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
  })

  // ─── Requirement 8.5: Client-side validation for empty email ────────────────

  it('shows validation error when submitting with empty email', async () => {
    render(<LoginPage />)
    fireEvent.click(screen.getByText('Forgot password?'))

    fireEvent.submit(screen.getByRole('button', { name: 'Send reset link' }).closest('form')!)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Please enter your email address.')
    })

    // Should NOT call supabase
    expect(mockResetPasswordForEmail).not.toHaveBeenCalled()
  })

  // ─── Requirement 8.5: Client-side validation for invalid email format ───────

  it('shows validation error for invalid email format', async () => {
    render(<LoginPage />)
    fireEvent.click(screen.getByText('Forgot password?'))

    const emailInput = screen.getByLabelText('Email')
    fireEvent.change(emailInput, { target: { value: 'not-an-email' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Send reset link' }).closest('form')!)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Please enter a valid email address (e.g. you@example.com).'
      )
    })

    expect(mockResetPasswordForEmail).not.toHaveBeenCalled()
  })

  // ─── Requirement 8.3 & 8.4: Successful submission shows confirmation ────────

  it('calls resetPasswordForEmail and shows confirmation on valid email submission', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: null })

    render(<LoginPage />)
    fireEvent.click(screen.getByText('Forgot password?'))

    const emailInput = screen.getByLabelText('Email')
    fireEvent.change(emailInput, { target: { value: 'user@example.com' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Send reset link' }).closest('form')!)

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'If an account exists for that email, you will receive a password reset link. Please check your inbox.'
      )
    })

    expect(mockResetPasswordForEmail).toHaveBeenCalledWith('user@example.com')
  })

  // ─── Requirement 8.8: Submit button disabled while request is in progress ───

  it('disables the submit button while the request is in progress', async () => {
    // Make the mock hang until we resolve it
    let resolveReset: (value: { error: null }) => void
    mockResetPasswordForEmail.mockImplementation(
      () => new Promise((resolve) => { resolveReset = resolve })
    )

    render(<LoginPage />)
    fireEvent.click(screen.getByText('Forgot password?'))

    const emailInput = screen.getByLabelText('Email')
    fireEvent.change(emailInput, { target: { value: 'user@example.com' } })
    fireEvent.submit(screen.getByRole('button', { name: /send reset link/i }).closest('form')!)

    // Button should be disabled and show loading text
    await waitFor(() => {
      const submitBtn = screen.getByRole('button', { name: /sending/i })
      expect(submitBtn).toBeDisabled()
    })

    // Resolve the request
    resolveReset!({ error: null })

    // Button should be re-enabled
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Send reset link' })).not.toBeDisabled()
    })
  })

  // ─── Requirement 8.6: Network error shows error message ─────────────────────

  it('shows error message when resetPasswordForEmail fails with network error', async () => {
    mockResetPasswordForEmail.mockResolvedValue({
      error: new Error('Network request failed'),
    })

    render(<LoginPage />)
    fireEvent.click(screen.getByText('Forgot password?'))

    const emailInput = screen.getByLabelText('Email')
    fireEvent.change(emailInput, { target: { value: 'user@example.com' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Send reset link' }).closest('form')!)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Network request failed')
    })

    // Submit button should be re-enabled after error
    expect(screen.getByRole('button', { name: 'Send reset link' })).not.toBeDisabled()
  })

  // ─── Requirement 8.7: Back link returns to sign-in and clears messages ──────

  it('back link returns to sign-in mode and clears messages', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: null })

    render(<LoginPage />)
    fireEvent.click(screen.getByText('Forgot password?'))

    // Submit to get a confirmation message
    const emailInput = screen.getByLabelText('Email')
    fireEvent.change(emailInput, { target: { value: 'user@example.com' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Send reset link' }).closest('form')!)

    await waitFor(() => {
      expect(screen.getByRole('status')).toBeInTheDocument()
    })

    // Click back to sign in
    fireEvent.click(screen.getByText('← Back to sign in'))

    // Should be back in sign-in mode
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    // Messages should be cleared
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    // Password field should be visible again
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
  })

  it('back link clears error messages when returning to sign-in', async () => {
    render(<LoginPage />)
    fireEvent.click(screen.getByText('Forgot password?'))

    // Submit empty to get an error
    fireEvent.submit(screen.getByRole('button', { name: 'Send reset link' }).closest('form')!)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    // Click back to sign in
    fireEvent.click(screen.getByText('← Back to sign in'))

    // Error should be cleared
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })
})
