import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useNavigate } from '@tanstack/react-router'
import { supabase } from '../../utils/supabase'
import { BackgroundGradient } from '../../components/ui/background-gradient'
import './LoginPage.css'

type Mode = 'sign_in' | 'sign_up' | 'forgot_password'

export function LoginPage() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()

  const [mode, setMode] = useState<Mode>('sign_in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [errorField, setErrorField] = useState<'email' | 'password' | 'both' | null>(null)

  useEffect(() => {
    if (!loading && session) {
      navigate({ to: '/home' })
    }
  }, [loading, session, navigate])

  function detectErrorField(message: string): 'email' | 'password' | 'both' {
    const lower = message.toLowerCase()
    if (lower.includes('email') && !lower.includes('password')) return 'email'
    if (lower.includes('password') && !lower.includes('email')) return 'password'
    return 'both'
  }

  function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setErrorField(null)
    setSubmitting(true)

    try {
      if (mode === 'forgot_password') {
        const trimmedEmail = email.trim()
        if (!trimmedEmail) {
          setError('Please enter your email address.')
          setErrorField('email')
          setSubmitting(false)
          return
        }
        if (!isValidEmail(trimmedEmail)) {
          setError('Please enter a valid email address (e.g. you@example.com).')
          setErrorField('email')
          setSubmitting(false)
          return
        }
        const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail)
        if (error) throw error
        setInfo('If an account exists for that email, you will receive a password reset link. Please check your inbox.')
      } else if (mode === 'sign_up') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setInfo('Check your email for a confirmation link before signing in.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred.'
      setError(msg)
      if (mode === 'forgot_password') {
        setErrorField('email')
      } else {
        setErrorField(detectErrorField(msg))
      }
    } finally {
      setSubmitting(false)
    }
  }

  function handleEmailChange(e: React.ChangeEvent<HTMLInputElement>) {
    setEmail(e.target.value)
    if (errorField === 'email' || errorField === 'both') {
      setError(null)
      setErrorField(null)
    }
  }

  function handlePasswordChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPassword(e.target.value)
    if (errorField === 'password' || errorField === 'both') {
      setError(null)
      setErrorField(null)
    }
  }

  const emailHasError = errorField === 'email' || errorField === 'both'
  const passwordHasError = errorField === 'password' || errorField === 'both'

  return (
    <main className="login-page">
      <BackgroundGradient containerClassName="login-gradient-container" className="login-card">
        <h1 className="login-title">
          {mode === 'sign_in' ? 'Sign in' : mode === 'sign_up' ? 'Create account' : 'Reset your password'}
        </h1>
        <p className="login-subtitle">
          {mode === 'sign_in'
            ? 'Welcome back — enter your email and password.'
            : mode === 'sign_up'
            ? 'Sign up with your email and a secure password.'
            : "Enter your email and we'll send you a reset link."}
        </p>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label htmlFor="email" className="login-label">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required={mode !== 'forgot_password'}
              value={email}
              onChange={handleEmailChange}
              placeholder="you@example.com"
              className={`login-input ${emailHasError ? 'login-input-error' : ''}`}
            />
          </div>

          {mode !== 'forgot_password' && (
            <div className="login-field">
              <label htmlFor="password" className="login-label">Password</label>
              <input
                id="password"
                type="password"
                autoComplete={mode === 'sign_in' ? 'current-password' : 'new-password'}
                required
                value={password}
                onChange={handlePasswordChange}
                placeholder="••••••••"
                className={`login-input ${passwordHasError ? 'login-input-error' : ''}`}
              />
              {mode === 'sign_in' && (
                <button
                  type="button"
                  onClick={() => { setMode('forgot_password'); setError(null); setInfo(null); setErrorField(null) }}
                  className="login-forgot-btn"
                >
                  Forgot password?
                </button>
              )}
            </div>
          )}

          {error && <p role="alert" className="login-error">{error}</p>}
          {info && <p role="status" className="login-info">{info}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="login-submit-btn"
          >
            {submitting
              ? mode === 'forgot_password' ? 'Sending…' : mode === 'sign_in' ? 'Signing in…' : 'Creating account…'
              : mode === 'forgot_password' ? 'Send reset link' : mode === 'sign_in' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        {mode === 'forgot_password' ? (
          <p className="login-toggle">
            <button
              type="button"
              onClick={() => { setMode('sign_in'); setError(null); setInfo(null); setErrorField(null) }}
              className="login-toggle-btn"
            >
              ← Back to sign in
            </button>
          </p>
        ) : (
          <p className="login-toggle">
            {mode === 'sign_in' ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button
              type="button"
              onClick={() => { setMode(mode === 'sign_in' ? 'sign_up' : 'sign_in'); setError(null); setInfo(null); setErrorField(null) }}
              className="login-toggle-btn"
            >
              {mode === 'sign_in' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        )}
      </BackgroundGradient>
    </main>
  )
}
