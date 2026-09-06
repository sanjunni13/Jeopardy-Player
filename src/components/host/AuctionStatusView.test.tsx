// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { AuctionStatusView } from './AuctionStatusView'
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

describe('AuctionStatusView', () => {
  const defaultProps = {
    category: 'Science',
    categoryIndex: 2,
    players: [makePlayer('Alice'), makePlayer('Bob'), makePlayer('Charlie')],
    receivedBids: {} as Record<string, number>,
    timerDuration: 30,
    timeRemaining: 20,
    onForceEnd: vi.fn(),
  }

  it('renders the category name', () => {
    render(<AuctionStatusView {...defaultProps} />)

    expect(screen.getByText('Science')).toBeInTheDocument()
  })

  it('shows "Waiting…" for players without bids', () => {
    render(<AuctionStatusView {...defaultProps} />)

    const waitingElements = screen.getAllByText('Waiting\u2026')
    expect(waitingElements).toHaveLength(3)
  })

  it('shows "Bid placed ✓" for players with bids', () => {
    render(
      <AuctionStatusView
        {...defaultProps}
        receivedBids={{ Alice: 500, Charlie: 250 }}
      />
    )

    const bidPlacedElements = screen.getAllByText('Bid placed \u2713')
    expect(bidPlacedElements).toHaveLength(2)
    // Bob should still be waiting
    expect(screen.getByText('Waiting\u2026')).toBeInTheDocument()
  })

  it('displays correct time remaining', () => {
    render(<AuctionStatusView {...defaultProps} timeRemaining={15} />)

    expect(screen.getByText('15s')).toBeInTheDocument()
  })

  it('displays timer with urgent styling when time is low', () => {
    render(<AuctionStatusView {...defaultProps} timeRemaining={3} />)

    expect(screen.getByText('3s')).toBeInTheDocument()
  })

  it('"End Bidding" button triggers onForceEnd callback', () => {
    const onForceEnd = vi.fn()
    render(<AuctionStatusView {...defaultProps} onForceEnd={onForceEnd} />)

    const endButton = screen.getByRole('button', { name: 'End Bidding' })
    fireEvent.click(endButton)

    expect(onForceEnd).toHaveBeenCalledTimes(1)
  })
})
