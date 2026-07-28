import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useNavigate, Link, useRouterState } from '@tanstack/react-router'
import { toast } from 'react-toastify'
import { supabase } from '../../utils/supabase'
import { GameCard } from '../../components/game/GameCard'
import { GameDetailsDialog } from '../../components/GameDetailsDialog'
import { BackButton } from '../../components/BackButton'
import { BackgroundGradient } from '../../components/ui/background-gradient'
import { FAQCard } from '../../components/ui/FAQCard'
import { gameLibraryFAQ } from '../../data/faqData'
import { useRandomGamePicker } from '../../hooks/useRandomGamePicker'
import { usePlayerProfileContext } from '../../hooks/usePlayerProfileContext'
import { useGameRatings } from '../../hooks/useGameRatings'
import { fetchFavorites, addFavorite, removeFavorite } from '../../utils/favoritesApi'
import { sortGames } from '../../utils/gameSorting'
import {
  MeltAwayList,
  MeltAwayItem,
  BackToTopFab,
} from '../../components/ui/framer-motion-animations'
import type { SortOption } from '../../utils/gameSorting'
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

const PAGE_SIZE = 30

async function loadGamesPage(options?: {
  page?: number
  search?: string
  filters?: Filters
  signal?: AbortSignal
}): Promise<{ games: GameRecord[]; totalCount: number }> {
  const page = options?.page ?? 0
  const from = page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = supabase
    .from('games')
    .select('*, players(player_name)', { count: 'exact' })
    .not('game_name', 'in', `(${EXCLUDED_GAMES.join(',')})`)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (options?.filters?.rounds != null) {
    query = query.eq('total_rounds', options.filters.rounds)
  }
  if (options?.filters?.source != null) {
    query = query.eq('source', options.filters.source)
  }
  if (options?.search?.trim()) {
    query = query.ilike('game_name', `%${options.search.trim()}%`)
  }
  if (options?.signal) {
    query.abortSignal(options.signal)
  }

  const { data, error, count } = await query
  if (error) throw error

  const games = (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
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

  return { games, totalCount: count ?? 0 }
}

async function loadAllGamesMinimal() {
  const { data, error } = await supabase
    .from('games')
    .select('id, game_name, total_rounds, times_played, winners, created_by, source, high_score, high_score_player, players(player_name)')
    .not('game_name', 'in', `(${EXCLUDED_GAMES.join(',')})`)
  if (error) throw error

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
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
  const { profile } = usePlayerProfileContext()
  const [games, setGames] = useState<GameRecord[]>([])
  const [allGames, setAllGames] = useState<GameRecord[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(0)
  const [status, setStatus] = useState<FetchStatus>('loading')
  const [loadingMore, setLoadingMore] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filters, setFilters] = useState<Filters>({ rounds: null, creator: null, source: null })
  const [showFilters, setShowFilters] = useState(false)
  const [selectedGame, setSelectedGame] = useState<GameRecord | null>(null)
  const [sortOption, setSortOption] = useState<SortOption>('default')
  const [showFavourites, setShowFavourites] = useState(false)
  const [favouriteIds, setFavouriteIds] = useState<Set<string>>(new Set())
  const [favouritesLoaded, setFavouritesLoaded] = useState(false)
  const [favouritesLoading, setFavouritesLoading] = useState(false)
  const [favouritesError, setFavouritesError] = useState<string | null>(null)

  // Read feelingLucky flag passed via location state from the Home page
  const locationState = useRouterState({ select: (s) => s.location.state }) as { feelingLucky?: boolean }
  const feelingLucky = locationState?.feelingLucky ?? false

  const { pickRandom } = useRandomGamePicker()

  // Debounce search input
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [searchQuery])

  // Paginated fetch function — resets state internally when page === 0
  const fetchGamesPage = useCallback(async (page: number, signal?: AbortSignal) => {
    if (page === 0) { setStatus('loading'); setErrorMessage(null); setCurrentPage(0); setGames([]) }
    else { setLoadingMore(true) }

    try {
      const { games: newGames, totalCount: count } = await loadGamesPage({
        page, search: debouncedSearch, filters, signal,
      })
      setGames(prev => page === 0 ? newGames : [...prev, ...newGames])
      setTotalCount(count)
      setCurrentPage(page)
      setStatus('success')
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      setStatus('error')
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load games')
    } finally {
      setLoadingMore(false)
    }
  }, [debouncedSearch, filters])

  // Initial fetch + refetch on search/filter change
  useEffect(() => {
    const controller = new AbortController()

    async function doFetch() {
      setStatus('loading')
      setErrorMessage(null)
      setCurrentPage(0)
      setGames([])

      try {
        const { games: newGames, totalCount: count } = await loadGamesPage({
          page: 0, search: debouncedSearch, filters, signal: controller.signal,
        })
        if (!controller.signal.aborted) {
          setGames(newGames)
          setTotalCount(count)
          setStatus('success')
        }
      } catch (err: unknown) {
        if (controller.signal.aborted) return
        setStatus('error')
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load games')
      } finally {
        if (!controller.signal.aborted) setLoadingMore(false)
      }
    }

    doFetch()
    return () => { controller.abort() }
  }, [debouncedSearch, filters])

  // Load all games in background for random pick and filter option lists
  useEffect(() => {
    const controller = new AbortController()
    loadAllGamesMinimal().then(data => {
      if (!controller.signal.aborted) setAllGames(data)
    }).catch(() => {})
    return () => { controller.abort() }
  }, [])

  const hasMore = games.length < totalCount

  // Infinite scroll via IntersectionObserver
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasMore || loadingMore) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingMore && hasMore) {
          fetchGamesPage(currentPage + 1)
        }
      },
      { rootMargin: '200px' }
    )
    observer.observe(sentinel)
    return () => { observer.disconnect() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loadingMore, currentPage])

  // Auto-trigger random selection when arriving via the Home page "Feeling Lucky" button
  useEffect(() => {
    if (!feelingLucky || status !== 'success') return
    const pool = allGames.length > 0 ? allGames : games
    if (pool.length === 0) {
      toast.info('No games are available for random selection.')
      return
    }
    pickRandom(pool)
  }, [feelingLucky, status, allGames, games, pickRandom])

  // Show error toast when feelingLucky is set and the library fetch fails (Requirement 2.4)
  useEffect(() => {
    if (!feelingLucky || status !== 'error') return
    toast.error(errorMessage ?? 'Failed to load games. Could not pick a random game.')
  }, [feelingLucky, status, errorMessage])

  // Game ratings for the library view
  const gameIds = useMemo(() => games.map(g => g.id), [games])
  const { ratings } = useGameRatings(gameIds)

  // Load favourites function defined outside effect (matches usePlayerProfile pattern)
  const loadFavourites = useCallback(async () => {
    if (!profile) return

    setFavouritesLoading(true)
    setFavouritesError(null)

    try {
      const ids = await fetchFavorites(profile.playerId)
      setFavouriteIds(new Set(ids))
      setFavouritesLoaded(true)
    } catch {
      setFavouritesError('Failed to load favourites')
    } finally {
      setFavouritesLoading(false)
    }
  }, [profile])

  // Fetch favourites on page load when authenticated (so cards render with correct state)
  const favouritesInitRef = useRef(false)

  useEffect(() => {
    favouritesInitRef.current = false
  }, [profile])

  useEffect(() => {
    if (!profile) return
    if (favouritesInitRef.current) return
    favouritesInitRef.current = true
    loadFavourites()
  }, [profile, loadFavourites])

  // Re-fetch favourites when the filter is activated (in case new bookmarks were added)
  const favouritesFetchedRef = useRef(false)

  useEffect(() => {
    favouritesFetchedRef.current = false
  }, [showFavourites, profile])

  useEffect(() => {
    if (!showFavourites || !profile) return
    if (favouritesFetchedRef.current) return
    favouritesFetchedRef.current = true
    loadFavourites()
  }, [showFavourites, profile, loadFavourites])

  // Unique round counts and creators for filter options (from allGames for comprehensive list)
  const filterSource = allGames.length > 0 ? allGames : games

  const roundOptions = useMemo(() =>
    [...new Set(filterSource.map(g => g.total_rounds))].sort((a, b) => a - b),
    [filterSource]
  )

  const creatorOptions = useMemo(() =>
    [...new Set(filterSource.map(g => g.creator_name).filter((c): c is string => c != null))].sort((a, b) => a.localeCompare(b)),
    [filterSource]
  )

  const sourceOptions = useMemo(() =>
    [...new Set(filterSource.map(g => g.source).filter((s): s is string => s != null))].sort(),
    [filterSource]
  )

  // Filtered games (creator filter is client-side since it's from a joined table)
  const filteredGames = useMemo(() => {
    let results = games

    if (filters.creator != null) {
      results = results.filter(g => g.creator_name === filters.creator)
    }

    return results
  }, [games, filters.creator])

  const activeFilterCount = (filters.rounds != null ? 1 : 0) + (filters.creator != null ? 1 : 0) + (filters.source != null ? 1 : 0)

  // Apply favourites filter and sorting on top of filteredGames
  const displayedGames = useMemo(() => {
    let results = filteredGames

    // Apply favourites filter
    if (showFavourites && profile) {
      results = results.filter(g => favouriteIds.has(g.id))
    }

    // Apply sorting
    results = sortGames(results, sortOption, ratings)

    return results
  }, [filteredGames, showFavourites, profile, favouriteIds, sortOption, ratings])

  function handleCardClick(id: string) {
    const game = games.find(g => g.id === id)
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

  async function handleToggleFavorite(gameId: string) {
    if (!profile) return
    const isCurrentlyFavorited = favouriteIds.has(gameId)

    // Optimistic update
    setFavouriteIds(prev => {
      const next = new Set(prev)
      if (isCurrentlyFavorited) next.delete(gameId)
      else next.add(gameId)
      return next
    })

    const result = isCurrentlyFavorited
      ? await removeFavorite(profile.playerId, gameId)
      : await addFavorite(profile.playerId, gameId)

    if (!result.success) {
      // Revert on failure
      setFavouriteIds(prev => {
        const next = new Set(prev)
        if (isCurrentlyFavorited) next.add(gameId)
        else next.delete(gameId)
        return next
      })
      toast.error('Could not update favourites. Please try again.')
    }
  }


  function retryFavourites() {
    loadFavourites()
  }

  // Feeling Lucky button visibility
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
        {status === 'success' && (games.length > 0 || debouncedSearch || activeFilterCount > 0) && (
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
            <select
              className="library-filter-select"
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as SortOption)}
              aria-label="Sort games"
            >
              <option value="default">Default</option>
              <option value="highest-rated">Highest Rated</option>
              <option value="most-played">Most Played</option>
            </select>
            {profile && (
              <button
                type="button"
                className={`library-favourites-btn ${showFavourites ? 'active' : ''}`}
                onClick={() => setShowFavourites(!showFavourites)}
              >
                ❤️ My Favorites
              </button>
            )}
            <button
              type="button"
              className="library-feeling-lucky-btn"
              onClick={() => pickRandom(allGames.length > 0 ? allGames : games)}
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
              onClick={() => fetchGamesPage(0)}
              className="library-retry-btn"
            >
              Retry
            </button>
          </div>
        )}

        {status === 'success' && games.length === 0 && !debouncedSearch && activeFilterCount === 0 && (
          <div className="library-empty">
            <p className="library-empty-message">
              No games available. Upload a game first!
            </p>
            <Link to="/home/upload" className="library-upload-link">
              Go to Upload
            </Link>
          </div>
        )}

        {status === 'success' && games.length === 0 && (debouncedSearch || activeFilterCount > 0) && (
          <div className="library-empty">
            <p className="library-empty-message">
              No games match your search or filters.
            </p>
          </div>
        )}

        {showFavourites && favouritesLoading && (
          <div className="library-loading">
            <Spinner />
          </div>
        )}

        {showFavourites && favouritesError && (
          <div className="library-error">
            <p className="library-error-message">{favouritesError}</p>
            <button type="button" onClick={retryFavourites} className="library-retry-btn">
              Retry
            </button>
          </div>
        )}

        {showFavourites && !favouritesLoading && !favouritesError && displayedGames.length === 0 && filteredGames.length > 0 && (
          <div className="library-empty">
            <p className="library-empty-message">
              No favourites yet! Bookmark games to see them here.
            </p>
          </div>
        )}

        {status === 'success' && displayedGames.length > 0 && !favouritesLoading && !favouritesError && (!profile || favouritesLoaded) && (
          <MeltAwayList className="library-grid">
            {displayedGames.map((game) => (
              <MeltAwayItem key={game.id} itemKey={game.id} className="library-grid-item">
                <GameCard
                  id={game.id}
                  gameName={game.game_name}
                  totalRounds={game.total_rounds}
                  creatorName={game.creator_name}
                  onClick={handleCardClick}
                  averageRating={ratings.get(game.id)?.averageRating ?? null}
                  ratingCount={ratings.get(game.id)?.ratingCount ?? 0}
                  isFavorited={favouriteIds.has(game.id)}
                  onToggleFavorite={() => handleToggleFavorite(game.id)}
                  showFavorite={profile != null}
                />
              </MeltAwayItem>
            ))}
          </MeltAwayList>
        )}
      </BackgroundGradient>

      {/* Infinite scroll sentinel */}
      {status === 'success' && hasMore && (
        <div ref={sentinelRef} className="library-load-more-sentinel" style={{ height: '1px', margin: '2rem 0' }}>
          {loadingMore && <Spinner />}
        </div>
      )}

      <GameDetailsDialog
        isOpen={selectedGame != null}
        game={selectedGame}
        onPlay={handlePlayGame}
        onClose={() => setSelectedGame(null)}
        averageRating={selectedGame ? (ratings.get(selectedGame.id)?.averageRating ?? null) : null}
        ratingCount={selectedGame ? (ratings.get(selectedGame.id)?.ratingCount ?? 0) : 0}
        isFavorited={selectedGame ? favouriteIds.has(selectedGame.id) : false}
        onToggleFavorite={selectedGame ? () => handleToggleFavorite(selectedGame.id) : undefined}
        showFavorite={profile != null}
      />

      <FAQCard items={gameLibraryFAQ} />

      <BackToTopFab />
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
