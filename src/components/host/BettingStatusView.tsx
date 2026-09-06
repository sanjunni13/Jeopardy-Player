import type { Player } from '../../types/game'
import { formatCurrency } from '../../utils/currency'
import { PlayerBalanceList } from './PlayerBalanceList'
import './BettingStatusView.css'

interface BettingStatusViewProps {
  players: Player[]
  receivedBets: Record<string, { count: number; totalWagered: number }>
  playersDone: Set<string>
  onForceEnd: () => void
}

export function BettingStatusView({
  players,
  receivedBets,
  playersDone,
  onForceEnd,
}: BettingStatusViewProps) {
  return (
    <div className="betting-status-view" aria-label="Betting status">
      <div className="betting-status-view__header">
        <h2 className="betting-status-view__title">Side Bets</h2>
        <span className="betting-status-view__phase-indicator">Betting Phase</span>
      </div>

      <p style={{ color: '#94a3b8', fontSize: '0.8125rem', textAlign: 'center', margin: '0 0 0.75rem' }}>
        Waiting for players to place bets or skip…
      </p>

      <PlayerBalanceList
        players={players}
        classPrefix="betting-status-view"
        ariaLabel="Player betting status"
        detailClassName={player =>
          `betting-status-view__player-status ${
            playersDone.has(player.name)
              ? 'betting-status-view__player-status--placed'
              : 'betting-status-view__player-status--waiting'
          }`
        }
        renderDetail={player => {
          const betInfo = receivedBets[player.name]
          const hasBets = betInfo && betInfo.count > 0
          const isDone = playersDone.has(player.name)
          // Requirement 5.9: every monetary amount here is the shared
          // Currency_Formatter output verbatim.
          const betSummary = hasBets
            ? `${betInfo.count} bet${betInfo.count > 1 ? 's' : ''} · ${formatCurrency(betInfo.totalWagered)}`
            : ''

          return isDone
            ? hasBets
              ? `Done · ${betSummary}`
              : 'Skipped'
            : hasBets
              ? betSummary
              : 'Waiting…'
        }}
      />

      <div className="betting-status-view__controls">
        <button
          type="button"
          className="betting-status-view__btn betting-status-view__btn--end"
          onClick={onForceEnd}
        >
          End Betting
        </button>
      </div>
    </div>
  )
}
