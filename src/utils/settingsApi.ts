import { supabase } from './supabase';
import { logError, logTimed } from './logger';
import { validatePlayerName } from './playerProfile';
import { createDraft } from './draftApi';
import type { BuilderDraft } from './draftApi';
import type { NormalizedGame, RoundName } from '../types/game';

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
 * Converts a published game into a builder draft and deletes the original.
 *
 * Steps:
 * 1. Download the game JSON from Supabase Storage.
 * 2. Convert the NormalizedGame into a BuilderDraft.
 * 3. Create a new draft in the drafts table (and storage).
 * 4. Delete the original game row (CASCADE removes ratings + favorites).
 * 5. Delete the original storage file (best-effort).
 *
 * Returns the new draft ID on success so the caller can navigate to the builder.
 */
export async function editGame(
  gameId: number,
  gameName: string,
  authUuid: string,
): Promise<{ success: true; draftId: string } | { success: false; error: string }> {
  const timer = logTimed('game', 'editGame', { gameId, gameName });

  try {
    // ── 1. Download game JSON from Storage ───────────────────────────────────
    const storagePath = `${authUuid}/${gameName}.json`;

    const { data: fileBlob, error: downloadErr } = await supabase.storage
      .from('games')
      .download(storagePath);

    if (downloadErr || !fileBlob) {
      timer.done({ success: false, error: `Failed to download game file: ${downloadErr?.message ?? 'File not found'}` });
      return { success: false, error: 'Could not load game data. The file may have been moved or deleted.' };
    }

    const rawText = await fileBlob.text();
    let normalizedGame: NormalizedGame;
    try {
      normalizedGame = JSON.parse(rawText) as NormalizedGame;
    } catch {
      timer.done({ success: false, error: 'Invalid game JSON' });
      return { success: false, error: 'Game file is corrupted and cannot be edited.' };
    }

    // ── 2. Convert NormalizedGame → BuilderDraft ──────────────────────────────
    const ROUND_NAMES: RoundName[] = [
      'single', 'double', 'triple', 'quadruple', 'quintuple', 'sextuple',
    ];

    const orderedRoundNames = ROUND_NAMES.filter(
      (name) => name in normalizedGame.rounds,
    );

    const draftRounds: BuilderDraft['rounds'] = {} as BuilderDraft['rounds'];
    for (const roundName of orderedRoundNames) {
      draftRounds[roundName] = normalizedGame.rounds[roundName];
    }

    const draft: BuilderDraft = {
      gameName,
      totalRounds: normalizedGame.totalRounds,
      categoriesPerRound: orderedRoundNames.length > 0
        ? (normalizedGame.rounds[orderedRoundNames[0]]?.length ?? 1)
        : 1,
      rounds: draftRounds,
      final: normalizedGame.final,
    };

    // ── 3. Create new draft ──────────────────────────────────────────────────
    const createResult = await createDraft(draft);
    if (!createResult.success) {
      timer.done({ success: false, error: `Failed to create draft: ${createResult.error}` });
      return { success: false, error: `Could not create draft: ${createResult.error}` };
    }

    const newDraftId = createResult.id;

    // ── 4. Delete the original game row (CASCADE removes ratings + favorites) ─
    const { error: deleteErr, count } = await supabase
      .from('games')
      .delete({ count: 'exact' })
      .eq('id', gameId);

    if (deleteErr) {
      // Roll back: delete the draft we just created
      await supabase.storage.from('games').remove([`${authUuid}/drafts/${newDraftId}.json`]);
      await supabase.from('drafts').delete().eq('id', newDraftId);
      timer.done({ success: false, error: `Failed to delete original game: ${deleteErr.message}` });
      return { success: false, error: 'Failed to remove the original game. Please try again.' };
    }

    if (count === 0) {
      // RLS blocked the delete — roll back draft
      await supabase.storage.from('games').remove([`${authUuid}/drafts/${newDraftId}.json`]);
      await supabase.from('drafts').delete().eq('id', newDraftId);
      timer.done({ success: false, error: 'Permission denied when deleting original game' });
      return { success: false, error: 'Permission denied. You can only edit your own games.' };
    }

    // ── 5. Delete original storage file (best-effort) ──────────────────────
    await supabase.storage.from('games').remove([storagePath]);

    timer.done({ success: true });
    return { success: true, draftId: newDraftId };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('game', 'editGame', `Unexpected error: ${message}`, { gameId, gameName });
    timer.done({ success: false, error: message });
    return { success: false, error: 'An unexpected error occurred. Please try again.' };
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
