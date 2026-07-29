import { supabase } from './supabase'
import { logTimed } from './logger'
import type { PlayerRow } from './leaderboardUtils'

// ─── Constants ────────────────────────────────────────────────────────────────

export const LEADERBOARD_PAGE_SIZE = 50

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LeaderboardPage {
  players: PlayerRow[]
  totalCount: number
  hasMore: boolean
}

/**
 * Fetches a paginated set of player rows from the Supabase `players` table.
 * Results are ordered by total_money_earned descending by default.
 * Null/undefined numeric fields are defaulted to 0.
 *
 * @param options.page - Zero-based page number (default 0)
 * @param options.pageSize - Number of rows per page (default LEADERBOARD_PAGE_SIZE)
 * @param options.signal - Optional AbortSignal for request cancellation
 * @returns Paginated result with players, totalCount, and hasMore flag
 * @throws Error if the query fails
 */
export async function fetchLeaderboardPage(
  options?: { page?: number; pageSize?: number; signal?: AbortSignal },
): Promise<LeaderboardPage> {
  const page = options?.page ?? 0
  const pageSize = options?.pageSize ?? LEADERBOARD_PAGE_SIZE
  const from = page * pageSize
  const to = from + pageSize - 1

  const timer = logTimed('leaderboard', 'fetchLeaderboardPage', { page, pageSize });

  const query = supabase
    .from('players')
    .select(
      'id, player_name, total_games_played, total_games_won, total_correct_answers, total_incorrect_answers, total_correct_daily_doubles, total_incorrect_daily_doubles, total_correct_final_jeopardies, total_incorrect_final_jeopardies, current_balance, total_money_earned',
      { count: 'exact' }
    )
    .order('total_money_earned', { ascending: false })
    .range(from, to)

  if (options?.signal) {
    query.abortSignal(options.signal)
  }

  const { data, error, count } = await query

  if (error) {
    timer.done({ success: false, error: error.message });
    throw new Error(`Failed to fetch players: ${error.message}`)
  }

  if (!data) {
    timer.done({ success: true });
    return { players: [], totalCount: 0, hasMore: false }
  }

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

  const totalCount = count ?? 0
  const hasMore = from + players.length < totalCount

  timer.done({ success: true });
  return { players, totalCount, hasMore }
}

/**
 * Fetches all player rows from the Supabase `players` table.
 * Null/undefined numeric fields are defaulted to 0.
 *
 * @deprecated Use fetchLeaderboardPage() for paginated access.
 * @param options.signal - Optional AbortSignal for request cancellation
 * @returns Typed PlayerRow[] on success
 * @throws Error if the query fails
 */
export async function fetchAllPlayers(
  options?: { signal?: AbortSignal },
): Promise<PlayerRow[]> {
  const timer = logTimed('leaderboard', 'fetchAllPlayers');
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
    timer.done({ success: false, error: error.message });
    throw new Error(`Failed to fetch players: ${error.message}`)
  }

  if (!data) {
    timer.done({ success: true });
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

  timer.done({ success: true });
  return players
}
