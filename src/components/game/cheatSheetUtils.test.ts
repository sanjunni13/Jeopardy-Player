import { describe, it, expect } from 'vitest';
import { shouldShowCheatSheet } from './cheatSheetUtils';
import type { GamePhase } from '../../types/game';

// ─── Valid phases where cheat sheet should be visible ─────────────────────────

const validPhases: GamePhase[] = [
  'category-reveal',
  'board',
  'clue',
  'daily-double',
  'daily-double-wager',
  'round-transition',
  'final-jeopardy',
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('shouldShowCheatSheet', () => {
  describe('returns true for source="ai" with valid game phases', () => {
    it.each(validPhases)('returns true for phase "%s"', (phase) => {
      expect(shouldShowCheatSheet('ai', phase)).toBe(true);
    });
  });

  describe('returns true for source="labs" with valid game phases', () => {
    it.each(validPhases)('returns true for phase "%s"', (phase) => {
      expect(shouldShowCheatSheet('labs', phase)).toBe(true);
    });
  });

  describe('returns true for source="archive" with valid game phases', () => {
    it.each(validPhases)('returns true for phase "%s"', (phase) => {
      expect(shouldShowCheatSheet('archive', phase)).toBe(true);
    });
  });

  describe('returns false for source=null', () => {
    it.each(validPhases)('returns false for phase "%s" when source is null', (phase) => {
      expect(shouldShowCheatSheet(null, phase)).toBe(false);
    });

    it('returns false for player-entry when source is null', () => {
      expect(shouldShowCheatSheet(null, 'player-entry')).toBe(false);
    });

    it('returns false for game-over when source is null', () => {
      expect(shouldShowCheatSheet(null, 'game-over')).toBe(false);
    });
  });

  describe('returns false during "player-entry" phase', () => {
    it('returns false for source="ai"', () => {
      expect(shouldShowCheatSheet('ai', 'player-entry')).toBe(false);
    });

    it('returns false for source="labs"', () => {
      expect(shouldShowCheatSheet('labs', 'player-entry')).toBe(false);
    });

    it('returns false for source="archive"', () => {
      expect(shouldShowCheatSheet('archive', 'player-entry')).toBe(false);
    });
  });

  describe('returns false during "game-over" phase', () => {
    it('returns false for source="ai"', () => {
      expect(shouldShowCheatSheet('ai', 'game-over')).toBe(false);
    });

    it('returns false for source="labs"', () => {
      expect(shouldShowCheatSheet('labs', 'game-over')).toBe(false);
    });

    it('returns false for source="archive"', () => {
      expect(shouldShowCheatSheet('archive', 'game-over')).toBe(false);
    });
  });
});
