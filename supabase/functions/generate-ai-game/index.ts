import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildGame, validateGeminiResponse, checkRateLimit } from './gameBuilder.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    // Auth validation
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }
    const token = authHeader.replace('Bearer ', '')

    // Create Supabase service-role client
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

    // Look up Player ID from players table using Auth UUID
    const { data: playerData, error: playerError } = await supabase
      .from('players')
      .select('id')
      .eq('auth_uuid', user.id)
      .single()

    if (playerError && playerError.code !== 'PGRST116') {
      // DB query failure (not a "no rows" error)
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

    // Rate limiting: 10 requests per 60-minute sliding window
    const windowStart = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    const { data: rateLimitData, error: rateLimitError } = await supabase
      .from('rate_limits')
      .select('requested_at')
      .eq('user_id', user.id)
      .eq('function_name', 'generate-ai-game')
      .gte('requested_at', windowStart)
      .order('requested_at', { ascending: true })

    if (rateLimitError) {
      return new Response(JSON.stringify({ error: 'Rate limit check failed' }), {
        status: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    if (rateLimitData && rateLimitData.length >= 10) {
      const timestamps = rateLimitData.map((r: { requested_at: string }) => r.requested_at)
      const rateLimitResult = checkRateLimit(timestamps, 10, 60 * 60 * 1000, Date.now())
      return new Response(
        JSON.stringify({
          error: 'Rate limit exceeded. Try again later.',
          retryAfterSeconds: rateLimitResult.retryAfterSeconds,
        }),
        {
          status: 429,
          headers: { ...CORS, 'Content-Type': 'application/json' },
        }
      )
    }

    // Insert rate limit record for this request
    const { error: insertError } = await supabase
      .from('rate_limits')
      .insert({ user_id: user.id, function_name: 'generate-ai-game' })

    if (insertError) {
      return new Response(JSON.stringify({ error: 'Failed to record rate limit' }), {
        status: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }
    // Parse and validate request body
    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const { rounds, categoriesPerRound, difficulty, dailyDoublesPerRound, specialRequests, gameName: requestedGameName } = body

    // Validate rounds
    if (typeof rounds !== 'number' || !Number.isInteger(rounds) || rounds < 1 || rounds > 6) {
      return new Response(JSON.stringify({ error: "Invalid 'rounds': must be a number between 1 and 6" }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Validate categoriesPerRound
    if (typeof categoriesPerRound !== 'number' || !Number.isInteger(categoriesPerRound) || categoriesPerRound < 1 || categoriesPerRound > 6) {
      return new Response(JSON.stringify({ error: "Invalid 'categoriesPerRound': must be a number between 1 and 6" }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Validate difficulty (now a 1-10 scale)
    if (typeof difficulty !== 'number' || !Number.isInteger(difficulty) || difficulty < 1 || difficulty > 10) {
      return new Response(JSON.stringify({ error: "Invalid 'difficulty': must be a number between 1 and 10" }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Validate dailyDoublesPerRound
    if (typeof dailyDoublesPerRound !== 'number' || !Number.isInteger(dailyDoublesPerRound) || dailyDoublesPerRound < 0 || dailyDoublesPerRound > categoriesPerRound) {
      return new Response(JSON.stringify({ error: `Invalid 'dailyDoublesPerRound': must be a number between 0 and ${categoriesPerRound}` }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Validate specialRequests
    if (typeof specialRequests !== 'string' || specialRequests.length > 500) {
      return new Response(JSON.stringify({ error: "Invalid 'specialRequests': must be a string with at most 500 characters" }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Validated parameters ready for use by subsequent tasks
    const validatedParams = {
      rounds: rounds as number,
      categoriesPerRound: categoriesPerRound as number,
      difficulty: difficulty as number,
      dailyDoublesPerRound: dailyDoublesPerRound as number,
      specialRequests: specialRequests as string,
    }
    // --- Gemini API call for game content generation (Task 2.1) ---
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY')
    if (!geminiApiKey) {
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const totalCategories = validatedParams.rounds * validatedParams.categoriesPerRound
    const difficultyLevel = validatedParams.difficulty
    const difficultyDescriptions: Record<number, string> = {
      1: 'Very easy — elementary-level trivia that almost anyone would know (e.g., "What color are bananas?")',
      2: 'Easy — simple facts most people learn by middle school (e.g., "What ocean is on the east coast of the United States?")',
      3: 'Casual — straightforward general knowledge, like an easy pub quiz (e.g., "What is the largest planet in our solar system?")',
      4: 'Average — standard trivia night level, requires some general knowledge (e.g., "What year did the Titanic sink?")',
      5: 'Standard Jeopardy — typical TV show difficulty, a mix of accessible and tricky clues',
      6: 'Above average — requires solid general knowledge across multiple topics, like a competitive trivia league',
      7: 'Challenging — clues that require specific knowledge or clever wordplay, like a hard Jeopardy episode',
      8: 'Difficult — deep but still fun trivia; think Tournament of Champions level where you need broad cultural literacy',
      9: 'Very challenging — obscure-but-guessable clues that reward well-read players; think final rounds of quiz bowl',
      10: 'Expert trivia — the hardest clues that are still fun and answerable with deep general knowledge; not academic, but would stump most casual players',
    }
    const difficultyDescription = difficultyDescriptions[difficultyLevel] || difficultyDescriptions[5]

    const prompt = `You are a Jeopardy game generator. Generate a complete Jeopardy game with the following specifications:

- Total categories needed: ${totalCategories} (${validatedParams.rounds} rounds × ${validatedParams.categoriesPerRound} categories per round)
- Difficulty level: ${difficultyLevel}/10 — ${difficultyDescription}
- Each category must have exactly 5 clues
- Clues must be in classic Jeopardy style: the clue is a statement, and the solution is in question form (e.g., clue: "This planet is closest to the sun", solution: "What is Mercury?")
- All category names must be unique (no duplicates)
- Include a Final Jeopardy round with a single category, clue, and solution
- Scale the complexity of clues to match difficulty ${difficultyLevel}/10. Make sure the game is fun and engaging at this level — clues should be challenging enough to be satisfying but not so obscure that players can't reasonably guess.
${validatedParams.specialRequests ? `- Special requests: ${validatedParams.specialRequests}` : ''}

Return a JSON object with this exact structure:
{
  "categories": [
    {
      "name": "Category Name",
      "clues": [
        { "clue": "This is a statement clue", "solution": "What is the answer?" },
        { "clue": "Another statement clue", "solution": "What is another answer?" },
        { "clue": "Third statement clue", "solution": "What is a third answer?" },
        { "clue": "Fourth statement clue", "solution": "What is a fourth answer?" },
        { "clue": "Fifth statement clue", "solution": "What is a fifth answer?" }
      ]
    }
  ],
  "final": {
    "category": "Final Category Name",
    "clue": "Final clue statement",
    "solution": "What is the final answer?"
  }
}

The "categories" array must contain exactly ${totalCategories} categories. Each category must have exactly 5 clues.`

    // Model fallback chain: try each model in order until one succeeds
    const MODELS = [
      'gemini-2.5-flash-lite',
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-3.5-flash',
      'gemini-3.1-pro-preview',
      'gemini-3.1-flash-lite',
      'gemini-3-flash-preview',
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
      'gemini-1.5-flash',
      'gemini-1.5-flash-8b',
      'gemini-1.5-pro',
    ]

    let geminiData: unknown = null
    let lastError = ''

    for (const model of MODELS) {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 60000)

      let geminiResponse: Response
      try {
        geminiResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: 'application/json' },
            }),
            signal: controller.signal,
          }
        )
      } catch (err) {
        clearTimeout(timeoutId)
        if (err instanceof DOMException && err.name === 'AbortError') {
          lastError = `Model ${model} timed out`
          continue
        }
        lastError = `Model ${model} fetch failed`
        continue
      }
      clearTimeout(timeoutId)

      // If model is overloaded (503) or rate limited (429), try next model
      if (geminiResponse.status === 503 || geminiResponse.status === 429) {
        lastError = `Model ${model} returned ${geminiResponse.status}`
        continue
      }

      if (!geminiResponse.ok) {
        lastError = `Model ${model} returned ${geminiResponse.status}`
        continue
      }

      // Parse response
      try {
        const geminiBody = await geminiResponse.json()
        const textContent = geminiBody?.candidates?.[0]?.content?.parts?.[0]?.text
        if (!textContent) {
          lastError = `Model ${model} returned no content`
          continue
        }
        geminiData = JSON.parse(textContent)
        break // Success — exit the loop
      } catch {
        lastError = `Model ${model} returned unparseable response`
        continue
      }
    }

    if (!geminiData) {
      return new Response(JSON.stringify({ error: `AI generation failed after trying all models. Last error: ${lastError}` }), {
        status: 502,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }


    // Validate the parsed Gemini data against expected schema
    const validation = validateGeminiResponse(geminiData, totalCategories)
    if (!validation.valid) {
      return new Response(JSON.stringify({ error: 'AI generation failed. Please retry.' }), {
        status: 502,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const geminiCategories = validation.categories!
    const geminiFinal = validation.final!

    // Build NormalizedGame with point values and daily doubles
    const game = buildGame(
      {
        rounds: validatedParams.rounds,
        categoriesPerRound: validatedParams.categoriesPerRound,
        dailyDoublesPerRound: validatedParams.dailyDoublesPerRound,
      },
      geminiCategories,
      geminiFinal
    )

    // Upload game JSON to storage and insert DB row
    const gameName = (typeof requestedGameName === 'string' && requestedGameName.trim())
      ? requestedGameName.trim()
      : `ai_${Date.now()}`
    const storagePath = `${user.id}/${gameName}.json`

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from('games')
      .upload(storagePath, JSON.stringify(game), {
        contentType: 'application/json',
        upsert: false,
      })

    if (uploadError) {
      return new Response(
        JSON.stringify({ error: `Failed to store game: ${uploadError.message}` }),
        {
          status: 500,
          headers: { ...CORS, 'Content-Type': 'application/json' },
        }
      )
    }

    // Insert DB row
    const { data: row, error: dbError } = await supabase
      .from('games')
      .insert({
        game_name: gameName,
        total_rounds: validatedParams.rounds,
        times_played: 0,
        winners: [],
        created_by: playerId,
        source: 'ai',
      })
      .select('id')
      .single()

    if (dbError || !row) {
      // Rollback: delete uploaded file
      await supabase.storage.from('games').remove([storagePath])
      return new Response(
        JSON.stringify({ error: `Database error: ${dbError?.message || 'Unknown error'}` }),
        {
          status: 500,
          headers: { ...CORS, 'Content-Type': 'application/json' },
        }
      )
    }

    return new Response(JSON.stringify({ success: true, id: row.id }), {
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
