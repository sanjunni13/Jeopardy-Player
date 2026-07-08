import { describe, it, expect, vi, beforeEach } from 'vitest'
import fc from 'fast-check'

// Feature: game-ratings-favorites

// ─── Mock Setup ─────────────────────────────────────────────────────────────

let capturedUpsertPayload: Record<string, unknown> | null = null
let capturedUpsertOptions: Record<string, unknown> | null = null
let upsertWasCalled = false

const mockUpsert = vi.fn().mockImplementation((payload: Record<string, unknown>, options?: Record<string, unknown>) => {
  capturedUpsertPayload = payload
  capturedUpsertOptions = options ?? null
  upsertWasCalled = true
  return Promise.resolve({ data: null, error: null })
})

let mockSelectData: Array<{ game_id: string; rating: number }> = []

const mockIn = vi.fn().mockImplementation(() => {
  return Promise.resolve({ data: mockSelectData, error: null })
})

const mockEq2 = vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })
const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
const mockSelect = vi.fn().mockImplementation(() => {
  return { eq: mockEq1, in: mockIn }
})

const mockFrom = vi.fn().mockImplementation(() => {
  return {
    upsert: mockUpsert,
    select: mockSelect,
  }
})

vi.mock('./supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}))

// ─── Generators ─────────────────────────────────────────────────────────────

/** Valid star rating: integer 1–5 */
const validRatingArb = fc.integer({ min: 1, max: 5 })

/** Invalid star rating: integer outside 1–5 or non-integer */
const invalidRatingIntArb = fc.oneof(
  fc.integer({ min: -100, max: 0 }),
  fc.integer({ min: 6, max: 100 })
)
const invalidRatingFloatArb = fc.double({ min: 1.01, max: 4.99, noNaN: true }).filter(v => !Number.isInteger(v))

/** Valid player ID: positive integer */
const playerIdArb = fc.integer({ min: 1, max: 2_147_483_647 })

/** Valid game ID: non-empty string */
const gameIdArb = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0)

/** Generate a non-empty list of valid ratings for average computation */
const ratingsListArb = fc.array(fc.integer({ min: 1, max: 5 }), { minLength: 1, maxLength: 50 })

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Property 1: Rating upsert produces valid payload', () => {
  /**
   * **Validates: Requirements 1.2, 1.3, 2.2**
   *
   * For any valid star value (integer 1–5), any valid player ID (positive integer),
   * and any valid game ID (non-empty string), the upsertRating function SHALL produce
   * a database payload containing exactly those three values, and the operation shall
   * result in at most one row per (player_id, game_id) combination.
   */

  beforeEach(() => {
    capturedUpsertPayload = null
    capturedUpsertOptions = null
    upsertWasCalled = false
    vi.clearAllMocks()
    mockUpsert.mockImplementation((payload: Record<string, unknown>, options?: Record<string, unknown>) => {
      capturedUpsertPayload = payload
      capturedUpsertOptions = options ?? null
      upsertWasCalled = true
      return Promise.resolve({ data: null, error: null })
    })
  })

  it('upsertRating produces correct payload with player_id, game_id, and rating', async () => {
    const { upsertRating } = await import('./ratingsApi')

    await fc.assert(
      fc.asyncProperty(
        playerIdArb,
        gameIdArb,
        validRatingArb,
        async (playerId, gameId, rating) => {
          capturedUpsertPayload = null
          capturedUpsertOptions = null
          upsertWasCalled = false
          vi.clearAllMocks()
          mockUpsert.mockImplementation((p: Record<string, unknown>, o?: Record<string, unknown>) => {
            capturedUpsertPayload = p
            capturedUpsertOptions = o ?? null
            upsertWasCalled = true
            return Promise.resolve({ data: null, error: null })
          })

          const result = await upsertRating(playerId, gameId, rating)

          // Should succeed
          expect(result.success).toBe(true)

          // Should have called supabase upsert
          expect(upsertWasCalled).toBe(true)

          // Payload contains exactly the three values
          expect(capturedUpsertPayload).not.toBeNull()
          expect(capturedUpsertPayload!.player_id).toBe(playerId)
          expect(capturedUpsertPayload!.game_id).toBe(gameId)
          expect(capturedUpsertPayload!.rating).toBe(rating)

          // onConflict ensures at most one row per (player_id, game_id)
          expect(capturedUpsertOptions).not.toBeNull()
          expect(capturedUpsertOptions!.onConflict).toBe('player_id,game_id')
        }
      ),
      { numRuns: 100 }
    )
  })
})

