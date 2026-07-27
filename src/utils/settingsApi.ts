import { supabase } from './supabase';
import { logError, logTimed } from './logger';
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
  const timer = logTimed('settings', 'updatePlayerName', { playerId });

  // Validate name format
  const validation = validatePlayerName(trimmed);
  if (!validation.valid) {
    timer.done({ success: false, error: validation.error });
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
      timer.done({ success: false, error: lookupErr.message });
      return { success: false, error: `Failed to check name availability: ${lookupErr.message}` };
    }

    if (existing && existing.length > 0) {
      timer.done({ success: false, error: 'Player name is already taken' });
      return { success: false, error: 'Player name is already taken' };
    }

    // Update the player record
    const { error: updateErr } = await supabase
      .from('players')
      .update({ player_name: trimmed })
      .eq('id', playerId);

    if (updateErr) {
      timer.done({ success: false, error: updateErr.message });
      return { success: false, error: `Failed to update player name: ${updateErr.message}` };
    }

    timer.done({ success: true });
    return { success: true };
  } catch {
    timer.done({ success: false, error: 'Network error' });
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
  const timer = logTimed('game', 'deleteGame', { gameId, gameName });
  try {
    // Delete game row from database
    const { error: deleteErr, count } = await supabase
      .from('games')
      .delete({ count: 'exact' })
      .eq('id', gameId);

    if (deleteErr) {
      timer.done({ success: false, error: 'Failed to delete game' });
      return { success: false, error: 'Failed to delete game' };
    }

    // If count is 0, the row wasn't actually deleted (likely RLS blocking)
    if (count === 0) {
      timer.done({ success: false, error: 'Permission denied' });
      return { success: false, error: 'Failed to delete game — permission denied' };
    }

    // Delete storage file (best-effort — partial failure is acceptable per Req 6.8)
    const storagePath = `${authUuid}/${gameName}.json`;
    await supabase.storage.from('games').remove([storagePath]);

    timer.done({ success: true });
    return { success: true };
  } catch {
    timer.done({ success: false, error: 'Failed to delete game' });
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
  const timer = logTimed('settings', 'deleteAccount', { playerId });
  try {
    const { data: fnData, error: invokeErr } = await supabase.functions.invoke('delete-user', {
      body: { userId: authUuid, playerId },
    });

    if (invokeErr) {
      logError('settings', 'deleteAccount', 'Edge Function invoke error', { error: invokeErr.message });
      timer.done({ success: false, error: 'Failed to delete account' });
      return {
        success: false,
        error: 'Failed to delete account',
        failedStep: 'delete_auth',
      };
    }

    // Check if the response indicates failure
    if (fnData && typeof fnData === 'object' && 'error' in fnData) {
      const response = fnData as { error: string; failedStep?: string };
      timer.done({ success: false, error: response.error });
      return {
        success: false,
        error: response.error,
        failedStep: response.failedStep || 'delete_auth',
      };
    }

    timer.done({ success: true });
    return { success: true };
  } catch {
    timer.done({ success: false, error: 'Network error' });
    return { success: false, error: 'Network error. Please try again.', failedStep: 'delete_auth' };
  }
}
