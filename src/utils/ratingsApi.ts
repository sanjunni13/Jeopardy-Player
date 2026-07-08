import { supabase } from './supabase';

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
      return { success: false, error: `Failed to save rating: ${error.message}` };
    }

    return { success: true };
  } catch {
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
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

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
 * Returns a GameRatingSummary for each requested game ID.
 * Games with no ratings will have averageRating: null and ratingCount: 0.
 */
export async function fetchGameRatings(
  gameIds: string[]
): Promise<GameRatingSummary[]> {
  if (gameIds.length === 0) {
    return [];
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return gameIds.map((id) => ({ gameId: id, averageRating: null, ratingCount: 0 }));
    }

    const { data, error } = await supabase
      .from('game_ratings')
      .select('game_id, rating')
      .in('game_id', gameIds);

    if (error || !data) {
      // Return empty summaries for all requested IDs on failure
      return gameIds.map((id) => ({
        gameId: id,
        averageRating: null,
        ratingCount: 0,
      }));
    }

    // Group ratings by game_id and compute averages
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

      return {
        gameId: id,
        averageRating: average,
        ratingCount: ratings.length,
      };
    });
  } catch {
    // On network failure, return empty summaries
    return gameIds.map((id) => ({
      gameId: id,
      averageRating: null,
      ratingCount: 0,
    }));
  }
}
