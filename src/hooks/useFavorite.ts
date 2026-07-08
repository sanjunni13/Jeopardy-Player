import { useState, useEffect, useCallback } from 'react'
import { fetchFavorites, addFavorite, removeFavorite } from '../utils/favoritesApi'

export interface UseFavoriteResult {
  isFavorited: boolean
  loading: boolean
  toggling: boolean
  toggleFavorite: () => Promise<boolean>
}

/**
 * Manages the favourite/bookmark state for a single game.
 * Provides optimistic UI toggling with revert on failure,
 * and guards against concurrent toggle activations.
 */
export function useFavorite(gameId: string, playerId: number | null): UseFavoriteResult {
  const [isFavorited, setIsFavorited] = useState(false)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)

  useEffect(() => {
    let cancelled = false

    const promise = (!playerId || !gameId)
      ? Promise.resolve([] as string[])
      : fetchFavorites(playerId)

    promise.then((favorites) => {
      if (!cancelled) {
        setIsFavorited(favorites.includes(gameId))
        setLoading(false)
      }
    })

    return () => { cancelled = true }
  }, [gameId, playerId])

  const toggleFavorite = useCallback(async (): Promise<boolean> => {
    // Guard: ignore if no player or already toggling (Req 3.7)
    if (!playerId || toggling) return false

    setToggling(true)

    // Optimistic UI update
    const previousState = isFavorited
    setIsFavorited(!previousState)

    let result: { success: boolean; error?: string }

    if (previousState) {
      // Was favorited → remove
      result = await removeFavorite(playerId, gameId)
    } else {
      // Was not favorited → add
      result = await addFavorite(playerId, gameId)
    }

    if (!result.success) {
      // Revert on failure (Req 3.4)
      setIsFavorited(previousState)
      setToggling(false)
      return false
    }

    setToggling(false)
    return true
  }, [playerId, gameId, toggling, isFavorited])

  return { isFavorited, loading, toggling, toggleFavorite }
}
