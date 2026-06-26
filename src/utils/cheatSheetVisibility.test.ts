import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { shouldShowCheatSheet } from './cheatSheetVisibility';

// Feature: misc-app-updates, Property 6: Cheat Sheet visible for all Library-launched games
// **Validates: Requirements 7.1, 7.4**

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/** Generates a random game source value (string, null, or undefined). */
const sourceArb = fc.oneof(
  fc.string({ minLength: 1 }),
  fc.constantFrom('ai', 'labs', 'archive'),
  fc.constant(null),
  fc.constant(undefined)
);

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('shouldShowCheatSheet — Property 6: Cheat Sheet visible for all Library-launched games', () => {
  it('returns true for any source when fromLibrary is true', () => {
    fc.assert(
      fc.property(sourceArb, (source) => {
        expect(shouldShowCheatSheet(source, true)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('returns false for source === null with fromLibrary absent or false', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(undefined, false),
        (fromLibrary) => {
          expect(shouldShowCheatSheet(null, fromLibrary)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns true for known sources (ai, labs, archive) without fromLibrary', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('ai', 'labs', 'archive'),
        fc.constantFrom(undefined, false),
        (source, fromLibrary) => {
          expect(shouldShowCheatSheet(source, fromLibrary)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
