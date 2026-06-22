// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FinalSection } from './FinalSection'

describe('FinalSection', () => {
  const defaultProps = {
    category: 'World History',
    hasMedia: false,
    onClick: vi.fn(),
    onDeleteBoard: vi.fn(),
    onDownloadJSON: vi.fn(),
  }

  it('renders "Final Jeopardy" label', () => {
    render(<FinalSection {...defaultProps} />)
    expect(screen.getByText('Final Jeopardy')).toBeDefined()
  })

  it('displays the category name when provided', () => {
    render(<FinalSection {...defaultProps} category="Science" />)
    expect(screen.getByText('Science')).toBeDefined()
  })

  it('displays "(No category)" placeholder when category is empty', () => {
    render(<FinalSection {...defaultProps} category="" />)
    expect(screen.getByText('(No category)')).toBeDefined()
  })

  it('fires onClick when the card area is clicked', () => {
    const onClick = vi.fn()
    render(<FinalSection {...defaultProps} onClick={onClick} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit Final Jeopardy' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('renders the BoardSettingsMenu gear icon trigger', () => {
    render(<FinalSection {...defaultProps} />)
    expect(screen.getByRole('button', { name: 'Board Settings' })).toBeDefined()
  })

  it('shows media indicator when hasMedia is true', () => {
    render(<FinalSection {...defaultProps} hasMedia={true} />)
    expect(screen.getByText('📎')).toBeDefined()
    expect(screen.getByLabelText('Media attached')).toBeDefined()
  })

  it('does not show media indicator when hasMedia is false', () => {
    render(<FinalSection {...defaultProps} hasMedia={false} />)
    expect(screen.queryByText('📎')).toBeNull()
  })

  it('clickable area meets minimum 44x44 CSS pixel touch target', () => {
    render(<FinalSection {...defaultProps} />)
    const card = screen.getByRole('button', { name: 'Edit Final Jeopardy' })
    expect(card.className).toContain('min-h-[44px]')
    expect(card.className).toContain('min-w-[44px]')
  })

  it('has accessible aria-label on the clickable card', () => {
    render(<FinalSection {...defaultProps} />)
    const card = screen.getByRole('button', { name: 'Edit Final Jeopardy' })
    expect(card.getAttribute('aria-label')).toBe('Edit Final Jeopardy')
  })
})
