import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { usePlayerProfileContext } from '../hooks/usePlayerProfileContext'

/**
 * Route guard that redirects authenticated users to /profile-setup
 * if they don't have a player profile yet.
 *
 * Must be rendered inside a PlayerProfileProvider.
 *
 * Requirements:
 * - 1.1: No player record → show Profile Setup Page
 * - 1.8: User navigates away without completing → redirect back to setup
 * - 1.9: Player record exists → bypass setup, go to home
 */
export function ProfileGuard({ children }: { children: React.ReactNode }) {
  const { profile, loading } = usePlayerProfileContext()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading && profile === null) {
      navigate({ to: '/profile-setup', replace: true })
    }
  }, [loading, profile, navigate])

  if (loading) {
    return <p className="p-6 text-slate-300">Loading profile…</p>
  }

  if (profile === null) {
    return null
  }

  return <>{children}</>
}
