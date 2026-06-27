// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { PlayerConnectionStatus } from './PlayerConnectionStatus'
import type { SessionPlayer } from '../../types/session'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePlayers(count: number): SessionPlayer[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `Player${i + 1}`,
    score: 0,
    joinedAt: new Date().toISOString(),
  }))
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PlayerConnectionStatus', () => {
  it('displays connected player count out of max (Req 8.2)', () => {
    const players = makePlayers(3)
    render(
      <PlayerConnectionStatus players={players} isLocked={false} onLock={vi.fn()} onUnlock={vi.fn()} />
    )
    expect(screen.getByText('3/10 players')).toBeInTheDocument()
  })

  it('displays player names in a list (Req 8.3)', () => {
    const players = makePlayers(2)
    render(
      <PlayerConnectionStatus players={players} isLocked={false} onLock={vi.fn()} onUnlock={vi.fn()} />
    )
    expect(screen.getByText('Player1')).toBeInTheDocument()
    expect(screen.getByText('Player2')).toBeInTheDocument()
  })

  it('shows Lock Session button when session is unlocked (Req 8.4)', () => {
    render(
      <PlayerConnectionStatus players={[]} isLocked={false} onLock={vi.fn()} onUnlock={vi.fn()} />
    )
    expect(screen.getByRole('button', { name: 'Lock Session' })).toBeInTheDocument()
    expect(screen.queryByText('Session Locked', { exact: false })).not.toBeInTheDocument()
  })

  it('shows Session Locked indicator and Unlock button when locked (Req 8.4)', () => {
    render(
      <PlayerConnectionStatus players={[]} isLocked={true} onLock={vi.fn()} onUnlock={vi.fn()} />
    )
    expect(screen.getByText(/Session Locked/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Lock Session' })).not.toBeInTheDocument()
  })

  it('calls onLock when Lock Session button is clicked (Req 8.4)', () => {
    const onLock = vi.fn()
    render(
      <PlayerConnectionStatus players={[]} isLocked={false} onLock={onLock} onUnlock={vi.fn()} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Lock Session' }))
    expect(onLock).toHaveBeenCalledOnce()
  })

  it('calls onUnlock when Unlock button is clicked (Req 8.7)', () => {
    const onUnlock = vi.fn()
    render(
      <PlayerConnectionStatus players={[]} isLocked={true} onLock={vi.fn()} onUnlock={onUnlock} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    expect(onUnlock).toHaveBeenCalledOnce()
  })

  it('does not render the player list when there are no players', () => {
    render(
      <PlayerConnectionStatus players={[]} isLocked={false} onLock={vi.fn()} onUnlock={vi.fn()} />
    )
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })
})
