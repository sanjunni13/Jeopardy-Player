import type { Player } from '../../types/game'
import './AuctionStatusView.css'

interface AuctionStatusViewProps {
  category: string
  categoryIndex: number
  players: Player[]
  receivedBids: Record<string, number>
  timerDuration: number
  timeRemaining: number
  onForceEnd: () => void
}

/**
 * Host-side read-only view during multiplayer auctions.
 * Shows which players have bid and the countdown timer.
 * Bidding happens on player devices — this is purely informational.
 * Bid amounts are hidden until bidding ends (only shows "Bid placed ✓").
 */
export function AuctionStatusView({
  category,
  categoryIndex,
  players,
  receivedBids,
  timerDuration,
  timeRemaining,
  onForceEnd,
}: AuctionStatusViewProps) {
  const timerPercent = timerDuration > 0 ? (timeRemaining / timerDuration) * 100 : 0
  const isUrgent = timeRemaining <= 5

  return (
    <div className="auction-status" aria-label="Auction status view">
      <div className="auction-status__header">
        <h2 className="auction-status__title">Category Auction</h2>
        <span className="auction-status__category-badge">
          Category {categoryIndex + 1}
        </span>
      </div>

      <div className="auction-status__category">
        <h3 className="auction-status__category-name">{category}</h3>
      </div>

      <div className="auction-status__timer">
        <div className="auction-status__timer-bar-track">
          <div
            className={`auction-status__timer-bar-fill${isUrgent ? ' auction-status__timer-bar-fill--urgent' : ''}`}
            style={{ width: `${timerPercent}%` }}
          />
        </div>
        <span className={`auction-status__time-text${isUrgent ? ' auction-status__time-text--urgent' : ''}`}>
          {timeRemaining}s
        </span>
      </div>

      <div className="auction-status__players" aria-label="Player bid statuses">
        <ul className="auction-status__player-list">
          {players.map(player => {
            const hasBid = player.name in receivedBids
            return (
              <li
                key={player.name}
                className={`auction-status__player-item${hasBid ? ' auction-status__player-item--bid' : ''}`}
              >
                <span className="auction-status__player-name">{player.name}</span>
                <span className={`auction-status__player-status${hasBid ? ' auction-status__player-status--bid' : ''}`}>
                  {hasBid
                    ? 'Bid placed \u2713'
                    : 'Waiting\u2026'}
                </span>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="auction-status__controls">
        <button
          type="button"
          className="auction-status__end-btn"
          onClick={onForceEnd}
        >
          End Bidding
        </button>
      </div>
    </div>
  )
}
