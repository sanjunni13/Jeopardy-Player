// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AddColumnButton } from './AddColumnButton'

describe('AddColumnButton', () => {
  it('renders a button with "+" text', () => {
    render(<AddColumnButton onClick={() => {}} />)
    const button = screen.getByRole('button', { name: 'Add category column' })
    expect(button).toBeDefined()
    expect(button.textContent).toBe('+')
  })

  it('has the correct aria-label', () => {
    render(<AddColumnButton onClick={() => {}} />)
    const button = screen.getByLabelText('Add category column')
    expect(button).toBeDefined()
  })

  it('fires onClick callback when clicked', () => {
    const handleClick = vi.fn()
    render(<AddColumnButton onClick={handleClick} />)
    const button = screen.getByRole('button', { name: 'Add category column' })
    fireEvent.click(button)
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('meets minimum touch target size (44×44 CSS pixels)', () => {
    render(<AddColumnButton onClick={() => {}} />)
    const button = screen.getByRole('button', { name: 'Add category column' })
    expect(button.className).toContain('min-h-[44px]')
    expect(button.className).toContain('min-w-[44px]')
  })

  it('has dashed border style', () => {
    render(<AddColumnButton onClick={() => {}} />)
    const button = screen.getByRole('button', { name: 'Add category column' })
    expect(button.className).toContain('border-dashed')
  })
})
