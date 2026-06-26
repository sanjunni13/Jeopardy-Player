// ─── Retry Utility ────────────────────────────────────────────────────────────

export interface RetryOptions {
  /** Total number of attempts (1 original + retries). Default: 2 */
  maxAttempts: number;
  /** Delay in ms between retry attempts. Default: 2000 */
  delayMs: number;
  /** Timeout in ms for each attempt. Default: 10000 */
  timeoutMs: number;
  /** Predicate to determine if an error is retryable. */
  shouldRetry: (error: unknown) => boolean;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxAttempts: 2,
  delayMs: 2000,
  timeoutMs: 10000,
  shouldRetry: defaultShouldRetry,
};

/**
 * Default retry predicate. Retries on:
 * - TypeError with "fetch" or "network" in message (network failures)
 * - AbortError (timeout)
 * - Connection refused errors
 */
export function defaultShouldRetry(error: unknown): boolean {
  if (error instanceof TypeError) {
    const msg = error.message.toLowerCase();
    return msg.includes('fetch') || msg.includes('network');
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('connection refused')) {
      return true;
    }
    if (error.name === 'AbortError') {
      return true;
    }
  }

  return false;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes an async function with retry logic.
 *
 * - On success, returns the result immediately.
 * - On a retryable error, waits `delayMs` then retries up to `maxAttempts` total.
 * - On a non-retryable error, propagates immediately without retrying.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: Partial<RetryOptions>
): Promise<T> {
  const opts: RetryOptions = { ...DEFAULT_OPTIONS, ...options };

  let lastError: unknown;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      const result = await fn();
      return result;
    } catch (error: unknown) {
      lastError = error;

      // If the error is not retryable, propagate immediately
      if (!opts.shouldRetry(error)) {
        throw error;
      }

      // If we've exhausted all attempts, throw the last error
      if (attempt >= opts.maxAttempts) {
        throw error;
      }

      // Wait before retrying
      await delay(opts.delayMs);
    }
  }

  // This should never be reached, but satisfies TypeScript
  throw lastError;
}
