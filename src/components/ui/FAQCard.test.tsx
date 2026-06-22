// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FAQCard } from './FAQCard'
import type { FAQItem } from '../../data/faqData'

const sampleItems: FAQItem[] = [
  { question: 'What is Jeopardy?', answer: 'A popular trivia game show.' },
  { question: 'How do I play?', answer: 'Select a category and point value to reveal a clue.' },
  { question: 'What are Daily Doubles?', answer: 'Special clues where a player can wager points.' },
]

describe('FAQCard', () => {
  it('renders heading "Frequently Asked Questions"', () => {
    render(<FAQCard items={sampleItems} />)
    expect(screen.getByText('Frequently Asked Questions')).toBeDefined()
  })

  it('renders all provided FAQ items in collapsed state', () => {
    render(<FAQCard items={sampleItems} />)

    // All questions should be visible
    for (const item of sampleItems) {
      expect(screen.getByText(item.question)).toBeDefined()
    }

    // All triggers should have data-state="closed"
    const triggers = screen.getAllByRole('button')
    for (const trigger of triggers) {
      expect(trigger.getAttribute('data-state')).toBe('closed')
    }
  })

  it('expanding one item shows its answer', () => {
    render(<FAQCard items={sampleItems} />)

    const firstTrigger = screen.getByText(sampleItems[0].question)
    fireEvent.click(firstTrigger)

    // The answer should now be visible
    expect(screen.getByText(sampleItems[0].answer)).toBeDefined()

    // The trigger should be in open state
    const button = firstTrigger.closest('button')!
    expect(button.getAttribute('data-state')).toBe('open')
  })

  it('expanding a second item collapses the first', () => {
    render(<FAQCard items={sampleItems} />)

    // Expand the first item
    const firstTrigger = screen.getByText(sampleItems[0].question)
    fireEvent.click(firstTrigger)
    expect(firstTrigger.closest('button')!.getAttribute('data-state')).toBe('open')

    // Expand the second item
    const secondTrigger = screen.getByText(sampleItems[1].question)
    fireEvent.click(secondTrigger)

    // Second should be open, first should be closed
    expect(secondTrigger.closest('button')!.getAttribute('data-state')).toBe('open')
    expect(firstTrigger.closest('button')!.getAttribute('data-state')).toBe('closed')
  })

  it('collapsing an already-expanded item', () => {
    render(<FAQCard items={sampleItems} />)

    const firstTrigger = screen.getByText(sampleItems[0].question)

    // Expand
    fireEvent.click(firstTrigger)
    expect(firstTrigger.closest('button')!.getAttribute('data-state')).toBe('open')

    // Collapse by clicking the same trigger again
    fireEvent.click(firstTrigger)
    expect(firstTrigger.closest('button')!.getAttribute('data-state')).toBe('closed')
  })

  it('empty items array renders without error', () => {
    const { container } = render(<FAQCard items={[]} />)
    // Should render the empty container div
    expect(container.querySelector('.faq-empty')).toBeDefined()
    // Should NOT render the heading or accordion
    expect(screen.queryByText('Frequently Asked Questions')).toBeNull()
  })
})