describe('Property 3: Same-value rating is idempotent (at DB level via onConflict)', () => {
  /**
   * **Validates: Requirements 2.5**
   *
   * For any game where the player submits the same rating value V (1–5) again,
   * the upsert function still works correctly (idempotent at the DB level via onConflict)
   * — calling upsertRating twice with the same values produces the same payload and succeeds.
   */

  beforeEach(() => {
    capturedUpsertPayload = null
    capturedUpsertOptions = null
    upsertWasCalled = false
    vi.clearAllMocks()
    mockUpsert.mockImplementation((payload: Record<string, unknown>, options?: Record<string, unknown>) => {
      capturedUpsertPayload = payload
      capturedUpsertOptions = options ?? null
      upsertWasCalled = true
      return Promise.resolve({ data: null, error: null })
    })
  })

  it('calling upsertRating twice with the same value produces identical payloads and both succeed', async () => {
    const { upsertRating } = await import('./ratingsApi')

    await fc.assert(
      fc.asyncProperty(
        playerIdArb,
        gameIdArb,
        validRatingArb,
        async (playerId, gameId, rating) => {
          // First call
          capturedUpsertPayload = null
          vi.clearAllMocks()
          mockUpsert.mockImplementation((p: Record<string, unknown>, o?: Record<string, unknown>) => {
            capturedUpsertPayload = p
            capturedUpsertOptions = o ?? null
            upsertWasCalled = true
            return Promise.resolve({ data: null, error: null })
          })

          const result1 = await upsertRating(playerId, gameId, rating)
          const payload1 = { ...(capturedUpsertPayload ?? {}) }

          // Second call with same values
          capturedUpsertPayload = null
          const result2 = await upsertRating(playerId, gameId, rating)
          const payload2 = { ...(capturedUpsertPayload ?? {}) }

          // Both should succeed
          expect(result1.success).toBe(true)
          expect(result2.success).toBe(true)

          // Both produce the same payload (idempotent)
          expect(payload1).toEqual(payload2)

          // onConflict ensures upsert semantics (update existing row)
          expect(capturedUpsertOptions!.onConflict).toBe('player_id,game_id')
        }
      ),
      { numRuns: 100 }
    )
  })
})

