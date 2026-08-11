import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Same model fallback chain as generate-ai-game
const MODELS = [
  'gemini-3.5-flash',
  'gemini-3.1-pro-preview',
  'gemini-3.1-flash-lite',
  'gemini-3-flash-preview',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-1.5-pro',
]

const SYSTEM_PROMPT = `You are a Jeopardy game creation assistant embedded in a board builder tool. Your role is to help users brainstorm and create content for their Jeopardy games.

You can help with:
1. **Category suggestions**: When asked for category ideas, suggest creative, fun, and varied Jeopardy-style category names. Consider wordplay, puns, and thematic groupings that make for engaging gameplay.
2. **Clue/answer generation**: When given a category, generate clue/answer pairs in classic Jeopardy style (clue is a statement, answer is in "What is...?" question form). Scale difficulty across the 5 clues (easiest first, hardest last).
3. **Refining user ideas**: When users share rough ideas for categories or clues, help them polish those ideas into proper Jeopardy format. Suggest related categories or similarly-themed clue/answer pairs.
4. **Theme exploration**: When users describe a theme, motif, or concept, brainstorm multiple category angles that fit that theme.

IMPORTANT RULES:
- All clues must be factually accurate and verifiable.
- Answers should always be in Jeopardy question form (e.g., "What is Mercury?").
- Keep responses concise and directly useful for building a game.
- When generating clues, provide exactly 5 per category (matching Jeopardy format).
- Format clue/answer pairs clearly so users can easily copy them into their game.
- Be creative with category names — wordplay and clever titles make better games.`

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

serve(async (req: Request) => {
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

    // Parse request body
    const body = await req.json()
    const { messages } = body as { messages: ChatMessage[] }

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Messages array is required' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Validate message format
    for (const msg of messages) {
      if (!msg.role || !msg.content || !['user', 'assistant'].includes(msg.role)) {
        return new Response(JSON.stringify({ error: 'Invalid message format' }), {
          status: 400,
          headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }
      if (msg.content.length > 2000) {
        return new Response(JSON.stringify({ error: 'Message too long (max 2000 characters)' }), {
          status: 400,
          headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }
    }

    // Limit conversation history to prevent abuse
    if (messages.length > 50) {
      return new Response(JSON.stringify({ error: 'Conversation too long. Please start a new chat.' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Get Gemini API key
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY')
    if (!geminiApiKey) {
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Build Gemini conversation contents
    const contents = [
      { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
      { role: 'model', parts: [{ text: 'Understood! I\'m ready to help you create an amazing Jeopardy game. What would you like help with? I can suggest categories, generate clue/answer pairs, or help refine your ideas.' }] },
      ...messages.map((msg) => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      })),
    ]

    // Try models in fallback order
    let responseText: string | null = null
    let lastError = ''

    for (const model of MODELS) {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)

      let geminiResponse: Response
      try {
        geminiResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents,
              generationConfig: {
                temperature: 0.8,
                maxOutputTokens: 2048,
              },
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

      if (geminiResponse.status === 503 || geminiResponse.status === 429) {
        lastError = `Model ${model} returned ${geminiResponse.status}`
        continue
      }

      if (!geminiResponse.ok) {
        lastError = `Model ${model} returned ${geminiResponse.status}`
        continue
      }

      try {
        const geminiBody = await geminiResponse.json()
        const textContent = geminiBody?.candidates?.[0]?.content?.parts?.[0]?.text
        if (!textContent) {
          lastError = `Model ${model} returned no content`
          continue
        }
        responseText = textContent
        break
      } catch {
        lastError = `Model ${model} returned unparseable response`
        continue
      }
    }

    if (!responseText) {
      return new Response(JSON.stringify({ error: `AI assistant unavailable. Last error: ${lastError}` }), {
        status: 502,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ reply: responseText }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
