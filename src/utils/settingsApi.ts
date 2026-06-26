import { supabase } from './supabase';
import { validatePlayerName } from './playerProfile';

/**
 * Updates a player's name after validating and checking uniqueness.
 *
 * - Validates using the shared `validatePlayerName` rules
 * - Checks case-insensitive uniqueness excluding the current player
 * - Updates the `players` table on success
 */
export async function updatePlayerName(
  playerId: number,
  newName: string,
): Promise<{ success: boolean; error?: string }> {
  const trimmed = newName.trim();

  // Validate name format
  const validation = validatePlayerName(trimmed);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  try {
    // Check uniqueness (case-insensitive, excluding self)
    const { data: existing, error: lookupErr } = await supabase
      .from('players')
      .select('id')
      .ilike('player_name', trimmed)
      .neq('id', playerId);

    if (lookupErr) {
      return { success: false, error: `Failed to check name availability: ${lookupErr.message}` };
    }

    if (existing && existing.length > 0) {
      return { success: false, error: 'Player name is already taken' };
    }

    // Update the player record
    const { error: updateErr } = await supabase
      .from('players')
      .update({ player_name: trimmed })
      .eq('id', playerId);

    if (updateErr) {
      return { success: false, error: `Failed to update player name: ${updateErr.message}` };
    }

    return { success: true };
  } catch {
    return { success: false, error: 'Network error. Please try again.' };
  }
}

/**
 * Deletes a game record and its associated storage file.
 *
 * Per Req 6.8: if the DB delete succeeds but storage delete fails,
 * the function still returns success (no error shown to user).
 * If the DB delete fails, returns an error.
 */
export async function deleteGame(
  gameId: number,
  authUuid: string,
  gameName: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // Delete game row from database
    const { error: deleteErr } = await supabase
      .from('games')
      .delete()
      .eq('id', gameId);

    if (deleteErr) {
      return { success: false, error: 'Failed to delete game' };
    }

    // Delete storage file (best-effort — partial failure is acceptable per Req 6.8)
    const storagePath = `${authUuid}/${gameName}.json`;
    await supabase.storage.from('games').remove([storagePath]);

    return { success: true };
  } catch {
    return { success: false, error: 'Failed to delete game' };
  }
}

/**
 * Deletes a user's entire account in sequence:
 * 1. Delete all game rows
 * 2. Delete all storage files
 * 3. Delete player record
 * 4. Invoke Edge Function to delete auth account
 *
 * If any step fails, halts and returns the failed step name.
 */
export async function deleteAccount(
  authUuid: string,
  playerId: number,
): Promise<{ success: boolean; error?: string; failedStep?: string }> {
  try {
    // Step 1: Get all user's games (needed for storage file paths)
    const { data: games, error: gamesQueryErr } = await supabase
      .from('games')
      .select('id, game_name')
      .eq('created_by', playerId);

    if (gamesQueryErr) {
      return {
        success: false,
        error: 'Failed to retrieve games for deletion',
        failedStep: 'delete_games',
      };
    }

    // Step 2: Delete all game rows
    if (games && games.length > 0) {
      const { error: gamesDeleteErr } = await supabase
        .from('games')
        .delete()
        .eq('created_by', playerId);

      if (gamesDeleteErr) {
        return {
          success: false,
          error: 'Failed to delete games',
          failedStep: 'delete_games',
        };
      }
    }

    // Step 3: Delete all storage files under the user's folder
    if (games && games.length > 0) {
      const filePaths = games.map(
        (game) => `${authUuid}/${(game as { game_name: string }).game_name}.json`,
      );

      const { error: storageErr } = await supabase.storage
        .from('games')
        .remove(filePaths);

      if (storageErr) {
        return {
          success: false,
          error: 'Failed to delete storage files',
          failedStep: 'delete_storage',
        };
      }
    }

    // Step 4: Delete player record
    const { error: playerDeleteErr } = await supabase
      .from('players')
      .delete()
      .eq('id', playerId);

    if (playerDeleteErr) {
      return {
        success: false,
        error: 'Failed to delete player record',
        failedStep: 'delete_player',
      };
    }

    // Step 5: Invoke Edge Function to delete auth account
    const { error: authDeleteErr } = await supabase.functions.invoke('delete-user', {
      body: { userId: authUuid },
    });

    if (authDeleteErr) {
      return {
        success: false,
        error: 'Failed to delete authentication account',
        failedStep: 'delete_auth',
      };
    }

    return { success: true };
  } catch {
    return { success: false, error: 'Network error. Please try again.', failedStep: 'delete_games' };
  }
}
