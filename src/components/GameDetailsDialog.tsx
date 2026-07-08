import { useEffect, useRef, useCallback } from 'react'
import type { GameRecord } from '../types/game'
import { AverageRatingBadge } from './AverageRatingBadge'
import { FavoriteToggle } from './FavoriteToggle'
import './GameDetailsDialog.css'

interface GameDetailsDialogProps {
  isOpen: boolean
  game: GameRecord | null
  onPlay: (id: string) => void
  onClose: () => void
  averageRating?: number | null
  ratingCount?: number
  isFavorited?: boolean
  onToggleFavorite?: () => void
  showFavorite?: boolean
}

export function GameDetailsDialog({ isOpen, game, onPlay, onClose, averageRating, ratingCount, isFavorited, onToggleFavorite, showFavorite }: GameDetailsDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const playRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Focus the play button when dialog opens
  useEffect(() => {
    if (isOpen) {
      playRef.current?.focus()
    }
  }, [isOpen])

  // Handle Escape key to close dialog
  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Focus trap: Tab cycles between close and play buttons
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return

    const focusableElements = [closeRef.current, playRef.current].filter(Boolean) as HTMLElement[]
    if (focusableElements.length === 0) return

    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]

    if (e.shiftKey) {
      if (document.activeElement === firstElement) {
        e.preventDefault()
        lastElement.focus()
      }
    } else {
      if (document.activeElement === lastElement) {
        e.preventDefault()
        firstElement.focus()
      }
    }
  }, [])

  if (!isOpen || !game) return null

  // Deduplicate winners list and count occurrences
  const winnerCounts = (game.winners ?? []).reduce<Record<string, number>>((acc, name) => {
    acc[name] = (acc[name] ?? 0) + 1
    return acc
  }, {})

  const uniqueWinners = Object.entries(winnerCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([name, count]) => ({ name, count }))

  const roundLabel = game.total_rounds === 1 ? '1 round' : `${game.total_rounds} rounds`

  return (
    <div
      className="game-details-dialog-overlay"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-details-dialog-title"
        className="game-details-dialog"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <h2 id="game-details-dialog-title" className="game-details-dialog__title">
          {game.game_name}
        </h2>

        <div className="game-details-dialog__meta">
          <span className="game-details-dialog__badge">{roundLabel}</span>
          {game.creator_name && (
            <span className="game-details-dialog__badge">by {game.creator_name}</span>
          )}
          {game.source && (
            <span className="game-details-dialog__badge">
              {game.source === 'archive' ? 'J! Archive' : game.source === 'labs' ? 'JeopardyLabs' : game.source === 'ai' ? 'AI Generated' : game.source}
            </span>
          )}
        </div>

        <div className="game-details-dialog__stats">
          {/* Times Played */}
          <div className="game-details-dialog__stat-row">
            <span className="game-details-dialog__stat-label">Times Played</span>
            <span className="game-details-dialog__stat-value">{game.times_played}</span>
          </div>

          {/* High Score */}
          <div className="game-details-dialog__stat-row">
            <span className="game-details-dialog__stat-label">Highest Score</span>
            <span className="game-details-dialog__stat-value">
              {game.high_score != null ? (
                <>
                  ${game.high_score.toLocaleString()}
                  {game.high_score_player && (
                    <span className="game-details-dialog__stat-player"> — {game.high_score_player}</span>
                  )}
                </>
              ) : (
                <span className="game-details-dialog__stat-empty">No games played yet</span>
              )}
            </span>
          </div>

          {/* Previous Winners */}
          <div className="game-details-dialog__stat-row game-details-dialog__stat-row--vertical">
            <span className="game-details-dialog__stat-label">Previous Winners</span>
            {uniqueWinners.length > 0 ? (
              <ul className="game-details-dialog__winners-list">
                {uniqueWinners.map(({ name, count }) => (
                  <li key={name} className="game-details-dialog__winner-item">
                    <span className="game-details-dialog__winner-name">{name}</span>
                    {count > 1 && (
                      <span className="game-details-dialog__winner-count">×{count}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <span className="game-details-dialog__stat-empty">No winners yet</span>
            )}
          </div>
        </div>

        {/* Average rating and favorite controls */}
        <div className="game-details-dialog__rating-controls" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginBottom: '1rem' }}>
          <AverageRatingBadge
            averageRating={averageRating ?? null}
            ratingCount={ratingCount ?? 0}
          />
          {showFavorite && onToggleFavorite && (
            <FavoriteToggle
              isFavorited={isFavorited ?? false}
              onToggle={onToggleFavorite}
              ariaLabel={isFavorited ? 'Remove from favourites' : 'Add to favourites'}
            />
          )}
        </div>

        <p className="game-details-dialog__prompt">Would you like to play this game?</p>

        <div className="game-details-dialog__actions">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="game-details-dialog__cancel"
          >
            Cancel
          </button>
          <button
            ref={playRef}
            type="button"
            onClick={() => onPlay(game.id)}
            className="game-details-dialog__play"
          >
            Play Game
          </button>
        </div>
      </div>
    </div>
  )
}
