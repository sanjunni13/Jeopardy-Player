import { supabase } from './supabase';
import { logTimed } from './logger';
import type { NormalizedGame, Player, SaveGameResponse, UpdateStatsResponse } from '../types/game';

export async function saveGame(
  gameName: string,
  gameData: NormalizedGame,
  playerId?: number,
): Promise<SaveGameResponse> {
  const timer = logTimed('game', 'saveGame', { gameName, playerId });
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      timer.done({ success: false, error: 'Not authenticated' });
      return { error: 'Not authenticated.' } as SaveGameResponse;
    }

    // Abort if player record is missing (profile setup required)
    if (playerId == null) {
      return { error: 'Please complete profile setup before saving games.' } as SaveGameResponse;
    }

    // Validate gameName
    if (!/^[\w\s\\-]{1,100}$/.test(gameName)) {
      return { error: 'Game name is invalid. It must be 1 to 100 characters and contain only letters, numbers, spaces, hyphens, or underscores.' } as SaveGameResponse;
    }

    // Duplicate check (case-insensitive, scoped to user by Player ID)
    const { data: existing, error: lookupErr } = await supabase
      .from('games')
      .select('id')
      .ilike('game_name', gameName)
      .eq('created_by', playerId)
      .maybeSingle();

    if (lookupErr) {
      return { error: `Database lookup failed: ${lookupErr.message}` } as SaveGameResponse;
    }
    if (existing) {
      return { error: 'Game already exists', alreadyExists: true } as SaveGameResponse;
    }

    // Upload to Storage using Auth UUID as folder prefix
    const storagePath = `${user.id}/${gameName}.json`;
    const { error: uploadErr } = await supabase.storage
      .from('games')
      .upload(storagePath, JSON.stringify(gameData), {
        contentType: 'application/json',
        upsert: false,
      });

    if (uploadErr) {
      return { error: `Storage upload failed: ${uploadErr.message}` } as SaveGameResponse;
    }

    // Count rounds
    const totalRounds = Object.keys(gameData.rounds).length;

    // Insert into games table with numeric Player ID
    const { data: row, error: insertErr } = await supabase
      .from('games')
      .insert({
        game_name: gameName,
        total_rounds: totalRounds,
        times_played: 0,
        winners: [],
        high_score: null,
        high_score_player: null,
        created_by: playerId,
        storage_path: storagePath,
      })
      .select('id')
      .single();

    if (insertErr || !row) {
      // Rollback: best-effort delete of uploaded file
      await supabase.storage.from('games').remove([storagePath]);
      timer.done({ success: false, error: `Database insert failed: ${insertErr?.message ?? 'Unknown error'}` });
      return { error: `Database insert failed: ${insertErr?.message ?? 'Unknown error'}` } as SaveGameResponse;
    }

    timer.done({ success: true });
    return { success: true, id: row.id } as SaveGameResponse;
  } catch {
    timer.done({ success: false, error: 'Network error' });
    return { error: 'Network error. Please try again.' } as SaveGameResponse;
  }
}

/**
 * Increment times_played by 1 without updating winners or high score.
 * Used for co-op mode where individual rankings don't apply.
 */
export async function incrementTimesPlayed(gameId: string): Promise<{ success: boolean; error?: string }> {
  const timer = logTimed('game', 'incrementTimesPlayed', { gameId });
  try {
    const { data: game, error: fetchErr } = await supabase
      .from('games')
      .select('times_played')
      .eq('id', gameId)
      .single();

    if (fetchErr || !game) {
      timer.done({ success: false, error: 'Game not found.' });
      return { success: false, error: 'Game not found.' };
    }

    const currentTimesPlayed = (game as Record<string, unknown>).times_played as number ?? 0;

    const { error: updateErr } = await supabase
      .from('games')
      .update({ times_played: currentTimesPlayed + 1 })
      .eq('id', gameId);

    if (updateErr) {
      timer.done({ success: false, error: updateErr.message });
      return { success: false, error: updateErr.message };
    }

    timer.done({ success: true });
    return { success: true };
  } catch {
    timer.done({ success: false, error: 'Network error.' });
    return { success: false, error: 'Network error.' };
  }
}

/**
 * Updates game stats and player stats via the update-game-stats Edge Function.
 * This performs all operations server-side in a single request instead of N+1 client queries.
 */
export async function updateGameStats(
  gameId: string,
  players: Player[],
  winnerNames: string[],
  authenticatedPlayer?: { playerId: number; playerName: string },
): Promise<UpdateStatsResponse> {
  const timer = logTimed('game', 'updateGameStats', { gameId, playerCount: players.length, winnerNames });
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      timer.done({ success: false, error: 'Not authenticated' });
      return { success: false, error: 'Not authenticated.' };
    }

    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-game-stats`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          gameId,
          players: players.map(p => ({
            name: p.name,
            score: p.score,
            correctCount: p.correctCount,
            incorrectCount: p.incorrectCount,
            correctDailyDoubles: p.correctDailyDoubles,
            incorrectDailyDoubles: p.incorrectDailyDoubles,
            correctFinalJeopardy: p.correctFinalJeopardy,
            incorrectFinalJeopardy: p.incorrectFinalJeopardy,
            totalEarned: p.totalEarned,
          })),
          winnerNames,
          authenticatedPlayer,
        }),
      }
    );

    const result = await res.json();

    if (result.error) {
      timer.done({ success: false, error: result.error });
      return { success: false, error: result.error };
    }

    timer.done({ success: true });
    return { success: true };
  } catch {
    timer.done({ success: false, error: 'Network error' });
    return { success: false, error: 'Network error. Please try again.' };
  }
}
