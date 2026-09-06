import { useMemo } from 'react'
import type { GameSession, GamblingLedger, GamblingLedgerEntry } from '../../types/game'
import { computeGamblingStatsExpanded } from '../../utils/gamblingScoring'
import { formatCurrency, formatSignedChange } from '../../utils/currency'
import { LEDGER_TYPE_LABELS, formatLedgerLabel } from '../../utils/ledgerLabels'
import { CollapsiblePlayerSection } from './CollapsiblePlayerSection'
import './GamblingAnalytics.css'

interface GamblingAnalyticsProps {
  session: GameSession
}

/** A ledger entry carrying its session-wide position. */
interface SequencedLedgerEntry extends GamblingLedgerEntry {
  /** 1-based position in the session-wide ascending `order` sequence. */
  sequence: number
}

/**
 * Numbers the whole ledger once, in ascending `order`, so a per-player section
 * can still show where each of its entries sat in the session as a whole
 * (Requirement 9.2).
 */
function sequenceLedger(ledger: GamblingLedger): SequencedLedgerEntry[] {
  return [...ledger]
    .sort((a, b) => a.order - b.order)
    .map((entry, index) => ({ ...entry, sequence: index + 1 }))
}

export function GamblingAnalytics({ session }: GamblingAnalyticsProps) {
  const stats = useMemo(
    () => computeGamblingStatsExpanded(session.gamblingLedger, session.players),
    [session.gamblingLedger, session.players],
  )

  const sequencedLedger = useMemo(
    () => sequenceLedger(session.gamblingLedger),
    [session.gamblingLedger],
  )

  return (
    <div className="gambling-analytics">
      {/* Per-Player Stats Table — always visible, never inside a section (Requirement 9.10) */}
      <div className="gambling-stats">
        <table className="gambling-stats-table" aria-label="Gambling statistics per player">
          <thead>
            <tr>
              <th className="gambling-stats-th">Player</th>
              <th className="gambling-stats-th">Categories Owned</th>
              <th className="gambling-stats-th">Ownership Bonus</th>
              <th className="gambling-stats-th">Bid Spend</th>
              <th className="gambling-stats-th">Bets Placed</th>
              <th className="gambling-stats-th">Bets Won</th>
              <th className="gambling-stats-th">Bets Lost</th>
              <th className="gambling-stats-th">Net Profit</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((playerStats) => {
              const profitClass = playerStats.netGamblingProfit > 0
                ? 'gambling-stats-profit--positive'
                : playerStats.netGamblingProfit < 0
                  ? 'gambling-stats-profit--negative'
                  : 'gambling-stats-profit--zero'

              return (
                <tr key={playerStats.playerName} className="gambling-stats-row">
                  <td className="gambling-stats-td gambling-stats-player">{playerStats.playerName}</td>
                  <td className="gambling-stats-td">{playerStats.categoriesOwned}</td>
                  <td className="gambling-stats-td">{formatCurrency(playerStats.ownershipBonusEarned)}</td>
                  <td className="gambling-stats-td">{formatCurrency(playerStats.totalBidSpend)}</td>
                  <td className="gambling-stats-td">{playerStats.betsPlaced}</td>
                  <td className="gambling-stats-td">{playerStats.betsWon}</td>
                  <td className="gambling-stats-td">{playerStats.betsLost}</td>
                  <td className={`gambling-stats-td ${profitClass}`}>
                    {formatSignedChange(playerStats.netGamblingProfit)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Bet Type Breakdown — one section per player, stats-table order (Requirements 9.1, 9.8) */}
      <div className="gambling-section-group">
        <h3 className="gambling-ledger-title">Bet Type Breakdown</h3>
        <div className="gambling-section-list">
          {stats.map((playerStats) => (
            <CollapsiblePlayerSection
              key={playerStats.playerName}
              playerName={playerStats.playerName}
            >
              {playerStats.betTypeBreakdown.length === 0 ? (
                <p className="gambling-ledger-empty">No bets placed</p>
              ) : (
                <div className="gambling-stats">
                  <table
                    className="gambling-stats-table"
                    aria-label={`${playerStats.playerName} bet type breakdown`}
                  >
                    <thead>
                      <tr>
                        <th className="gambling-stats-th">Bet Type</th>
                        <th className="gambling-stats-th">Won</th>
                        <th className="gambling-stats-th">Lost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {playerStats.betTypeBreakdown.map((bt) => (
                        <tr key={bt.betType} className="gambling-stats-row">
                          <td className="gambling-stats-td">{bt.displayName}</td>
                          <td className="gambling-stats-td gambling-stats-profit--positive">{bt.won}</td>
                          <td className="gambling-stats-td gambling-stats-profit--negative">{bt.lost}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CollapsiblePlayerSection>
          ))}
        </div>
      </div>

      {/* Gambling Ledger — one section per player (Requirements 9.2, 9.9, 10.8, 10.9) */}
      <div className="gambling-section-group">
        <h3 className="gambling-ledger-title">Gambling Ledger</h3>
        <div className="gambling-section-list">
          {stats.map((playerStats) => {
            const playerEntries = sequencedLedger.filter(
              (entry) => entry.playerName === playerStats.playerName,
            )

            return (
              <CollapsiblePlayerSection
                key={playerStats.playerName}
                playerName={playerStats.playerName}
              >
                {playerEntries.length === 0 ? (
                  <p className="gambling-ledger-empty">No gambling actions recorded</p>
                ) : (
                  <div className="gambling-ledger">
                    <table
                      className="gambling-ledger-table"
                      aria-label={`${playerStats.playerName} gambling ledger`}
                    >
                      <thead>
                        <tr>
                          <th className="gambling-ledger-th">#</th>
                          <th className="gambling-ledger-th">Type</th>
                          <th className="gambling-ledger-th">Amount</th>
                          <th className="gambling-ledger-th">Detail</th>
                        </tr>
                      </thead>
                      <tbody>
                        {playerEntries.map((entry) => (
                          <tr key={entry.sequence} className="gambling-ledger-row">
                            <td className="gambling-ledger-td">{entry.sequence}</td>
                            <td className="gambling-ledger-td">
                              <span className={`gambling-ledger-type-badge gambling-ledger-type--${entry.type}`}>
                                {LEDGER_TYPE_LABELS[entry.type]}
                              </span>
                            </td>
                            <td className="gambling-ledger-td gambling-ledger-amount">
                              {formatCurrency(entry.amount)}
                            </td>
                            <td className="gambling-ledger-td">{formatLedgerLabel(entry)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CollapsiblePlayerSection>
            )
          })}
        </div>
      </div>
    </div>
  )
}
