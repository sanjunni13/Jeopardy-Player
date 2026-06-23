export interface PlayerRow {
  id: string
  player_name: string
  total_games_played: number
  total_games_won: number
  total_correct_answers: number
  total_incorrect_answers: number
  total_correct_daily_doubles: number
  total_incorrect_daily_doubles: number
  total_correct_final_jeopardies: number
  total_incorrect_final_jeopardies: number
  current_balance: number
  total_money_earned: number
}

export type SortableColumn =
  | 'player_name'
  | 'win_rate'
  | 'total_games_played'
  | 'accuracy_rate'
  | 'fj_accuracy_rate'
  | 'total_money_earned'
  | 'current_balance'

export interface SortState {
  column: SortableColumn
  direction: 'asc' | 'desc'
}

/**
 * Returns percentage (0–100) rounded to nearest whole number.
 * Returns 0 when denominator is 0.
 */
export function computeRate(numerator: number, denominator: number): number {
  if (denominator === 0) return 0
  return Math.round((numerator / denominator) * 100)
}

/**
 * Formats an integer as US dollar currency with no decimals.
 * Negative values display as `-$X,XXX`.
 */
export function formatCurrency(value: number): string {
  if (value < 0) {
    return `-$${Math.abs(value).toLocaleString('en-US')}`
  }
  return `$${value.toLocaleString('en-US')}`
}

/**
 * Returns the raw or derived sort value for a given column.
 */
export function getSortValue(
  player: PlayerRow,
  column: SortableColumn,
): string | number {
  switch (column) {
    case 'player_name':
      return player.player_name
    case 'total_games_played':
      return player.total_games_played
    case 'total_money_earned':
      return player.total_money_earned
    case 'current_balance':
      return player.current_balance
    case 'win_rate':
      return computeRate(player.total_games_won, player.total_games_played)
    case 'accuracy_rate':
      return computeRate(
        player.total_correct_answers,
        player.total_correct_answers + player.total_incorrect_answers,
      )
    case 'fj_accuracy_rate':
      return computeRate(
        player.total_correct_final_jeopardies,
        player.total_correct_final_jeopardies +
          player.total_incorrect_final_jeopardies,
      )
  }
}

/**
 * Returns a new sorted array of players.
 * Derived columns (win_rate, accuracy_rate, fj_accuracy_rate) are computed inline.
 * Ties are broken by player_name ascending (A–Z).
 */
export function sortPlayers(
  players: PlayerRow[],
  column: SortableColumn,
  direction: 'asc' | 'desc',
): PlayerRow[] {
  const sorted = [...players].sort((a, b) => {
    const aVal = getSortValue(a, column)
    const bVal = getSortValue(b, column)

    let cmp: number
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      cmp = aVal.localeCompare(bVal)
    } else {
      cmp = (aVal as number) - (bVal as number)
    }

    if (cmp !== 0) {
      return direction === 'asc' ? cmp : -cmp
    }

    // Ties are always broken by player_name ascending (A–Z)
    return a.player_name.localeCompare(b.player_name)
  })
  return sorted
}
