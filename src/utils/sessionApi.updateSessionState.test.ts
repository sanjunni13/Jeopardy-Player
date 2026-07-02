import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { BuzzState } from '../types/session'

// ─── Supabase mock ────────────────────────────────────────────────────────────
// vi.hoisted ensures these are initialized before vi.mock's factory runs,
// avoiding the "Cannot access before initialization" hoisting issue.

const { mockEq, mockUpdate, mockFrom } = vi.hoisted(() => {
  const mockEq = vi.fn().mockReturnValue({ error: null })
  const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
  const mockFrom = vi.fn().mockReturnValue({ update: mockUpdate })
  return { mockEq, mockUpdate, mockFrom }
})

vi.mock('./supabase', () => ({
  supabase: {
    from: mockFrom,
  },
}))

import { updateSessionState, updateBuzzState, updateSessionPhase } from './sessionApi'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeBuzzState(overrides: Partial<BuzzState> = {}): BuzzState {
  return {
    clueActive: false,
    queue: [],
    lockedOut: [],
    systemLocked: false,
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('updateSessionState', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEq.mockReturnValue({ error: null })
    mockUpdate.mockReturnValue({ eq: mockEq })
    mockFrom.mockReturnValue({ update: mockUpdate })
  })

  it('issues exactly one PATCH to game_sessions', async () => {
    await updateSessionState('session-abc', 'buzzer', makeBuzzState())

    expect(mockFrom).toHaveBeenCalledTimes(1)
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(mockFrom).toHaveBeenCalledWith('game_sessions')
  })

  it('sends phase and buzz_state together in the same update payload', async () => {
    const buzzState = makeBuzzState({ clueActive: true, systemLocked: true })

    await updateSessionState('session-abc', 'buzzer', buzzState)

    const payload = mockUpdate.mock.calls[0][0] as Record<string, unknown>
    expect(payload).toMatchObject({
      phase: 'buzzer',
      buzz_state: buzzState,
    })
  })

  it('filters by the correct session ID', async () => {
    await updateSessionState('session-xyz-123', 'buzzer', makeBuzzState())

    expect(mockEq).toHaveBeenCalledWith('id', 'session-xyz-123')
  })

  it('includes updated_at in the payload', async () => {
    await updateSessionState('session-abc', 'buzzer', makeBuzzState())

    const payload = mockUpdate.mock.calls[0][0] as Record<string, unknown>
    expect(payload).toHaveProperty('updated_at')
    expect(typeof payload.updated_at).toBe('string')
  })

  it('works for final-jeopardy phase', async () => {
    const buzzState = makeBuzzState({ clueActive: false, systemLocked: true })

    await updateSessionState('session-abc', 'final-jeopardy', buzzState)

    const payload = mockUpdate.mock.calls[0][0] as Record<string, unknown>
    expect(payload).toMatchObject({
      phase: 'final-jeopardy',
      buzz_state: buzzState,
    })
  })

  it('throws when Supabase returns an error', async () => {
    mockEq.mockReturnValueOnce({ error: { message: 'connection refused' } })

    await expect(
      updateSessionState('session-abc', 'buzzer', makeBuzzState())
    ).rejects.toThrow('Failed to update session state: connection refused')
  })
})

describe('updateSessionState vs separate calls — PATCH count comparison', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Re-wire mock chain after clearAllMocks wipes return values
    mockEq.mockReturnValue({ error: null })
    mockUpdate.mockReturnValue({ eq: mockEq })
    mockFrom.mockReturnValue({ update: mockUpdate })
  })

  it('updateSessionState issues 1 PATCH; calling updateSessionPhase + updateBuzzState separately issues 2', async () => {
    const buzzState = makeBuzzState({ clueActive: true })

    // Baseline: two separate functions = two .from() calls
    await updateSessionPhase('session-abc', 'buzzer')
    await updateBuzzState('session-abc', buzzState)
    const separateCallCount = mockFrom.mock.calls.length
    expect(separateCallCount).toBe(2)

    vi.clearAllMocks()
    mockEq.mockReturnValue({ error: null })
    mockUpdate.mockReturnValue({ eq: mockEq })
    mockFrom.mockReturnValue({ update: mockUpdate })

    // Fix #3: batched function = one .from() call
    await updateSessionState('session-abc', 'buzzer', buzzState)
    const batchedCallCount = mockFrom.mock.calls.length
    expect(batchedCallCount).toBe(1)

    expect(batchedCallCount).toBeLessThan(separateCallCount)
  })
})
