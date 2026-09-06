// @vitest-environment jsdom

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { PlayerBalanceList } from './PlayerBalanceList'
import { formatCurrency } from '../../utils/currency'
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

describe('PlayerBalanceList', () => {
  it('renders every player balance through the shared Currency_Formatter', () => {
    const players = [makePlayer('Alice', 12000), makePlayer('Bob', -1000), makePlayer('Cy', 0)]
    render(<PlayerBalanceList players={players} />)

    expect(screen.getByText(formatCurrency(12000))).toBeInTheDocument()
    expect(screen.getByText('-$1,000')).toBeInTheDocument()
    expect(screen.getByText('$0')).toBeInTheDocument()
  })

  it('preserves player order and uses the caller class prefix', () => {
    const players = [makePlayer('Bob', 100), makePlayer('Alice', 200)]
    const { container } = render(
      <PlayerBalanceList players={players} classPrefix="auction-status" ariaLabel="Player balances" />
    )

    const items = container.querySelectorAll('.auction-status__player-item')
    expect(items).toHaveLength(2)
    expect(items[0].textContent).toContain('Bob')
    expect(items[1].textContent).toContain('Alice')
    expect(screen.getByLabelText('Player balances')).toBeInTheDocument()
  })

  it('lets a caller replace the detail cell', () => {
    render(
      <PlayerBalanceList
        players={[makePlayer('Alice', 500)]}
        renderDetail={player => `${player.name} is waiting`}
      />
    )

    expect(screen.getByText('Alice is waiting')).toBeInTheDocument()
    expect(screen.queryByText('$500')).not.toBeInTheDocument()
  })
})
