import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../hooks/useAuth'
import { fetchPlayerProfile } from '../hooks/usePlayerProfile'
import { PlayerProfileContext } from './PlayerProfileContext'
import type { PlayerProfile } from './PlayerProfileContext'

export function PlayerProfileProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth()
  const [profile, setProfile] = useState<PlayerProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const fetchedRef = useRef(false)

  const authUuid = session?.user?.id ?? null

  const refreshProfile = useCallback(async () => {
    if (!authUuid) {
      setProfile(null)
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const result = await fetchPlayerProfile(authUuid)
      setProfile(result)
    } catch {
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }, [authUuid])

  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true
    refreshProfile()
  }, [refreshProfile])

  return (
    <PlayerProfileContext.Provider value={{ profile, loading, refreshProfile }}>
      {children}
    </PlayerProfileContext.Provider>
  )
}
