import { describe, it, expect, vi, beforeEach } from 'vitest'
import fc from 'fast-check'

// Feature: user-profile-setup, Property 4: Game ownership uses numeric Player ID resolved from Auth UUID

// ─── Mock Setup ─────────────────────────────────────────────────────────────

// Capture arguments passed to supabase operations
let capturedStoragePath: string | null = null
let capturedInsertPayload: Record<string, unknown> | null = null

const mockSingle = vi.fn().mockResolvedValue({ data: { id: 'game-uuid-123' }, error: null })
const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
const mockInsert = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
  capturedInsertPayload = payload
  return { select: mockSelect }
})

const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
const mockIlike = vi.fn().mockReturnValue({ eq: mockEq })
const mockQuerySelect = vi.fn().mockReturnValue({ ilike: mockIlike })

const mockFrom = vi.fn().mockImplementation((table: string) => {
  if (table === 'games') {
    // Differentiate between select (duplicate check) and insert calls
    return {
      select: mockQuerySelect,
      insert: mockInsert,
    }
  }
  return { select: mockQuerySelect, insert: mockInsert }
})

const mockUpload = vi.fn().mockImplementation((path: string) => {
  capturedStoragePath = path
  return Promise.resolve({ data: { path }, error: null })
})

const mockStorageFrom = vi.fn().mockReturnValue({
  upload: mockUpload,
  remove: vi.fn().mockResolvedValue({ data: null, error: null }),
})

let mockUserId = ''
const mockGetUser = vi.fn()

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getUser: () => mockGetUser(),
    },
    from: (...args: unknown[]) => mockFrom(...args),
    storage: {
      from: (...args: unknown[]) => mockStorageFrom(...args),
    },
  },
}))

// ─── Generators ─────────────────────────────────────────────────────────────

/** Generate a valid UUID v4 string */
const uuidArb = fc.uuid()

/** Generate a positive integer to serve as a Player ID */
const playerIdArb = fc.integer({ min: 1, max: 2_147_483_647 })

/** Generate a valid game name (alphanumeric, spaces, hyphens, underscores, 1-100 chars) */
const VALID_GAME_NAME_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 _-'
const validGameNameChar = fc.constantFrom(...VALID_GAME_NAME_CHARS.split(''))
const gameNameArb = fc
  .array(validGameNameChar, { minLength: 1, maxLength: 50 })
  .map(chars => chars.join(''))
  .filter(s => s.trim().length >= 1)

