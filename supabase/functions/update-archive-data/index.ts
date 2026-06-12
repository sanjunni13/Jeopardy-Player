import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Clue {
  text: string
  answer: string
  value: string
  is_daily_double: boolean
  category: string
}

interface Round {
  round_name: string
  categories: string[]
  clues: Clue[]
}

interface Game {
  episode_number?: string
  air_date?: string
  game_title?: string
  rounds?: Round[]
}

interface CategoryInstance {
  show_number: string
  game_title: string
  air_date: string
  clues: { text: string; answer: string; value: string; is_daily_double: boolean }[]
}

interface CategoryEntry {
  category_name: string
  occurrences: number
  total_questions: number
  instances: CategoryInstance[]
}

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    // Extract and validate Authorization header
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
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

    // Verify JWT
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Download jeopardy_complete.json from the data Storage bucket
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('data')
      .download('jeopardy_complete.json')

    if (downloadError || !fileData) {
      return new Response(
        JSON.stringify({ error: `Failed to download archive data: ${downloadError?.message || 'Unknown error'}` }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // Parse the JSON data
    let games: Game[]
    try {
      const text = await fileData.text()
      games = JSON.parse(text)
    } catch (parseError) {
      return new Response(
        JSON.stringify({ error: `Failed to parse archive data: ${(parseError as Error).message}` }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // Category analysis logic (equivalent to analyze_categories.py)
    const categories: {
      single: Map<string, CategoryInstance[]>
      double: Map<string, CategoryInstance[]>
      final: Map<string, CategoryInstance[]>
    } = {
      single: new Map(),
      double: new Map(),
      final: new Map(),
    }

    for (const game of games) {
      if (!game.rounds) continue

      const showNumber = game.episode_number || 'unknown'
      const airDate = game.air_date || ''
      const gameTitle = game.game_title || ''

      for (const round of game.rounds) {
        const roundName = (round.round_name || '').toLowerCase()

        let roundType: 'single' | 'double' | 'final'
        if (roundName === 'double jeopardy') {
          roundType = 'double'
        } else if (roundName === 'final jeopardy') {
          roundType = 'final'
        } else {
          roundType = 'single'
        }

        if (roundType === 'final') {
          // Process final round
          if (!round.categories || round.categories.length === 0) continue
          const catName = round.categories[0].trim().toUpperCase()
          if (!catName) continue

          const clues = (round.clues || []).map((clue) => ({
            text: clue.text || '',
            answer: clue.answer || '',
            value: 'Final Jeopardy',
            is_daily_double: false,
          }))

          if (clues.length === 0) continue

          const instance: CategoryInstance = {
            show_number: showNumber,
            game_title: gameTitle,
            air_date: airDate,
            clues,
          }

          if (!categories.final.has(catName)) {
            categories.final.set(catName, [])
          }
          categories.final.get(catName)!.push(instance)
        } else {
          // Process single or double round
          if (!round.categories) continue

          for (const categoryName of round.categories) {
            if (!categoryName) continue
            const catName = categoryName.trim().toUpperCase()
            if (!catName) continue

            // Get all clues for this category
            const clues = (round.clues || [])
              .filter(
                (clue) =>
                  clue.category &&
                  clue.category.trim().toUpperCase() === catName
              )
              .map((clue) => ({
                text: clue.text || '',
                answer: clue.answer || '',
                value: clue.value || '',
                is_daily_double: clue.is_daily_double || false,
              }))

            if (clues.length === 0) continue

            const instance: CategoryInstance = {
              show_number: showNumber,
              game_title: gameTitle,
              air_date: airDate,
              clues,
            }

            const targetMap = categories[roundType]
            if (!targetMap.has(catName)) {
              targetMap.set(catName, [])
            }
            targetMap.get(catName)!.push(instance)
          }
        }
      }
    }

    // Build output structure: sort categories alphabetically, instances by show number/air date
    const buildOutput = (
      catMap: Map<string, CategoryInstance[]>
    ): Record<string, CategoryEntry> => {
      const sortedKeys = Array.from(catMap.keys()).sort()
      const result: Record<string, CategoryEntry> = {}

      for (const catName of sortedKeys) {
        const instances = catMap.get(catName)!
        const sortedInstances = instances.sort((a, b) => {
          const showCmp = (a.show_number || '').localeCompare(b.show_number || '')
          if (showCmp !== 0) return showCmp
          return (a.air_date || '').localeCompare(b.air_date || '')
        })

        result[catName] = {
          category_name: catName,
          occurrences: instances.length,
          total_questions: instances.reduce((sum, inst) => sum + inst.clues.length, 0),
          instances: sortedInstances,
        }
      }

      return result
    }

    const singleOutput = buildOutput(categories.single)
    const doubleOutput = buildOutput(categories.double)
    const finalOutput = buildOutput(categories.final)

    // Upload resulting files to data bucket
    const uploadFile = async (path: string, data: unknown): Promise<void> => {
      const jsonStr = JSON.stringify(data, null, 2)
      const blob = new Blob([jsonStr], { type: 'application/json' })
      const { error } = await supabase.storage
        .from('data')
        .upload(path, blob, { contentType: 'application/json', upsert: true })
      if (error) {
        throw new Error(`Failed to upload ${path}: ${error.message}`)
      }
    }

    await uploadFile('category_analysis/single_categories.json', singleOutput)
    await uploadFile('category_analysis/double_categories.json', doubleOutput)
    await uploadFile('category_analysis/final_categories.json', finalOutput)

    // Upload last_updated.json
    const lastUpdated = new Date().toISOString()
    await uploadFile('category_analysis/last_updated.json', { lastUpdated })

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Archive data updated successfully.',
        lastUpdated,
      }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message || 'An unexpected error occurred' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
