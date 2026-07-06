import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate, Link, useRouterState } from '@tanstack/react-router'
import { toast } from 'react-toastify'
import Fuse from 'fuse.js'
import { supabase } from '../../utils/supabase'
import { GameCard } from '../../components/game/GameCard'
import { GameDetailsDialog } from '../../components/GameDetailsDialog'
import { BackButton } from '../../components/BackButton'
import { BackgroundGradient } from '../../components/ui/background-gradient'
import { FAQCard } from '../../components/ui/FAQCard'
import { gameLibraryFAQ } from '../../data/faqData'
import { useRandomGamePicker } from '../../hooks/useRandomGamePicker'
import type { GameRecord } from '../../types/game'
import './GameLibraryPage.css'

interface Filters {
  rounds: number | null
  creator: string | null
  source: string | null
}

type FetchStatus = 'loading' | 'success' | 'error'

const EXCLUDED_GAMES = [
  'exampleCustomizableGame',
  'exampleDoubleGame',
  'exampleShortGame',
  'exampleTripleGame',
  'generated_game',
  'sample',
  'scraped_game',
  'random_game',
]

async function loadGames() {
  const { data, error } = await supabase
    .from('games')
    .select('*, players(player_name)')
    .not('game_name', 'in', `(${EXCLUDED_GAMES.join(',')})`)
  if (error) throw error

  // Map the joined player_name into a flat creator_name field
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    game_name: row.game_name as string,
    total_rounds: row.total_rounds as number,
    times_played: row.times_played as number,
    winners: row.winners as string[],
    created_by: row.created_by as number | null,
    source: row.source as string | null,
    high_score: row.high_score as number | null,
    high_score_player: row.high_score_player as string | null,
    creator_name: (row.players as { player_name: string } | null)?.player_name ?? null,
  })) as GameRecord[]
}

