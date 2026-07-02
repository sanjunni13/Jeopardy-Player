// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FAQCard } from './FAQCard'
import type { FAQCategory } from '../../data/faqData'

const sampleCategories: FAQCategory[] = [
  {
    category: 'Games',
    items: [
      { question: 'What is Jeopardy?', answer: 'A popular trivia game show.' },
      { question: 'How do I play?', answer: 'Select a category and point value to reveal a clue.' },
    ],
  },
  {
    category: 'Buzzers',
    items: [
      { question: 'What are Daily Doubles?', answer: 'Special clues where a player can wager points.' },
    ],
  },
]

describe('FAQCard', () => {
  it('renders heading "Frequently Asked Questions"', () => {
    render(<FAQCard items={sampleCategories} />)
    expect(screen.getByText('Frequently Asked Questions')).toBeDefined()
  })

  it('renders all category labels', () => {
    render(<FAQCard items={sampleCategories} />)
    expect(screen.getByText('Games')).toBeDefined()
    expect(screen.getByText('Buzzers')).toBeDefined()
  })

  it('category triggers start collapsed; questions are not visible', () => {
    render(<FAQCard items={sampleCategories} />)

    // Category triggers should be closed
    const categoryTriggers = screen.getAllByRole('button')
    for (const trigger of categoryTriggers) {
      expect(trigger.getAttribute('data-state')).toBe('closed')
    }

    // Questions should not be visible until category is opened
    expect(screen.queryByText('What is Jeopardy?')).toBeNull()
  })

  it('opening a category reveals its questions (still collapsed)', () => {
    render(<FAQCard items={sampleCategories} />)

    const gamesTrigger = screen.getByText('Games')
    fireEvent.click(gamesTrigger)

    // Category should be open
    expect(gamesTrigger.closest('button')!.getAttribute('data-state')).toBe('open')

    // Questions within the category should now be visible
    expect(screen.getByText('What is Jeopardy?')).toBeDefined()
    expect(screen.getByText('How do I play?')).toBeDefined()
  })

  it('expanding a question inside an open category shows its answer', () => {
    render(<FAQCard items={sampleCategories} />)

    // Open the category first
    fireEvent.click(screen.getByText('Games'))

    // Then open a question
    const questionTrigger = screen.getByText('What is Jeopardy?')
    fireEvent.click(questionTrigger)

    expect(screen.getByText('A popular trivia game show.')).toBeDefined()
    expect(questionTrigger.closest('button')!.getAttribute('data-state')).toBe('open')
  })

  it('expanding a second question in the same category collapses the first', () => {
    render(<FAQCard items={sampleCategories} />)

    fireEvent.click(screen.getByText('Games'))

    const firstQ = screen.getByText('What is Jeopardy?')
    const secondQ = screen.getByText('How do I play?')

    fireEvent.click(firstQ)
    expect(firstQ.closest('button')!.getAttribute('data-state')).toBe('open')

    fireEvent.click(secondQ)
    expect(secondQ.closest('button')!.getAttribute('data-state')).toBe('open')
    expect(firstQ.closest('button')!.getAttribute('data-state')).toBe('closed')
  })

  it('empty items array renders without error', () => {
    const { container } = render(<FAQCard items={[]} />)
    expect(container.querySelector('.faq-empty')).toBeDefined()
    expect(screen.queryByText('Frequently Asked Questions')).toBeNull()
  })
})
