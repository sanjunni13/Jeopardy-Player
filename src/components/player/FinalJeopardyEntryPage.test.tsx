// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { SessionPlayer } from '../../types/session'
import { FinalJeopardyEntryPage } from './FinalJeopardyEntryPage'
import { fetchSession, updateFinalJeopardyState } from '../../utils/sessionApi'

vi.mock('../../utils/sessionApi', () => ({
  fetchSession: vi.fn(),
  updateFinalJeopardyState: vi.fn().mockResolvedValue(undefined),
}))

const fetchSessionMock = vi.mocked(fetchSession)
const updateStateMock = vi.mocked(updateFinalJeopardyState)

const channel = { send: vi.fn().mockResolvedValue('ok') } as unknown as RealtimeChannel

function makePlayer(name: string, score: number): SessionPlayer {
  return { name, score, joinedAt: '2024-01-01T00:00:00.000Z' }
}

/** Minimal session shape the component reads. */
function session(finalJeopardyState: Record<string, unknown>) {
  return { final_jeopardy_state: { wagers: [], submissions: [], revealedIndex: -1, ...finalJeopardyState } }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('FinalJeopardyEntryPage wager range (Req 4.5–4.10, 5.7)', () => {
  it('takes the range from the persisted wagerConfig for a non-positive balance', async () => {
    fetchSessionMock.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      session({ wagerConfig: { wagerFloor: 100, lowestPositiveBalance: 800 } }) as any
    )

    render(
      <FinalJeopardyEntryPage
        sessionId="s1"
        playerName="Alice"
        playerScore={-500}
        channel={channel}
        players={[makePlayer('Alice', -500), makePlayer('Bob', 800)]}
      />
    )

    const line = await screen.findByText(/Wager range/)
    expect(line.textContent).toContain('Your score: -$500')
    expect(line.textContent).toContain('Wager range: $1 – $800')
  })

  it('uses the configured floor and the balance for a positive balance', async () => {
    fetchSessionMock.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      session({ wagerConfig: { wagerFloor: 250, lowestPositiveBalance: 250 } }) as any
    )

    render(
      <FinalJeopardyEntryPage
        sessionId="s1"
        playerName="Alice"
        playerScore={3000}
        channel={channel}
        players={[makePlayer('Alice', 3000), makePlayer('Bob', 250)]}
      />
    )

    const line = await screen.findByText(/Wager range/)
    expect(line.textContent).toContain('Wager range: $250 – $3,000')
  })

  it('falls back to the default floor and a locally computed lowest positive balance', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fetchSessionMock.mockResolvedValue(session({}) as any)

    render(
      <FinalJeopardyEntryPage
        sessionId="s1"
        playerName="Alice"
        playerScore={-1200}
        channel={channel}
        players={[makePlayer('Alice', -1200), makePlayer('Bob', 300), makePlayer('Cara', 4000)]}
      />
    )

    const line = await screen.findByText(/Wager range/)
    expect(line.textContent).toContain('Wager range: $1 – $300')
  })

  it('falls back to the default floor when no player holds a positive balance', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fetchSessionMock.mockResolvedValue(session({}) as any)

    render(
      <FinalJeopardyEntryPage
        sessionId="s1"
        playerName="Alice"
        playerScore={-400}
        channel={channel}
        players={[makePlayer('Alice', -400), makePlayer('Bob', 0)]}
      />
    )

    const line = await screen.findByText(/Wager range/)
    expect(line.textContent).toContain('Wager range: $1 – $100')
  })

  it('rejects an out-of-range wager naming both bounds and writes nothing', async () => {
    fetchSessionMock.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      session({ wagerConfig: { wagerFloor: 100, lowestPositiveBalance: 800 } }) as any
    )

    render(
      <FinalJeopardyEntryPage
        sessionId="s1"
        playerName="Alice"
        playerScore={-500}
        channel={channel}
        players={[makePlayer('Alice', -500), makePlayer('Bob', 800)]}
      />
    )

    const input = await waitFor(() => screen.getByLabelText('Wager'))
    fireEvent.change(input, { target: { value: '900' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit Wager' }))

    const error = await screen.findByRole('alert')
    expect(error).toHaveTextContent('Wager must be between $1 and $800.')
    expect(updateStateMock).not.toHaveBeenCalled()
    expect(input).toHaveValue('900')
  })

  it('accepts a wager at the top of the persisted range', async () => {
    fetchSessionMock.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      session({ wagerConfig: { wagerFloor: 100, lowestPositiveBalance: 800 } }) as any
    )

    render(
      <FinalJeopardyEntryPage
        sessionId="s1"
        playerName="Alice"
        playerScore={-500}
        channel={channel}
        players={[makePlayer('Alice', -500), makePlayer('Bob', 800)]}
      />
    )

    const input = await waitFor(() => screen.getByLabelText('Wager'))
    fireEvent.change(input, { target: { value: '800' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit Wager' }))

    await waitFor(() => expect(updateStateMock).toHaveBeenCalledTimes(1))
    expect(updateStateMock.mock.calls[0][1].wagers).toEqual([
      expect.objectContaining({ playerName: 'Alice', wager: 800 }),
    ])
  })
})