export function GameLibraryPage() {
  const navigate = useNavigate()
  const [games, setGames] = useState<GameRecord[]>([])
  const [status, setStatus] = useState<FetchStatus>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filters, setFilters] = useState<Filters>({ rounds: null, creator: null, source: null })
  const [showFilters, setShowFilters] = useState(false)
  const [selectedGame, setSelectedGame] = useState<GameRecord | null>(null)

  // Read feelingLucky flag passed via location state from the Home page
  const locationState = useRouterState({ select: (s) => s.location.state }) as { feelingLucky?: boolean }
  const feelingLucky = locationState?.feelingLucky ?? false

  const { pickRandom } = useRandomGamePicker()

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

  // Auto-trigger random selection when arriving via the Home page "Feeling Lucky" button
  useEffect(() => {
    if (!feelingLucky || status !== 'success') return
    if (games.length === 0) {
      toast.info('No games are available for random selection.')
      return
    }
    pickRandom(games)
  }, [feelingLucky, status, games, pickRandom])

  // Show error toast when feelingLucky is set and the library fetch fails (Requirement 2.4)
  useEffect(() => {
    if (!feelingLucky || status !== 'error') return
    toast.error(errorMessage ?? 'Failed to load games. Could not pick a random game.')
  }, [feelingLucky, status, errorMessage])

  // Fuse.js instance for fuzzy search
  const fuse = useMemo(() => new Fuse(games, {
    keys: ['game_name'],
    threshold: 0.4,
    ignoreLocation: true,
  }), [games])

  // Unique round counts and creators for filter options
  const roundOptions = useMemo(() =>
    [...new Set(games.map(g => g.total_rounds))].sort((a, b) => a - b),
    [games]
  )

  const creatorOptions = useMemo(() =>
    [...new Set(games.map(g => g.creator_name).filter((c): c is string => c != null))].sort((a, b) => a.localeCompare(b)),
    [games]
  )

  const sourceOptions = useMemo(() =>
    [...new Set(games.map(g => g.source).filter((s): s is string => s != null))].sort(),
    [games]
  )

  // Filtered + searched games
  const filteredGames = useMemo(() => {
    let results = searchQuery.trim()
      ? fuse.search(searchQuery).map(r => r.item)
      : games

    if (filters.rounds != null) {
      results = results.filter(g => g.total_rounds === filters.rounds)
    }

    if (filters.creator != null) {
      results = results.filter(g => g.creator_name === filters.creator)
    }

    if (filters.source != null) {
      results = results.filter(g => g.source === filters.source)
    }

    return results
  }, [games, searchQuery, filters, fuse])

  const activeFilterCount = (filters.rounds != null ? 1 : 0) + (filters.creator != null ? 1 : 0) + (filters.source != null ? 1 : 0)

  function handleCardClick(id: string) {
    const game = filteredGames.find(g => g.id === id) ?? games.find(g => g.id === id)
    if (game) {
      setSelectedGame(game)
    }
  }

  function handlePlayGame(id: string) {
    setSelectedGame(null)
    navigate({ to: '/home/game/$gameId', params: { gameId: id }, state: { fromLibrary: true } })
  }

  function clearFilters() {
    setFilters({ rounds: null, creator: null, source: null })
  }

  // Feeling Lucky button visibility:
  //   loading  → visible, disabled
  //   success + games.length > 0 → visible, enabled  (rendered inside library-search-row)
  //   success + games.length === 0 → hidden
  //   error → hidden
  const showFeelingLuckyLoading = status === 'loading'

  return (
    <div className="library-page">
      <BackgroundGradient containerClassName="library-gradient-container" className="library-card">
        <BackButton onClick={() => navigate({ to: '/home' })} label="Back to home" />

        <h1 className="library-title">Game Library</h1>
        <p className="library-subtitle">Select a game to play!</p>

        {/* Disabled Feeling Lucky button shown while loading (Requirements 1.3, 1.7) */}
        {showFeelingLuckyLoading && (
          <div className="library-feeling-lucky-row">
            <button
              type="button"
              className="library-feeling-lucky-btn"
              disabled
            >
              🎲 Feeling Lucky
            </button>
          </div>
        )}

        {/* Search row with enabled Feeling Lucky button (Requirements 1.1, 1.4) */}
        {status === 'success' && games.length > 0 && (
          <div className="library-search-row">
            <div className="library-search-wrapper">
              <input
                placeholder="Search games..."
                className="library-search-input"
                name="search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="library-search-clear"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>
            <button
              type="button"
              className={`library-filter-btn ${showFilters ? 'active' : ''}`}
              onClick={() => setShowFilters(!showFilters)}
              aria-label="Toggle filters"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
              </svg>
              {activeFilterCount > 0 && (
                <span className="library-filter-badge">{activeFilterCount}</span>
              )}
            </button>
            <button
              type="button"
              className="library-feeling-lucky-btn"
              onClick={() => pickRandom(games)}
            >
              🎲 Feeling Lucky
            </button>
          </div>
        )}

        {showFilters && status === 'success' && (
          <div className="library-filter-panel">
            <div className="library-filter-group">
              <label className="library-filter-label">Rounds</label>
              <select
                className="library-filter-select"
                value={filters.rounds ?? ''}
                onChange={(e) => setFilters({ ...filters, rounds: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">All</option>
                {roundOptions.map(r => (
                  <option key={r} value={r}>{r} {r === 1 ? 'round' : 'rounds'}</option>
                ))}
              </select>
            </div>

            <div className="library-filter-group">
              <label className="library-filter-label">Creator</label>
              <select
                className="library-filter-select"
                value={filters.creator ?? ''}
                onChange={(e) => setFilters({ ...filters, creator: e.target.value || null })}
              >
                <option value="">All</option>
                {creatorOptions.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="library-filter-group">
              <label className="library-filter-label">Source</label>
              <select
                className="library-filter-select"
                value={filters.source ?? ''}
                onChange={(e) => setFilters({ ...filters, source: e.target.value || null })}
              >
                <option value="">All</option>
                {sourceOptions.map(s => (
                  <option key={s} value={s}>{s === 'archive' ? 'J! Archive' : s === 'labs' ? 'JeopardyLabs' : s === 'ai' ? 'AI Generated' : s}</option>
                ))}
              </select>
            </div>

            {activeFilterCount > 0 && (
              <button type="button" className="library-filter-clear" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>
        )}

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

        {status === 'success' && games.length > 0 && filteredGames.length === 0 && (
          <div className="library-empty">
            <p className="library-empty-message">
              No games match your search or filters.
            </p>
          </div>
        )}

        {status === 'success' && filteredGames.length > 0 && (
          <div className="library-grid">
            {filteredGames.map((game) => (
              <GameCard
                key={game.id}
                id={game.id}
                gameName={game.game_name}
                totalRounds={game.total_rounds}
                creatorName={game.creator_name}
                onClick={handleCardClick}
              />
            ))}
          </div>
        )}
      </BackgroundGradient>

      <GameDetailsDialog
        isOpen={selectedGame != null}
        game={selectedGame}
        onPlay={handlePlayGame}
        onClose={() => setSelectedGame(null)}
      />

      <FAQCard items={gameLibraryFAQ} />
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
