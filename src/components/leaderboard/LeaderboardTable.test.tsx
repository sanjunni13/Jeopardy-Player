// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import fc from 'fast-check'
import { LeaderboardTable } from './LeaderboardTable'
import type { PlayerRow, SortableColumn } from '../../utils/leaderboardUtils'

const samplePlayers: PlayerRow[] = [
  {
    id: '1',
    player_name: 'Alice',
    total_games_played: 10,
    total_games_won: 7,
    total_correct_answers: 80,
    total_incorrect_answers: 20,
    total_correct_daily_doubles: 5,
    total_incorrect_daily_doubles: 2,
    total_correct_final_jeopardies: 6,
    total_incorrect_final_jeopardies: 4,
    current_balance: 15000,
    total_money_earned: 50000,
  },
  {
    id: '2',
    player_name: 'Bob',
    total_games_played: 5,
    total_games_won: 3,
    total_correct_answers: 40,
    total_incorrect_answers: 15,
    total_correct_daily_doubles: 2,
    total_incorrect_daily_doubles: 1,
    total_correct_final_jeopardies: 3,
    total_incorrect_final_jeopardies: 2,
    current_balance: -2000,
    total_money_earned: 20000,
  },
]

const columnLabels: Record<SortableColumn, string> = {
  player_name: 'Player Name',
  win_rate: 'Record',
  total_games_played: 'Games Played',
  accuracy_rate: 'Accuracy',
  fj_accuracy_rate: 'FJ Accuracy',
  total_money_earned: 'Total Money Earned',
  current_balance: 'Current Balance',
}

const allColumns: SortableColumn[] = [
  'player_name',
  'win_rate',
  'total_games_played',
  'accuracy_rate',
  'fj_accuracy_rate',
  'total_money_earned',
  'current_balance',
]

/**
 * Finds the sort button for a given column by matching the exact label text
 * within the button's text content (excluding arrow indicators).
 */
function findColumnButton(container: HTMLElement, column: SortableColumn): HTMLElement {
  const buttons = container.querySelectorAll<HTMLButtonElement>('thead button.sort-button')
  const label = columnLabels[column]

  for (const btn of buttons) {
    // Get text content excluding the aria-hidden arrow span
    const textNodes = Array.from(btn.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent?.trim())
      .join('')

    if (textNodes === label) {
      return btn
    }
  }

  throw new Error(`Could not find button for column: ${column} (label: ${label})`)
}

/**
 * Simulates clicks to reach the desired sort state from the default state
 * (total_money_earned descending).
 *
 * Sort toggle logic:
 * - Clicking the already-active column toggles direction (desc→asc, asc→desc)
 * - Clicking a new column sets it as active with default direction:
 *   - player_name defaults to 'asc'
 *   - all other columns default to 'desc'
 */
function clickToSortState(
  container: HTMLElement,
  targetColumn: SortableColumn,
  targetDirection: 'asc' | 'desc',
) {
  const button = findColumnButton(container, targetColumn)

  // Default initial state: total_money_earned, desc
  const defaultColumn: SortableColumn = 'total_money_earned'
  const defaultDirection: 'asc' | 'desc' = 'desc'

  if (targetColumn === defaultColumn) {
    // Already on this column. Clicking toggles direction.
    if (targetDirection !== defaultDirection) {
      // Need asc: one click toggles desc→asc
      fireEvent.click(button)
    }
    // If targetDirection === defaultDirection, no clicks needed (already there)
  } else {
    // Clicking a different column activates it with its own default direction
    const columnDefaultDir = targetColumn === 'player_name' ? 'asc' : 'desc'
    fireEvent.click(button)

    if (targetDirection !== columnDefaultDir) {
      // Click again to toggle to the opposite direction
      fireEvent.click(button)
    }
  }
}

describe('Feature: scores-leaderboard, Property 4: ARIA sort attribute correctness', () => {
  /**
   * Validates: Requirements 7.4
   *
   * For any sort state (column, direction) and any column header in the table,
   * the active sorted column SHALL have aria-sort set to the current direction
   * ("ascending" or "descending"), and all other column headers SHALL have
   * aria-sort set to "none".
   */
  it('active column header has correct aria-sort value and inactive headers have aria-sort="none"', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...allColumns),
        fc.constantFrom<'asc' | 'desc'>('asc', 'desc'),
        (targetColumn, targetDirection) => {
          const { container, unmount } = render(<LeaderboardTable players={samplePlayers} />)

          // Navigate to the desired sort state
          clickToSortState(container, targetColumn, targetDirection)

          // Assert aria-sort attributes
          const expectedAriaSortValue = targetDirection === 'asc' ? 'ascending' : 'descending'

          const allHeaders = container.querySelectorAll('th')
          const targetLabel = columnLabels[targetColumn]

          for (const header of allHeaders) {
            // Determine which column this header represents by checking button text
            const btn = header.querySelector('button.sort-button')
            if (!btn) continue

            const btnTextNodes = Array.from(btn.childNodes)
              .filter((node) => node.nodeType === Node.TEXT_NODE)
              .map((node) => node.textContent?.trim())
              .join('')

            if (btnTextNodes === targetLabel) {
              expect(header.getAttribute('aria-sort')).toBe(expectedAriaSortValue)
            } else {
              expect(header.getAttribute('aria-sort')).toBe('none')
            }
          }

          unmount()
        },
      ),
      { numRuns: 100 },
    )
  })
})
