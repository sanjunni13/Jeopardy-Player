import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PlayerStats {
  name: string
  score: number
  correctCount: number
  incorrectCount: number
  correctDailyDoubles: number
  incorrectDailyDoubles: number
  correctFinalJeopardy: number
  incorrectFinalJeopardy: number
  totalEarned: number
}

interface RequestBody {
  gameId: string
  players: PlayerStats[]
  winnerNames: string[]
  authenticatedPlayer?: { playerId: number; playerName: string }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }
    const token = authHeader.replace('Bearer ', '')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify JWT
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const { gameId, players, winnerNames, authenticatedPlayer }: RequestBody = await req.json()

    if (!gameId || !players || !winnerNames) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // ─── Step 1: Update the games table ───────────────────────────────────────
    const { data: game, error: fetchErr } = await supabase
      .from('games')
      .select('times_played, winners, high_score, high_score_player')
      .eq('id', gameId)
      .single()

    if (fetchErr || !game) {
      return new Response(JSON.stringify({ error: 'Game not found' }), {
        status: 404,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    let newHighScore = game.high_score as number | null
    let newHighScorePlayer = game.high_score_player as string | null

    for (const player of players) {
      if (player.score > (newHighScore ?? -Infinity)) {
        newHighScore = player.score
        newHighScorePlayer = player.name
      }
    }

    const { error: gameUpdateErr } = await supabase
      .from('games')
      .update({
        times_played: (game.times_played ?? 0) + 1,
        winners: [...(game.winners ?? []), ...winnerNames],
        high_score: newHighScore,
        high_score_player: newHighScorePlayer,
      })
      .eq('id', gameId)

    if (gameUpdateErr) {
      return new Response(JSON.stringify({ error: `Games update failed: ${gameUpdateErr.message}` }), {
        status: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // ─── Step 2: Verify authenticated player if provided ──────────────────────
    let verifiedAuthPlayer: { playerId: number; playerName: string } | undefined
    if (authenticatedPlayer) {
      const { data: authRow } = await supabase
        .from('players')
        .select('id')
        .eq('id', authenticatedPlayer.playerId)
        .maybeSingle()

      if (authRow) {
        verifiedAuthPlayer = authenticatedPlayer
      }
    }

    // ─── Step 3: Batch update all players ─────────────────────────────────────
    const errors: string[] = []

    // Fetch all player rows in ONE query (batch lookup by name)
    const playerNames = players.filter(p => p.name).map(p => p.name)
    const { data: existingRows, error: batchLookupErr } = await supabase
      .from('players')
      .select('id, player_name, total_games_played, total_games_won, total_correct_answers, total_incorrect_answers, total_correct_daily_doubles, total_incorrect_daily_doubles, total_correct_final_jeopardies, total_incorrect_final_jeopardies, current_balance, total_money_earned')
      .or(playerNames.map(n => `player_name.ilike.${n}`).join(','))

    if (batchLookupErr) {
      errors.push(`Batch lookup failed: ${batchLookupErr.message}`)
    }

    // Build a lookup map (lowercase name → row)
    const playerMap = new Map<string, Record<string, unknown>>()
    if (existingRows) {
      for (const row of existingRows) {
        playerMap.set((row.player_name as string).toLowerCase(), row as Record<string, unknown>)
      }
    }

    // Also handle authenticated player by ID (may differ from name match)
    if (verifiedAuthPlayer) {
      const { data: authRow } = await supabase
        .from('players')
        .select('id, player_name, total_games_played, total_games_won, total_correct_answers, total_incorrect_answers, total_correct_daily_doubles, total_incorrect_daily_doubles, total_correct_final_jeopardies, total_incorrect_final_jeopardies, current_balance, total_money_earned')
        .eq('id', verifiedAuthPlayer.playerId)
        .single()

      if (authRow) {
        // Override the map entry for the auth player to use ID-based row
        playerMap.set(verifiedAuthPlayer.playerName.toLowerCase(), authRow as Record<string, unknown>)
      }
    }

    // Process each player: update existing or insert new
    const updates: Array<{ id: unknown; data: Record<string, unknown> }> = []
    const inserts: Array<Record<string, unknown>> = []

    for (const player of players) {
      if (!player.name) continue

      const isWinner = winnerNames.includes(player.name)
      const existingRow = playerMap.get(player.name.toLowerCase())

      if (existingRow) {
        updates.push({
          id: existingRow.id,
          data: {
            total_games_played: (existingRow.total_games_played as number ?? 0) + 1,
            total_games_won: (existingRow.total_games_won as number ?? 0) + (isWinner ? 1 : 0),
            total_correct_answers: (existingRow.total_correct_answers as number ?? 0) + (player.correctCount ?? 0),
            total_incorrect_answers: (existingRow.total_incorrect_answers as number ?? 0) + (player.incorrectCount ?? 0),
            total_correct_daily_doubles: (existingRow.total_correct_daily_doubles as number ?? 0) + (player.correctDailyDoubles ?? 0),
            total_incorrect_daily_doubles: (existingRow.total_incorrect_daily_doubles as number ?? 0) + (player.incorrectDailyDoubles ?? 0),
            total_correct_final_jeopardies: (existingRow.total_correct_final_jeopardies as number ?? 0) + (player.correctFinalJeopardy ?? 0),
            total_incorrect_final_jeopardies: (existingRow.total_incorrect_final_jeopardies as number ?? 0) + (player.incorrectFinalJeopardy ?? 0),
            current_balance: (existingRow.current_balance as number ?? 0) + player.score,
            total_money_earned: (existingRow.total_money_earned as number ?? 0) + (player.totalEarned ?? 0),
          },
        })
      } else {
        inserts.push({
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
        })
      }
    }

    // Execute updates in parallel
    const updatePromises = updates.map(({ id, data }) =>
      supabase.from('players').update(data).eq('id', id)
    )

    // Execute inserts in one batch
    if (inserts.length > 0) {
      const { error: insertErr } = await supabase.from('players').insert(inserts)
      if (insertErr) {
        errors.push(`Batch insert failed: ${insertErr.message}`)
      }
    }

    const updateResults = await Promise.all(updatePromises)
    for (const result of updateResults) {
      if (result.error) {
        errors.push(`Update failed: ${result.error.message}`)
      }
    }

    if (errors.length > 0) {
      return new Response(JSON.stringify({ success: false, error: errors.join('; ') }), {
        status: 207,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
