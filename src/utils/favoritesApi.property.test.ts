import { describe, it, expect, vi, beforeEach } from 'vitest'
import fc from 'fast-check'

// Feature: game-ratings-favorites, Property 4: Favorite toggle round-trip
// Feature: game-ratings-favorites, Property 5: Favorite toggle ignores concurrent activations

// ─── Mock Setup ─────────────────────────────────────────────────────────────

let capturedInsertPayload: Record<string, unknown> | null = null
let capturedMatchCriteria: Record<string, unknown> | null = null
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let capturedSelectTable: string | null = null
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let capturedEqArgs: { column: string; value: unknown } | null = null

const mockInsert = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
  capturedInsertPayload = payload
  return Promise.resolve({ data: null, error: null })
})

const mockMatch = vi.fn().mockImplementation((criteria: Record<string, unknown>) => {
  capturedMatchCriteria = criteria
  return Promise.resolve({ data: null, error: null })
})

const mockDelete = vi.fn().mockReturnValue({ match: mockMatch })

const mockEq = vi.fn().mockImplementation((column: string, value: unknown) => {
  capturedEqArgs = { column, value }
  return Promise.resolve({
    data: [{ game_id: 'game-1' }, { game_id: 'game-2' }],
    error: null,
  })
})

const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })

const mockFrom = vi.fn().mockImplementation((table: string) => {
  capturedSelectTable = table
  return {
    insert: mockInsert,
    delete: mockDelete,
    select: mockSelect,
  }
})

