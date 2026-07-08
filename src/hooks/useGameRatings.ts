import { useState, useEffect, useCallback, useMemo } from 'react'
import { fetchGameRatings } from '../utils/ratingsApi'
import type { GameRatingSummary } from '../utils/ratingsApi'

export function useGameRatings(gameIds: string[]): {
  ratings: Map<string, GameRatingSummary>
  loading: boolean
  refresh: (gameId?: string) => void
} {
  const [ratings, setRatings] = useState<Map<string, GameRatingSummary>>(new Map())
  const [loading, setLoading] = useState(false)

  // Stabilize the gameIds reference using a joined key
  const gameIdsKey = useMemo(() => gameIds.join(','), [gameIds])
  const stableGameIds = useMemo(() => gameIds, [gameIdsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (stableGameIds.length === 0) return

    let cancelled = false

    fetchGameRatings(stableGameIds).then((summaries) => {
      if (!cancelled) {
        const map = new Map<string, GameRatingSummary>()
        for (const summary of summaries) {
          map.set(summary.gameId, summary)
        }
        setRatings(map)
        setLoading(false)
      }
    }).catch(() => {
      if (!cancelled) {
        setLoading(false)
      }
    })

    return () => { cancelled = true }
  }, [stableGameIds])

  const refresh = useCallback(
    (gameId?: string) => {
      if (gameId) {
        fetchGameRatings([gameId]).then((summaries) => {
          if (summaries.length > 0) {
            setRatings((prev) => {
              const next = new Map(prev)
              next.set(summaries[0].gameId, summaries[0])
              return next
            })
          }
        })
      } else {
        fetchGameRatings(stableGameIds).then((summaries) => {
          const map = new Map<string, GameRatingSummary>()
          for (const summary of summaries) {
            map.set(summary.gameId, summary)
          }
          setRatings(map)
        })
      }
    },
    [stableGameIds]
  )

  return { ratings, loading, refresh }
}
