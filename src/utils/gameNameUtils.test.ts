import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { getDefaultGameName, sanitizeGameName, GAME_NAME_PATTERN, MAX_GAME_NAME_LENGTH } from './gameNameUtils';

// ─── Generators ───────────────────────────────────────────────────────────────

/** Generates one of the three valid generation methods */
const methodArb = fc.constantFrom('Archive' as const, 'Labs' as const, 'AI' as const);

/** Generates a valid Date object (reasonable range, excludes NaN dates) */
const dateArb = fc.date({ min: new Date('2000-01-01'), max: new Date('2099-12-31') }).filter(
  (d) => !isNaN(d.getTime())
);

// ─── Property Tests ───────────────────────────────────────────────────────────

// Feature: misc-app-updates, Property 4: Default game name follows format pattern
describe('getDefaultGameName — Property 4: Default game name follows format pattern', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * **Validates: Requirements 6.2**
   *
   * For any method in ['Archive', 'Labs', 'AI'] and any valid Date,
   * the output matches "{Method} Game - {MMM DD, YYYY}" pattern.
   */
  it('output matches "{Method} Game - {MMM DD, YYYY}" pattern for any method and date', () => {
    // Pattern: "Archive Game - Jun 25, 2026" or "AI Game - Jan 1, 2000"
    // Month is 3-letter abbreviation, day is 1-2 digits, year is 4 digits
    const datePattern = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s\d{1,2},\s\d{4}$/;

    fc.assert(
      fc.property(methodArb, dateArb, (method, date) => {
        vi.useFakeTimers();
        vi.setSystemTime(date);

        const result = getDefaultGameName(method);

        // Must start with the method name followed by " Game - "
        expect(result.startsWith(`${method} Game - `)).toBe(true);

        // Extract the date portion and verify it matches the expected date format
        const datePortion = result.slice(`${method} Game - `.length);
        expect(datePortion).toMatch(datePattern);

        // Verify the date portion matches what toLocaleDateString produces for this date
        const expectedDate = date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
        expect(datePortion).toBe(expectedDate);

        vi.useRealTimers();
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 6.2**
   *
   * The result always contains exactly the method name as prefix.
   */
  it('result always starts with the exact method name', () => {
    fc.assert(
      fc.property(methodArb, dateArb, (method, date) => {
        vi.useFakeTimers();
        vi.setSystemTime(date);

        const result = getDefaultGameName(method);
        const prefix = result.split(' Game - ')[0];
        expect(prefix).toBe(method);

        vi.useRealTimers();
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 6.2**
   *
   * The result always contains the separator " Game - " exactly once.
   */
  it('result contains " Game - " separator exactly once', () => {
    fc.assert(
      fc.property(methodArb, dateArb, (method, date) => {
        vi.useFakeTimers();
        vi.setSystemTime(date);

        const result = getDefaultGameName(method);
        const parts = result.split(' Game - ');
        expect(parts.length).toBe(2);

        vi.useRealTimers();
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 5 Arbitraries ──────────────────────────────────────────────────

const ALLOWED_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -_\'.,!?'.split('');

/** Generates random Unicode strings (the general case for sanitization). */
const unicodeStringArb = fc.string({ minLength: 0, maxLength: 200 });

/** Generates strings containing only allowed characters (may exceed max length). */
const allowedCharsArb = fc.array(fc.constantFrom(...ALLOWED_CHARS), { minLength: 0, maxLength: 200 })
  .map((chars) => chars.join(''));

/** Generates allowed-char strings that are already within the max length (valid inputs). */
const validGameNameArb = fc.array(fc.constantFrom(...ALLOWED_CHARS), { minLength: 0, maxLength: MAX_GAME_NAME_LENGTH })
  .map((chars) => chars.join(''));

// Feature: misc-app-updates, Property 5: Game name sanitization preserves allowed characters and enforces length
// **Validates: Requirements 6.4, 6.5**

describe('sanitizeGameName — Property 5: Game name sanitization preserves allowed characters and enforces length', () => {
  it('output contains only characters matching GAME_NAME_PATTERN', () => {
    fc.assert(
      fc.property(unicodeStringArb, (input) => {
        const result = sanitizeGameName(input);
        expect(result).toMatch(GAME_NAME_PATTERN);
      }),
      { numRuns: 100 }
    );
  });

  it('output length is at most MAX_GAME_NAME_LENGTH (100)', () => {
    fc.assert(
      fc.property(unicodeStringArb, (input) => {
        const result = sanitizeGameName(input);
        expect(result.length).toBeLessThanOrEqual(MAX_GAME_NAME_LENGTH);
      }),
      { numRuns: 100 }
    );
  });

  it('for inputs already matching allowed pattern with length ≤ 100, output equals input (idempotence)', () => {
    fc.assert(
      fc.property(validGameNameArb, (input) => {
        const result = sanitizeGameName(input);
        expect(result).toBe(input);
      }),
      { numRuns: 100 }
    );
  });

  it('output contains only allowed characters for strings with mixed allowed and disallowed chars', () => {
    fc.assert(
      fc.property(allowedCharsArb, unicodeStringArb, (allowed, unicode) => {
        // Interleave allowed and arbitrary chars
        const mixed = allowed + unicode + allowed;
        const result = sanitizeGameName(mixed);
        expect(result).toMatch(GAME_NAME_PATTERN);
      }),
      { numRuns: 100 }
    );
  });

  it('sanitization is idempotent — applying it twice gives the same result as once', () => {
    fc.assert(
      fc.property(unicodeStringArb, (input) => {
        const once = sanitizeGameName(input);
        const twice = sanitizeGameName(once);
        expect(twice).toBe(once);
      }),
      { numRuns: 100 }
    );
  });
});
