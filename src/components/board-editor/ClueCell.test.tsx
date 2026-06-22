// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ClueCell } from './ClueCell'

describe('ClueCell', () => {
  const defaultProps = {
    pointValue: 400,
    hasContent: false,
    hasMedia: false,
    dailyDouble: false,
    onClick: vi.fn(),
    ariaLabel: 'Category Science, row 2, 400 dollars',
  }

  it('renders as a button with role="gridcell"', () => {
    render(<ClueCell {...defaultProps} />)
    const cell = screen.getByRole('gridcell')
    expect(cell).toBeDefined()
    expect(cell.tagName).toBe('BUTTON')
  })

  it('displays the point value with dollar sign', () => {
    render(<ClueCell {...defaultProps} pointValue={800} />)
    expect(screen.getByText('$800')).toBeDefined()
  })

  it('applies the provided aria-label for accessibility', () => {
    render(<ClueCell {...defaultProps} />)
    const cell = screen.getByRole('gridcell')
    expect(cell.getAttribute('aria-label')).toBe('Category Science, row 2, 400 dollars')
  })

  it('fires onClick callback when clicked', () => {
    const onClick = vi.fn()
    render(<ClueCell {...defaultProps} onClick={onClick} />)
    fireEvent.click(screen.getByRole('gridcell'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('meets minimum 44×44 CSS pixel touch target', () => {
    render(<ClueCell {...defaultProps} />)
    const cell = screen.getByRole('gridcell')
    const className = cell.className
    expect(className).toContain('min-h-[44px]')
    expect(className).toContain('min-w-[44px]')
  })

  it('applies empty visual state when hasContent is false', () => {
    render(<ClueCell {...defaultProps} hasContent={false} />)
    const cell = screen.getByRole('gridcell')
    expect(cell.className).toContain('clue-cell--empty')
    expect(cell.className).not.toContain('clue-cell--filled')
  })

  it('applies filled visual state when hasContent is true', () => {
    render(<ClueCell {...defaultProps} hasContent={true} />)
    const cell = screen.getByRole('gridcell')
    expect(cell.className).toContain('clue-cell--filled')
    expect(cell.className).not.toContain('clue-cell--empty')
  })

  it('shows media badge when hasMedia is true', () => {
    render(<ClueCell {...defaultProps} hasMedia={true} />)
    const badge = screen.getByText('🎵')
    expect(badge).toBeDefined()
    expect(badge.getAttribute('aria-hidden')).toBe('true')
  })

  it('does not show media badge when hasMedia is false', () => {
    render(<ClueCell {...defaultProps} hasMedia={false} />)
    expect(screen.queryByText('🎵')).toBeNull()
  })

  it('shows daily double star when dailyDouble is true', () => {
    render(<ClueCell {...defaultProps} dailyDouble={true} />)
    const star = screen.getByText('⭐')
    expect(star).toBeDefined()
    expect(star.getAttribute('aria-hidden')).toBe('true')
  })

  it('does not show daily double star when dailyDouble is false', () => {
    render(<ClueCell {...defaultProps} dailyDouble={false} />)
    expect(screen.queryByText('⭐')).toBeNull()
  })

  it('shows both media badge and daily double star simultaneously', () => {
    render(<ClueCell {...defaultProps} hasMedia={true} dailyDouble={true} />)
    expect(screen.getByText('🎵')).toBeDefined()
    expect(screen.getByText('⭐')).toBeDefined()
  })
})
