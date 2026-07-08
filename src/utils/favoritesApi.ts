import { supabase } from './supabase';

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
        return { success: true };
      }
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch {
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
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch {
    return { success: false, error: 'Network error. Please try again.' };
  }
}

/** Fetch all favorite game IDs for a player */
export async function fetchFavorites(
  playerId: number
): Promise<string[]> {
  try {
    // Ensure auth session is available before querying RLS-protected table
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return [];
    }

    const { data, error } = await supabase
      .from('game_favorites')
      .select('game_id')
      .eq('player_id', playerId);

    if (error) {
      console.warn('[fetchFavorites] Error:', error.message, error.code);
      return [];
    }

    if (!data) {
      return [];
    }

    return data.map((row) => String(row.game_id));
  } catch (e) {
    console.warn('[fetchFavorites] Exception:', e);
    return [];
  }
}
