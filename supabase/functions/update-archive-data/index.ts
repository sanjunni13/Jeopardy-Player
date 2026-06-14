import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { DOMParser } from 'https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Scraping configuration
const BASE_URL = 'https://j-archive.com/'
const MAX_GAMES_PER_INVOCATION = 30
const REQUEST_DELAY_MS = 3000
const MAX_EXECUTION_MS = 120_000 // 120s safety margin (function timeout is ~150s)
const MAX_PART_BYTES = 49 * 1024 * 1024 // 49 MB to leave margin under 50MB limit

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface Clue {
  text: string
  answer: string
  value: string | null
  category: string
  is_daily_double: boolean
}

interface Round {
  round_name: string
  categories: string[]
  clues: Clue[]
}

interface Game {
  game_title: string
  url: string
  episode_number: number | null
  air_date: string | null
  rounds: Round[]
}

interface ScrapeProgress {
  seasons_complete: number[]
  seasons_partial: Record<string, string[]> // season_url -> scraped game urls
  total_games: number
  last_scrape: string
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

// ─── Utility functions ───────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function cleanText(text: string | null | undefined): string | null {
  if (!text) return null
  let cleaned = text
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
  // Decode HTML entities
  cleaned = cleaned
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
  // Strip HTML tags
  cleaned = cleaned.replace(/<[^>]+>/g, '')
  // Normalize whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim()
  // Remove parenthetical notes
  cleaned = cleaned.replace(/\([^)]*\)/g, '').trim()
  // Strip leading/trailing quotes
  cleaned = cleaned.replace(/^["']|["']$/g, '')
  return cleaned || null
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '')
}

// ─── Scraping functions ──────────────────────────────────────────────────────

async function fetchPage(path: string): Promise<string> {
  const url = BASE_URL + path
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  })
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} fetching ${url}`)
  }
  return resp.text()
}

function getSeasons(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  if (!doc) return []
  const links = doc.querySelectorAll('tr td a')
  const seasons: string[] = []
  for (const link of links) {
    const href = (link as unknown as { getAttribute(name: string): string | null }).getAttribute('href')
    if (href && href.startsWith('showseason.php')) {
      seasons.push(href)
    }
  }
  return seasons
}

function getGameUrls(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  if (!doc) return []
  const links = doc.querySelectorAll('tr td a')
  const games: string[] = []
  for (const link of links) {
    const href = (link as unknown as { getAttribute(name: string): string | null }).getAttribute('href')
    if (href && href.startsWith('showgame.php')) {
      games.push(href)
    }
  }
  return games
}

function parseGame(html: string, gameUrl: string): Game | null {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  if (!doc) return null

  // Get title/metadata
  const titleDiv = doc.querySelector('#game_title')
  const title = titleDiv?.textContent?.trim() || 'Unknown Game'
  let episodeNumber: number | null = null
  let airDate: string | null = null
  const titleMatch = title.match(/Show #(\d+) - Aired (.*)/)
  if (titleMatch) {
    episodeNumber = parseInt(titleMatch[1])
    airDate = titleMatch[2]
  }

  // Build answer cache from toggle responses
  const answerCache: Record<string, string> = {}
  const answerDivs = doc.querySelectorAll('div[onmouseover]')
  for (const div of answerDivs) {
    const mouseover = (div as unknown as { getAttribute(name: string): string | null }).getAttribute('onmouseover')
    if (!mouseover) continue
    // Extract the parent clue ID and correct response
    const parentTd = div.parentElement
    if (!parentTd) continue
    const parentId = (parentTd as unknown as { getAttribute(name: string): string | null }).getAttribute('id')
    if (!parentId) continue
    
    // Find correct_response in the mouseover content
    const crMatch = mouseover.match(/correct_response">(.*?)<\/em/)
    if (crMatch) {
      answerCache[parentId] = cleanText(stripTags(crMatch[1])) || ''
    }
  }

  const rounds: Round[] = []
  const roundConfigs = [
    { id: 'jeopardy_round', name: 'Jeopardy' },
    { id: 'double_jeopardy_round', name: 'Double Jeopardy' },
    { id: 'final_jeopardy_round', name: 'Final Jeopardy' },
  ]

  for (const { id, name } of roundConfigs) {
    const roundDiv = doc.querySelector(`#${id}`)
    if (!roundDiv) continue

    const categoryEls = roundDiv.querySelectorAll('.category_name')
    const categories: string[] = []
    for (const el of categoryEls) {
      categories.push(cleanText(el.textContent) || '')
    }
    if (categories.length === 0) continue

    const clues: Clue[] = []
    const clueTexts = roundDiv.querySelectorAll('.clue_text')
    
    for (const clueEl of clueTexts) {
      const clueId = (clueEl as unknown as { getAttribute(name: string): string | null }).getAttribute('id')
      if (!clueId) continue

      const clueText = cleanText(clueEl.textContent)
      if (!clueText) continue

      // Determine category index from clue ID
      // Format: clue_J_1_1 (round_col_row) or clue_DJ_1_1
      let colIndex = 0
      const colMatch = clueId.match(/clue_(?:DJ?|FJ)_(\d+)/)
      if (colMatch) {
        colIndex = parseInt(colMatch[1]) - 1
      }

      const category = categories[colIndex] || ''
      const answer = answerCache[`${clueId}_r`] || answerCache[clueId] || null

      // Get value
      let value: string | null = null
      const valueMatch = clueId.match(/clue_(?:DJ?|FJ)_(\d+)_(\d+)/)
      if (valueMatch && name === 'Jeopardy') {
        const row = parseInt(valueMatch[2])
        value = `$${row * 200}`
      } else if (valueMatch && name === 'Double Jeopardy') {
        const row = parseInt(valueMatch[2])
        value = `$${row * 400}`
      } else if (name === 'Final Jeopardy') {
        value = 'Final Jeopardy'
      }

      // Check for daily double (look in parent elements for DD indicator)
      const isDailyDouble = html.includes(`clue_value_daily_double`) && 
        html.includes(clueId.replace('clue_', ''))

      clues.push({
        text: clueText,
        answer: answer || '',
        value,
        category,
        is_daily_double: isDailyDouble,
      })
    }

    if (clues.length > 0) {
      rounds.push({ round_name: name, categories, clues })
    }
  }

  if (rounds.length === 0) return null

  return {
    game_title: title,
    url: gameUrl,
    episode_number: episodeNumber,
    air_date: airDate,
    rounds,
  }
}

