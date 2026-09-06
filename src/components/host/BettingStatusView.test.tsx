// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { BettingStatusView } from './BettingStatusView'
import { formatCurrency } from '../../utils/currency'
import type { Player } from '../../types/game'

function makePlayer(name: string, score = 1000): Player {
  return {
    name,
    score,
    correctCount: 0,
    incorrectCount: 0,
    correctDailyDoubles: 0,
    incorrectDailyDoubles: 0,
    correctFinalJeopardy: 0,
    incorrectFinalJeopardy: 0,
    totalEarned: 0,
  }
}

describe('BettingStatusView', () => {
  const defaultProps = {
    players: [makePlayer('Alice'), makePlayer('Bob'), makePlayer('Charlie')],
    receivedBets: {} as Record<string, { count: number; totalWagered: number }>,
    playersDone: new Set<string>(),
    onForceEnd: vi.fn(),
  }

  it('shows player names with "Waiting…" for players who have not finished', () => {
    render(<BettingStatusView {...defaultProps} />)

    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByText('Charlie')).toBeInTheDocument()

    const waitingElements = screen.getAllByText('Waiting…')
    expect(waitingElements).toHaveLength(3)
  })

  it('shows bet count and total wagered for players with bets who are done', () => {
    render(
      <BettingStatusView
        {...defaultProps}
        receivedBets={{
          Alice: { count: 2, totalWagered: 300 },
          Charlie: { count: 1, totalWagered: 150 },
        }}
        playersDone={new Set(['Alice', 'Charlie'])}
      />
    )

    // Alice is done with 2 bets
    expect(screen.getByText('Done · 2 bets · $300')).toBeInTheDocument()
    // Charlie is done with 1 bet
    expect(screen.getByText('Done · 1 bet · $150')).toBeInTheDocument()
    // Bob is still waiting
    expect(screen.getByText('Waiting…')).toBeInTheDocument()
  })

  it('renders wagered totals through the shared Currency_Formatter (Req 5.9)', () => {
    render(
      <BettingStatusView
        {...defaultProps}
        receivedBets={{
          Alice: { count: 3, totalWagered: 1200 },
          Bob: { count: 1, totalWagered: 2500 },
        }}
        playersDone={new Set(['Alice'])}
      />
    )

    expect(screen.getByText(`Done · 3 bets · ${formatCurrency(1200)}`)).toBeInTheDocument()
    expect(screen.getByText('Done · 3 bets · $1,200')).toBeInTheDocument()
    // Not yet done, so no "Done ·" prefix but still formatter output.
    expect(screen.getByText('1 bet · $2,500')).toBeInTheDocument()
  })

  it('shows "Skipped" for players who are done without bets', () => {
    render(
      <BettingStatusView
        {...defaultProps}
        playersDone={new Set(['Bob'])}
      />
    )

    expect(screen.getByText('Skipped')).toBeInTheDocument()
  })

  it('"End Betting" button triggers onForceEnd callback', () => {
    const onForceEnd = vi.fn()
    render(<BettingStatusView {...defaultProps} onForceEnd={onForceEnd} />)

    const endButton = screen.getByRole('button', { name: 'End Betting' })
    fireEvent.click(endButton)

    expect(onForceEnd).toHaveBeenCalledTimes(1)
  })
})
