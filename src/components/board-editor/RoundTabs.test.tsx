// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RoundTabs } from './RoundTabs'

function renderTabs(overrides: Partial<React.ComponentProps<typeof RoundTabs>> = {}) {
  const defaultProps = {
    totalRounds: 2,
    activeRound: 0,
    onSelectRound: vi.fn(),
    onAddRound: vi.fn(),
    onDeleteRound: vi.fn(),
    onSwapRounds: vi.fn(),
  }
  const props = { ...defaultProps, ...overrides }
  const result = render(<RoundTabs {...props} />)
  return { ...result, props }
}

describe('RoundTabs', () => {
  it('renders the correct number of round tabs', () => {
    renderTabs({ totalRounds: 3 })
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(3)
  })

  it('renders tab labels as "Round 1", "Round 2", etc.', () => {
    renderTabs({ totalRounds: 3 })
    expect(screen.getByText('Round 1')).toBeInTheDocument()
    expect(screen.getByText('Round 2')).toBeInTheDocument()
    expect(screen.getByText('Round 3')).toBeInTheDocument()
  })

  it('marks the active round tab with aria-selected="true"', () => {
    renderTabs({ totalRounds: 3, activeRound: 1 })
    const tabs = screen.getAllByRole('tab')
    expect(tabs[0]).toHaveAttribute('aria-selected', 'false')
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[2]).toHaveAttribute('aria-selected', 'false')
  })

  it('sets aria-controls on each tab linking to a panel', () => {
    renderTabs({ totalRounds: 2 })
    const tabs = screen.getAllByRole('tab')
    expect(tabs[0]).toHaveAttribute('aria-controls', 'round-panel-0')
    expect(tabs[1]).toHaveAttribute('aria-controls', 'round-panel-1')
  })

  it('contains a tablist container with proper aria-label', () => {
    renderTabs()
    const tablist = screen.getByRole('tablist')
    expect(tablist).toHaveAttribute('aria-label', 'Game rounds')
  })

  it('fires onSelectRound with the correct index when a tab is clicked', () => {
    const onSelectRound = vi.fn()
    renderTabs({ totalRounds: 3, onSelectRound })
    fireEvent.click(screen.getByText('Round 2'))
    expect(onSelectRound).toHaveBeenCalledWith(1)
  })

  it('renders add round button with aria-label', () => {
    renderTabs()
    const addBtn = screen.getByLabelText('Add round')
    expect(addBtn).toBeInTheDocument()
  })

  it('fires onAddRound when the add button is clicked', () => {
    const onAddRound = vi.fn()
    renderTabs({ onAddRound })
    fireEvent.click(screen.getByLabelText('Add round'))
    expect(onAddRound).toHaveBeenCalledTimes(1)
  })

  it('renders delete buttons for each round when totalRounds > 1', () => {
    renderTabs({ totalRounds: 3 })
    expect(screen.getByLabelText('Delete Round 1')).toBeInTheDocument()
    expect(screen.getByLabelText('Delete Round 2')).toBeInTheDocument()
    expect(screen.getByLabelText('Delete Round 3')).toBeInTheDocument()
  })

  it('does not render delete buttons when only one round exists', () => {
    renderTabs({ totalRounds: 1 })
    expect(screen.queryByLabelText('Delete Round 1')).not.toBeInTheDocument()
  })

  it('fires onDeleteRound with the correct index when delete is clicked', () => {
    const onDeleteRound = vi.fn()
    renderTabs({ totalRounds: 2, onDeleteRound })
    fireEvent.click(screen.getByLabelText('Delete Round 2'))
    expect(onDeleteRound).toHaveBeenCalledWith(1)
  })

  it('renders swap-left arrows for all rounds except the first', () => {
    renderTabs({ totalRounds: 3 })
    // Round 2 and Round 3 should have "Move left" buttons
    expect(screen.getByLabelText('Move Round 2 left')).toBeInTheDocument()
    expect(screen.getByLabelText('Move Round 3 left')).toBeInTheDocument()
    expect(screen.queryByLabelText('Move Round 1 left')).not.toBeInTheDocument()
  })

  it('renders swap-right arrows for all rounds except the last', () => {
    renderTabs({ totalRounds: 3 })
    expect(screen.getByLabelText('Move Round 1 right')).toBeInTheDocument()
    expect(screen.getByLabelText('Move Round 2 right')).toBeInTheDocument()
    expect(screen.queryByLabelText('Move Round 3 right')).not.toBeInTheDocument()
  })

  it('fires onSwapRounds(index, index-1) when swap-left is clicked', () => {
    const onSwapRounds = vi.fn()
    renderTabs({ totalRounds: 3, onSwapRounds })
    fireEvent.click(screen.getByLabelText('Move Round 2 left'))
    expect(onSwapRounds).toHaveBeenCalledWith(1, 0)
  })

  it('fires onSwapRounds(index, index+1) when swap-right is clicked', () => {
    const onSwapRounds = vi.fn()
    renderTabs({ totalRounds: 3, onSwapRounds })
    fireEvent.click(screen.getByLabelText('Move Round 2 right'))
    expect(onSwapRounds).toHaveBeenCalledWith(1, 2)
  })

  it('renders a single round tab with no swap arrows and no delete', () => {
    renderTabs({ totalRounds: 1 })
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(1)
    expect(screen.queryByLabelText('Move Round 1 left')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Move Round 1 right')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Delete Round 1')).not.toBeInTheDocument()
  })

  it('meets minimum 44px touch target on tab buttons', () => {
    renderTabs({ totalRounds: 1 })
    const tab = screen.getByRole('tab')
    expect(tab.className).toContain('min-h-[44px]')
  })
})
