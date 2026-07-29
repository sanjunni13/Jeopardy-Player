/**
 * Structured logging utility for the Jeopardy app.
 *
 * Outputs structured JSON to the console so that:
 * - Edge Functions: Supabase captures these in its built-in Log Explorer
 * - Client-side: Logs appear in DevTools with consistent format, queryable
 *   if piped to an observability service later
 *
 * No extra DB calls — zero overhead beyond a console statement.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type LogLevel = 'info' | 'warn' | 'error';

export type LogCategory =
  | 'auth'
  | 'game'
  | 'session'
  | 'buzzer'
  | 'final_jeopardy'
  | 'draft'
  | 'media'
  | 'rating'
  | 'favorite'
  | 'leaderboard'
  | 'settings'
  | 'generation'
  | 'realtime'
  | 'storage';

export interface LogPayload {
  category: LogCategory;
  action: string;
  message: string;
  metadata?: Record<string, unknown>;
  userId?: string | null;
  sessionId?: string | null;
  durationMs?: number | null;
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function buildLogObject(level: LogLevel, payload: LogPayload) {
  return {
    level,
    category: payload.category,
    action: payload.action,
    msg: payload.message,
    ...(payload.metadata && { meta: payload.metadata }),
    ...(payload.userId && { userId: payload.userId }),
    ...(payload.sessionId && { sessionId: payload.sessionId }),
    ...(payload.durationMs != null && { durationMs: payload.durationMs }),
    ts: new Date().toISOString(),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Log an info-level structured event */
export function logInfo(
  category: LogCategory,
  action: string,
  message: string,
  metadata?: Record<string, unknown>
): void {
  console.log(JSON.stringify(buildLogObject('info', { category, action, message, metadata })));
}

/** Log a warning-level structured event */
export function logWarn(
  category: LogCategory,
  action: string,
  message: string,
  metadata?: Record<string, unknown>
): void {
  console.warn(JSON.stringify(buildLogObject('warn', { category, action, message, metadata })));
}

/** Log an error-level structured event */
export function logError(
  category: LogCategory,
  action: string,
  message: string,
  metadata?: Record<string, unknown>
): void {
  console.error(JSON.stringify(buildLogObject('error', { category, action, message, metadata })));
}

/**
 * Start a timed operation. Call `done()` when the operation completes
 * to log with duration automatically calculated.
 */
export function logTimed(
  category: LogCategory,
  action: string,
  metadata?: Record<string, unknown>
): { done: (result?: { success: boolean; error?: string }) => void } {
  const start = performance.now();

  return {
    done(result?: { success: boolean; error?: string }) {
      const durationMs = Math.round(performance.now() - start);
      const level: LogLevel = result?.success === false ? 'error' : 'info';
      const message = result?.success === false
        ? `${action} failed: ${result.error ?? 'unknown error'}`
        : `${action} completed`;

      const logFn = level === 'error' ? console.error : console.log;
      logFn(JSON.stringify(buildLogObject(level, {
        category,
        action,
        message,
        metadata: { ...metadata, ...result },
        durationMs,
      })));
    },
  };
}
