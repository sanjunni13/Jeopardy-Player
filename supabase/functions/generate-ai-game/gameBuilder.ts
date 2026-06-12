/**
 * Pure game construction logic for AI-generated Jeopardy games.
 * Extracted for independent testability.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GeminiCategory {
  name: string
  clues: Array<{ clue: string; solution: string }>
}

export interface GeminiFinal {
  category: string
  clue: string
  solution: string
}

export interface Clue {
  value: number
  clue: string
  solution: string
  dailyDouble: boolean
  html: boolean
}

export interface Category {
  category: string
  clues: Clue[]
}

export interface FinalRound {
  category: string
  clue: string
  solution: string
  html: boolean
}

export type RoundName = 'single' | 'double' | 'triple' | 'quadruple' | 'quintuple' | 'sextuple'

export interface NormalizedGame {
  rounds: Record<string, Category[]>
  final: FinalRound
  totalRounds: number
}

export interface BuildGameParams {
  rounds: number
  categoriesPerRound: number
  dailyDoublesPerRound: number
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const ROUND_NAMES: RoundName[] = ['single', 'double', 'triple', 'quadruple', 'quintuple', 'sextuple']
export const BASE_VALUES = [200, 400, 600, 800, 1000]

/**
 * The CORS headers applied to all Edge Function responses.
 */
export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Verifies that a response headers object includes the required CORS headers.
 */
export function hasCorsHeaders(headers: Record<string, string>): boolean {
  return (
    headers['Access-Control-Allow-Origin'] === '*' &&
    headers['Access-Control-Allow-Headers'] === 'authorization, x-client-info, apikey, content-type'
  )
}

// ─── Point Value Assignment ─────────────────────────────────────────────────

/**
 * Computes the point value for a clue given its row index (0-4) and round number (1-indexed).
 * Formula: BASE_VALUES[rowIndex] × roundNumber
 */
export function getPointValue(rowIndex: number, roundNumber: number): number {
  return BASE_VALUES[rowIndex] * roundNumber
}

// ─── Daily Double Placement ─────────────────────────────────────────────────

export interface CluePosition {
  categoryIndex: number
  clueIndex: number
}

/**
 * Places daily doubles for a single round, distributing across different categories first.
 * 
 * Algorithm:
 * 1. Build a list of all clue positions for the round
 * 2. Shuffle the list using the provided random function
 * 3. Pick positions preferring categories that don't already have a daily double
 * 4. If dailyDoublesPerRound > categoriesPerRound, wrap (some categories get multiple)
 * 5. No single category gets more than ceil(dailyDoublesPerRound / categoriesPerRound)
 * 
 * @param categoriesPerRound Number of categories in this round
 * @param cluesPerCategory Number of clues per category (always 5)
 * @param dailyDoublesPerRound Number of daily doubles to place
 * @param random A function returning a random number in [0, 1) - allows seeding for tests
 * @returns Array of positions where daily doubles should be placed
 */
export function placeDailyDoubles(
  categoriesPerRound: number,
  cluesPerCategory: number,
  dailyDoublesPerRound: number,
  random: () => number = Math.random
): CluePosition[] {
  if (dailyDoublesPerRound === 0) return []

  // Build all possible positions
  const allPositions: CluePosition[] = []
  for (let catIdx = 0; catIdx < categoriesPerRound; catIdx++) {
    for (let clueIdx = 0; clueIdx < cluesPerCategory; clueIdx++) {
      allPositions.push({ categoryIndex: catIdx, clueIndex: clueIdx })
    }
  }

  // Shuffle using Fisher-Yates
  for (let i = allPositions.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[allPositions[i], allPositions[j]] = [allPositions[j], allPositions[i]]
  }

  const maxPerCategory = Math.ceil(dailyDoublesPerRound / categoriesPerRound)
  const categoryCount: Record<number, number> = {}

  const selected: CluePosition[] = []

  // First pass: pick from categories that don't have a daily double yet
  for (const pos of allPositions) {
    if (selected.length >= dailyDoublesPerRound) break
    const count = categoryCount[pos.categoryIndex] || 0
    if (count === 0) {
      selected.push(pos)
      categoryCount[pos.categoryIndex] = 1
    }
  }

  // Second pass: if we still need more, pick from categories that haven't hit the max
  if (selected.length < dailyDoublesPerRound) {
    // Get positions not already selected
    const remaining = allPositions.filter(
      pos => !selected.some(s => s.categoryIndex === pos.categoryIndex && s.clueIndex === pos.clueIndex)
    )

    for (const pos of remaining) {
      if (selected.length >= dailyDoublesPerRound) break
      const count = categoryCount[pos.categoryIndex] || 0
      if (count < maxPerCategory) {
        selected.push(pos)
        categoryCount[pos.categoryIndex] = count + 1
      }
    }
  }

  return selected
}

