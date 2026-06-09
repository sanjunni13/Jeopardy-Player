import { useEffect, useState } from 'react'
import { useAuth } from '../auth'
import { useNavigate } from '@tanstack/react-router'
import { supabase } from '../../utils/supabase'

type Mode = 'sign_in' | 'sign_up'

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
          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-sm text-slate-300">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-sm text-slate-300">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete={mode === 'sign_in' ? 'current-password' : 'new-password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
            />
          </div>

          {/* Feedback */}
          {error && (
            <p role="alert" className="rounded-xl bg-rose-500/10 border border-rose-500/30 px-4 py-2.5 text-sm text-rose-400">
              {error}
            </p>
          )}
          {info && (
            <p role="status" className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-4 py-2.5 text-sm text-emerald-400">
              {info}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed"
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
            className="text-emerald-400 hover:text-emerald-300 font-medium transition"
          >
            {mode === 'sign_in' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </section>
    </main>
  )
}
