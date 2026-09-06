// @vitest-environment jsdom

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HeadToHead } from './HeadToHead'
import type { HeadToHeadResult } from '../../utils/analyticsUtils'

// Feature: negative-balance-and-analytics-updates — Requirement 9.3

afterEach(cleanup)

function makeResult(
  playerA: string,
  playerB: string,
  overrides: Partial<HeadToHeadResult> = {},
): HeadToHeadResult {
  return {
    playerA,
    playerB,
    correctA: 3,
    correctB: 5,
    incorrectA: 1,
    incorrectB: 2,
    ddAttemptedA: 1,
    ddAttemptedB: 0,
    ddWonA: 1,
    ddWonB: 0,
    finalScoreA: 1200,
    finalScoreB: -400,
    ...overrides,
  }
}

const NO_COLORS = new Map<string, string>()

describe('HeadToHead', () => {
  it('renders nothing when there are no comparisons', () => {
    const { container } = render(
      <HeadToHead comparisons={[]} playerNames={['Alice']} playerColors={NO_COLORS} />,
    )

    expect(container.innerHTML).toBe('')
  })

  it('renders one collapsed section per player, in playerNames order', () => {
    render(
      <HeadToHead
        comparisons={[makeResult('Alice', 'Bob')]}
        playerNames={['Bob', 'Alice']}
        playerColors={NO_COLORS}
      />,
    )

    const toggles = screen.getAllByRole('button')

    expect(toggles.map((t) => t.textContent)).toEqual(['Bob▼', 'Alice▼'])
    for (const toggle of toggles) {
      expect(toggle.getAttribute('aria-expanded')).toBe('false')
    }
    // Content is absent while collapsed
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('omits players with no comparison', () => {
    render(
      <HeadToHead
        comparisons={[makeResult('Alice', 'Bob')]}
        playerNames={['Alice', 'Bob', 'Cara']}
        playerColors={NO_COLORS}
      />,
    )

    expect(screen.getAllByRole('button')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Cara' })).toBeNull()
  })

  it('puts the section player on the left of every comparison it contains', async () => {
    const user = userEvent.setup()
    render(
      <HeadToHead
        comparisons={[makeResult('Alice', 'Bob')]}
        playerNames={['Alice', 'Bob']}
        playerColors={NO_COLORS}
      />,
    )

    // Alice's section keeps the stored orientation
    await user.click(screen.getByRole('button', { name: 'Alice' }))
    const aliceTable = screen.getByRole('table', { name: 'Alice vs Bob' })
    const aliceRow = aliceTable.querySelectorAll('.head-to-head-stat-row')[0]
    expect(aliceRow.children[0].textContent).toBe('3') // Alice's correct count
    expect(aliceRow.children[2].textContent).toBe('5') // Bob's correct count

    // Bob's section mirrors the same pair with Bob on the left
    await user.click(screen.getByRole('button', { name: 'Bob' }))
    const bobTable = screen.getByRole('table', { name: 'Bob vs Alice' })
    const bobRow = bobTable.querySelectorAll('.head-to-head-stat-row')[0]
    expect(bobRow.children[0].textContent).toBe('5')
    expect(bobRow.children[2].textContent).toBe('3')

    const bobScoreRow = bobTable.querySelectorAll('.head-to-head-stat-row')[4]
    expect(bobScoreRow.children[0].textContent).toBe('-$400')
    expect(bobScoreRow.children[2].textContent).toBe('$1,200')
  })

  it('mirrors every pair under both participants', async () => {
    const user = userEvent.setup()
    render(
      <HeadToHead
        comparisons={[
          makeResult('Alice', 'Bob'),
          makeResult('Alice', 'Cara'),
          makeResult('Bob', 'Cara'),
        ]}
        playerNames={['Alice', 'Bob', 'Cara']}
        playerColors={NO_COLORS}
      />,
    )

    for (const name of ['Alice', 'Bob', 'Cara']) {
      await user.click(screen.getByRole('button', { name }))
    }

    // 3 pairs × 2 orientations = 6 comparison cards
    expect(screen.getAllByRole('table')).toHaveLength(6)
    expect(screen.getByRole('table', { name: 'Cara vs Alice' })).toBeTruthy()
    expect(screen.getByRole('table', { name: 'Cara vs Bob' })).toBeTruthy()
  })
})