/** Generate minimal NormalizedGame data */
const normalizedGameArb = fc.record({
  rounds: fc.dictionary(
    fc.stringMatching(/^round[1-3]$/),
    fc.constant([]),
    { minKeys: 1, maxKeys: 3 }
  ),
})

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Property 4: Game ownership uses numeric Player ID resolved from Auth UUID', () => {
  /**
   * **Validates: Requirements 4.1, 5.1, 5.2, 5.3**
   *
   * For any authenticated user whose Auth UUID maps to a player record,
   * all game insert operations (client `saveGame`) SHALL set `games.created_by`
   * to the numeric Player ID from that player record, never the email string
   * or Auth UUID.
   */

  beforeEach(() => {
    capturedStoragePath = null
    capturedInsertPayload = null
    mockUserId = ''
    vi.clearAllMocks()

    // Reset mock chain
    mockSingle.mockResolvedValue({ data: { id: 'game-uuid-123' }, error: null })
    mockMaybeSingle.mockResolvedValue({ data: null, error: null })
  })

  it('insert payload uses numeric playerId as created_by, not email or UUID', async () => {
    const { saveGame } = await import('./gameApi')

    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        playerIdArb,
        gameNameArb,
        normalizedGameArb,
        async (authUuid, playerId, gameName, gameData) => {
          // Reset captured values
          capturedInsertPayload = null
          capturedStoragePath = null
          mockUserId = authUuid

          // Setup mock user with Auth UUID
          mockGetUser.mockResolvedValue({
            data: {
              user: {
                id: authUuid,
                email: `user-${authUuid.substring(0, 8)}@example.com`,
              },
            },
          })

          // Reset mock chain for fresh call
          mockMaybeSingle.mockResolvedValue({ data: null, error: null })
          mockSingle.mockResolvedValue({ data: { id: 'game-uuid-123' }, error: null })

          await saveGame(gameName, gameData as never, playerId)

          // Verify insert was called with numeric Player ID
          expect(capturedInsertPayload).not.toBeNull()
          expect(capturedInsertPayload!.created_by).toBe(playerId)

          // Verify created_by is a number, not a string (not email or UUID)
          expect(typeof capturedInsertPayload!.created_by).toBe('number')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('storage path uses Auth UUID (user.id) as folder prefix, not email', async () => {
    const { saveGame } = await import('./gameApi')

    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        playerIdArb,
        gameNameArb,
        normalizedGameArb,
        async (authUuid, playerId, gameName, gameData) => {
          // Reset captured values
          capturedInsertPayload = null
          capturedStoragePath = null
          mockUserId = authUuid

          // Setup mock user with Auth UUID and an email
          const email = `user-${authUuid.substring(0, 8)}@example.com`
          mockGetUser.mockResolvedValue({
            data: {
              user: {
                id: authUuid,
                email,
              },
            },
          })

          // Reset mock chain for fresh call
          mockMaybeSingle.mockResolvedValue({ data: null, error: null })
          mockSingle.mockResolvedValue({ data: { id: 'game-uuid-123' }, error: null })

          await saveGame(gameName, gameData as never, playerId)

          // Verify storage path starts with Auth UUID, not email
          expect(capturedStoragePath).not.toBeNull()
          expect(capturedStoragePath!.startsWith(`${authUuid}/`)).toBe(true)

          // Verify email is NOT used as folder prefix
          expect(capturedStoragePath!.startsWith(`${email}/`)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('created_by is never set to an email string or Auth UUID string', async () => {
    const { saveGame } = await import('./gameApi')

    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        playerIdArb,
        gameNameArb,
        normalizedGameArb,
        async (authUuid, playerId, gameName, gameData) => {
          // Reset captured values
          capturedInsertPayload = null
          capturedStoragePath = null

          const email = `player-${authUuid.substring(0, 8)}@test.com`
          mockGetUser.mockResolvedValue({
            data: {
              user: { id: authUuid, email },
            },
          })

          mockMaybeSingle.mockResolvedValue({ data: null, error: null })
          mockSingle.mockResolvedValue({ data: { id: 'game-uuid-123' }, error: null })

          await saveGame(gameName, gameData as never, playerId)

          // Verify created_by is not a UUID string
          expect(capturedInsertPayload).not.toBeNull()
          expect(capturedInsertPayload!.created_by).not.toBe(authUuid)

          // Verify created_by is not an email string
          expect(capturedInsertPayload!.created_by).not.toBe(email)

          // Verify created_by equals the numeric playerId
          expect(capturedInsertPayload!.created_by).toBe(playerId)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// Feature: user-profile-setup, Property 5: Duplicate game name check is scoped to Player ID

describe('Property 5: Duplicate game name check is scoped to Player ID', () => {
  /**
   * **Validates: Requirements 4.2**
   *
   * For any game name and authenticated user with a known Player ID,
   * the duplicate name check SHALL query only games where `created_by`
   * equals that Player ID, ensuring that users with different Player IDs
   * can have games with the same name.
   */

  beforeEach(() => {
    capturedStoragePath = null
    capturedInsertPayload = null
    mockUserId = ''
    vi.clearAllMocks()

    // Reset mock chain
    mockSingle.mockResolvedValue({ data: { id: 'game-uuid-123' }, error: null })
    mockMaybeSingle.mockResolvedValue({ data: null, error: null })
  })

  it('duplicate check queries with .eq("created_by", playerId) for numeric Player ID', async () => {
    const { saveGame } = await import('./gameApi')

    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        playerIdArb,
        gameNameArb,
        normalizedGameArb,
        async (authUuid, playerId, gameName, gameData) => {
          // Reset mocks for each iteration
          vi.clearAllMocks()
          capturedInsertPayload = null
          capturedStoragePath = null

          mockGetUser.mockResolvedValue({
            data: {
              user: {
                id: authUuid,
                email: `user-${authUuid.substring(0, 8)}@example.com`,
              },
            },
          })

          mockMaybeSingle.mockResolvedValue({ data: null, error: null })
          mockSingle.mockResolvedValue({ data: { id: 'game-uuid-123' }, error: null })

          await saveGame(gameName, gameData as never, playerId)

          // Verify .eq was called with 'created_by' and the numeric playerId
          expect(mockEq).toHaveBeenCalledWith('created_by', playerId)

          // Verify the playerId passed to .eq is a number
          const eqCall = mockEq.mock.calls[0]
          expect(eqCall[0]).toBe('created_by')
          expect(typeof eqCall[1]).toBe('number')
          expect(eqCall[1]).toBe(playerId)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('duplicate check uses .ilike("game_name", gameName) for case-insensitive comparison', async () => {
    const { saveGame } = await import('./gameApi')

    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        playerIdArb,
        gameNameArb,
        normalizedGameArb,
        async (authUuid, playerId, gameName, gameData) => {
          // Reset mocks for each iteration
          vi.clearAllMocks()
          capturedInsertPayload = null
          capturedStoragePath = null

          mockGetUser.mockResolvedValue({
            data: {
              user: {
                id: authUuid,
                email: `user-${authUuid.substring(0, 8)}@example.com`,
              },
            },
          })

          mockMaybeSingle.mockResolvedValue({ data: null, error: null })
          mockSingle.mockResolvedValue({ data: { id: 'game-uuid-123' }, error: null })

          await saveGame(gameName, gameData as never, playerId)

          // Verify .ilike was called with 'game_name' and the gameName
          expect(mockIlike).toHaveBeenCalledWith('game_name', gameName)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('duplicate check always scopes to the provided playerId, not a different ID', async () => {
    const { saveGame } = await import('./gameApi')

    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        playerIdArb,
        playerIdArb,
        gameNameArb,
        normalizedGameArb,
        async (authUuid, playerId, otherPlayerId, gameName, gameData) => {
          // Skip if IDs are the same (we want to test that it's specifically the passed playerId)
          fc.pre(playerId !== otherPlayerId)

          // Reset mocks for each iteration
          vi.clearAllMocks()
          capturedInsertPayload = null
          capturedStoragePath = null

          mockGetUser.mockResolvedValue({
            data: {
              user: {
                id: authUuid,
                email: `user-${authUuid.substring(0, 8)}@example.com`,
              },
            },
          })

          mockMaybeSingle.mockResolvedValue({ data: null, error: null })
          mockSingle.mockResolvedValue({ data: { id: 'game-uuid-123' }, error: null })

          await saveGame(gameName, gameData as never, playerId)

          // Verify .eq was called with the correct playerId, not some other ID
          expect(mockEq).toHaveBeenCalledWith('created_by', playerId)
          expect(mockEq).not.toHaveBeenCalledWith('created_by', otherPlayerId)
        }
      ),
      { numRuns: 100 }
    )
  })
})
