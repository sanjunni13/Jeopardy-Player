// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AddRowButton } from './AddRowButton'

describe('AddRowButton', () => {
  it('renders a button with "+" text', () => {
    render(<AddRowButton onClick={() => {}} />)
    const button = screen.getByRole('button', { name: 'Add clue row' })
    expect(button).toBeDefined()
    expect(button.textContent).toBe('+')
  })

  it('has the correct aria-label', () => {
    render(<AddRowButton onClick={() => {}} />)
    const button = screen.getByLabelText('Add clue row')
    expect(button).toBeDefined()
  })

  it('fires onClick callback when clicked', () => {
    const handleClick = vi.fn()
    render(<AddRowButton onClick={handleClick} />)
    const button = screen.getByRole('button', { name: 'Add clue row' })
    fireEvent.click(button)
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('meets minimum touch target size (44×44 CSS pixels)', () => {
    render(<AddRowButton onClick={() => {}} />)
    const button = screen.getByRole('button', { name: 'Add clue row' })
    expect(button.className).toContain('min-h-[44px]')
    expect(button.className).toContain('min-w-[44px]')
  })

  it('has dashed border style', () => {
    render(<AddRowButton onClick={() => {}} />)
    const button = screen.getByRole('button', { name: 'Add clue row' })
    expect(button.className).toContain('border-dashed')
  })

  it('spans full width for bottom-edge positioning', () => {
    render(<AddRowButton onClick={() => {}} />)
    const button = screen.getByRole('button', { name: 'Add clue row' })
    expect(button.className).toContain('w-full')
  })
})
