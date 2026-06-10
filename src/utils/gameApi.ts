import { supabase } from './supabase';
import type { NormalizedGame, Player, SaveGameResponse, UpdateStatsResponse } from '../types/game';

export async function saveGame(
  gameName: string,
  gameData: NormalizedGame,
): Promise<SaveGameResponse> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { error: 'Not authenticated.' } as SaveGameResponse;
    }

    // Validate gameName
    if (!/^[\w\s\\-]{1,100}$/.test(gameName)) {
      return { error: 'Game name is invalid. It must be 1 to 100 characters and contain only letters, numbers, spaces, hyphens, or underscores.' } as SaveGameResponse;
    }

    // Duplicate check (case-insensitive, scoped to user by email)
    const userEmail = user.email ?? ''
    const { data: existing, error: lookupErr } = await supabase
      .from('games')
      .select('id')
      .ilike('game_name', gameName)
      .eq('created_by', userEmail)
      .maybeSingle();

    if (lookupErr) {
      return { error: `Database lookup failed: ${lookupErr.message}` } as SaveGameResponse;
    }
    if (existing) {
      return { error: 'Game already exists', alreadyExists: true } as SaveGameResponse;
    }

    // Upload to Storage
    const storagePath = `${user.id}/${gameName}.json`;
    const { data: uploadData, error: uploadErr } = await supabase.storage
      .from('games')
      .upload(storagePath, JSON.stringify(gameData), {
        contentType: 'application/json',
        upsert: false,
      });

    if (uploadErr) {
      return { error: `Storage upload failed: ${uploadErr.message}` } as SaveGameResponse;
    }

    console.log('Storage upload successful:', storagePath, uploadData);

    // Count rounds
    const totalRounds = Object.keys(gameData.rounds).length;

    // Insert into games table
    const { data: row, error: insertErr } = await supabase
      .from('games')
      .insert({
        game_name: gameName,
        total_rounds: totalRounds,
        times_played: 0,
        winners: [],
        created_by: userEmail,
      })
      .select('id')
      .single();

    if (insertErr || !row) {
      // Rollback: best-effort delete of uploaded file
      await supabase.storage.from('games').remove([storagePath]);
      return { error: `Database insert failed: ${insertErr?.message ?? 'Unknown error'}` } as SaveGameResponse;
    }

    return { success: true, id: row.id } as SaveGameResponse;
  } catch {
    return { error: 'Network error. Please try again.' } as SaveGameResponse;
  }
}

export async function updateGameStats(
  gameId: string,
  players: Player[],
  winnerNames: string[],
): Promise<UpdateStatsResponse> {
  try {
    // Get auth user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated.' };
    }

    // Fetch the game row
    const { data: game, error: fetchErr } = await supabase
      .from('games')
      .select('times_played, winners')
      .eq('id', gameId)
      .single();

    if (fetchErr || !game) {
      return { success: false, error: 'Game not found.' };
    }

    // Update games table: increment times_played, append winnerNames to winners array
    const currentTimesPlayed = (game as Record<string, unknown>).times_played as number ?? 0;
    const currentWinners = (game as Record<string, unknown>).winners as string[] ?? [];

    const { error: gameUpdateErr } = await supabase
      .from('games')
      .update({
        times_played: currentTimesPlayed + 1,
        winners: [...currentWinners, ...winnerNames],
      })
      .eq('id', gameId);

    if (gameUpdateErr) {
      return { success: false, error: `Games table update failed: ${gameUpdateErr.message}` };
    }

    // Update players table for each matching player
    const errors: string[] = [];

    for (const player of players) {
      if (!player.name) continue;

      const { data: userRow, error: lookupErr } = await supabase
        .from('players')
        .select('id, total_games_played, total_games_won, total_correct_answers, total_incorrect_answers, total_money_earned')
        .ilike('player_name', player.name)
        .maybeSingle();

      if (lookupErr) {
        errors.push(`Lookup error for '${player.name}': ${lookupErr.message}`);
        continue;
      }

      if (!userRow) {
        // Not a registered user — skip silently
        continue;
      }

      const row = userRow as Record<string, unknown>;
      const moneyDelta = typeof player.score === 'number' && player.score > 0
        ? player.score
        : 0;

      const isWinner = winnerNames.includes(player.name);

      const { error: updateErr } = await supabase
        .from('players')
        .update({
          total_games_played: (row.total_games_played as number ?? 0) + 1,
          total_games_won: (row.total_games_won as number ?? 0) + (isWinner ? 1 : 0),
          total_correct_answers: (row.total_correct_answers as number ?? 0) + (player.correctCount ?? 0),
          total_incorrect_answers: (row.total_incorrect_answers as number ?? 0) + (player.incorrectCount ?? 0),
          total_money_earned: (row.total_money_earned as number ?? 0) + moneyDelta,
        })
        .eq('id', row.id);

      if (updateErr) {
        errors.push(`Update failed for '${player.name}': ${updateErr.message}`);
      }
    }

    if (errors.length > 0) {
      return { success: false, error: errors.join('; ') };
    }

    return { success: true };
  } catch {
    return { success: false, error: 'Network error. Please try again.' };
  }
}
