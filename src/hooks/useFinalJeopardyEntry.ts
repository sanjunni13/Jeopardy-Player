import { useState, useCallback, useEffect } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  validateWager,
  validateAnswer,
  canSubmitFinalJeopardy,
} from '../utils/finalJeopardyValidation';
import { fetchSession, updateFinalJeopardyState } from '../utils/sessionApi';
import { broadcastMessage } from '../utils/sessionChannel';
import type { FinalJeopardySubmission } from '../types/session';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SubmissionStatus = 'idle' | 'submitting' | 'submitted' | 'error';

export interface UseFinalJeopardyEntryReturn {
  wager: number;
  setWager: (value: number) => void;
  answer: string;
  setAnswer: (value: string) => void;
  submit: () => Promise<void>;
  status: SubmissionStatus;
  wagerError: string | null;
  answerError: string | null;
  hasSubmitted: boolean;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Manages Final Jeopardy wager/answer form state, validation, submission
 * to Supabase, confirmation state, and retry on failure.
 *
 * @param sessionId - The current game session ID
 * @param playerName - The current player's name
 * @param playerScore - The current player's score (used for wager validation)
 * @param channel - The Supabase Realtime channel for broadcasting submission notifications
 */
export function useFinalJeopardyEntry(
  sessionId: string,
  playerName: string,
  playerScore: number,
  channel: RealtimeChannel | null
): UseFinalJeopardyEntryReturn {
  const [wager, setWager] = useState<number>(0);
  const [answer, setAnswer] = useState<string>('');
  const [status, setStatus] = useState<SubmissionStatus>('idle');
  const [wagerError, setWagerError] = useState<string | null>(null);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState<boolean>(false);

  // Check on mount if the player has already submitted (handles reconnect case)
  useEffect(() => {
    let cancelled = false;
    fetchSession(sessionId).then(session => {
      if (cancelled || !session) return;
      const submissions = session.final_jeopardy_state.submissions ?? [];
      if (!canSubmitFinalJeopardy(submissions, playerName)) {
        setHasSubmitted(true);
        setStatus('submitted');
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [sessionId, playerName]);

  const submit = useCallback(async () => {
    // Clear previous validation errors
    setWagerError(null);
    setAnswerError(null);

    // Validate wager
    const wagerResult = validateWager(wager, playerScore);
    if (!wagerResult.valid) {
      setWagerError(wagerResult.error);
      return;
    }

    // Validate answer
    const answerResult = validateAnswer(answer);
    if (!answerResult.valid) {
      setAnswerError(answerResult.error);
      return;
    }

    // Check if submission is still allowed (single submission enforcement)
    // Fetch current session state to get latest submissions
    setStatus('submitting');

    try {
      const session = await fetchSession(sessionId);
      if (!session) {
        setStatus('error');
        setWagerError('Session not found');
        return;
      }

      const currentSubmissions = session.final_jeopardy_state.submissions ?? [];

      if (!canSubmitFinalJeopardy(currentSubmissions, playerName)) {
        // Player has already submitted
        setStatus('submitted');
        setHasSubmitted(true);
        return;
      }

      // Build the new submission
      const submission: FinalJeopardySubmission = {
        playerName,
        wager,
        answer: answer.trim(),
        submittedAt: new Date().toISOString(),
      };

      // Append to existing submissions and update Supabase
      const updatedSubmissions = [...currentSubmissions, submission];
      await updateFinalJeopardyState(sessionId, {
        ...session.final_jeopardy_state,
        submissions: updatedSubmissions,
      });

      // Broadcast submission notification via channel
      if (channel) {
        await broadcastMessage(channel, {
          type: 'fj_submission_received',
          playerName,
        });
      }

      setStatus('submitted');
      setHasSubmitted(true);
    } catch (err: unknown) {
      // On failure: keep form populated, allow retry
      setStatus('error');
      const message =
        err instanceof Error ? err.message : 'Submission failed. Please retry.';
      setWagerError(message);
    }
  }, [sessionId, playerName, playerScore, wager, answer, channel]);

  return {
    wager,
    setWager,
    answer,
    setAnswer,
    submit,
    status,
    wagerError,
    answerError,
    hasSubmitted,
  };
}
