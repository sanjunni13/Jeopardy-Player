import { useEffect, useState } from 'react'
import { useAuth } from '../auth'
import { useNavigate } from '@tanstack/react-router'
import { supabase } from '../../utils/supabase'

type Mode = 'sign_in' | 'sign_up'

const PURPLE = '#6A1B9A'

/** Shared input styles — focus ring colour applied via inline style on focus */
function AuthInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [focused, setFocused] = useState(false)

  return (
    <input
      {...props}
      onFocus={(e) => { setFocused(true); props.onFocus?.(e) }}
      onBlur={(e)  => { setFocused(false); props.onBlur?.(e) }}
      className="rounded-xl border bg-slate-950 px-4 py-2.5 text-slate-100 placeholder:text-slate-600 focus:outline-none transition"
      style={{
        borderColor: focused ? PURPLE : undefined,
        boxShadow:   focused ? `0 0 0 2px ${PURPLE}40` : undefined,
        // fallback border colour when not focused
        ...(focused ? {} : { borderColor: 'rgb(51 65 85)' /* slate-700 */ }),
      }}
    />
  )
}

export function LoginPage() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()

  const [mode, setMode] = useState<Mode>('sign_in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Redirect authenticated users straight to /home
  useEffect(() => {
    if (!loading && session) {
      navigate({ to: '/home' })
    }
  }, [loading, session, navigate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setSubmitting(true)

    try {
      if (mode === 'sign_up') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setInfo('Check your email for a confirmation link before signing in.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        // AuthProvider will pick up the new session and the useEffect above
        // will redirect to /home automatically.
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <section className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/95 p-8 shadow-2xl shadow-slate-900/30">
        {/* Header */}
        <h1 className="text-3xl font-semibold mb-1">
          {mode === 'sign_in' ? 'Sign in' : 'Create account'}
        </h1>
        <p className="text-slate-400 mb-6 text-sm">
          {mode === 'sign_in'
            ? 'Welcome back — enter your email and password.'
            : 'Sign up with your email and a secure password.'}
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1 mt-4">
            <label htmlFor="email" className="text-sm text-slate-300">
              Email
            </label>
            <AuthInput
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-sm text-slate-300">
              Password
            </label>
            <AuthInput
              id="password"
              type="password"
              autoComplete={mode === 'sign_in' ? 'current-password' : 'new-password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {/* Feedback */}
          {error && (
            <p role="alert" className="rounded-xl bg-rose-500/10 border border-rose-500/30 px-4 py-2.5 text-sm text-rose-400">
              {error}
            </p>
          )}
          {info && (
            <p role="status" className="rounded-xl bg-purple-500/10 border border-purple-500/30 px-4 py-2.5 text-sm text-purple-300">
              {info}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 mb-4 rounded-full px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: PURPLE }}
          >
            {submitting
              ? mode === 'sign_in' ? 'Signing in…' : 'Creating account…'
              : mode === 'sign_in' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        {/* Toggle mode */}
        <p className="mt-6 text-center text-sm text-slate-400">
          {mode === 'sign_in' ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button
            type="button"
            onClick={() => { setMode(mode === 'sign_in' ? 'sign_up' : 'sign_in'); setError(null); setInfo(null) }}
            className="font-medium transition hover:opacity-80"
            style={{ color: PURPLE }}
          >
            {mode === 'sign_in' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </section>
    </main>
  )
}
