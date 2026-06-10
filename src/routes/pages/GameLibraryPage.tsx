import { useEffect, useState, useCallback } from 'react'
import { useNavigate, Link } from '@tanstack/react-router'
import { supabase } from '../../utils/supabase'
import { GameCard } from '../../components/game/GameCard'
import { BackButton } from '../../components/BackButton'
import { BackgroundGradient } from '../../components/ui/background-gradient'
import './GameLibraryPage.css'

interface GameRecord {
  id: string
  game_name: string
  total_rounds: number
  times_played: number
  winners: string[]
}

type FetchStatus = 'loading' | 'success' | 'error'

async function loadGames() {
  const { data, error } = await supabase.from('games').select('*')
  if (error) throw error
  return (data ?? []) as GameRecord[]
}

export function GameLibraryPage() {
  const navigate = useNavigate()
  const [games, setGames] = useState<GameRecord[]>([])
  const [status, setStatus] = useState<FetchStatus>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const fetchGames = useCallback(async () => {
    setStatus('loading')
    setErrorMessage(null)

    try {
      const data = await loadGames()
      setGames(data)
      setStatus('success')
    } catch (err: unknown) {
      setStatus('error')
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load games')
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    loadGames().then(
      (data) => { if (!cancelled) { setGames(data); setStatus('success') } },
      (err) => { if (!cancelled) { setStatus('error'); setErrorMessage(err instanceof Error ? err.message : 'Failed to load games') } },
    )

    return () => { cancelled = true }
  }, [])

  function handleCardClick(id: string) {
    navigate({ to: '/home/game/$gameId', params: { gameId: id } })
  }

  return (
    <div className="library-page">
      <BackgroundGradient containerClassName="library-gradient-container" className="library-card">
        <BackButton onClick={() => navigate({ to: '/home' })} label="Back to home" />

        <h1 className="library-title">Game Library</h1>
        <p className="library-subtitle">Select a game to play!</p>

        {status === 'loading' && (
          <div className="library-loading">
            <Spinner />
          </div>
        )}

        {status === 'error' && (
          <div className="library-error">
            <p className="library-error-message">{errorMessage}</p>
            <button
              type="button"
              onClick={fetchGames}
              className="library-retry-btn"
            >
              Retry
            </button>
          </div>
        )}

        {status === 'success' && games.length === 0 && (
          <div className="library-empty">
            <p className="library-empty-message">
              No games available. Upload a game first!
            </p>
            <Link to="/home/upload" className="library-upload-link">
              Go to Upload
            </Link>
          </div>
        )}

        {status === 'success' && games.length > 0 && (
          <div className="library-grid">
            {games.map((game) => (
              <GameCard
                key={game.id}
                id={game.id}
                gameName={game.game_name}
                totalRounds={game.total_rounds}
                onClick={handleCardClick}
              />
            ))}
          </div>
        )}
      </BackgroundGradient>
    </div>
  )
}

function Spinner() {
  return (
    <svg
      className="library-spinner"
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
