import { supabase } from './supabase';
import { logTimed } from './logger';

export interface RatingRecord {
  id: number
  player_id: number
  game_id: string
  rating: number       // 1-5
  created_at: string
}

export interface GameRatingSummary {
  gameId: string
  averageRating: number | null  // null if no ratings
  ratingCount: number
}

/**
 * Upsert a rating for the current player on a game.
 * If a rating already exists for the (player_id, game_id) pair, it is updated.
 */
export async function upsertRating(
  playerId: number,
  gameId: string,
  rating: number
): Promise<{ success: boolean; error?: string }> {
  // Client-side validation: reject values outside 1–5
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { success: false, error: 'Rating must be an integer between 1 and 5.' };
  }

  const timer = logTimed('rating', 'upsertRating', { playerId, gameId, rating });

  try {
    const { error } = await supabase
      .from('game_ratings')
      .upsert(
        {
          player_id: playerId,
          game_id: gameId,
          rating,
        },
        { onConflict: 'player_id,game_id' }
      );

    if (error) {
      timer.done({ success: false, error: error.message });
      return { success: false, error: `Failed to save rating: ${error.message}` };
    }

    timer.done({ success: true });
    return { success: true };
  } catch {
    timer.done({ success: false, error: 'Network error' });
    return { success: false, error: 'Network error. Please try again.' };
  }
}

/**
 * Fetch the current player's rating for a specific game.
 * Returns the rating value (1-5) or null if no rating exists.
 */
export async function fetchMyRating(
  playerId: number,
  gameId: string
): Promise<number | null> {
  try {
    const { data, error } = await supabase
      .from('game_ratings')
      .select('rating')
      .eq('player_id', playerId)
      .eq('game_id', gameId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return data.rating as number;
  } catch {
    return null;
  }
}

/**
 * Fetch average ratings and counts for a list of game IDs.
 * Uses a server-side RPC for aggregation when available, falling back to
 * a select with client-side grouping for compatibility.
 *
 * Returns a GameRatingSummary for each requested game ID.
 * Games with no ratings will have averageRating: null and ratingCount: 0.
 */
export async function fetchGameRatings(
  gameIds: string[]
): Promise<GameRatingSummary[]> {
  if (gameIds.length === 0) {
    return [];
  }

  const emptySummaries = () => gameIds.map((id) => ({ gameId: id, averageRating: null as number | null, ratingCount: 0 }));

  try {
    // Try using the aggregated RPC (returns {game_id, avg_rating, rating_count}[])
    try {
      if (typeof supabase.rpc === 'function') {
        const { data: rpcData, error: rpcError } = await supabase
          .rpc('get_game_rating_summaries', { game_ids: gameIds.map(id => Number(id)) });

        if (!rpcError && rpcData) {
          const rpcMap = new Map<string, { avg: number; count: number }>();
          for (const row of rpcData as Array<{ game_id: string; avg_rating: number; rating_count: number }>) {
            rpcMap.set(String(row.game_id), {
              avg: Math.round(row.avg_rating * 10) / 10,
              count: row.rating_count,
            });
          }

          return gameIds.map((id) => {
            const entry = rpcMap.get(id);
            if (!entry) return { gameId: id, averageRating: null, ratingCount: 0 };
            return { gameId: id, averageRating: entry.avg, ratingCount: entry.count };
          });
        }
      }
    } catch {
      // RPC not available — fall through to legacy query
    }

    // Fallback: fetch only game_id and rating for requested IDs, group client-side
    const { data, error } = await supabase
      .from('game_ratings')
      .select('game_id, rating')
      .in('game_id', gameIds);

    if (error || !data) {
      return emptySummaries();
    }

    const ratingsMap = new Map<string, number[]>();
    for (const row of data) {
      const gid = String(row.game_id);
      const existing = ratingsMap.get(gid);
      if (existing) {
        existing.push(row.rating as number);
      } else {
        ratingsMap.set(gid, [row.rating as number]);
      }
    }

    return gameIds.map((id) => {
      const ratings = ratingsMap.get(id);
      if (!ratings || ratings.length === 0) {
        return { gameId: id, averageRating: null, ratingCount: 0 };
      }

      const sum = ratings.reduce((acc, val) => acc + val, 0);
      const average = Math.round((sum / ratings.length) * 10) / 10;

      return { gameId: id, averageRating: average, ratingCount: ratings.length };
    });
  } catch {
    return emptySummaries();
  }
}
