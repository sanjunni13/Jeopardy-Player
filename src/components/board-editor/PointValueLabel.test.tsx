// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PointValueLabel } from './PointValueLabel'

describe('PointValueLabel', () => {
  it('renders the dollar value text', () => {
    render(<PointValueLabel value={400} rowIndex={1} onClick={() => {}} />)
    const button = screen.getByRole('button')
    expect(button.textContent).toBe('$400')
  })

  it('renders correct aria-label with row index and value', () => {
    render(<PointValueLabel value={800} rowIndex={3} onClick={() => {}} />)
    const button = screen.getByRole('button')
    expect(button.getAttribute('aria-label')).toBe(
      'Edit row 4 point value, currently 800 dollars'
    )
  })

  it('calls onClick when clicked', () => {
    const handleClick = vi.fn()
    render(<PointValueLabel value={200} rowIndex={0} onClick={handleClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('renders as a button element with type="button"', () => {
    render(<PointValueLabel value={600} rowIndex={2} onClick={() => {}} />)
    const button = screen.getByRole('button')
    expect(button.tagName).toBe('BUTTON')
    expect(button.getAttribute('type')).toBe('button')
  })

  it('has the point-value-label class for min 44x44 styling', () => {
    render(<PointValueLabel value={1000} rowIndex={4} onClick={() => {}} />)
    const button = screen.getByRole('button')
    expect(button.className).toContain('point-value-label')
  })
})
