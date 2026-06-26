// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RoundTabs, generateTabLabels, getNextFocusIndex } from './RoundTabs'

describe('generateTabLabels', () => {
  it('returns correct labels for 1 round', () => {
    expect(generateTabLabels(1)).toEqual(['Round 1', 'Final Jeopardy'])
  })

  it('returns correct labels for 3 rounds', () => {
    expect(generateTabLabels(3)).toEqual([
      'Round 1',
      'Round 2',
      'Round 3',
      'Final Jeopardy',
    ])
  })
})

describe('getNextFocusIndex', () => {
  it('wraps from last to first going right', () => {
    expect(getNextFocusIndex(2, 1, 3)).toBe(0)
  })

  it('wraps from first to last going left', () => {
    expect(getNextFocusIndex(0, -1, 3)).toBe(2)
  })

  it('moves forward without wrapping', () => {
    expect(getNextFocusIndex(1, 1, 4)).toBe(2)
  })

  it('moves backward without wrapping', () => {
    expect(getNextFocusIndex(2, -1, 4)).toBe(1)
  })
})

describe('RoundTabs', () => {
  const defaultProps = {
    totalRounds: 2,
    activeTab: 0,
    onTabChange: vi.fn(),
  }

  it('renders correct number of tabs (totalRounds + 1)', () => {
    render(<RoundTabs {...defaultProps} />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(3) // Round 1, Round 2, Final Jeopardy
  })

  it('renders correct tab labels', () => {
    render(<RoundTabs {...defaultProps} />)
    expect(screen.getByText('Round 1')).toBeInTheDocument()
    expect(screen.getByText('Round 2')).toBeInTheDocument()
    expect(screen.getByText('Final Jeopardy')).toBeInTheDocument()
  })

  it('marks active tab with aria-selected=true', () => {
    render(<RoundTabs {...defaultProps} activeTab={1} />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs[0]).toHaveAttribute('aria-selected', 'false')
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[2]).toHaveAttribute('aria-selected', 'false')
  })

  it('sets tabIndex 0 on active tab and -1 on inactive tabs', () => {
    render(<RoundTabs {...defaultProps} activeTab={0} />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs[0]).toHaveAttribute('tabindex', '0')
    expect(tabs[1]).toHaveAttribute('tabindex', '-1')
    expect(tabs[2]).toHaveAttribute('tabindex', '-1')
  })

  it('calls onTabChange when a tab is clicked', () => {
    const onTabChange = vi.fn()
    render(<RoundTabs {...defaultProps} onTabChange={onTabChange} />)
    fireEvent.click(screen.getByText('Round 2'))
    expect(onTabChange).toHaveBeenCalledWith(1)
  })

  it('calls onTabChange on Enter key press', () => {
    const onTabChange = vi.fn()
    render(<RoundTabs {...defaultProps} onTabChange={onTabChange} activeTab={1} />)
    const tab = screen.getAllByRole('tab')[1]
    fireEvent.keyDown(tab, { key: 'Enter' })
    expect(onTabChange).toHaveBeenCalledWith(1)
  })

  it('calls onTabChange on Space key press', () => {
    const onTabChange = vi.fn()
    render(<RoundTabs {...defaultProps} onTabChange={onTabChange} activeTab={0} />)
    const tab = screen.getAllByRole('tab')[0]
    fireEvent.keyDown(tab, { key: ' ' })
    expect(onTabChange).toHaveBeenCalledWith(0)
  })

  it('moves focus to next tab on ArrowRight', () => {
    render(<RoundTabs {...defaultProps} activeTab={0} />)
    const tabs = screen.getAllByRole('tab')
    tabs[0].focus()
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' })
    expect(document.activeElement).toBe(tabs[1])
  })

  it('moves focus to previous tab on ArrowLeft', () => {
    render(<RoundTabs {...defaultProps} activeTab={1} />)
    const tabs = screen.getAllByRole('tab')
    tabs[1].focus()
    fireEvent.keyDown(tabs[1], { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(tabs[0])
  })

  it('wraps focus from last tab to first on ArrowRight', () => {
    render(<RoundTabs {...defaultProps} activeTab={2} />)
    const tabs = screen.getAllByRole('tab')
    tabs[2].focus()
    fireEvent.keyDown(tabs[2], { key: 'ArrowRight' })
    expect(document.activeElement).toBe(tabs[0])
  })

  it('wraps focus from first tab to last on ArrowLeft', () => {
    render(<RoundTabs {...defaultProps} activeTab={0} />)
    const tabs = screen.getAllByRole('tab')
    tabs[0].focus()
    fireEvent.keyDown(tabs[0], { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(tabs[2])
  })

  it('uses role="tablist" on the container', () => {
    render(<RoundTabs {...defaultProps} />)
    expect(screen.getByRole('tablist')).toBeInTheDocument()
  })
})
