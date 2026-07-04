import { useState, useEffect, useRef, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseClueTimerOptions {
  /** When false the hook is a no-op: no interval is started, remaining stays at duration */
  enabled: boolean;
  /** Countdown duration in whole seconds (configured Timer_Duration) */
  duration: number;
  /** Called once when remaining hits 0 */
  onExpire: () => void;
}

export interface UseClueTimerReturn {
  /** Whole seconds remaining in the countdown */
  remaining: number;
  /** Whether the interval is currently running */
  isRunning: boolean;
  /** Clears the interval and sets isRunning to false; does NOT reset remaining */
  stop: () => void;
  /** Stops the interval AND resets remaining to duration */
  reset: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Countdown timer hook for Timed Clue Responses.
 *
 * When `enabled` is true the timer starts automatically, decrementing
 * `remaining` by 1 every second.  When `remaining` reaches 0, `onExpire`
 * is called and the interval is stopped.
 *
 * When `enabled` is false the hook is a no-op: it returns
 * `{ remaining: duration, isRunning: false }` and never starts an interval.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.6, 10.7
 */
export function useClueTimer({
  enabled,
  duration,
  onExpire,
}: UseClueTimerOptions): UseClueTimerReturn {
  const [remaining, setRemaining] = useState<number>(duration);
  const [isRunning, setIsRunning] = useState<boolean>(false);

  // Stable refs so callbacks inside the interval closure always see the
  // latest values without needing the effect to re-run.
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onExpireRef = useRef<() => void>(onExpire);
  const remainingRef = useRef<number>(duration);

  // Keep onExpireRef in sync with the latest callback prop.
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  // ─── Internal helpers ───────────────────────────────────────────────────────

  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // ─── Public API ─────────────────────────────────────────────────────────────

  /** Stop the interval; remaining is preserved at its current value. */
  const stop = useCallback(() => {
    clearTimer();
    setIsRunning(false);
  }, [clearTimer]);

  /** Stop the interval and reset remaining back to duration. */
  const reset = useCallback(() => {
    clearTimer();
    remainingRef.current = duration;
    setRemaining(duration);
    setIsRunning(false);
  }, [clearTimer, duration]);

  // ─── Core timer effect ──────────────────────────────────────────────────────

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!enabled) {
      // Ensure any previously-running interval is cleaned up when disabled.
      clearTimer();
      setIsRunning(false);
      remainingRef.current = duration;
      setRemaining(duration);
      return;
    }

    // Defensive handling: if duration is 0 or negative, fire immediately.
    if (duration <= 0) {
      onExpireRef.current();
      return;
    }

    // Sync remaining to the new duration when the timer (re)starts.
    remainingRef.current = duration;
    setRemaining(duration);
    setIsRunning(true);

    intervalRef.current = setInterval(() => {
      remainingRef.current -= 1;
      setRemaining(remainingRef.current);

      if (remainingRef.current <= 0) {
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
        setIsRunning(false);
        onExpireRef.current();
      }
    }, 1000);

    // Cleanup: clear the interval when the effect re-runs or on unmount.
    return () => {
      clearTimer();
    };
  // We intentionally omit `clearTimer` from deps here to avoid re-creating the
  // interval when only the stable helper reference changes; `enabled` and
  // `duration` are the true triggers for restarting the timer.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, duration]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return { remaining, isRunning, stop, reset };
}
