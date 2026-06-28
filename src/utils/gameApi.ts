import { supabase } from './supabase';
import type { NormalizedGame, Player, SaveGameResponse, UpdateStatsResponse } from '../types/game';

export async function saveGame(
  gameName: string,
  gameData: NormalizedGame,
  playerId?: number,
): Promise<SaveGameResponse> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
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
        created_by: playerId,
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
  authenticatedPlayer?: { playerId: number; playerName: string },
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

    // If authenticated player info is provided, verify the player record exists by ID.
    // If it doesn't exist, fall back to name-based matching for all players (Req 8.3).
    let verifiedAuthPlayer: { playerId: number; playerName: string } | undefined;
    if (authenticatedPlayer) {
      const { data: authRow, error: authLookupErr } = await supabase
        .from('players')
        .select('id')
        .eq('id', authenticatedPlayer.playerId)
        .maybeSingle();

      if (!authLookupErr && authRow) {
        verifiedAuthPlayer = authenticatedPlayer;
      }
      // If lookup fails or no row found, verifiedAuthPlayer stays undefined → name-based fallback for all
    }

    // Update players table for each matching player
    const errors: string[] = [];

    for (const player of players) {
      if (!player.name) continue;

      // Check if this player is the authenticated user (Req 8.1)
      const isAuthenticatedPlayer = verifiedAuthPlayer &&
        player.name.toLowerCase() === verifiedAuthPlayer.playerName.toLowerCase();

      if (isAuthenticatedPlayer) {
        // Use Player_ID directly for the authenticated user
        const { data: userRow, error: lookupErr } = await supabase
          .from('players')
          .select('id, total_games_played, total_games_won, total_correct_answers, total_incorrect_answers, total_money_earned, total_correct_daily_doubles, total_incorrect_daily_doubles, total_correct_final_jeopardies, total_incorrect_final_jeopardies, current_balance')
          .eq('id', verifiedAuthPlayer!.playerId)
          .single();

        if (lookupErr || !userRow) {
          errors.push(`Lookup error for authenticated player '${player.name}': ${lookupErr?.message ?? 'not found'}`);
          continue;
        }

        const row = userRow as Record<string, unknown>;
        const isWinner = winnerNames.includes(player.name);

        const { error: updateErr } = await supabase
          .from('players')
          .update({
            total_games_played: (row.total_games_played as number ?? 0) + 1,
            total_games_won: (row.total_games_won as number ?? 0) + (isWinner ? 1 : 0),
            total_correct_answers: (row.total_correct_answers as number ?? 0) + (player.correctCount ?? 0),
            total_incorrect_answers: (row.total_incorrect_answers as number ?? 0) + (player.incorrectCount ?? 0),
            total_correct_daily_doubles: (row.total_correct_daily_doubles as number ?? 0) + (player.correctDailyDoubles ?? 0),
            total_incorrect_daily_doubles: (row.total_incorrect_daily_doubles as number ?? 0) + (player.incorrectDailyDoubles ?? 0),
            total_correct_final_jeopardies: (row.total_correct_final_jeopardies as number ?? 0) + (player.correctFinalJeopardy ?? 0),
            total_incorrect_final_jeopardies: (row.total_incorrect_final_jeopardies as number ?? 0) + (player.incorrectFinalJeopardy ?? 0),
            current_balance: (row.current_balance as number ?? 0) + player.score,
            total_money_earned: (row.total_money_earned as number ?? 0) + (player.totalEarned ?? 0),
          })
          .eq('id', verifiedAuthPlayer!.playerId);

        if (updateErr) {
          errors.push(`Update failed for '${player.name}': ${updateErr.message}`);
        }
      } else {
        // Non-authenticated player: use case-insensitive name matching (Req 8.2)
        const { data: userRow, error: lookupErr } = await supabase
          .from('players')
          .select('id, total_games_played, total_games_won, total_correct_answers, total_incorrect_answers, total_money_earned, total_correct_daily_doubles, total_incorrect_daily_doubles, total_correct_final_jeopardies, total_incorrect_final_jeopardies, current_balance')
          .ilike('player_name', player.name)
          .maybeSingle();

        if (lookupErr) {
          errors.push(`Lookup error for '${player.name}': ${lookupErr.message}`);
          continue;
        }

        if (!userRow) {
          // Player doesn't exist — insert a new row
          const isWinner = winnerNames.includes(player.name);

          const { error: insertErr } = await supabase
            .from('players')
            .insert({
              player_name: player.name,
              total_games_played: 1,
              total_games_won: isWinner ? 1 : 0,
              total_correct_answers: player.correctCount ?? 0,
              total_incorrect_answers: player.incorrectCount ?? 0,
              total_correct_daily_doubles: player.correctDailyDoubles ?? 0,
              total_incorrect_daily_doubles: player.incorrectDailyDoubles ?? 0,
              total_correct_final_jeopardies: player.correctFinalJeopardy ?? 0,
              total_incorrect_final_jeopardies: player.incorrectFinalJeopardy ?? 0,
              current_balance: player.score,
              total_money_earned: player.totalEarned ?? 0,
            });

          if (insertErr) {
            errors.push(`Insert failed for '${player.name}': ${insertErr.message}`);
          }
          continue;
        }

        const row = userRow as Record<string, unknown>;
        const isWinner = winnerNames.includes(player.name);

        const { error: updateErr } = await supabase
          .from('players')
          .update({
            total_games_played: (row.total_games_played as number ?? 0) + 1,
            total_games_won: (row.total_games_won as number ?? 0) + (isWinner ? 1 : 0),
            total_correct_answers: (row.total_correct_answers as number ?? 0) + (player.correctCount ?? 0),
            total_incorrect_answers: (row.total_incorrect_answers as number ?? 0) + (player.incorrectCount ?? 0),
            total_correct_daily_doubles: (row.total_correct_daily_doubles as number ?? 0) + (player.correctDailyDoubles ?? 0),
            total_incorrect_daily_doubles: (row.total_incorrect_daily_doubles as number ?? 0) + (player.incorrectDailyDoubles ?? 0),
            total_correct_final_jeopardies: (row.total_correct_final_jeopardies as number ?? 0) + (player.correctFinalJeopardy ?? 0),
            total_incorrect_final_jeopardies: (row.total_incorrect_final_jeopardies as number ?? 0) + (player.incorrectFinalJeopardy ?? 0),
            current_balance: (row.current_balance as number ?? 0) + player.score,
            total_money_earned: (row.total_money_earned as number ?? 0) + (player.totalEarned ?? 0),
          })
          .eq('id', row.id);

        if (updateErr) {
          errors.push(`Update failed for '${player.name}': ${updateErr.message}`);
        }
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