// ─── Gemini Response Validation ──────────────────────────────────────────────

export interface GeminiResponseValidation {
  valid: boolean
  categories?: GeminiCategory[]
  final?: GeminiFinal
}

/**
 * Validates a parsed Gemini response against the expected schema.
 * Returns { valid: true, categories, final } if the response conforms,
 * or { valid: false } if it does not.
 */
export function validateGeminiResponse(
  data: unknown,
  expectedCategories: number
): GeminiResponseValidation {
  if (!data || typeof data !== 'object') return { valid: false }

  const obj = data as Record<string, unknown>

  // Validate categories array
  if (!Array.isArray(obj.categories) || obj.categories.length !== expectedCategories) {
    return { valid: false }
  }

  const categoryNames = new Set<string>()
  const categories: GeminiCategory[] = []

  for (const category of obj.categories) {
    const cat = category as Record<string, unknown>
    if (typeof cat.name !== 'string' || cat.name.trim() === '') return { valid: false }
    if (categoryNames.has(cat.name)) return { valid: false }
    categoryNames.add(cat.name)

    if (!Array.isArray(cat.clues) || cat.clues.length !== 5) return { valid: false }

    const clues: Array<{ clue: string; solution: string }> = []
    for (const clue of cat.clues) {
      const c = clue as Record<string, unknown>
      if (typeof c.clue !== 'string' || c.clue.trim() === '' ||
          typeof c.solution !== 'string' || c.solution.trim() === '') {
        return { valid: false }
      }
      clues.push({ clue: c.clue, solution: c.solution })
    }
    categories.push({ name: cat.name, clues })
  }

  // Validate final round
  const final = obj.final as Record<string, unknown> | undefined
  if (!final ||
      typeof final.category !== 'string' || final.category.trim() === '' ||
      typeof final.clue !== 'string' || final.clue.trim() === '' ||
      typeof final.solution !== 'string' || final.solution.trim() === '') {
    return { valid: false }
  }

  return {
    valid: true,
    categories,
    final: { category: final.category, clue: final.clue, solution: final.solution },
  }
}

// ─── Rate Limit Check ───────────────────────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean
  retryAfterSeconds?: number
}

/**
 * Determines whether a request should be rate-limited based on existing request timestamps.
 *
 * @param existingTimestamps Array of ISO timestamp strings for requests in the current window
 * @param maxRequests Maximum allowed requests in the window (10)
 * @param windowMs Window duration in milliseconds (60 * 60 * 1000)
 * @param now Current time in milliseconds
 * @returns Whether the request is allowed, and if not, how long until retry
 */
export function checkRateLimit(
  existingTimestamps: string[],
  maxRequests: number,
  windowMs: number,
  now: number
): RateLimitResult {
  if (existingTimestamps.length >= maxRequests) {
    // Sort ascending to get the oldest
    const sorted = [...existingTimestamps].sort()
    const oldestTime = new Date(sorted[0]).getTime()
    const retryAfterSeconds = Math.max(
      Math.ceil((oldestTime + windowMs - now) / 1000),
      1
    )
    return { allowed: false, retryAfterSeconds }
  }
  return { allowed: true }
}

