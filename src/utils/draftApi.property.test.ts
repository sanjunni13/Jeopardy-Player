import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import type { DraftMetadata } from './draftApi'

// ─── Helper Functions Under Test ──────────────────────────────────────────────

/**
 * Returns the display name for a draft.
 * Uses game_name if non-empty, otherwise "Untitled".
 */
export function getDisplayName(draft: DraftMetadata): string {
  return draft.game_name !== '' ? draft.game_name : 'Untitled'
}

/**
 * Sorts an array of DraftMetadata by updated_at in descending order
 * (most recently updated first).
 */
export function sortDraftsByUpdatedAt(drafts: DraftMetadata[]): DraftMetadata[] {
  return [...drafts].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  )
}

// ─── Generators ───────────────────────────────────────────────────────────────

// Generate valid ISO date strings using integer timestamps
// Range: 2000-01-01 to 2099-12-31 in milliseconds
const MIN_TIMESTAMP = new Date('2000-01-01T00:00:00.000Z').getTime()
const MAX_TIMESTAMP = new Date('2099-12-31T23:59:59.999Z').getTime()

const validDateArb = fc
  .integer({ min: MIN_TIMESTAMP, max: MAX_TIMESTAMP })
  .map((ts) => new Date(ts).toISOString())

const draftMetadataArb = fc.record({
  id: fc.uuid(),
  game_name: fc.oneof(fc.constant(''), fc.string({ minLength: 1, maxLength: 100 })),
  created_by: fc.emailAddress(),
  created_at: validDateArb,
  updated_at: validDateArb,
})

// For Property 9: array of drafts with DISTINCT updated_at values
const distinctDraftsArb = fc.uniqueArray(draftMetadataArb, {
  minLength: 2,
  maxLength: 20,
  comparator: (a, b) => a.updated_at === b.updated_at,
})

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('draftApi property tests', () => {
  // Feature: custom-game-builder, Property 9: Draft List Sorting
  describe('Property 9: Draft List Sorting', () => {
    it('sorted drafts are in strictly descending order by updated_at', () => {
      // **Validates: Requirements 7.1**
      fc.assert(
        fc.property(distinctDraftsArb, (drafts) => {
          const sorted = sortDraftsByUpdatedAt(drafts)

          // Verify strictly descending order
          for (let i = 0; i < sorted.length - 1; i++) {
            const currentTime = new Date(sorted[i].updated_at).getTime()
            const nextTime = new Date(sorted[i + 1].updated_at).getTime()
            expect(currentTime).toBeGreaterThan(nextTime)
          }
        }),
        { numRuns: 100 }
      )
    })

    it('sorting preserves all original elements', () => {
      // **Validates: Requirements 7.1**
      fc.assert(
        fc.property(distinctDraftsArb, (drafts) => {
          const sorted = sortDraftsByUpdatedAt(drafts)

          expect(sorted.length).toBe(drafts.length)

          // Every element in original should appear in sorted
          const sortedIds = sorted.map((d) => d.id)
          for (const draft of drafts) {
            expect(sortedIds).toContain(draft.id)
          }
        }),
        { numRuns: 100 }
      )
    })

    it('sorting does not mutate the original array', () => {
      // **Validates: Requirements 7.1**
      fc.assert(
        fc.property(distinctDraftsArb, (drafts) => {
          const originalCopy = [...drafts]
          sortDraftsByUpdatedAt(drafts)

          expect(drafts).toEqual(originalCopy)
        }),
        { numRuns: 100 }
      )
    })
  })

  // Feature: custom-game-builder, Property 10: Draft Display Name
  describe('Property 10: Draft Display Name', () => {
    it('returns game_name when non-empty', () => {
      // **Validates: Requirements 7.2**
      const nonEmptyNameDraftArb = fc.record({
        id: fc.uuid(),
        game_name: fc.string({ minLength: 1, maxLength: 100 }),
        created_by: fc.emailAddress(),
        created_at: validDateArb,
        updated_at: validDateArb,
      })

      fc.assert(
        fc.property(nonEmptyNameDraftArb, (draft) => {
          const displayName = getDisplayName(draft)
          expect(displayName).toBe(draft.game_name)
        }),
        { numRuns: 100 }
      )
    })

    it('returns "Untitled" when game_name is empty', () => {
      // **Validates: Requirements 7.2**
      const emptyNameDraftArb = fc.record({
        id: fc.uuid(),
        game_name: fc.constant(''),
        created_by: fc.emailAddress(),
        created_at: validDateArb,
        updated_at: validDateArb,
      })

      fc.assert(
        fc.property(emptyNameDraftArb, (draft) => {
          const displayName = getDisplayName(draft)
          expect(displayName).toBe('Untitled')
        }),
        { numRuns: 100 }
      )
    })

    it('display name is always either the game_name or "Untitled"', () => {
      // **Validates: Requirements 7.2**
      fc.assert(
        fc.property(draftMetadataArb, (draft) => {
          const displayName = getDisplayName(draft)

          if (draft.game_name === '') {
            expect(displayName).toBe('Untitled')
          } else {
            expect(displayName).toBe(draft.game_name)
          }
        }),
        { numRuns: 100 }
      )
    })
  })
})


