// @vitest-environment jsdom

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { AuctionResultView } from './AuctionResultView'
import type { AuctionResultSummary } from './AuctionResultView'
import type { Player } from '../../types/game'

function makePlayer(name: string, score: number): Player {
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

const players = [makePlayer('Alice', 2500), makePlayer('Bob', -1500)]

function result(overrides: Partial<AuctionResultSummary> = {}): AuctionResultSummary {
  return {
    winner: 'Alice',
    winningBid: 1200,
    categoryName: 'Potent Potables',
    isTied: false,
    isReleased: false,
    ...overrides,
  }
}

describe('AuctionResultView', () => {
  it('shows the winner and the winning bid through the shared formatter', () => {
    render(<AuctionResultView result={result()} players={players} />)

    expect(screen.getByLabelText('Auction result')).toBeInTheDocument()
    expect(screen.getByText('Potent Potables')).toBeInTheDocument()
    expect(screen.getByText('Winner')).toBeInTheDocument()
    // Once in the winner panel, once in the balance list below it.
    expect(screen.getAllByText('Alice')).toHaveLength(2)
    expect(screen.getByText('Bid: $1,200')).toBeInTheDocument()
  })

  it('shows the rebid notice for a first tie and the release notice for a repeat tie', () => {
    const { unmount } = render(
      <AuctionResultView result={result({ winner: null, isTied: true })} players={players} />
    )
    expect(screen.getByText('Tied! Rebidding…')).toBeInTheDocument()
    unmount()

    render(
      <AuctionResultView
        result={result({ winner: null, isTied: true, isReleased: true })}
        players={players}
      />
    )
    expect(screen.getByText('Tied again! Category released — no owner')).toBeInTheDocument()
  })

  it('shows the no-bids notice when nobody bid', () => {
    render(
      <AuctionResultView result={result({ winner: null, winningBid: 0 })} players={players} />
    )

    expect(screen.getByText('No bids — category released')).toBeInTheDocument()
  })

  it('renders the per-player balance list, negatives included', () => {
    render(<AuctionResultView result={result()} players={players} />)

    expect(screen.getByText('$2,500')).toBeInTheDocument()
    expect(screen.getByText('-$1,500')).toBeInTheDocument()
  })
})
