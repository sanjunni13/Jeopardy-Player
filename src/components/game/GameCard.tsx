import { AverageRatingBadge } from '../AverageRatingBadge'
import { FavoriteToggle } from '../FavoriteToggle'

interface GameCardProps {
  id: string
  gameName: string
  totalRounds: number
  creatorName?: string | null
  onClick: (id: string) => void
  averageRating?: number | null
  ratingCount?: number
  isFavorited?: boolean
  onToggleFavorite?: () => void
  showFavorite?: boolean
}

export function GameCard({ id, gameName, totalRounds, creatorName, onClick, averageRating, ratingCount, isFavorited, onToggleFavorite, showFavorite }: GameCardProps) {
  const roundLabel = totalRounds === 1 ? '1 round' : `${totalRounds} rounds`

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick(id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(id) } }}
      className="rounded-2xl border border-slate-800 bg-slate-950 p-6 text-left transition-colors cursor-pointer hover:bg-[#6A1B9A] focus:bg-[#6A1B9A] focus:outline-none"
    >
      <h3 className="text-lg font-semibold text-slate-100">{gameName}</h3>
      <p className="mt-1 text-sm text-slate-400">{roundLabel}</p>
      {creatorName && (
        <p className="mt-1 text-xs text-slate-500">by {creatorName}</p>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.5rem' }}>
        <AverageRatingBadge
          averageRating={averageRating ?? null}
          ratingCount={ratingCount ?? 0}
        />
        {showFavorite && onToggleFavorite && (
          <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <FavoriteToggle
              isFavorited={isFavorited ?? false}
              onToggle={onToggleFavorite}
              ariaLabel={isFavorited ? 'Remove from favourites' : 'Add to favourites'}
            />
          </span>
        )}
      </div>
    </div>
  )
}
