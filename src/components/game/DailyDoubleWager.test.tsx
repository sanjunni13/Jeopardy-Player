// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { Player } from '../../types/game'
import { DailyDoubleWager } from './DailyDoubleWager'

function makePlayer(name: string, score: number): Player {
  return {
    name,
    score,
    correctCount: 0,
    incorrectCount: 0,
    correctDailyDoubles: 0,
    incorrectDailyDoubles: 0,
    correctFinalJeopardy: 0,
    incorrectFinalJeopardy: 0,
    totalEarned: 0,
  }
}

function renderForm(score: number) {
  const onSubmit = vi.fn()
  render(
    <DailyDoubleWager
      player={makePlayer('Alice', score)}
      categoryName="Science"
      onSubmit={onSubmit}
    />
  )
  const input = screen.getByPlaceholderText('Enter wager...') as HTMLInputElement
  const submit = screen.getByRole('button', { name: 'Submit Wager' })
  return { onSubmit, input, submit }
}

describe('DailyDoubleWager range display (Req 3.3, 3.7)', () => {
  it('formats a negative score and the $1,000 floor via the Currency_Formatter', () => {
    renderForm(-5000)

    expect(screen.getByText(/Score: -\$5,000/)).toBeInTheDocument()
    expect(screen.getByText(/Wager range: \$1 – \$1,000/)).toBeInTheDocument()
  })

  it('keeps the $1,000 floor for a small positive score', () => {
    renderForm(200)

    expect(screen.getByText(/Score: \$200/)).toBeInTheDocument()
    expect(screen.getByText(/Wager range: \$1 – \$1,000/)).toBeInTheDocument()
  })

  it('raises the maximum to the score when the score exceeds $1,000', () => {
    renderForm(2500)

    expect(screen.getByText(/Wager range: \$1 – \$2,500/)).toBeInTheDocument()
  })
})

describe('DailyDoubleWager validation (Req 3.1, 3.2, 3.5, 3.6)', () => {
  it('accepts $1,000 from a player with a small positive score', () => {
    const { onSubmit, input, submit } = renderForm(200)

    fireEvent.change(input, { target: { value: '1000' } })
    fireEvent.click(submit)

    expect(onSubmit).toHaveBeenCalledWith(1000)
  })

  it('accepts the $1 minimum', () => {
    const { onSubmit, input, submit } = renderForm(-5000)

    fireEvent.change(input, { target: { value: '1' } })
    fireEvent.click(submit)

    expect(onSubmit).toHaveBeenCalledWith(1)
  })

  it('rejects $0 and leaves the entered value in place', () => {
    const { onSubmit, input, submit } = renderForm(-5000)

    fireEvent.change(input, { target: { value: '0' } })
    fireEvent.click(submit)

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Wager must be between $1 and $1,000.')).toBeInTheDocument()
    expect(input.value).toBe('0')
  })

  it('rejects a wager above the maximum with both bounds formatted', () => {
    const { onSubmit, input, submit } = renderForm(200)

    fireEvent.change(input, { target: { value: '1001' } })
    fireEvent.click(submit)

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Wager must be between $1 and $1,000.')).toBeInTheDocument()
    expect(input.value).toBe('1001')
  })

  it('rejects a fractional wager and keeps the entry', () => {
    const { onSubmit, input, submit } = renderForm(2500)

    fireEvent.change(input, { target: { value: '500.5' } })
    fireEvent.click(submit)

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Enter a whole-dollar amount, with no cents.')).toBeInTheDocument()
    expect(input.value).toBe('500.5')
  })

  it('accepts the score itself when the score exceeds $1,000', () => {
    const { onSubmit, input, submit } = renderForm(2500)

    fireEvent.change(input, { target: { value: '2500' } })
    fireEvent.click(submit)

    expect(onSubmit).toHaveBeenCalledWith(2500)
  })
})
