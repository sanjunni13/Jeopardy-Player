import { describe, it, expect } from 'vitest';
import { normalizeGame } from './gameNormalizer';
import { GameFile } from '../types/game';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCategory(name = 'History') {
  return {
    category: name,
    clues: [{ value: 200, clue: 'A clue', solution: 'An answer' }],
  };
}

function makeFinal() {
  return { category: 'Final Cat', clue: 'Final clue', solution: 'Final answer' };
}

function makeGameFile(overrides: Record<string, unknown>): GameFile {
  return { game: overrides as GameFile['game'] };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('normalizeGame', () => {
  describe('numeric key mapping', () => {
    it('maps "1" and "2" to "single" and "double"', () => {
      const raw = makeGameFile({
        '1': [makeCategory('Geography')],
        '2': [makeCategory('Science')],
        final: makeFinal(),
      });

      const result = normalizeGame(raw);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.game.rounds).toHaveProperty('single');
      expect(result.game.rounds).toHaveProperty('double');
      expect(result.game.rounds.single[0].category).toBe('Geography');
      expect(result.game.rounds.double[0].category).toBe('Science');
    });

    it('maps all six numeric keys to their word equivalents', () => {
      const raw = makeGameFile({
        '1': [makeCategory('R1')],
        '2': [makeCategory('R2')],
        '3': [makeCategory('R3')],
        '4': [makeCategory('R4')],
        '5': [makeCategory('R5')],
        '6': [makeCategory('R6')],
        final: makeFinal(),
      });

      const result = normalizeGame(raw);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(Object.keys(result.game.rounds)).toEqual([
        'single', 'double', 'triple', 'quadruple', 'quintuple', 'sextuple',
      ]);
    });
  });

  describe('word-descriptor key passthrough', () => {
    it('passes word-descriptor keys through unchanged', () => {
      const raw = makeGameFile({
        single: [makeCategory('Arts')],
        double: [makeCategory('Music')],
        final: makeFinal(),
      });

      const result = normalizeGame(raw);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.game.rounds).toHaveProperty('single');
      expect(result.game.rounds).toHaveProperty('double');
      expect(result.game.rounds.single[0].category).toBe('Arts');
      expect(result.game.rounds.double[0].category).toBe('Music');
    });

    it('sorts word-descriptor keys in WORD_KEYS order', () => {
      const raw = makeGameFile({
        double: [makeCategory('D')],
        single: [makeCategory('S')],
        final: makeFinal(),
      });

      const result = normalizeGame(raw);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(Object.keys(result.game.rounds)).toEqual(['single', 'double']);
    });
  });

  describe('clue defaults', () => {
    it('defaults dailyDouble to false when absent', () => {
      const raw = makeGameFile({
        single: [{ category: 'Test', clues: [{ value: 100, clue: 'Q', solution: 'A' }] }],
        final: makeFinal(),
      });

      const result = normalizeGame(raw);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.game.rounds.single[0].clues[0].dailyDouble).toBe(false);
    });

    it('preserves dailyDouble: true when provided', () => {
      const raw = makeGameFile({
        single: [{ category: 'Test', clues: [{ value: 100, clue: 'Q', solution: 'A', dailyDouble: true }] }],
        final: makeFinal(),
      });

      const result = normalizeGame(raw);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.game.rounds.single[0].clues[0].dailyDouble).toBe(true);
    });

    it('defaults html to false on clues when absent', () => {
      const raw = makeGameFile({
        single: [{ category: 'Test', clues: [{ value: 100, clue: 'Q', solution: 'A' }] }],
        final: makeFinal(),
      });

      const result = normalizeGame(raw);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.game.rounds.single[0].clues[0].html).toBe(false);
    });

    it('preserves html: true on clues when provided', () => {
      const raw = makeGameFile({
        single: [{ category: 'Test', clues: [{ value: 100, clue: 'Q', solution: 'A', html: true }] }],
        final: makeFinal(),
      });

      const result = normalizeGame(raw);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.game.rounds.single[0].clues[0].html).toBe(true);
    });
  });

  describe('out-of-range numeric key', () => {
    it('returns ok: false for numeric key "7" (out of range)', () => {
      const raw = makeGameFile({
        '7': [makeCategory('Nope')],
        final: makeFinal(),
      });

      const result = normalizeGame(raw);

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error).toContain('"7"');
      expect(result.error).toContain('1–6');
    });

    it('returns ok: false for numeric key "0" (out of range)', () => {
      const raw = makeGameFile({
        '0': [makeCategory('Nope')],
        final: makeFinal(),
      });

      const result = normalizeGame(raw);

      expect(result.ok).toBe(false);
    });
  });

  describe('final round', () => {
    it('defaults html to false on final when absent', () => {
      const raw = makeGameFile({
        single: [makeCategory()],
        final: { category: 'FC', clue: 'FQ', solution: 'FA' },
      });

      const result = normalizeGame(raw);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.game.final.html).toBe(false);
    });

    it('preserves html: true on final when provided', () => {
      const raw = makeGameFile({
        single: [makeCategory()],
        final: { category: 'FC', clue: 'FQ', solution: 'FA', html: true },
      });

      const result = normalizeGame(raw);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.game.final.html).toBe(true);
    });

    it('preserves all final round fields', () => {
      const raw = makeGameFile({
        single: [makeCategory()],
        final: { category: 'History', clue: 'Who was it?', solution: 'Abraham Lincoln' },
      });

      const result = normalizeGame(raw);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.game.final.category).toBe('History');
      expect(result.game.final.clue).toBe('Who was it?');
      expect(result.game.final.solution).toBe('Abraham Lincoln');
    });
  });

  describe('totalRounds', () => {
    it('equals the number of non-final round keys (2 rounds)', () => {
      const raw = makeGameFile({
        '1': [makeCategory()],
        '2': [makeCategory()],
        final: makeFinal(),
      });

      const result = normalizeGame(raw);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.game.totalRounds).toBe(2);
    });

    it('equals the number of non-final round keys (1 round)', () => {
      const raw = makeGameFile({
        single: [makeCategory()],
        final: makeFinal(),
      });

      const result = normalizeGame(raw);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.game.totalRounds).toBe(1);
    });

    it('does not count final in totalRounds', () => {
      const raw = makeGameFile({
        '1': [makeCategory()],
        '2': [makeCategory()],
        '3': [makeCategory()],
        final: makeFinal(),
      });

      const result = normalizeGame(raw);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.game.totalRounds).toBe(3);
    });
  });

  describe('mixed key type error', () => {
    it('returns ok: false when both numeric and word-descriptor keys are present', () => {
      const raw = makeGameFile({
        '1': [makeCategory()],
        double: [makeCategory()],
        final: makeFinal(),
      });

      const result = normalizeGame(raw);

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error).toContain('both numeric and word-descriptor');
    });
  });

  describe('field preservation', () => {
    it('preserves category name, clue text, solution, and value', () => {
      const raw = makeGameFile({
        single: [
          {
            category: 'Science',
            clues: [{ value: 400, clue: 'What is gravity?', solution: 'A force' }],
          },
        ],
        final: makeFinal(),
      });

      const result = normalizeGame(raw);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const clue = result.game.rounds.single[0].clues[0];
      expect(clue.value).toBe(400);
      expect(clue.clue).toBe('What is gravity?');
      expect(clue.solution).toBe('A force');
    });
  });
});
