import { describe, it, expect } from 'vitest';
import { getValidWagerRange, validateWager, validateAnswer } from './finalJeopardyValidation';

describe('getValidWagerRange', () => {
  it('returns 0-1000 for a player with score 0', () => {
    expect(getValidWagerRange(0)).toEqual({ min: 0, max: 1000 });
  });

  it('returns 0-1000 for a player with negative score', () => {
    expect(getValidWagerRange(-500)).toEqual({ min: 0, max: 1000 });
  });

  it('returns 0-playerScore for a player with positive score', () => {
    expect(getValidWagerRange(5000)).toEqual({ min: 0, max: 5000 });
  });
});

describe('validateWager', () => {
  it('accepts a valid wager within range', () => {
    expect(validateWager(100, 5000)).toEqual({ valid: true });
  });

  it('accepts zero wager', () => {
    expect(validateWager(0, 5000)).toEqual({ valid: true });
  });

  it('accepts maximum wager equal to player score', () => {
    expect(validateWager(5000, 5000)).toEqual({ valid: true });
  });

  it('rejects non-integer wager', () => {
    const result = validateWager(100.5, 5000);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe('Wager must be a whole dollar amount');
    }
  });

  it('rejects wager exceeding player score', () => {
    const result = validateWager(6000, 5000);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe('Wager must be between $0 and $5000');
    }
  });

  it('rejects negative wager', () => {
    const result = validateWager(-100, 5000);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe('Wager must be between $0 and $5000');
    }
  });

  it('allows wager up to 1000 when player score is 0', () => {
    expect(validateWager(1000, 0)).toEqual({ valid: true });
  });

  it('rejects wager over 1000 when player score is 0', () => {
    const result = validateWager(1001, 0);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe('Wager must be between $0 and $1000');
    }
  });
});

describe('validateAnswer', () => {
  it('accepts a valid answer', () => {
    expect(validateAnswer('What is Paris?')).toEqual({ valid: true });
  });

  it('rejects an empty string', () => {
    const result = validateAnswer('');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe('Answer cannot be empty');
    }
  });

  it('rejects a whitespace-only string', () => {
    const result = validateAnswer('   ');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe('Answer cannot be empty');
    }
  });

  it('rejects an answer exceeding 200 characters', () => {
    const longAnswer = 'a'.repeat(201);
    const result = validateAnswer(longAnswer);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe('Answer cannot exceed 200 characters');
    }
  });

  it('accepts an answer of exactly 200 characters', () => {
    const answer = 'a'.repeat(200);
    expect(validateAnswer(answer)).toEqual({ valid: true });
  });
});
