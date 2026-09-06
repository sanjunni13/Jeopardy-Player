import type { Player } from '../../types/game'
import { formatCurrency } from '../../utils/currency'
import { PlayerBalanceList } from './PlayerBalanceList'
import './AuctionStatusView.css'

export interface AuctionResultSummary {
  winner: string | null
  winningBid: number
  categoryName: string
  isTied: boolean
  isReleased: boolean
}

interface AuctionResultViewProps {
  result: AuctionResultSummary
  players: Player[]
}

/**
 * Host-side result panel shown after a category auction resolves: the winner,
 * the tie / rebid notice, or the released category, plus the per-player balance
 * list. Extracted out of `GamePage.tsx` so every monetary string on this surface
 * comes from the shared Currency_Formatter (Requirements 5.9, 5.13).
 */
export function AuctionResultView({ result, players }: AuctionResultViewProps) {
  return (
    <div className="auction-status" aria-label="Auction result">
      <div className="auction-status__header">
        <h2 className="auction-status__title">Category Auction</h2>
        <span className="auction-status__category-badge">{result.categoryName}</span>
      </div>
      <div className="auction-status__category" style={{ textAlign: 'center', padding: '1.5rem 0' }}>
        {result.isReleased ? (
          <p style={{ fontSize: '1.125rem', color: '#e63946', margin: 0 }}>
            Tied again! Category released — no owner
          </p>
        ) : result.isTied && !result.winner ? (
          <p style={{ fontSize: '1.125rem', color: '#f4a261', margin: 0 }}>
            Tied! Rebidding…
          </p>
        ) : result.winner ? (
          <>
            <p style={{ fontSize: '1rem', color: '#94a3b8', margin: '0 0 0.5rem' }}>Winner</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#2a9d8f', margin: '0 0 0.5rem' }}>
              {result.winner}
            </p>
            <p style={{ fontSize: '1.125rem', color: '#f1f5f9', margin: 0 }}>
              Bid: {formatCurrency(result.winningBid)}
            </p>
          </>
        ) : (
          <p style={{ fontSize: '1.125rem', color: '#94a3b8', margin: 0 }}>
            No bids — category released
          </p>
        )}
      </div>
      <div style={{ padding: '0.5rem 0' }}>
        <PlayerBalanceList
          players={players}
          classPrefix="auction-status"
          ariaLabel="Player balances"
        />
      </div>
    </div>
  )
}
