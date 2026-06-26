import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from './useAuth'
import { supabase } from '../utils/supabase'
import type { PlayerProfile } from '../contexts/PlayerProfileContext'

export interface UsePlayerProfileResult {
  profile: PlayerProfile | null
  loading: boolean
  error: string | null
}

/**
 * Queries the `players` table for a row matching the current user's Auth UUID.
 * Caches the result for the session lifetime — subsequent calls return the
 * cached value unless `refreshProfile` is triggered via the context provider.
 */
export function usePlayerProfile(): UsePlayerProfileResult {
  const { session } = useAuth()
  const [profile, setProfile] = useState<PlayerProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const fetchedRef = useRef(false)
  const authUuid = session?.user?.id ?? null

  const fetchProfile = useCallback(async () => {
    if (!authUuid) {
      setProfile(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const { data, error: queryError } = await supabase
      .from('players')
      .select('id, player_name, auth_uuid')
      .eq('auth_uuid', authUuid)
      .maybeSingle()

    if (queryError) {
      setError(queryError.message)
      setProfile(null)
    } else if (data) {
      setProfile({
        playerId: data.id,
        playerName: data.player_name,
        authUuid: data.auth_uuid,
      })
    } else {
      setProfile(null)
    }

    setLoading(false)
  }, [authUuid])

  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true
    fetchProfile()
  }, [fetchProfile])

  return { profile, loading, error }
}

/**
 * Standalone fetch function used by the PlayerProfileProvider to support
 * the `refreshProfile` method without re-instantiating the hook.
 */
export async function fetchPlayerProfile(authUuid: string): Promise<PlayerProfile | null> {
  const { data, error } = await supabase
    .from('players')
    .select('id, player_name, auth_uuid')
    .eq('auth_uuid', authUuid)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  if (!data) return null

  return {
    playerId: data.id,
    playerName: data.player_name,
    authUuid: data.auth_uuid,
  }
}
