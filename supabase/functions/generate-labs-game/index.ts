import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { DOMParser } from 'https://deno.land/x/deno_dom/deno-dom-wasm.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
]

interface Clue {
  value: number
  clue: string
  solution: string
  dailyDouble: boolean
  html: boolean
}

interface Category {
  category: string
  clues: Clue[]
}

interface FinalRound {
  category: string
  clue: string
  solution: string
  html: boolean
}

function randomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
}

function randomDelay(min: number, max: number): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min) + min)
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function containsHtml(text: string): boolean {
  return /<[^>]+>/.test(text)
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}


async function fetchGameSlugs(keyword: string, maxPerKeyword: number): Promise<string[]> {
  const url = `https://jeopardylabs.com/browse/?q=${encodeURIComponent(keyword)}`
  const res = await fetch(url, {
    headers: { 'User-Agent': randomUserAgent() },
  })
  if (!res.ok) return []

  const html = await res.text()
  const doc = new DOMParser().parseFromString(html, 'text/html')
  if (!doc) return []

  const slugs: string[] = []
  const links = doc.querySelectorAll('a[href*="/play/"]')
  for (let i = 0; i < links.length && slugs.length < maxPerKeyword; i++) {
    const href = links[i].getAttribute('href')
    if (!href) continue
    const match = href.match(/\/play\/([^/?#]+)/)
    if (match && match[1]) {
      const slug = match[1]
      if (!slugs.includes(slug)) {
        slugs.push(slug)
      }
    }
  }
  return slugs
}

interface ScrapedCategory {
  category: string
  clues: { clue: string; solution: string }[]
}

async function scrapeGame(slug: string): Promise<ScrapedCategory[]> {
  const url = `https://jeopardylabs.com/play/${slug}`
  const res = await fetch(url, {
    headers: { 'User-Agent': randomUserAgent() },
  })
  if (!res.ok) return []

  const html = await res.text()
  const doc = new DOMParser().parseFromString(html, 'text/html')
  if (!doc) return []

  // Each cell-group contains a single clue with data-category on .cell-inner
  const categoryMap = new Map<string, { clue: string; solution: string }[]>()

  const cellGroups = doc.querySelectorAll('.cell-group')
  for (let i = 0; i < cellGroups.length; i++) {
    const cellInner = cellGroups[i].querySelector('.cell-inner')
    if (!cellInner) continue

    const catName = (cellInner.getAttribute('data-category') || '').trim()
    if (!catName) continue

    const answerEl = cellGroups[i].querySelector('.front.answer')
    const questionEl = cellGroups[i].querySelector('.back.question')

    const clueText = (answerEl?.innerHTML || '').trim()
    const solutionText = (questionEl?.innerHTML || '').trim()

    if (clueText && solutionText) {
      if (!categoryMap.has(catName)) {
        categoryMap.set(catName, [])
      }
      categoryMap.get(catName)!.push({ clue: clueText, solution: solutionText })
    }
  }

  const categories: ScrapedCategory[] = []
  for (const [category, clues] of categoryMap) {
    categories.push({ category, clues })
  }

  return categories
}

function buildValidCategories(scraped: ScrapedCategory[]): ScrapedCategory[] {
  // Only keep categories with exactly 5 valid clues
  return scraped
    .filter((cat) => cat.clues.length >= 5)
    .map((cat) => ({
      category: cat.category,
      clues: cat.clues.slice(0, 5),
    }))
}

function assignClues(
  cat: ScrapedCategory,
  values: number[]
): Category {
  return {
    category: cat.category,
    clues: cat.clues.map((c, i) => ({
      value: values[i],
      clue: c.clue,
      solution: c.solution,
      dailyDouble: false,
      html: containsHtml(c.clue) || containsHtml(c.solution),
    })),
  }
}

function placeDailyDoubles(categories: Category[], minValue: number): void {
  // Collect eligible positions (value >= minValue)
  const eligible: { catIdx: number; clueIdx: number }[] = []
  for (let catIdx = 0; catIdx < categories.length; catIdx++) {
    for (let clueIdx = 0; clueIdx < categories[catIdx].clues.length; clueIdx++) {
      if (categories[catIdx].clues[clueIdx].value >= minValue) {
        eligible.push({ catIdx, clueIdx })
      }
    }
  }

  if (eligible.length < 2) return

  // Shuffle eligible and pick 2 from different categories
  const shuffled = shuffle(eligible)
  let first: { catIdx: number; clueIdx: number } | null = null
  let second: { catIdx: number; clueIdx: number } | null = null

  for (const pos of shuffled) {
    if (!first) {
      first = pos
      continue
    }
    if (pos.catIdx !== first.catIdx) {
      second = pos
      break
    }
  }

  if (first) categories[first.catIdx].clues[first.clueIdx].dailyDouble = true
  if (second) categories[second.catIdx].clues[second.clueIdx].dailyDouble = true
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

    // Parse request body
    const body = await req.json()
    const keywords: string[] = body.keywords

    // Determine max slugs per keyword
    const maxPerKeyword = keywords.length > 3 ? 5 : 10

    // Fetch game slugs for each keyword
    const allSlugs = new Set<string>()
    for (const keyword of keywords) {
      const slugs = await fetchGameSlugs(keyword, maxPerKeyword)
      for (const slug of slugs) {
        allSlugs.add(slug)
      }
      // Random delay between keyword requests
      await randomDelay(500, 1500)
    }

    if (allSlugs.size === 0) {
      return new Response(
        JSON.stringify({ error: 'No games found for the provided keywords.' }),
        {
          status: 404,
          headers: { ...CORS, 'Content-Type': 'application/json' },
        }
      )
    }

    // Scrape each game slug
    const allScrapedCategories: ScrapedCategory[] = []
    for (const slug of allSlugs) {
      const scraped = await scrapeGame(slug)
      allScrapedCategories.push(...scraped)
      await randomDelay(500, 1500)
    }

    // Build valid categories (exactly 5 clues each)
    const validCategories = buildValidCategories(allScrapedCategories)

    if (validCategories.length < 12) {
      return new Response(
        JSON.stringify({
          error: 'Not enough valid categories found from search results. Try different keywords.',
        }),
        {
          status: 422,
          headers: { ...CORS, 'Content-Type': 'application/json' },
        }
      )
    }

    // Shuffle and select categories for rounds
    const shuffled = shuffle(validCategories)
    const round1Categories = shuffled.slice(0, 6)
    const round2Categories = shuffled.slice(6, 12)
    const unusedCategories = shuffled.slice(12)

    // Build round 1 (single): values 200, 400, 600, 800, 1000
    const singleRound: Category[] = round1Categories.map((cat) =>
      assignClues(cat, [200, 400, 600, 800, 1000])
    )

    // Build round 2 (double): values 400, 800, 1200, 1600, 2000
    const doubleRound: Category[] = round2Categories.map((cat) =>
      assignClues(cat, [400, 800, 1200, 1600, 2000])
    )

    // Place Daily Doubles
    // Round 1: eligible = value >= 600
    placeDailyDoubles(singleRound, 600)
    // Round 2: eligible = value >= 1200
    placeDailyDoubles(doubleRound, 1200)

    // Select Final Jeopardy from unused categories
    let finalRound: FinalRound
    if (unusedCategories.length > 0) {
      const finalCat = unusedCategories[0]
      const firstClue = finalCat.clues[0]
      finalRound = {
        category: finalCat.category,
        clue: firstClue.clue,
        solution: firstClue.solution,
        html: containsHtml(firstClue.clue) || containsHtml(firstClue.solution),
      }
    } else {
      // Pick any unused clue from scraped data
      // Use the last clue from the last round 2 category as fallback
      const fallbackCat = round2Categories[round2Categories.length - 1]
      const fallbackClue = fallbackCat.clues[fallbackCat.clues.length - 1]
      finalRound = {
        category: fallbackCat.category,
        clue: fallbackClue.clue,
        solution: fallbackClue.solution,
        html: containsHtml(fallbackClue.clue) || containsHtml(fallbackClue.solution),
      }
    }

    // Build game object
    const game = {
      rounds: {
        single: singleRound,
        double: doubleRound,
      },
      final: finalRound,
      totalRounds: 2,
    }

    // Generate keywords slug and timestamp
    const slug = keywords.join('-').replace(/[^a-z0-9-]/gi, '').slice(0, 50)
    const timestamp = Date.now()
    const gameName = `labs_${slug}_${timestamp}`
    const storagePath = `${user.email}/${gameName}.json`

    // Upload game JSON to games bucket
    const { error: uploadError } = await supabase.storage
      .from('games')
      .upload(storagePath, JSON.stringify(game), {
        contentType: 'application/json',
        upsert: false,
      })

    if (uploadError) {
      return new Response(
        JSON.stringify({ error: `Failed to upload game: ${uploadError.message}` }),
        {
          status: 500,
          headers: { ...CORS, 'Content-Type': 'application/json' },
        }
      )
    }

    // Insert row into games table
    const { data: row, error: dbError } = await supabase
      .from('games')
      .insert({
        game_name: gameName,
        total_rounds: 2,
        times_played: 0,
        winners: [],
        created_by: user.email,
        source: 'labs',
      })
      .select('id')
      .single()

    if (dbError || !row) {
      // Best-effort rollback: delete uploaded file
      await supabase.storage.from('games').remove([storagePath])
      return new Response(
        JSON.stringify({ error: `Database insert failed: ${dbError?.message || 'Unknown error'}` }),
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
