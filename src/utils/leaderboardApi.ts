import { supabase } from './supabase'
import type { PlayerRow } from './leaderboardUtils'

/**
 * Fetches all player rows from the Supabase `players` table.
 * Null/undefined numeric fields are defaulted to 0.
 *
 * @param options.signal - Optional AbortSignal for request cancellation
 * @returns Typed PlayerRow[] on success
 * @throws Error if the query fails
 */
export async function fetchAllPlayers(
  options?: { signal?: AbortSignal },
): Promise<PlayerRow[]> {
  const query = supabase
    .from('players')
    .select(
      'id, player_name, total_games_played, total_games_won, total_correct_answers, total_incorrect_answers, total_correct_daily_doubles, total_incorrect_daily_doubles, total_correct_final_jeopardies, total_incorrect_final_jeopardies, current_balance, total_money_earned',
    )

  if (options?.signal) {
    query.abortSignal(options.signal)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to fetch players: ${error.message}`)
  }

  if (!data) {
    return []
  }

  // Normalize null/undefined numeric fields to 0
  const players: PlayerRow[] = data.map((row) => ({
    id: row.id,
    player_name: row.player_name ?? '',
    total_games_played: row.total_games_played ?? 0,
    total_games_won: row.total_games_won ?? 0,
    total_correct_answers: row.total_correct_answers ?? 0,
    total_incorrect_answers: row.total_incorrect_answers ?? 0,
    total_correct_daily_doubles: row.total_correct_daily_doubles ?? 0,
    total_incorrect_daily_doubles: row.total_incorrect_daily_doubles ?? 0,
    total_correct_final_jeopardies: row.total_correct_final_jeopardies ?? 0,
    total_incorrect_final_jeopardies: row.total_incorrect_final_jeopardies ?? 0,
    current_balance: row.current_balance ?? 0,
    total_money_earned: row.total_money_earned ?? 0,
  }))

  return players
}
