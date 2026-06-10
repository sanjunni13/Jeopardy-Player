import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAuth } from '../hooks/useAuth'
import { AuthenticatedLayout } from '../components/AuthenticatedLayout'

/** Redirects to /home or /login depending on auth state. */
export function IndexRedirect() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading) {
      navigate({ to: session ? '/home' : '/login', replace: true })
    }
  }, [loading, session, navigate])

  return <p className="p-6 text-slate-300">Redirecting…</p>
}

/**
 * Shell wrapping all protected routes under /home.
 * - No session + was signed out  → /login
 * - No session + never signed in → /401
 */
export function ProtectedShell() {
  const { session, loading, signedOut } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading && !session) {
      navigate({ to: signedOut ? '/login' : '/401', replace: true })
    }
  }, [loading, session, signedOut, navigate])

  if (loading) {
    return <p className="p-6 text-slate-300">Checking authentication…</p>
  }

  return session ? <AuthenticatedLayout /> : null
}
