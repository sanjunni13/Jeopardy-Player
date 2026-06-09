import { useEffect } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useAuth } from '../auth'

export function NotFoundPage() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()

  // Auto-redirect once auth state is known
  useEffect(() => {
    if (!loading) {
      if (session) {
        navigate({ to: '/home', replace: true })
      } else {
        navigate({ to: '/login', replace: true })
      }
    }
  }, [loading, session, navigate])

  if (loading) {
    return <p className="p-6 text-slate-300">Redirecting…</p>
  }

  // Fallback UI shown briefly before the redirect fires, or if JS is slow
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8 flex items-center justify-center">
      <div className="max-w-xl rounded-3xl border border-slate-800 bg-slate-900/95 p-10 text-center shadow-2xl shadow-slate-900/30">
        <h1 className="text-5xl font-bold text-amber-400 mb-4">404</h1>
        <p className="text-slate-300 mb-6">This page doesn't exist.</p>
        {session ? (
          <Link
            to="/home"
            className="inline-flex rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
          >
            Back to Home
          </Link>
        ) : (
          <Link
            to="/login"
            className="inline-flex rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
          >
            Go to Login
          </Link>
        )}
      </div>
    </main>
  )
}
