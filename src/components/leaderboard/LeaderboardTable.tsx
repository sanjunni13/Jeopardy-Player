import { useState, useMemo } from 'react'
import type { PlayerRow, SortableColumn } from '../../utils/leaderboardUtils'
import { computeRate, formatCurrency, sortPlayers } from '../../utils/leaderboardUtils'
import { SortableColumnHeader } from './SortableColumnHeader'
import { PagedTableBody, PagedTableRow, PagedTablePager } from '../ui/framer-motion-animations'
import './LeaderboardTable.css'

interface SortState {
  column: SortableColumn
  direction: 'asc' | 'desc'
}

interface LeaderboardTableProps {
  players: PlayerRow[]
}

const PAGE_SIZE = 10

export function LeaderboardTable({ players }: LeaderboardTableProps) {
  const [sortState, setSortState] = useState<SortState>({
    column: 'total_money_earned',
    direction: 'desc',
  })
  const [page, setPage] = useState(0)

  function handleSort(column: SortableColumn) {
    setSortState((prev) => {
      if (prev.column === column) {
        return { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
      }
      const direction = column === 'player_name' ? 'asc' : 'desc'
      return { column, direction }
    })
    setPage(0) // Reset to first page on sort change
  }

  const sortedPlayers = sortPlayers(players, sortState.column, sortState.direction)

  const totalPages = Math.max(1, Math.ceil(sortedPlayers.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)

  const pagedPlayers = useMemo(() => {
    const start = safePage * PAGE_SIZE
    return sortedPlayers.slice(start, start + PAGE_SIZE)
  }, [sortedPlayers, safePage])

  const pageKey = `${safePage}-${sortState.column}-${sortState.direction}`

  return (
    <div className="leaderboard-table-container">
      <table className="leaderboard-table">
        <thead>
          <tr>
            <SortableColumnHeader
              label="Player Name"
              column="player_name"
              activeColumn={sortState.column}
              direction={sortState.direction}
              onSort={handleSort}
            />
            <SortableColumnHeader
              label="Record"
              column="win_rate"
              activeColumn={sortState.column}
              direction={sortState.direction}
              onSort={handleSort}
            />
            <SortableColumnHeader
              label="Games Played"
              column="total_games_played"
              activeColumn={sortState.column}
              direction={sortState.direction}
              onSort={handleSort}
            />
            <SortableColumnHeader
              label="Accuracy"
              column="accuracy_rate"
              activeColumn={sortState.column}
              direction={sortState.direction}
              onSort={handleSort}
            />
            <SortableColumnHeader
              label="FJ Accuracy"
              column="fj_accuracy_rate"
              activeColumn={sortState.column}
              direction={sortState.direction}
              onSort={handleSort}
            />
            <SortableColumnHeader
              label="Total Money Earned"
              column="total_money_earned"
              activeColumn={sortState.column}
              direction={sortState.direction}
              onSort={handleSort}
            />
            <SortableColumnHeader
              label="Current Balance"
              column="current_balance"
              activeColumn={sortState.column}
              direction={sortState.direction}
              onSort={handleSort}
            />
          </tr>
        </thead>
        <PagedTableBody pageKey={pageKey}>
          {pagedPlayers.map((player, index) => {
            const winRate = computeRate(player.total_games_won, player.total_games_played)
            const accuracyRate = computeRate(
              player.total_correct_answers,
              player.total_correct_answers + player.total_incorrect_answers,
            )
            const fjAccuracyRate = computeRate(
              player.total_correct_final_jeopardies,
              player.total_correct_final_jeopardies + player.total_incorrect_final_jeopardies,
            )

            return (
              <PagedTableRow key={player.id} index={index}>
                <td>{player.player_name}</td>
                <td>
                  {player.total_games_won}/{player.total_games_played} ({winRate}%)
                </td>
                <td>{player.total_games_played}</td>
                <td>
                  {player.total_correct_answers}/{player.total_correct_answers + player.total_incorrect_answers} ({accuracyRate}%)
                </td>
                <td>
                  {player.total_correct_final_jeopardies}/{player.total_correct_final_jeopardies + player.total_incorrect_final_jeopardies} ({fjAccuracyRate}%)
                </td>
                <td className="col-money">{formatCurrency(player.total_money_earned)}</td>
                <td className="col-balance">{formatCurrency(player.current_balance)}</td>
              </PagedTableRow>
            )
          })}
        </PagedTableBody>
      </table>
      {totalPages > 1 && (
        <PagedTablePager
          currentPage={safePage}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      )}
    </div>
  )
}
