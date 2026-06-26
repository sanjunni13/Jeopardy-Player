// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { RoundsSelector } from './RoundsSelector'

describe('RoundsSelector', () => {
  it('renders buttons for values 1 through 5', () => {
    render(<RoundsSelector value={2} onChange={() => {}} />)

    for (let i = 1; i <= 5; i++) {
      expect(screen.getByRole('button', { name: String(i) })).toBeInTheDocument()
    }
  })

  it('highlights the selected value with active class', () => {
    render(<RoundsSelector value={3} onChange={() => {}} />)

    const activeBtn = screen.getByRole('button', { name: '3' })
    expect(activeBtn).toHaveClass('rounds-btn--active')

    const inactiveBtn = screen.getByRole('button', { name: '1' })
    expect(inactiveBtn).not.toHaveClass('rounds-btn--active')
  })

  it('calls onChange with the clicked round number', () => {
    const handleChange = vi.fn()

    render(<RoundsSelector value={2} onChange={handleChange} />)

    fireEvent.click(screen.getByRole('button', { name: '4' }))

    expect(handleChange).toHaveBeenCalledWith(4)
    expect(handleChange).toHaveBeenCalledTimes(1)
  })

  it('sets aria-pressed on the selected button', () => {
    render(<RoundsSelector value={5} onChange={() => {}} />)

    expect(screen.getByRole('button', { name: '5' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '1' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('has an accessible group container with aria-label', () => {
    render(<RoundsSelector value={1} onChange={() => {}} />)

    const group = screen.getByRole('group', { name: 'Select number of rounds' })
    expect(group).toBeInTheDocument()
  })

  it('buttons are keyboard accessible (native button elements)', () => {
    const handleChange = vi.fn()

    render(<RoundsSelector value={2} onChange={handleChange} />)

    const btn3 = screen.getByRole('button', { name: '3' })
    fireEvent.click(btn3)

    expect(handleChange).toHaveBeenCalledWith(3)
  })
})