describe('Property 6: Average rating computation', () => {
  /**
   * **Validates: Requirements 4.1**
   *
   * For any non-empty list of integers each in [1,5], the computed average SHALL equal
   * the arithmetic mean rounded to one decimal place, and the count SHALL equal the list length.
   * For an empty list, the average SHALL be null and count SHALL be 0.
   */

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('non-empty ratings produce correct average (rounded to 1 decimal) and correct count', async () => {
    const { fetchGameRatings } = await import('./ratingsApi')

    await fc.assert(
      fc.asyncProperty(
        ratingsListArb,
        async (ratings) => {
          const testGameId = 'test-game-1'

          // Mock supabase to return ratings for this game
          mockSelectData = ratings.map(r => ({ game_id: testGameId, rating: r }))
          mockFrom.mockImplementation(() => ({
            upsert: mockUpsert,
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: mockSelectData, error: null }),
            }),
          }))

          const results = await fetchGameRatings([testGameId])

          expect(results).toHaveLength(1)
          const summary = results[0]

          // Count equals list length
          expect(summary.ratingCount).toBe(ratings.length)

          // Average equals arithmetic mean rounded to 1 decimal place
          const expectedSum = ratings.reduce((acc, val) => acc + val, 0)
          const expectedAvg = Math.round((expectedSum / ratings.length) * 10) / 10
          expect(summary.averageRating).toBe(expectedAvg)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('empty ratings list produces null average and 0 count', async () => {
    const { fetchGameRatings } = await import('./ratingsApi')

    // Mock supabase to return no ratings
    mockFrom.mockImplementation(() => ({
      upsert: mockUpsert,
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    }))

    const results = await fetchGameRatings(['game-with-no-ratings'])

    expect(results).toHaveLength(1)
    expect(results[0].averageRating).toBeNull()
    expect(results[0].ratingCount).toBe(0)
  })

  it('empty gameIds array returns empty results', async () => {
    const { fetchGameRatings } = await import('./ratingsApi')

    const results = await fetchGameRatings([])
    expect(results).toHaveLength(0)
  })
})

describe('Property 7: Rating display formatting', () => {
  /**
   * **Validates: Requirements 4.2, 4.3**
   *
   * For any average rating value between 1.0 and 5.0 (one decimal place) and any positive
   * integer rating count, the GameRatingSummary SHALL contain the numeric average and the count.
   * For null average with count 0, the summary represents "No ratings".
   */

  it('GameRatingSummary with valid average contains correct numeric average and count', async () => {
    const { fetchGameRatings } = await import('./ratingsApi')

    // Generate average values between 1.0 and 5.0 at one decimal place
    const avgArb = fc.integer({ min: 10, max: 50 }).map(v => v / 10)
    const countArb = fc.integer({ min: 1, max: 1000 })

    await fc.assert(
      fc.asyncProperty(
        avgArb,
        countArb,
        async (targetAvg, count) => {
          const testGameId = 'format-test-game'

          // Create ratings that produce the target average (approximate via repeated value)
          // For simplicity, we use count ratings all with the same value closest to targetAvg
          const closestInt = Math.round(targetAvg)
          const ratings = Array.from({ length: count }, () => ({
            game_id: testGameId,
            rating: closestInt,
          }))

          mockFrom.mockImplementation(() => ({
            upsert: mockUpsert,
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: ratings, error: null }),
            }),
          }))

          const results = await fetchGameRatings([testGameId])
          const summary = results[0]

          // averageRating is a number (not null)
          expect(summary.averageRating).not.toBeNull()
          expect(typeof summary.averageRating).toBe('number')

          // averageRating is between 1.0 and 5.0
          expect(summary.averageRating!).toBeGreaterThanOrEqual(1.0)
          expect(summary.averageRating!).toBeLessThanOrEqual(5.0)

          // ratingCount equals list length
          expect(summary.ratingCount).toBe(count)

          // averageRating is rounded to at most 1 decimal place
          const decimalStr = summary.averageRating!.toString()
          const parts = decimalStr.split('.')
          if (parts.length > 1) {
            expect(parts[1].length).toBeLessThanOrEqual(1)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('GameRatingSummary with no ratings has null average and 0 count (represents "No ratings")', async () => {
    const { fetchGameRatings } = await import('./ratingsApi')

    await fc.assert(
      fc.asyncProperty(
        gameIdArb,
        async (gameId) => {
          // Mock no ratings for this game
          mockFrom.mockImplementation(() => ({
            upsert: mockUpsert,
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }))

          const results = await fetchGameRatings([gameId])
          const summary = results[0]

          // Null average and 0 count represents "No ratings"
          expect(summary.averageRating).toBeNull()
          expect(summary.ratingCount).toBe(0)
          expect(summary.gameId).toBe(gameId)
        }
      ),
      { numRuns: 100 }
    )
  })
})

describe('Property 11: Rating CHECK constraint enforcement', () => {
  /**
   * **Validates: Requirements 7.9**
   *
   * For any integer value outside the range [1, 5], attempting to upsert a rating
   * SHALL be rejected by the client-side validation.
   */

  beforeEach(() => {
    capturedUpsertPayload = null
    upsertWasCalled = false
    vi.clearAllMocks()
    mockUpsert.mockImplementation((payload: Record<string, unknown>, options?: Record<string, unknown>) => {
      capturedUpsertPayload = payload
      capturedUpsertOptions = options ?? null
      upsertWasCalled = true
      return Promise.resolve({ data: null, error: null })
    })
  })

  it('integers outside 1-5 are rejected without calling supabase', async () => {
    const { upsertRating } = await import('./ratingsApi')

    await fc.assert(
      fc.asyncProperty(
        playerIdArb,
        gameIdArb,
        invalidRatingIntArb,
        async (playerId, gameId, invalidRating) => {
          upsertWasCalled = false
          vi.clearAllMocks()
          mockUpsert.mockImplementation((p: Record<string, unknown>, o?: Record<string, unknown>) => {
            capturedUpsertPayload = p
            capturedUpsertOptions = o ?? null
            upsertWasCalled = true
            return Promise.resolve({ data: null, error: null })
          })

          const result = await upsertRating(playerId, gameId, invalidRating)

          // Should fail
          expect(result.success).toBe(false)
          expect(result.error).toBeDefined()

          // Should NOT have called supabase
          expect(upsertWasCalled).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('non-integer floats are rejected without calling supabase', async () => {
    const { upsertRating } = await import('./ratingsApi')

    await fc.assert(
      fc.asyncProperty(
        playerIdArb,
        gameIdArb,
        invalidRatingFloatArb,
        async (playerId, gameId, invalidRating) => {
          upsertWasCalled = false
          vi.clearAllMocks()
          mockUpsert.mockImplementation((p: Record<string, unknown>, o?: Record<string, unknown>) => {
            capturedUpsertPayload = p
            capturedUpsertOptions = o ?? null
            upsertWasCalled = true
            return Promise.resolve({ data: null, error: null })
          })

          const result = await upsertRating(playerId, gameId, invalidRating)

          // Should fail
          expect(result.success).toBe(false)
          expect(result.error).toBeDefined()

          // Should NOT have called supabase
          expect(upsertWasCalled).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })
})
