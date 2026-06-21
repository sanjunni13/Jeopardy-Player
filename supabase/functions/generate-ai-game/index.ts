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

    const { rounds, categoriesPerRound, difficulty, dailyDoublesPerRound, specialRequests } = body

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

    // Validate difficulty
    const validDifficulties = ['easy', 'medium', 'hard']
    if (typeof difficulty !== 'string' || !validDifficulties.includes(difficulty)) {
      return new Response(JSON.stringify({ error: "Invalid 'difficulty': must be 'easy', 'medium', or 'hard'" }), {
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
      difficulty: difficulty as 'easy' | 'medium' | 'hard',
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
    const prompt = `You are a Jeopardy game generator. Generate a complete Jeopardy game with the following specifications:

- Total categories needed: ${totalCategories} (${validatedParams.rounds} rounds × ${validatedParams.categoriesPerRound} categories per round)
- Difficulty level: ${validatedParams.difficulty}
- Each category must have exactly 5 clues
- Clues must be in classic Jeopardy style: the clue is a statement, and the solution is in question form (e.g., clue: "This planet is closest to the sun", solution: "What is Mercury?")
- All category names must be unique (no duplicates)
- Include a Final Jeopardy round with a single category, clue, and solution
- Generate varied, interesting categories appropriate for the ${validatedParams.difficulty} difficulty level
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

    // Call Gemini API with 60-second timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000)

    let geminiResponse: Response
    try {
      geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
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
        return new Response(JSON.stringify({ error: 'AI generation timed out. Please retry.' }), {
          status: 504,
          headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ error: 'AI generation failed. Please retry.' }), {
        status: 502,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }
    clearTimeout(timeoutId)

    // Parse and validate Gemini response
    let geminiData: unknown
    try {
      const geminiBody = await geminiResponse.json()
      const textContent = geminiBody?.candidates?.[0]?.content?.parts?.[0]?.text
      if (!textContent) {
        return new Response(JSON.stringify({ error: 'AI generation failed. Please retry.' }), {
          status: 502,
          headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }
      geminiData = JSON.parse(textContent)
    } catch {
      return new Response(JSON.stringify({ error: 'AI generation failed. Please retry.' }), {
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
    const timestamp = Date.now()
    const gameName = `ai_${timestamp}`
    const storagePath = `${user.email}/${gameName}.json`

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
        created_by: user.email,
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
