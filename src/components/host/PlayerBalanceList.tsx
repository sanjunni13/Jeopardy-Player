import type { ReactNode } from 'react'
import type { Player } from '../../types/game'
import { formatCurrency } from '../../utils/currency'
import './PlayerBalanceList.css'

export interface PlayerBalanceListProps {
  players: Player[]
  /** Accessible name for the list, when the surrounding view wants one. */
  ariaLabel?: string
  /**
   * BEM class prefix, so a host view keeps the styling it already ships.
   * Emitted classes are `${classPrefix}__player-list`, `__player-item`,
   * `__player-name`, and `__player-balance`.
   */
  classPrefix?: string
  /**
   * Right-hand cell for a player. Defaults to that player's Real_Balance
   * rendered by the shared Currency_Formatter (Requirement 5.9).
   */
  renderDetail?: (player: Player) => ReactNode
  /** Replaces the default class on the right-hand cell, per player. */
  detailClassName?: (player: Player) => string
}

/**
 * The per-player list shared by the host auction result panel and the host
 * betting status view. Extracted out of `GamePage.tsx` so the monetary display
 * lives in a bounded module the Requirement 5.13 source scan can check.
 */
export function PlayerBalanceList({
  players,
  ariaLabel,
  classPrefix = 'player-balance-list',
  renderDetail,
  detailClassName,
}: PlayerBalanceListProps) {
  return (
    <ul className={`${classPrefix}__player-list`} aria-label={ariaLabel}>
      {players.map(player => (
        <li key={player.name} className={`${classPrefix}__player-item`}>
          <span className={`${classPrefix}__player-name`}>{player.name}</span>
          <span className={detailClassName?.(player) ?? `${classPrefix}__player-balance`}>
            {renderDetail ? renderDetail(player) : formatCurrency(player.score)}
          </span>
        </li>
      ))}
    </ul>
  )
}
