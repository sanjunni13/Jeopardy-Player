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
    const { error: deleteErr, count } = await supabase
      .from('games')
      .delete({ count: 'exact' })
      .eq('id', gameId);

    if (deleteErr) {
      return { success: false, error: 'Failed to delete game' };
    }

    // If count is 0, the row wasn't actually deleted (likely RLS blocking)
    if (count === 0) {
      return { success: false, error: 'Failed to delete game — permission denied' };
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
 * Deletes a user's entire account by invoking the delete-user Edge Function.
 * The Edge Function handles all deletion steps server-side with service role
 * (bypasses RLS) to avoid foreign key constraint issues:
 * 1. Delete game rows
 * 2. Delete storage files
 * 3. Delete player record
 * 4. Delete auth account
 */
export async function deleteAccount(
  authUuid: string,
  playerId: number,
): Promise<{ success: boolean; error?: string; failedStep?: string }> {
  try {
    const { data: fnData, error: invokeErr } = await supabase.functions.invoke('delete-user', {
      body: { userId: authUuid, playerId },
    });

    if (invokeErr) {
      console.error('delete-user invoke error:', invokeErr);
      return {
        success: false,
        error: 'Failed to delete account',
        failedStep: 'delete_auth',
      };
    }

    // Check if the response indicates failure
    if (fnData && typeof fnData === 'object' && 'error' in fnData) {
      const response = fnData as { error: string; failedStep?: string };
      return {
        success: false,
        error: response.error,
        failedStep: response.failedStep || 'delete_auth',
      };
    }

    return { success: true };
  } catch {
    return { success: false, error: 'Network error. Please try again.', failedStep: 'delete_auth' };
  }
}