// ─── Storage helpers ─────────────────────────────────────────────────────────

async function downloadJson(supabase: ReturnType<typeof createClient>, path: string): Promise<unknown | null> {
  const { data, error } = await supabase.storage.from('data').download(path)
  if (error || !data) return null
  try {
    return JSON.parse(await data.text())
  } catch {
    return null
  }
}

async function uploadJson(supabase: ReturnType<typeof createClient>, path: string, data: unknown): Promise<void> {
  const jsonStr = JSON.stringify(data)
  const blob = new Blob([jsonStr], { type: 'application/json' })
  const { error } = await supabase.storage
    .from('data')
    .upload(path, blob, { contentType: 'application/json', upsert: true })
  if (error) {
    throw new Error(`Failed to upload ${path}: ${error.message}`)
  }
}

// ─── Category analysis ───────────────────────────────────────────────────────

function runCategoryAnalysis(games: Game[]) {
  const categories = {
    single: new Map<string, CategoryInstance[]>(),
    double: new Map<string, CategoryInstance[]>(),
    final: new Map<string, CategoryInstance[]>(),
  }

  for (const game of games) {
    if (!game.rounds) continue
    const showNumber = String(game.episode_number || 'unknown')
    const airDate = game.air_date || ''
    const gameTitle = game.game_title || ''

    for (const round of game.rounds) {
      const roundName = (round.round_name || '').toLowerCase()
      let roundType: 'single' | 'double' | 'final'
      if (roundName === 'double jeopardy') roundType = 'double'
      else if (roundName === 'final jeopardy') roundType = 'final'
      else roundType = 'single'

      if (roundType === 'final') {
        if (!round.categories?.length) continue
        const catName = round.categories[0].trim().toUpperCase()
        if (!catName) continue
        const clues = (round.clues || []).map((c) => ({
          text: c.text || '', answer: c.answer || '',
          value: 'Final Jeopardy', is_daily_double: false,
        }))
        if (!clues.length) continue
        const inst: CategoryInstance = { show_number: showNumber, game_title: gameTitle, air_date: airDate, clues }
        if (!categories.final.has(catName)) categories.final.set(catName, [])
        categories.final.get(catName)!.push(inst)
      } else {
        if (!round.categories) continue
        for (const categoryName of round.categories) {
          if (!categoryName) continue
          const catName = categoryName.trim().toUpperCase()
          if (!catName) continue
          const clues = (round.clues || [])
            .filter((c) => c.category && c.category.trim().toUpperCase() === catName)
            .map((c) => ({
              text: c.text || '', answer: c.answer || '',
              value: c.value || '', is_daily_double: c.is_daily_double || false,
            }))
          if (!clues.length) continue
          const inst: CategoryInstance = { show_number: showNumber, game_title: gameTitle, air_date: airDate, clues }
          const targetMap = categories[roundType]
          if (!targetMap.has(catName)) targetMap.set(catName, [])
          targetMap.get(catName)!.push(inst)
        }
      }
    }
  }

  const buildOutput = (catMap: Map<string, CategoryInstance[]>): Record<string, CategoryEntry> => {
    const sortedKeys = Array.from(catMap.keys()).sort()
    const result: Record<string, CategoryEntry> = {}
    for (const catName of sortedKeys) {
      const instances = catMap.get(catName)!.sort((a, b) => {
        const cmp = (a.show_number || '').localeCompare(b.show_number || '')
        return cmp !== 0 ? cmp : (a.air_date || '').localeCompare(b.air_date || '')
      })
      result[catName] = {
        category_name: catName,
        occurrences: instances.length,
        total_questions: instances.reduce((sum, i) => sum + i.clues.length, 0),
        instances,
      }
    }
    return result
  }

  return {
    single: buildOutput(categories.single),
    double: buildOutput(categories.double),
    final: buildOutput(categories.final),
  }
}

