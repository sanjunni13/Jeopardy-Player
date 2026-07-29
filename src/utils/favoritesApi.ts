import { supabase } from './supabase';
import { logInfo, logError, logWarn } from './logger';

export interface FavoriteRecord {
  id: number
  player_id: number
  game_id: string
  created_at: string
}

/** Add a game to the player's favourites */
export async function addFavorite(
  playerId: number,
  gameId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('game_favorites')
      .insert({ player_id: playerId, game_id: gameId });

    if (error) {
      // 409 / 23505 = duplicate key — treat as success (already favorited)
      if (error.code === '23505') {
        logInfo('favorite', 'addFavorite', 'Already favorited (duplicate key)', { playerId, gameId });
        return { success: true };
      }
      logError('favorite', 'addFavorite', `Failed to add favorite: ${error.message}`, { playerId, gameId });
      return { success: false, error: error.message };
    }

    logInfo('favorite', 'addFavorite', 'Favorite added', { playerId, gameId });
    return { success: true };
  } catch {
    logError('favorite', 'addFavorite', 'Network error', { playerId, gameId });
    return { success: false, error: 'Network error. Please try again.' };
  }
}

/** Remove a game from the player's favourites */
export async function removeFavorite(
  playerId: number,
  gameId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('game_favorites')
      .delete()
      .match({ player_id: playerId, game_id: gameId });

    if (error) {
      logError('favorite', 'removeFavorite', `Failed to remove favorite: ${error.message}`, { playerId, gameId });
      return { success: false, error: error.message };
    }

    logInfo('favorite', 'removeFavorite', 'Favorite removed', { playerId, gameId });
    return { success: true };
  } catch {
    logError('favorite', 'removeFavorite', 'Network error', { playerId, gameId });
    return { success: false, error: 'Network error. Please try again.' };
  }
}

/** Fetch all favorite game IDs for a player */
export async function fetchFavorites(
  playerId: number
): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('game_favorites')
      .select('game_id')
      .eq('player_id', playerId);

    if (error) {
      logWarn('favorite', 'fetchFavorites', `Error fetching favorites: ${error.message}`, { playerId, code: error.code });
      return [];
    }

    if (!data) {
      return [];
    }

    return data.map((row) => String(row.game_id));
  } catch (e) {
    logWarn('favorite', 'fetchFavorites', 'Exception fetching favorites', { playerId, error: e instanceof Error ? e.message : 'unknown' });
    return [];
  }
}
