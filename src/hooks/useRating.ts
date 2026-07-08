import { useState, useEffect, useCallback } from 'react'
import { fetchMyRating, upsertRating } from '../utils/ratingsApi'

export interface UseRatingResult {
  rating: number | null        // current player's rating (1-5 or null)
  loading: boolean
  submitting: boolean
  submitRating: (value: number) => Promise<boolean>
}

/**
 * Manages the current player's rating for a specific game.
 * Fetches the existing rating on mount and exposes a submitRating function
 * with optimistic UI updates and revert-on-failure behaviour.
 *
 * Validates: Requirements 1.2, 1.3, 1.6, 2.1, 2.2, 2.3, 2.5
 */
export function useRating(gameId: string, playerId: number | null): UseRatingResult {
  const [rating, setRating] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false

    const promise = (playerId === null || !gameId)
      ? Promise.resolve(null)
      : fetchMyRating(playerId, gameId)

    promise.then((existing) => {
      if (!cancelled) {
        setRating(existing)
        setLoading(false)
      }
    })

    return () => { cancelled = true }
  }, [playerId, gameId])

  const submitRating = useCallback(async (value: number): Promise<boolean> => {
    if (playerId === null) return false

    // Same-value no-op check (Req 2.5): skip write if rating unchanged
    if (value === rating) return true

    const previousRating = rating

    // Optimistic UI update — reflect the new rating immediately
    setRating(value)
    setSubmitting(true)

    try {
      const result = await upsertRating(playerId, gameId, value)
      if (!result.success) {
        // Revert on failure (Req 2.3)
        setRating(previousRating)
        return false
      }
      return true
    } catch {
      // Revert on unexpected error
      setRating(previousRating)
      return false
    } finally {
      setSubmitting(false)
    }
  }, [playerId, gameId, rating])

  return { rating, loading, submitting, submitRating }
}
