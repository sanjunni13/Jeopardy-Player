import { describe, it, expect } from 'vitest'
import {
  createGameFAQ,
  generateGameFAQ,
  uploadGameFAQ,
  gameLibraryFAQ,
  type FAQItem,
} from './faqData'

describe('FAQ Data Validation', () => {
  const allFAQs: { name: string; items: FAQItem[] }[] = [
    { name: 'createGameFAQ', items: createGameFAQ },
    { name: 'generateGameFAQ', items: generateGameFAQ },
    { name: 'uploadGameFAQ', items: uploadGameFAQ },
    { name: 'gameLibraryFAQ', items: gameLibraryFAQ },
  ]

  describe('FAQ array length constraints', () => {
    it.each(allFAQs)(
      '$name has between 2 and 10 items',
      ({ items }) => {
        expect(items.length).toBeGreaterThanOrEqual(2)
        expect(items.length).toBeLessThanOrEqual(10)
      }
    )

    it.each(allFAQs)(
      '$name has no more than 8 items',
      ({ items }) => {
        expect(items.length).toBeLessThanOrEqual(8)
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

    it('generateGameFAQ covers: generation options, AI behaviour, editing generated games, difficulty levels', () => {
      const questions = generateGameFAQ.map((item) =>
        (item.question + ' ' + item.answer).toLowerCase()
      )

      expect(questions.some((q) => q.includes('generation') || q.includes('option'))).toBe(true)
      expect(questions.some((q) => q.includes('ai'))).toBe(true)
      expect(questions.some((q) => q.includes('edit'))).toBe(true)
      expect(questions.some((q) => q.includes('difficult'))).toBe(true)
    })

    it('uploadGameFAQ covers: supported file formats, validation rules, fixing upload errors, game ownership', () => {
      const questions = uploadGameFAQ.map((item) =>
        (item.question + ' ' + item.answer).toLowerCase()
      )

      expect(questions.some((q) => q.includes('format') || q.includes('file'))).toBe(true)
      expect(questions.some((q) => q.includes('validat'))).toBe(true)
      expect(questions.some((q) => q.includes('error') || q.includes('fix'))).toBe(true)
      expect(questions.some((q) => q.includes('own'))).toBe(true)
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
