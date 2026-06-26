import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock Setup ─────────────────────────────────────────────────────────────

const mockNeq = vi.fn()
const mockIlike = vi.fn().mockReturnValue({ neq: mockNeq })
const mockSelectQuery = vi.fn().mockReturnValue({ ilike: mockIlike })

const mockUpdateEq = vi.fn()
const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq })

const mockDeleteEq = vi.fn()
const mockDelete = vi.fn().mockReturnValue({ eq: mockDeleteEq })

const mockFrom = vi.fn().mockImplementation(() => ({
  select: mockSelectQuery,
  update: mockUpdate,
  delete: mockDelete,
}))

const mockStorageRemove = vi.fn()
const mockStorageFrom = vi.fn().mockReturnValue({
  remove: mockStorageRemove,
})

const mockFunctionsInvoke = vi.fn()

vi.mock('./supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    storage: {
      from: (...args: unknown[]) => mockStorageFrom(...args),
    },
    functions: {
      invoke: (...args: unknown[]) => mockFunctionsInvoke(...args),
    },
  },
}))

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('updatePlayerName', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNeq.mockResolvedValue({ data: [], error: null })
    mockUpdateEq.mockResolvedValue({ error: null })
  })

  it('returns success when name is valid and unique', async () => {
    const { updatePlayerName } = await import('./settingsApi')

    mockNeq.mockResolvedValue({ data: [], error: null })
    mockUpdateEq.mockResolvedValue({ error: null })

    const result = await updatePlayerName(1, 'NewValidName')

    expect(result).toEqual({ success: true })
    expect(mockFrom).toHaveBeenCalledWith('players')
    expect(mockSelectQuery).toHaveBeenCalledWith('id')
    expect(mockIlike).toHaveBeenCalledWith('player_name', 'NewValidName')
    expect(mockNeq).toHaveBeenCalledWith('id', 1)
    expect(mockUpdate).toHaveBeenCalledWith({ player_name: 'NewValidName' })
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 1)
  })

  it('returns error when name is empty', async () => {
    const { updatePlayerName } = await import('./settingsApi')

    const result = await updatePlayerName(1, '   ')

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns error when name is too long (over 50 characters)', async () => {
    const { updatePlayerName } = await import('./settingsApi')

    const longName = 'a'.repeat(51)
    const result = await updatePlayerName(1, longName)

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns error when name contains invalid characters', async () => {
    const { updatePlayerName } = await import('./settingsApi')

    const result = await updatePlayerName(1, 'Invalid@Name!')

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns error when name is already taken (duplicate found)', async () => {
    const { updatePlayerName } = await import('./settingsApi')

    mockNeq.mockResolvedValue({ data: [{ id: 99 }], error: null })

    const result = await updatePlayerName(1, 'TakenName')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Player name is already taken')
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('returns error when DB update fails', async () => {
    const { updatePlayerName } = await import('./settingsApi')

    mockNeq.mockResolvedValue({ data: [], error: null })
    mockUpdateEq.mockResolvedValue({ error: { message: 'DB connection lost' } })

    const result = await updatePlayerName(1, 'ValidName')

    expect(result.success).toBe(false)
    expect(result.error).toContain('Failed to update player name')
  })

  it('returns error when uniqueness lookup fails', async () => {
    const { updatePlayerName } = await import('./settingsApi')

    mockNeq.mockResolvedValue({ data: null, error: { message: 'Query timeout' } })

    const result = await updatePlayerName(1, 'ValidName')

    expect(result.success).toBe(false)
    expect(result.error).toContain('Failed to check name availability')
  })

  it('returns error on network failure', async () => {
    const { updatePlayerName } = await import('./settingsApi')

    mockNeq.mockRejectedValue(new Error('Network error'))

    const result = await updatePlayerName(1, 'ValidName')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Network error. Please try again.')
  })
})

describe('deleteGame', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDeleteEq.mockResolvedValue({ error: null })
    mockStorageRemove.mockResolvedValue({ error: null })
  })

  it('returns success when DB delete and storage delete both succeed', async () => {
    const { deleteGame } = await import('./settingsApi')

    mockDeleteEq.mockResolvedValue({ error: null })
    mockStorageRemove.mockResolvedValue({ error: null })

    const result = await deleteGame(42, 'auth-uuid-123', 'MyGame')

    expect(result).toEqual({ success: true })
    expect(mockFrom).toHaveBeenCalledWith('games')
    expect(mockDeleteEq).toHaveBeenCalledWith('id', 42)
    expect(mockStorageFrom).toHaveBeenCalledWith('games')
    expect(mockStorageRemove).toHaveBeenCalledWith(['auth-uuid-123/MyGame.json'])
  })

  it('returns success when DB delete succeeds but storage delete fails (Req 6.8)', async () => {
    const { deleteGame } = await import('./settingsApi')

    mockDeleteEq.mockResolvedValue({ error: null })
    mockStorageRemove.mockResolvedValue({ error: { message: 'Storage unavailable' } })

    const result = await deleteGame(42, 'auth-uuid-123', 'MyGame')

    // Per Req 6.8: storage failure after DB success still reports success
    expect(result).toEqual({ success: true })
  })

  it('returns error when DB delete fails', async () => {
    const { deleteGame } = await import('./settingsApi')

    mockDeleteEq.mockResolvedValue({ error: { message: 'Foreign key violation' } })

    const result = await deleteGame(42, 'auth-uuid-123', 'MyGame')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Failed to delete game')
    // Storage should not be attempted if DB fails
    expect(mockStorageFrom).not.toHaveBeenCalled()
  })
})

describe('deleteAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFunctionsInvoke.mockResolvedValue({ data: { success: true }, error: null })
  })

  it('returns success when edge function succeeds', async () => {
    const { deleteAccount } = await import('./settingsApi')

    mockFunctionsInvoke.mockResolvedValue({ data: { success: true }, error: null })

    const result = await deleteAccount('auth-uuid-123', 10)

    expect(result).toEqual({ success: true })
    expect(mockFunctionsInvoke).toHaveBeenCalledWith('delete-user', {
      body: { userId: 'auth-uuid-123', playerId: 10 },
    })
  })

  it('returns error when edge function invoke fails', async () => {
    const { deleteAccount } = await import('./settingsApi')

    mockFunctionsInvoke.mockResolvedValue({ data: null, error: { message: 'Function timeout' } })

    const result = await deleteAccount('auth-uuid-123', 10)

    expect(result.success).toBe(false)
    expect(result.failedStep).toBe('delete_auth')
  })

  it('returns error with failedStep when edge function returns error in data', async () => {
    const { deleteAccount } = await import('./settingsApi')

    mockFunctionsInvoke.mockResolvedValue({
      data: { error: 'Failed to delete games', failedStep: 'delete_games' },
      error: null,
    })

    const result = await deleteAccount('auth-uuid-123', 10)

    expect(result.success).toBe(false)
    expect(result.error).toBe('Failed to delete games')
    expect(result.failedStep).toBe('delete_games')
  })
})