// ─── Request Pipeline Phase ─────────────────────────────────────────────────

export type RequestPhase = 'cors' | 'auth' | 'rate_limit' | 'validate' | 'generate' | 'store'

/**
 * Determines which phase a request would reach based on its properties.
 * This models the Edge Function pipeline order for testability.
 *
 * Pipeline order: CORS → Auth → Rate Limit → Validate → Generate → Store
 * Unauthenticated requests stop at 'auth' and never reach 'rate_limit'.
 */
export function getRequestPhase(request: {
  method: string
  hasValidAuth: boolean
  isRateLimited: boolean
}): RequestPhase {
  if (request.method === 'OPTIONS') return 'cors'
  if (!request.hasValidAuth) return 'auth'
  if (request.isRateLimited) return 'rate_limit'
  return 'validate'
}

// ─── Error Response Sanitization ─────────────────────────────────────────────

/**
 * Builds a safe error response body, ensuring the API key never appears.
 * Used by the Edge Function to construct all error responses.
 */
export function buildErrorResponse(
  error: string,
  apiKey: string | undefined
): { error: string } {
  // If by any chance the error message contains the API key, redact it
  if (apiKey && error.includes(apiKey)) {
    error = error.replace(new RegExp(apiKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '[REDACTED]')
  }
  return { error }
}

/**
 * Checks whether a response body or headers contain an API key.
 * This is a verification function for testing purposes.
 */
export function responseContainsApiKey(
  responseBody: string,
  responseHeaders: Record<string, string>,
  apiKey: string
): boolean {
  if (!apiKey) return false
  if (responseBody.includes(apiKey)) return true
  for (const value of Object.values(responseHeaders)) {
    if (value.includes(apiKey)) return true
  }
  return false
}

// ─── Game Builder ───────────────────────────────────────────────────────────

/**
 * Builds a complete NormalizedGame object from Gemini API response data.
 * 
 * @param params The validated request parameters
 * @param geminiCategories Array of categories from Gemini (total = rounds × categoriesPerRound)
 * @param geminiFinal The final round data from Gemini
 * @param random Optional random function for daily double placement (allows seeding)
 * @returns A complete NormalizedGame object
 */
export function buildGame(
  params: BuildGameParams,
  geminiCategories: GeminiCategory[],
  geminiFinal: GeminiFinal,
  random: () => number = Math.random
): NormalizedGame {
  const rounds: Record<string, Category[]> = {}

  for (let roundIdx = 0; roundIdx < params.rounds; roundIdx++) {
    const roundNumber = roundIdx + 1
    const roundName = ROUND_NAMES[roundIdx]
    const startIdx = roundIdx * params.categoriesPerRound
    const roundCategories = geminiCategories.slice(startIdx, startIdx + params.categoriesPerRound)

    // Build categories with point values
    const categories: Category[] = roundCategories.map(cat => ({
      category: cat.name,
      clues: cat.clues.map((c, rowIdx) => ({
        value: getPointValue(rowIdx, roundNumber),
        clue: c.clue,
        solution: c.solution,
        dailyDouble: false,
        html: false,
      }))
    }))

    // Place daily doubles for this round
    const dailyDoublePositions = placeDailyDoubles(
      params.categoriesPerRound,
      5, // always 5 clues per category
      params.dailyDoublesPerRound,
      random
    )

    for (const pos of dailyDoublePositions) {
      categories[pos.categoryIndex].clues[pos.clueIndex].dailyDouble = true
    }

    rounds[roundName] = categories
  }

  const final: FinalRound = {
    category: geminiFinal.category,
    clue: geminiFinal.clue,
    solution: geminiFinal.solution,
    html: false,
  }

  return {
    rounds,
    final,
    totalRounds: params.rounds,
  }
}