// ─── Main handler ────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }

  const startTime = Date.now()

  try {
    // Auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }
    const token = authHeader.replace('Bearer ', '')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Load progress
    let progress: ScrapeProgress = (await downloadJson(supabase, 'scrape_progress.json') as ScrapeProgress) || {
      seasons_complete: [],
      seasons_partial: {},
      total_games: 0,
      last_scrape: '',
    }

    // Fetch season list
    await sleep(REQUEST_DELAY_MS)
    const seasonsHtml = await fetchPage('listseasons.php')
    const seasonUrls = getSeasons(seasonsHtml)

    if (seasonUrls.length === 0) {
      return new Response(JSON.stringify({ error: 'Could not fetch season list from J-Archive' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Find next season to scrape
    let gamesScraped = 0
    let seasonsProcessed = 0

    for (let si = 0; si < seasonUrls.length; si++) {
      if (Date.now() - startTime > MAX_EXECUTION_MS) break
      if (gamesScraped >= MAX_GAMES_PER_INVOCATION) break

      const seasonUrl = seasonUrls[si]
      const seasonNum = si + 1

      // Skip fully completed seasons
      if (progress.seasons_complete.includes(seasonNum)) continue

      // Get game list for this season
      await sleep(REQUEST_DELAY_MS)
      const seasonHtml = await fetchPage(seasonUrl)
      const allGameUrls = getGameUrls(seasonHtml)

      if (allGameUrls.length === 0) {
        progress.seasons_complete.push(seasonNum)
        continue
      }

      // Load existing season data
      const existingGames: Game[] = (await downloadJson(supabase, `seasons/season_${String(seasonNum).padStart(2, '0')}.json`) as Game[]) || []
      const scrapedUrls = new Set(existingGames.map((g) => g.url))

      // Also check partial progress
      const partialUrls = new Set(progress.seasons_partial[seasonUrl] || [])
      for (const url of partialUrls) scrapedUrls.add(url)

      // Find games we haven't scraped yet
      const pendingGames = allGameUrls.filter((url) => !scrapedUrls.has(url))

      if (pendingGames.length === 0) {
        progress.seasons_complete.push(seasonNum)
        seasonsProcessed++
        continue
      }

      // Scrape a batch from this season
      const newGames: Game[] = []
      for (const gameUrl of pendingGames) {
        if (Date.now() - startTime > MAX_EXECUTION_MS) break
        if (gamesScraped >= MAX_GAMES_PER_INVOCATION) break

        try {
          await sleep(REQUEST_DELAY_MS)
          const gameHtml = await fetchPage(gameUrl)
          const game = parseGame(gameHtml, gameUrl)
          if (game) {
            newGames.push(game)
          }
          // Track this URL regardless of parse success
          if (!progress.seasons_partial[seasonUrl]) {
            progress.seasons_partial[seasonUrl] = []
          }
          progress.seasons_partial[seasonUrl].push(gameUrl)
          gamesScraped++
        } catch (e) {
          console.error(`Failed to scrape ${gameUrl}: ${(e as Error).message}`)
        }
      }

      // Save updated season data
      if (newGames.length > 0) {
        const updatedSeason = [...existingGames, ...newGames]
        await uploadJson(supabase, `seasons/season_${String(seasonNum).padStart(2, '0')}.json`, updatedSeason)
      }

      // Check if season is now complete
      const totalScraped = scrapedUrls.size + newGames.length
      if (totalScraped >= allGameUrls.length) {
        progress.seasons_complete.push(seasonNum)
        delete progress.seasons_partial[seasonUrl]
      }

      seasonsProcessed++
    }

    // Update progress
    progress.total_games += gamesScraped
    progress.last_scrape = new Date().toISOString()
    await uploadJson(supabase, 'scrape_progress.json', progress)

    // If we have data, combine seasons and run analysis
    // Only do full combine + analysis if we have at least some complete seasons
    if (progress.seasons_complete.length > 0) {
      // Combine all season data into parts (respecting 50MB limit)
      const allGames: Game[] = []
      for (let i = 1; i <= seasonUrls.length; i++) {
        if (Date.now() - startTime > MAX_EXECUTION_MS) break
        const seasonData = (await downloadJson(supabase, `seasons/season_${String(i).padStart(2, '0')}.json`) as Game[])
        if (seasonData) {
          allGames.push(...seasonData)
        }
      }

      if (allGames.length > 0) {
        // Upload combined data in parts if needed
        const fullJson = JSON.stringify(allGames)
        const totalBytes = new TextEncoder().encode(fullJson).length

        if (totalBytes <= MAX_PART_BYTES) {
          await uploadJson(supabase, 'jeopardy_complete.json', allGames)
        } else {
          // Split into parts
          const numParts = Math.ceil(totalBytes / MAX_PART_BYTES)
          const gamesPerPart = Math.ceil(allGames.length / numParts)
          for (let p = 0; p < numParts; p++) {
            const partGames = allGames.slice(p * gamesPerPart, (p + 1) * gamesPerPart)
            await uploadJson(supabase, `jeopardy_complete_part${p + 1}.json`, partGames)
          }
          // Upload a manifest
          await uploadJson(supabase, 'jeopardy_complete_manifest.json', {
            parts: numParts,
            total_games: allGames.length,
            updated: new Date().toISOString(),
          })
        }

        // Run category analysis
        const analysis = runCategoryAnalysis(allGames)
        await uploadJson(supabase, 'category_analysis/single_categories.json', analysis.single)
        await uploadJson(supabase, 'category_analysis/double_categories.json', analysis.double)
        await uploadJson(supabase, 'category_analysis/final_categories.json', analysis.final)
      }

      // Update last_updated
      const lastUpdated = new Date().toISOString()
      await uploadJson(supabase, 'category_analysis/last_updated.json', { lastUpdated })

      const totalSeasons = seasonUrls.length
      const completedSeasons = progress.seasons_complete.length
      const isFullyComplete = completedSeasons >= totalSeasons

      return new Response(
        JSON.stringify({
          success: true,
          message: isFullyComplete
            ? `Archive fully updated. ${progress.total_games} total games across ${completedSeasons} seasons.`
            : `Scraped ${gamesScraped} new games this run. ${completedSeasons}/${totalSeasons} seasons complete. Click again to continue.`,
          lastUpdated,
          gamesScraped,
          totalGames: progress.total_games,
          seasonsComplete: completedSeasons,
          totalSeasons,
          isFullyComplete,
        }),
        { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // No complete seasons yet but we scraped some games
    return new Response(
      JSON.stringify({
        success: true,
        message: `Scraped ${gamesScraped} games. Still building initial data. Click again to continue.`,
        lastUpdated: progress.last_scrape,
        gamesScraped,
        totalGames: progress.total_games,
        seasonsComplete: 0,
        totalSeasons: seasonUrls.length,
        isFullyComplete: false,
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
