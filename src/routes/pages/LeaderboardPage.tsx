import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchAllPlayers } from '../../utils/leaderboardApi'
import { LeaderboardTable } from '../../components/leaderboard/LeaderboardTable'
import type { PlayerRow } from '../../utils/leaderboardUtils'
import './LeaderboardPage.css'

type PageState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty' }
  | { status: 'success'; players: PlayerRow[] }

export function LeaderboardPage() {
  const [state, setState] = useState<PageState>({ status: 'loading' })
  const controllerRef = useRef<AbortController | null>(null)

  const loadPlayers = useCallback(async () => {
    // Abort any in-flight request
    controllerRef.current?.abort()

    const controller = new AbortController()
    controllerRef.current = controller

    setState({ status: 'loading' })

    const timeoutId = setTimeout(() => controller.abort(), 10_000)

    try {
      const data = await fetchAllPlayers({ signal: controller.signal })

      if (controller.signal.aborted) return

      if (data.length === 0) {
        setState({ status: 'empty' })
      } else {
        setState({ status: 'success', players: data })
      }
    } catch (err: unknown) {
      if (controller.signal.aborted) {
        // Only show timeout error if this was our own timeout (not unmount cleanup)
        if (controllerRef.current === controller) {
          setState({ status: 'error', message: 'Request timed out. Please try again.' })
        }
        return
      }

      setState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Could not load player stats.',
      })
    } finally {
      clearTimeout(timeoutId)
    }
  }, [])

  useEffect(() => {
    loadPlayers()

    return () => {
      controllerRef.current?.abort()
    }
  }, [loadPlayers])

  return (
    <div className="leaderboard-page">
      <div className="leaderboard-header">
        <h1 className="leaderboard-title">Leaderboard</h1>
        {state.status === 'success' && (
          <button
            type="button"
            className="leaderboard-refresh-btn"
            onClick={loadPlayers}
            aria-label="Refresh leaderboard"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M23 4v6h-6" />
              <path d="M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
            </svg>
          </button>
        )}
      </div>

      {state.status === 'loading' && (
        <div className="leaderboard-loading" aria-live="polite">
          <Spinner />
          <p className="leaderboard-loading-text">Loading player stats…</p>
        </div>
      )}

      {state.status === 'error' && (
        <div className="leaderboard-error" role="alert">
          <p className="leaderboard-error-message">Could not load player stats.</p>
          <p className="leaderboard-error-detail">{state.message}</p>
          <button
            type="button"
            className="leaderboard-retry-btn"
            onClick={loadPlayers}
          >
            Try Again
          </button>
        </div>
      )}

      {state.status === 'empty' && (
        <div className="leaderboard-empty" role="status">
          <p className="leaderboard-empty-message">No player data available yet</p>
        </div>
      )}

      {state.status === 'success' && (
        <div className="leaderboard-content">
          <LeaderboardTable players={state.players} />
        </div>
      )}

      <div className="leaderboard-glossary-header">
        <h1 className="leaderboard-title">Glossary</h1>
        <div>
          <ul className="leaderboard-glossary-list">
            <li> 
              <code>Record</code> refers to the total win rate of a given player (i.e. how many games they've won) 
            </li>
            <li> 
              <code>Accuracy</code> is the amount of correct answers a player has had, compared with their total amount of answers made 
            </li>
            <li> 
              <code>Total Money Earned</code> is the overall sum of money a player has earned over all their played games 
            </li>
            <li> 
              <code>Current Balance</code> is how much money a player currently has after their most recent game
            </li>
          </ul>
          <p>
            If you don't see your name here, you should be playing more games!
          </p>
        </div>
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <svg
      className="leaderboard-spinner"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle opacity="0.25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path opacity="0.75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}
