import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { withRetry, defaultShouldRetry } from './retry';

// Feature: misc-app-updates, Property 1: Retry utility respects retry predicates
// **Validates: Requirements 3.4**

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Creates an error that `defaultShouldRetry` classifies as retryable. */
function makeRetryableError(kind: 'network' | 'fetch' | 'abort' | 'connectionRefused'): Error {
  switch (kind) {
    case 'network':
      return new TypeError('network error');
    case 'fetch':
      return new TypeError('fetch failed');
    case 'abort': {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      return err;
    }
    case 'connectionRefused':
      return new Error('connection refused');
  }
}

/** Creates an error that `defaultShouldRetry` classifies as non-retryable. */
function makeNonRetryableError(message: string): Error {
  return new Error(message);
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

const retryableErrorKindArb = fc.constantFrom(
  'network' as const,
  'fetch' as const,
  'abort' as const,
  'connectionRefused' as const
);

const nonRetryableMessageArb = fc.string({ minLength: 1 }).filter((msg) => {
  // Ensure the generated message does NOT match any retryable pattern
  const lower = msg.toLowerCase();
  return (
    !lower.includes('fetch') &&
    !lower.includes('network') &&
    !lower.includes('connection refused')
  );
});

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('withRetry — Property 1: Retry respects predicates', () => {
  it('invokes the function exactly twice for retryable errors (1 original + 1 retry)', async () => {
    await fc.assert(
      fc.asyncProperty(retryableErrorKindArb, async (kind) => {
        let callCount = 0;
        const error = makeRetryableError(kind);

        const fn = () => {
          callCount++;
          return Promise.reject(error);
        };

        await expect(
          withRetry(fn, { maxAttempts: 2, delayMs: 1, timeoutMs: 10000 })
        ).rejects.toThrow();

        expect(callCount).toBe(2);
      }),
      { numRuns: 100 }
    );
  });

  it('invokes the function exactly once for non-retryable errors and propagates immediately', async () => {
    await fc.assert(
      fc.asyncProperty(nonRetryableMessageArb, async (message) => {
        let callCount = 0;
        const error = makeNonRetryableError(message);

        const fn = () => {
          callCount++;
          return Promise.reject(error);
        };

        await expect(
          withRetry(fn, { maxAttempts: 2, delayMs: 1, timeoutMs: 10000 })
        ).rejects.toThrow(message);

        expect(callCount).toBe(1);
      }),
      { numRuns: 100 }
    );
  });

  it('defaultShouldRetry correctly classifies retryable errors as true', () => {
    fc.assert(
      fc.property(retryableErrorKindArb, (kind) => {
        const error = makeRetryableError(kind);
        expect(defaultShouldRetry(error)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('defaultShouldRetry correctly classifies non-retryable errors as false', () => {
    fc.assert(
      fc.property(nonRetryableMessageArb, (message) => {
        const error = makeNonRetryableError(message);
        expect(defaultShouldRetry(error)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });
});