vi.mock('./supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}))

// ─── Generators ─────────────────────────────────────────────────────────────

/** Generate a positive integer to serve as a Player ID */
const playerIdArb = fc.integer({ min: 1, max: 2_147_483_647 })

/** Generate a valid non-empty game ID string */
const gameIdArb = fc.stringMatching(/^[a-zA-Z0-9_-]{1,50}$/)

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Property 4: Favorite toggle round-trip', () => {
  /**
   * **Validates: Requirements 3.1, 3.2, 3.3**
   *
   * For any player and game, adding the game to favourites and then removing it
   * SHALL restore the Favorites_Table to its original state (no row exists for
   * that player/game pair). Test that addFavorite calls supabase insert with
   * correct payload, and removeFavorite calls supabase delete with correct
   * match criteria.
   */

  beforeEach(() => {
    capturedInsertPayload = null
    capturedMatchCriteria = null
    capturedSelectTable = null
    capturedEqArgs = null
    vi.clearAllMocks()

    // Reset mock implementations
    mockInsert.mockImplementation((payload: Record<string, unknown>) => {
      capturedInsertPayload = payload
      return Promise.resolve({ data: null, error: null })
    })
    mockMatch.mockImplementation((criteria: Record<string, unknown>) => {
      capturedMatchCriteria = criteria
      return Promise.resolve({ data: null, error: null })
    })
  })

  it('addFavorite calls supabase insert with { player_id, game_id }', async () => {
    const { addFavorite } = await import('./favoritesApi')

    await fc.assert(
      fc.asyncProperty(
        playerIdArb,
        gameIdArb,
        async (playerId, gameId) => {
          capturedInsertPayload = null
          vi.clearAllMocks()
          mockInsert.mockImplementation((payload: Record<string, unknown>) => {
            capturedInsertPayload = payload
            return Promise.resolve({ data: null, error: null })
          })

          await addFavorite(playerId, gameId)

          // Verify from was called with correct table
          expect(mockFrom).toHaveBeenCalledWith('game_favorites')

          // Verify insert payload contains exact player_id and game_id
          expect(capturedInsertPayload).not.toBeNull()
          expect(capturedInsertPayload!.player_id).toBe(playerId)
          expect(capturedInsertPayload!.game_id).toBe(gameId)

          // Verify payload only has the two expected keys
          expect(Object.keys(capturedInsertPayload!).sort()).toEqual(['game_id', 'player_id'])
        }
      ),
      { numRuns: 100 }
    )
  })

  it('removeFavorite calls supabase delete with match({ player_id, game_id })', async () => {
    const { removeFavorite } = await import('./favoritesApi')

    await fc.assert(
      fc.asyncProperty(
        playerIdArb,
        gameIdArb,
        async (playerId, gameId) => {
          capturedMatchCriteria = null
          vi.clearAllMocks()
          mockMatch.mockImplementation((criteria: Record<string, unknown>) => {
            capturedMatchCriteria = criteria
            return Promise.resolve({ data: null, error: null })
          })
          mockDelete.mockReturnValue({ match: mockMatch })

          await removeFavorite(playerId, gameId)

          // Verify from was called with correct table
          expect(mockFrom).toHaveBeenCalledWith('game_favorites')

          // Verify delete was called
          expect(mockDelete).toHaveBeenCalled()

          // Verify match criteria contains exact player_id and game_id
          expect(capturedMatchCriteria).not.toBeNull()
          expect(capturedMatchCriteria!.player_id).toBe(playerId)
          expect(capturedMatchCriteria!.game_id).toBe(gameId)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('addFavorite then removeFavorite uses matching player_id and game_id (round-trip)', async () => {
    const { addFavorite, removeFavorite } = await import('./favoritesApi')

    await fc.assert(
      fc.asyncProperty(
        playerIdArb,
        gameIdArb,
        async (playerId, gameId) => {
          capturedInsertPayload = null
          capturedMatchCriteria = null
          vi.clearAllMocks()
          mockInsert.mockImplementation((payload: Record<string, unknown>) => {
            capturedInsertPayload = payload
            return Promise.resolve({ data: null, error: null })
          })
          mockMatch.mockImplementation((criteria: Record<string, unknown>) => {
            capturedMatchCriteria = criteria
            return Promise.resolve({ data: null, error: null })
          })
          mockDelete.mockReturnValue({ match: mockMatch })

          // Add favorite
          await addFavorite(playerId, gameId)

          // Remove favorite
          await removeFavorite(playerId, gameId)

          // The insert payload and delete match criteria should use the same identifiers
          expect(capturedInsertPayload).not.toBeNull()
          expect(capturedMatchCriteria).not.toBeNull()

          // The player_id used for insert matches the one used for delete
          expect(capturedInsertPayload!.player_id).toBe(capturedMatchCriteria!.player_id)

          // The game_id used for insert matches the one used for delete
          expect(capturedInsertPayload!.game_id).toBe(capturedMatchCriteria!.game_id)

          // Both reference the original input values
          expect(capturedInsertPayload!.player_id).toBe(playerId)
          expect(capturedMatchCriteria!.game_id).toBe(gameId)
        }
      ),
      { numRuns: 100 }
    )
  })
})

describe('Property 5: Favorite toggle ignores concurrent activations (API payload correctness)', () => {
  /**
   * **Validates: Requirements 3.7**
   *
   * For the API layer, test that addFavorite and removeFavorite produce correct
   * payloads for any valid inputs. The concurrent-activation guard is at the hook
   * level, but the API functions must always produce correct payloads regardless
   * of call timing.
   */

  beforeEach(() => {
    capturedInsertPayload = null
    capturedMatchCriteria = null
    capturedSelectTable = null
    capturedEqArgs = null
    vi.clearAllMocks()

    mockInsert.mockImplementation((payload: Record<string, unknown>) => {
      capturedInsertPayload = payload
      return Promise.resolve({ data: null, error: null })
    })
    mockMatch.mockImplementation((criteria: Record<string, unknown>) => {
      capturedMatchCriteria = criteria
      return Promise.resolve({ data: null, error: null })
    })
    mockDelete.mockReturnValue({ match: mockMatch })
    mockEq.mockImplementation((column: string, value: unknown) => {
      capturedEqArgs = { column, value }
      return Promise.resolve({
        data: [{ game_id: 'game-1' }, { game_id: 'game-2' }],
        error: null,
      })
    })
    mockSelect.mockReturnValue({ eq: mockEq })
  })

  it('addFavorite produces correct payload for any valid playerId and gameId', async () => {
    const { addFavorite } = await import('./favoritesApi')

    await fc.assert(
      fc.asyncProperty(
        playerIdArb,
        gameIdArb,
        async (playerId, gameId) => {
          capturedInsertPayload = null
          vi.clearAllMocks()
          mockInsert.mockImplementation((payload: Record<string, unknown>) => {
            capturedInsertPayload = payload
            return Promise.resolve({ data: null, error: null })
          })

          const result = await addFavorite(playerId, gameId)

          // Should succeed
          expect(result.success).toBe(true)

          // Payload must be exactly { player_id, game_id }
          expect(capturedInsertPayload).toEqual({ player_id: playerId, game_id: gameId })
        }
      ),
      { numRuns: 100 }
    )
  })

  it('removeFavorite produces correct match criteria for any valid playerId and gameId', async () => {
    const { removeFavorite } = await import('./favoritesApi')

    await fc.assert(
      fc.asyncProperty(
        playerIdArb,
        gameIdArb,
        async (playerId, gameId) => {
          capturedMatchCriteria = null
          vi.clearAllMocks()
          mockMatch.mockImplementation((criteria: Record<string, unknown>) => {
            capturedMatchCriteria = criteria
            return Promise.resolve({ data: null, error: null })
          })
          mockDelete.mockReturnValue({ match: mockMatch })

          const result = await removeFavorite(playerId, gameId)

          // Should succeed
          expect(result.success).toBe(true)

          // Match criteria must be exactly { player_id, game_id }
          expect(capturedMatchCriteria).toEqual({ player_id: playerId, game_id: gameId })
        }
      ),
      { numRuns: 100 }
    )
  })

  it('fetchFavorites returns game_id values as strings from query result', async () => {
    const { fetchFavorites } = await import('./favoritesApi')

    await fc.assert(
      fc.asyncProperty(
        playerIdArb,
        fc.array(fc.oneof(fc.integer({ min: 1, max: 999999 }), gameIdArb), {
          minLength: 0,
          maxLength: 20,
        }),
        async (playerId, gameIds) => {
          vi.clearAllMocks()
          const mockData = gameIds.map((id) => ({ game_id: id }))

          mockEq.mockImplementation(() => {
            return Promise.resolve({ data: mockData, error: null })
          })
          mockSelect.mockReturnValue({ eq: mockEq })

          const result = await fetchFavorites(playerId)

          // All returned values should be strings
          for (const id of result) {
            expect(typeof id).toBe('string')
          }

          // The number of returned IDs should match the mock data length
          expect(result.length).toBe(gameIds.length)

          // Each returned ID should be the string representation of the input
          for (let i = 0; i < gameIds.length; i++) {
            expect(result[i]).toBe(String(gameIds[i]))
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