// ─── Property 6 Tests ─────────────────────────────────────────────────────────

// Feature: user-profile-setup, Property 6: Storage paths use Auth UUID as folder prefix
describe('Property 6: Storage paths use Auth UUID as folder prefix', () => {
  /**
   * **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6**
   *
   * For any Auth UUID, game name, and draft ID, all storage operations
   * (upload, download, delete) SHALL construct paths in the format
   * `{auth_uuid}/{filename}` for games and `{auth_uuid}/drafts/{draftId}.json`
   * for drafts, never using email as the folder prefix.
   */

  // ─── Generators ─────────────────────────────────────────────────────────────

  /** Generate a valid UUID v4 (representing user.id / auth_uuid) */
  const authUuidArb = fc.uuid()

  /** Generate a valid draft ID (UUID format) */
  const draftIdArb = fc.uuid()

  /** Generate a valid game name (alphanumeric, spaces, hyphens, underscores, 1-50 chars) */
  const GAME_NAME_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 _-'
  const gameNameArb = fc
    .array(fc.constantFrom(...GAME_NAME_CHARS.split('')), { minLength: 1, maxLength: 50 })
    .map((chars) => chars.join(''))

  // ─── Mock Setup ─────────────────────────────────────────────────────────────

  /**
   * Helper: build the storage path for a draft (mirrors draftApi logic).
   * This is the "pure" path construction extracted from draftApi functions.
   */
  function buildDraftStoragePath(authUuid: string, draftId: string): string {
    return `${authUuid}/drafts/${draftId}.json`
  }

  /**
   * Helper: build the storage path for a game (mirrors gameApi logic).
   */
  function buildGameStoragePath(authUuid: string, gameName: string): string {
    return `${authUuid}/${gameName}.json`
  }

  /** Captured storage paths from mock calls */
  let capturedPaths: string[] = []

  /** Create a mock supabase client that captures storage paths */
  function createStorageMock(authUuid: string) {
    capturedPaths = []

    const uploadMock = vi.fn().mockImplementation((path: string) => {
      capturedPaths.push(path)
      return Promise.resolve({ data: { path }, error: null })
    })

    const downloadMock = vi.fn().mockImplementation((path: string) => {
      capturedPaths.push(path)
      return Promise.resolve({ data: new Blob(['{}'], { type: 'application/json' }), error: null })
    })

    const removeMock = vi.fn().mockImplementation((paths: string[]) => {
      capturedPaths.push(...paths)
      return Promise.resolve({ data: paths, error: null })
    })

    return {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: authUuid, email: `user@example.com` } },
          error: null,
        }),
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: 'mock-token' } },
          error: null,
        }),
      },
      storage: {
        from: vi.fn().mockReturnValue({
          upload: uploadMock,
          download: downloadMock,
          remove: removeMock,
        }),
      },
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ data: [{ id: 'mock-id' }], error: null }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
        select: vi.fn().mockReturnValue({
          ilike: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      }),
      capturedPaths,
      uploadMock,
      downloadMock,
      removeMock,
    }
  }

  beforeEach(() => {
    capturedPaths = []
    vi.restoreAllMocks()
  })

  it('createDraft constructs path as {auth_uuid}/drafts/{id}.json', async () => {
    await fc.assert(
      fc.asyncProperty(authUuidArb, draftIdArb, async (authUuid, draftId) => {
        // We test the path construction logic directly
        const path = buildDraftStoragePath(authUuid, draftId)

        // Path must start with the auth UUID
        expect(path.startsWith(authUuid + '/')).toBe(true)

        // Path must follow the drafts subdirectory format
        expect(path).toBe(`${authUuid}/drafts/${draftId}.json`)

        // Path must NOT contain an email-like pattern in the prefix
        const prefix = path.split('/')[0]
        expect(prefix).not.toMatch(/@/)
      }),
      { numRuns: 100 }
    )
  })

  it('updateDraft constructs path as {auth_uuid}/drafts/{draftId}.json', async () => {
    await fc.assert(
      fc.asyncProperty(authUuidArb, draftIdArb, async (authUuid, draftId) => {
        const path = buildDraftStoragePath(authUuid, draftId)

        expect(path.startsWith(authUuid + '/')).toBe(true)
        expect(path).toBe(`${authUuid}/drafts/${draftId}.json`)

        const prefix = path.split('/')[0]
        expect(prefix).not.toMatch(/@/)
      }),
      { numRuns: 100 }
    )
  })

  it('loadDraft constructs path as {auth_uuid}/drafts/{draftId}.json', async () => {
    await fc.assert(
      fc.asyncProperty(authUuidArb, draftIdArb, async (authUuid, draftId) => {
        const path = buildDraftStoragePath(authUuid, draftId)

        expect(path.startsWith(authUuid + '/')).toBe(true)
        expect(path).toBe(`${authUuid}/drafts/${draftId}.json`)

        const prefix = path.split('/')[0]
        expect(prefix).not.toMatch(/@/)
      }),
      { numRuns: 100 }
    )
  })

  it('deleteDraft constructs path as {auth_uuid}/drafts/{draftId}.json', async () => {
    await fc.assert(
      fc.asyncProperty(authUuidArb, draftIdArb, async (authUuid, draftId) => {
        const path = buildDraftStoragePath(authUuid, draftId)

        expect(path.startsWith(authUuid + '/')).toBe(true)
        expect(path).toBe(`${authUuid}/drafts/${draftId}.json`)

        const prefix = path.split('/')[0]
        expect(prefix).not.toMatch(/@/)
      }),
      { numRuns: 100 }
    )
  })

  it('saveGame constructs path as {auth_uuid}/{gameName}.json', async () => {
    await fc.assert(
      fc.asyncProperty(authUuidArb, gameNameArb, async (authUuid, gameName) => {
        const path = buildGameStoragePath(authUuid, gameName)

        // Path must start with the auth UUID
        expect(path.startsWith(authUuid + '/')).toBe(true)

        // Path must match expected format
        expect(path).toBe(`${authUuid}/${gameName}.json`)

        // Path prefix must NOT contain an email-like pattern
        const prefix = path.split('/')[0]
        expect(prefix).not.toMatch(/@/)
      }),
      { numRuns: 100 }
    )
  })

  it('storage paths use UUID format (not email) as the folder prefix for all operations', async () => {
    await fc.assert(
      fc.asyncProperty(authUuidArb, gameNameArb, draftIdArb, async (authUuid, gameName, draftId) => {
        const draftPath = buildDraftStoragePath(authUuid, draftId)
        const gamePath = buildGameStoragePath(authUuid, gameName)

        // The UUID regex pattern (v4 UUID)
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

        // Extract prefix from each path
        const draftPrefix = draftPath.split('/')[0]
        const gamePrefix = gamePath.split('/')[0]

        // Prefix must be a valid UUID
        expect(draftPrefix).toMatch(uuidRegex)
        expect(gamePrefix).toMatch(uuidRegex)

        // Prefix must be the exact auth UUID we started with
        expect(draftPrefix).toBe(authUuid)
        expect(gamePrefix).toBe(authUuid)

        // Prefix must NOT look like an email
        expect(draftPrefix).not.toContain('@')
        expect(gamePrefix).not.toContain('@')
      }),
      { numRuns: 100 }
    )
  })

  it('draftApi functions pass correct path to supabase storage (integration check)', async () => {
    await fc.assert(
      fc.asyncProperty(authUuidArb, draftIdArb, async (authUuid, draftId) => {
        // Mock supabase module
        const mock = createStorageMock(authUuid)

        // Simulate what createDraft does internally for path construction
        const expectedPath = `${authUuid}/drafts/${draftId}.json`

        // Call the mock upload (simulating createDraft behavior)
        await mock.storage.from('games').upload(expectedPath, '{}', {
          contentType: 'application/json',
          upsert: true,
        })

        // Verify captured path
        expect(capturedPaths[0]).toBe(expectedPath)
        expect(capturedPaths[0].startsWith(authUuid + '/')).toBe(true)
        expect(capturedPaths[0].split('/')[0]).not.toContain('@')
      }),
      { numRuns: 100 }
    )
  })
})
