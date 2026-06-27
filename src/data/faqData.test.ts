import { describe, it, expect } from 'vitest'
import {
  createGameFAQ,
  generateGameFAQ,
  uploadGameFAQ,
  gameLibraryFAQ,
  type FAQItem,
} from './faqData'

// ─── Answer Sheet FAQ Entry Tests (Requirements 1.1-1.3, 2.1-2.3) ─────────────

describe('gameLibraryFAQ — Answer Sheet entry', () => {
  const answerSheetEntry = gameLibraryFAQ.find(
    (item) => item.question.toLowerCase().includes('answer sheet')
  )

  it('contains an Answer Sheet FAQ entry', () => {
    expect(answerSheetEntry).toBeDefined()
  })

  it('question identifies the Answer Sheet by name', () => {
    expect(answerSheetEntry!.question).toMatch(/answer sheet/i)
  })

  it('answer states it opens as a modal overlay within the game window', () => {
    expect(answerSheetEntry!.answer.toLowerCase()).toContain('modal overlay')
    expect(answerSheetEntry!.answer.toLowerCase()).toContain('game window')
  })

  it('answer states answers are organized by round and category', () => {
    expect(answerSheetEntry!.answer.toLowerCase()).toContain('organized by round')
    expect(answerSheetEntry!.answer.toLowerCase()).toContain('category')
  })

  it('answer mentions availability for generated games (AI, JeopardyLabs, J! Archive)', () => {
    const answerLower = answerSheetEntry!.answer.toLowerCase()
    expect(answerLower).toContain('ai')
    expect(answerLower).toMatch(/jeopardylabs/i)
    expect(answerLower).toMatch(/archive/i)
  })

  it('answer instructs host to click the "Answer Sheet" button during active gameplay', () => {
    const answer = answerSheetEntry!.answer
    expect(answer).toContain('"Answer Sheet" button')
    expect(answer.toLowerCase()).toContain('gameplay')
  })
})

describe('generateGameFAQ — Answer Sheet entry', () => {
  const answerSheetEntry = generateGameFAQ.find(
    (item) => item.question.toLowerCase().includes('answer sheet')
  )

  it('contains an Answer Sheet FAQ entry', () => {
    expect(answerSheetEntry).toBeDefined()
  })

  it('question asks what the Answer Sheet is', () => {
    expect(answerSheetEntry!.question).toMatch(/answer sheet/i)
  })

  it('answer describes it as allowing the host to view all correct answers during gameplay without affecting game state', () => {
    const answerLower = answerSheetEntry!.answer.toLowerCase()
    expect(answerLower).toContain('host')
    expect(answerLower).toContain('correct answers')
    expect(answerLower).toContain('gameplay')
    expect(answerLower).toContain('without affecting the game state')
  })

  it('answer states it opens as a modal overlay within the game page displaying answers organized by round and grouped by category', () => {
    const answerLower = answerSheetEntry!.answer.toLowerCase()
    expect(answerLower).toContain('modal overlay')
    expect(answerLower).toContain('game page')
    expect(answerLower).toContain('organized by round')
    expect(answerLower).toContain('grouped by category')
  })

  it('answer instructs accessing via the "Answer Sheet" button visible during gameplay', () => {
    const answer = answerSheetEntry!.answer
    expect(answer).toContain('"Answer Sheet" button')
    expect(answer.toLowerCase()).toContain('during gameplay')
  })

  it('answer states button is only available for generated games (J! Archive, JeopardyLabs, AI Generation)', () => {
    const answerLower = answerSheetEntry!.answer.toLowerCase()
    expect(answerLower).toMatch(/archive/i)
    expect(answerLower).toMatch(/jeopardylabs/i)
    expect(answerLower).toMatch(/ai generation/i)
  })
})

// ─── General FAQ Data Validation ──────────────────────────────────────────────

describe('FAQ Data Validation', () => {
  const allFAQs: { name: string; items: FAQItem[] }[] = [
    { name: 'createGameFAQ', items: createGameFAQ },
    { name: 'generateGameFAQ', items: generateGameFAQ },
    { name: 'uploadGameFAQ', items: uploadGameFAQ },
    { name: 'gameLibraryFAQ', items: gameLibraryFAQ },
  ]

  describe('FAQ array length constraints', () => {
    it.each(allFAQs)(
      '$name has between 2 and 20 items',
      ({ items }) => {
        expect(items.length).toBeGreaterThanOrEqual(2)
        expect(items.length).toBeLessThanOrEqual(20)
      }
    )

    it.each(allFAQs)(
      '$name has no more than 20 items',
      ({ items }) => {
        expect(items.length).toBeLessThanOrEqual(20)
      }
    )
  })

  describe('No duplicate questions across all FAQ arrays', () => {
    it('has no duplicate question text across all pages', () => {
      const allQuestions = allFAQs.flatMap(({ items }) =>
        items.map((item) => item.question)
      )
      const uniqueQuestions = new Set(allQuestions)
      expect(uniqueQuestions.size).toBe(allQuestions.length)
    })
  })

  describe('FAQ topic keyword coverage per Requirement 3', () => {
    it('createGameFAQ covers: manual game builder, saving drafts, required fields, category/clue limits', () => {
      const questions = createGameFAQ.map((item) =>
        (item.question + ' ' + item.answer).toLowerCase()
      )

      expect(questions.some((q) => q.includes('manual') || q.includes('builder') || q.includes('custom'))).toBe(true)
      expect(questions.some((q) => q.includes('draft') || q.includes('save'))).toBe(true)
      expect(questions.some((q) => q.includes('required') || q.includes('field'))).toBe(true)
      expect(questions.some((q) => q.includes('categor') || q.includes('clue') || q.includes('limit'))).toBe(true)
    })

    it('generateGameFAQ covers: generation options, AI behaviour, difficulty levels', () => {
      const questions = generateGameFAQ.map((item) =>
        (item.question + ' ' + item.answer).toLowerCase()
      )

      expect(questions.some((q) => q.includes('generation') || q.includes('option'))).toBe(true)
      expect(questions.some((q) => q.includes('ai'))).toBe(true)
      expect(questions.some((q) => q.includes('difficult'))).toBe(true)
    })

    it('uploadGameFAQ covers: supported file formats, validation rules, fixing upload errors, duplicate names', () => {
      const questions = uploadGameFAQ.map((item) =>
        (item.question + ' ' + item.answer).toLowerCase()
      )

      expect(questions.some((q) => q.includes('format') || q.includes('file'))).toBe(true)
      expect(questions.some((q) => q.includes('validat'))).toBe(true)
      expect(questions.some((q) => q.includes('error') || q.includes('fix'))).toBe(true)
      expect(questions.some((q) => q.includes('duplicate'))).toBe(true)
    })

    it('gameLibraryFAQ covers: multiplayer setup, scoring rules, Daily Doubles, how rounds work, buzzer integration', () => {
      const questions = gameLibraryFAQ.map((item) =>
        (item.question + ' ' + item.answer).toLowerCase()
      )

      expect(questions.some((q) => q.includes('multiplayer') || q.includes('player'))).toBe(true)
      expect(questions.some((q) => q.includes('scor'))).toBe(true)
      expect(questions.some((q) => q.includes('daily double'))).toBe(true)
      expect(questions.some((q) => q.includes('round'))).toBe(true)
      expect(questions.some((q) => q.includes('buzzer'))).toBe(true)
    })
  })
})
