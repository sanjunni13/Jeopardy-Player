import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ROUND_KEYS = ['single', 'double', 'triple', 'quadruple', 'quintuple', 'sextuple']

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    // Extract and validate authorization
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }
    const token = authHeader.replace('Bearer ', '')

    // Create Supabase service-role client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Verify JWT
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Look up Player ID from players table using Auth UUID
    const { data: playerData, error: playerError } = await supabase
      .from('players')
      .select('id')
      .eq('auth_uuid', user.id)
      .single()

    if (playerError) {
      // Distinguish between "not found" and actual DB failure
      if (playerError.code === 'PGRST116') {
        // No rows returned — player record does not exist
        return new Response(JSON.stringify({ error: 'Profile setup required' }), {
          status: 400,
          headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }
      // Actual database error
      return new Response(JSON.stringify({ error: 'Could not complete operation' }), {
        status: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    if (!playerData) {
      return new Response(JSON.stringify({ error: 'Profile setup required' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const playerId = playerData.id

    // Parse request body
    const { rounds, categoriesPerRound } = await req.json()

    // Validate inputs
    if (
      typeof rounds !== 'number' || rounds < 1 || rounds > 6 ||
      typeof categoriesPerRound !== 'number' || categoriesPerRound < 1 || categoriesPerRound > 6
    ) {
      return new Response(JSON.stringify({ error: 'Invalid parameters. rounds and categoriesPerRound must be numbers between 1 and 6.' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Load category chunks - pick random chunks for each round type
    async function loadRandomChunk(roundType: string): Promise<Record<string, { category_name: string; clues: Array<{ text: string; answer: string }> }> | null> {
      // Load manifest to know how many chunks exist
      const { data: manifestData, error: manifestError } = await supabase.storage
        .from('data')
        .download(`category_analysis/${roundType}_chunks_manifest.json`)
      if (manifestError || !manifestData) return null

      const manifest = JSON.parse(await manifestData.text())
      const numChunks = manifest.chunks

      // Pick a random chunk
      const chunkIdx = Math.floor(Math.random() * numChunks)
      const chunkPath = `category_analysis/${roundType}_chunk_${String(chunkIdx).padStart(3, '0')}.json`

      const { data, error } = await supabase.storage.from('data').download(chunkPath)
      if (error || !data) return null

      return JSON.parse(await data.text())
    }

    // Load chunks for single, double, and final
    const singleCategories = await loadRandomChunk('single')
    const doubleCategories = await loadRandomChunk('double')
    const finalCategories = await loadRandomChunk('final')

    if (!singleCategories || !doubleCategories || !finalCategories) {
      return new Response(JSON.stringify({ error: 'Archive data not available. Please run the category analysis script first.' }), {
        status: 422,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Build game rounds
    const gameRounds: Record<string, Array<{ category: string; clues: Array<{ value: number; clue: string; solution: string; dailyDouble: boolean; html: boolean }> }>> = {}
    const usedCategoryNames = new Set<string>()

    for (let n = 1; n <= rounds; n++) {
      const roundKey = ROUND_KEYS[n - 1]
      // Round 1 uses single_categories, round 2+ uses double_categories
      const dataSource = n === 1 ? singleCategories : doubleCategories

      // Get available category names that haven't been used
      const availableKeys = Object.keys(dataSource).filter(k => !usedCategoryNames.has(k))

      if (availableKeys.length < categoriesPerRound) {
        return new Response(JSON.stringify({ error: 'Not enough unique categories available for the requested configuration.' }), {
          status: 422,
          headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }

      // Randomly select categoriesPerRound categories
      const selectedKeys = shuffleArray(availableKeys).slice(0, categoriesPerRound)
      selectedKeys.forEach(k => usedCategoryNames.add(k))

      const categories = selectedKeys.map(key => {
        const categoryData = dataSource[key]
        const categoryName = categoryData.category_name || key
        // Slim format: clues are directly on the category object
        const rawClues = categoryData.clues.slice(0, 5)

        const clues = rawClues.map((rawClue: { text?: string; clue?: string; answer?: string; solution?: string }, i: number) => ({
          value: n * (i + 1) * 200,
          clue: rawClue.text || rawClue.clue || '',
          solution: rawClue.answer || rawClue.solution || '',
          dailyDouble: false,
          html: false,
        }))

        // Pad with empty clues if fewer than 5 available
        while (clues.length < 5) {
          clues.push({
            value: n * (clues.length + 1) * 200,
            clue: '',
            solution: '',
            dailyDouble: false,
            html: false,
          })
        }

        return { category: categoryName, clues }
      })

      gameRounds[roundKey] = categories
    }

    // Place Daily Doubles for each round
    for (let n = 1; n <= rounds; n++) {
      const roundKey = ROUND_KEYS[n - 1]
      const categories = gameRounds[roundKey]

      // Collect eligible positions: value >= N * 600 (3rd tier or higher)
      const eligiblePositions: Array<{ catIdx: number; clueIdx: number; value: number }> = []
      for (let catIdx = 0; catIdx < categories.length; catIdx++) {
        for (let clueIdx = 0; clueIdx < categories[catIdx].clues.length; clueIdx++) {
          const clue = categories[catIdx].clues[clueIdx]
          if (clue.value >= n * 600) {
            eligiblePositions.push({ catIdx, clueIdx, value: clue.value })
          }
        }
      }

      if (eligiblePositions.length >= 2) {
        // Weighted random selection favoring higher values
        const firstDD = weightedRandomSelect(eligiblePositions)
        // Filter to different categories for second DD
        const remainingPositions = eligiblePositions.filter(p => p.catIdx !== firstDD.catIdx)

        if (remainingPositions.length > 0) {
          const secondDD = weightedRandomSelect(remainingPositions)
          categories[firstDD.catIdx].clues[firstDD.clueIdx].dailyDouble = true
          categories[secondDD.catIdx].clues[secondDD.clueIdx].dailyDouble = true
        } else {
          // Fallback: just place one DD
          categories[firstDD.catIdx].clues[firstDD.clueIdx].dailyDouble = true
        }
      }
    }

    // Select Final Jeopardy
    const finalKeys = Object.keys(finalCategories)
    const randomFinalKey = finalKeys[Math.floor(Math.random() * finalKeys.length)]
    const finalData = finalCategories[randomFinalKey]
    const finalClue = finalData.clues[0]

    const finalRound = {
      category: finalData.category_name || randomFinalKey,
      clue: finalClue.text || finalClue.clue || '',
      solution: finalClue.answer || finalClue.solution || '',
      html: false,
    }

    // Build the complete game object
    const game = {
      rounds: gameRounds,
      final: finalRound,
      totalRounds: rounds,
    }

    // Generate timestamp and upload
    const timestamp = Date.now()
    const gameName = `generated_${timestamp}`
    const storagePath = `${user.id}/${gameName}.json`

    const { error: uploadError } = await supabase.storage
      .from('games')
      .upload(storagePath, JSON.stringify(game), {
        contentType: 'application/json',
        upsert: false,
      })

    if (uploadError) {
      return new Response(JSON.stringify({ error: `Failed to upload game: ${uploadError.message}` }), {
        status: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Insert row into games table
    const { data: row, error: insertError } = await supabase
      .from('games')
      .insert({
        game_name: gameName,
        total_rounds: rounds,
        times_played: 0,
        winners: [],
        created_by: playerId,
        source: 'archive',
      })
      .select('id')
      .single()

    if (insertError || !row) {
      // Best-effort rollback: delete the uploaded file
      await supabase.storage.from('games').remove([storagePath])
      return new Response(JSON.stringify({ error: `Failed to save game record: ${insertError?.message || 'Unknown error'}` }), {
        status: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true, id: row.id }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})

/** Fisher-Yates shuffle */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

/** Weighted random selection favoring higher values */
function weightedRandomSelect(positions: Array<{ catIdx: number; clueIdx: number; value: number }>): { catIdx: number; clueIdx: number; value: number } {
  const totalWeight = positions.reduce((sum, p) => sum + p.value, 0)
  let random = Math.random() * totalWeight
  for (const pos of positions) {
    random -= pos.value
    if (random <= 0) return pos
  }
  return positions[positions.length - 1]
}
