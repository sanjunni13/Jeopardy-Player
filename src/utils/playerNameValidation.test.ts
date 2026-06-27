import { describe, it, expect } from 'vitest';
import { validatePlayerName, isDuplicateName } from './playerNameValidation';
import type { SessionPlayer } from '../types/session';

describe('validatePlayerName', () => {
  it('accepts a valid name', () => {
    expect(validatePlayerName('Alice')).toEqual({ valid: true });
  });

  it('accepts a single character name', () => {
    expect(validatePlayerName('A')).toEqual({ valid: true });
  });

  it('accepts a 20-character name', () => {
    expect(validatePlayerName('A'.repeat(20))).toEqual({ valid: true });
  });

  it('accepts a name with leading/trailing spaces if it has non-whitespace', () => {
    expect(validatePlayerName('  Bob  ')).toEqual({ valid: true });
  });

  it('rejects an empty string', () => {
    expect(validatePlayerName('')).toEqual({ valid: false, error: 'A valid name is required' });
  });

  it('rejects a string of only whitespace', () => {
    expect(validatePlayerName('   ')).toEqual({ valid: false, error: 'A valid name is required' });
  });

  it('rejects a name exceeding 20 characters', () => {
    expect(validatePlayerName('A'.repeat(21))).toEqual({ valid: false, error: 'Name must be 20 characters or fewer' });
  });
});

describe('isDuplicateName', () => {
  const players: SessionPlayer[] = [
    { name: 'Alice', score: 0, joinedAt: new Date().toISOString() },
    { name: 'Bob', score: 100, joinedAt: new Date().toISOString() },
  ];

  it('returns true for an exact match', () => {
    expect(isDuplicateName(players, 'Alice')).toBe(true);
  });

  it('returns true for a case-insensitive match', () => {
    expect(isDuplicateName(players, 'alice')).toBe(true);
    expect(isDuplicateName(players, 'ALICE')).toBe(true);
    expect(isDuplicateName(players, 'BOB')).toBe(true);
  });

  it('returns false for a name not in the list', () => {
    expect(isDuplicateName(players, 'Charlie')).toBe(false);
  });

  it('returns false for an empty player list', () => {
    expect(isDuplicateName([], 'Alice')).toBe(false);
  });
});
