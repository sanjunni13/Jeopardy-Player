import { useState, useEffect, useCallback } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useFinalJeopardyEntry } from '../../hooks/useFinalJeopardyEntry';
import { fetchSession, updateFinalJeopardyState } from '../../utils/sessionApi';
import { broadcastMessage } from '../../utils/sessionChannel';
import type { FinalJeopardyWager } from '../../types/session';
import './FinalJeopardyEntryPage.css';

interface FinalJeopardyEntryPageProps {
  sessionId: string;
  playerName: string;
  playerScore: number;
  channel: RealtimeChannel | null;
  submissionsLocked?: boolean;
}

const MAX_ANSWER_LENGTH = 200;

export function FinalJeopardyEntryPage({
  sessionId,
  playerName,
  playerScore,
  channel,
  submissionsLocked = true,
}: FinalJeopardyEntryPageProps) {
  const [wagerValue, setWagerValue] = useState('');
  const [wagerError, setWagerError] = useState<string | null>(null);
  const [wagerSubmitted, setWagerSubmitted] = useState(false);
  const [wagerSubmitting, setWagerSubmitting] = useState(false);

  const maxWager = playerScore > 0 ? playerScore : 1000;

  // Check on mount if wager was already submitted (reconnect case)
  useEffect(() => {
    let cancelled = false;
    fetchSession(sessionId).then(session => {
      if (cancelled || !session) return;
      const wagers = session.final_jeopardy_state.wagers ?? [];
      const existing = wagers.find(w => w.playerName.toLowerCase() === playerName.toLowerCase());
      if (existing) {
        setWagerSubmitted(true);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [sessionId, playerName]);

  const submitWager = useCallback(async () => {
    setWagerError(null);
    const num = Number(wagerValue);

    if (wagerValue === '' || isNaN(num)) {
      setWagerError('Enter a valid number');
      return;
    }
    if (num < 0) {
      setWagerError('Wager cannot be negative');
      return;
    }
    if (num > maxWager) {
      setWagerError(`Maximum wager is $${maxWager.toLocaleString()}`);
      return;
    }
    if (!Number.isInteger(num)) {
      setWagerError('Wager must be a whole number');
      return;
    }

    setWagerSubmitting(true);
    try {
      const session = await fetchSession(sessionId);
      if (!session) { setWagerError('Session not found'); setWagerSubmitting(false); return; }

      const currentWagers = session.final_jeopardy_state.wagers ?? [];
      // Check if already submitted
      if (currentWagers.some(w => w.playerName.toLowerCase() === playerName.toLowerCase())) {
        setWagerSubmitted(true);
        setWagerSubmitting(false);
        return;
      }

      const newWager: FinalJeopardyWager = {
        playerName,
        wager: num,
        submittedAt: new Date().toISOString(),
      };

      await updateFinalJeopardyState(sessionId, {
        ...session.final_jeopardy_state,
        wagers: [...currentWagers, newWager],
      });

      if (channel) {
        await broadcastMessage(channel, { type: 'fj_wager_received', playerName });
      }

      setWagerSubmitted(true);
    } catch {
      setWagerError('Failed to submit. Please try again.');
    } finally {
      setWagerSubmitting(false);
    }
  }, [sessionId, playerName, wagerValue, maxWager, channel]);

  // Answer entry hook (only used after wager is submitted and clue is revealed)
  const {
    answer,
    setAnswer,
    submit: submitAnswer,
    status: answerStatus,
    answerError,
    hasSubmitted: hasSubmittedAnswer,
  } = useFinalJeopardyEntry(sessionId, playerName, playerScore, channel);

  // ─── Wager phase ──────────────────────────────────────────────────────────

  if (!wagerSubmitted) {
    const scoreDisplay = playerScore < 0
      ? `-$${Math.abs(playerScore).toLocaleString()}`
      : `$${playerScore.toLocaleString()}`;

    return (
      <div className="fj-entry">
        <div className="fj-entry__header">
          <p className="fj-entry__player-name">{playerName}</p>
          <p className="fj-entry__player-score" style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
            Final Jeopardy — Enter Your Wager
          </p>
          <p style={{ fontSize: '0.8125rem', color: '#64748b', margin: '0.25rem 0 0' }}>
            Your score: {scoreDisplay} • Max wager: ${maxWager.toLocaleString()}
          </p>
        </div>

        <form className="fj-entry__form" onSubmit={(e) => { e.preventDefault(); submitWager(); }} noValidate>
          <div className="fj-entry__field">
            <label className="fj-entry__label" htmlFor="fj-wager">
              Wager
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
              <span style={{ position: 'absolute', left: '0.75rem', color: '#94a3b8', fontSize: '1rem', pointerEvents: 'none', zIndex: 1 }}>$</span>
              <input
                id="fj-wager"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                className={`fj-entry__textarea${wagerError ? ' fj-entry__textarea--error' : ''}`}
                style={{ width: '100%', height: 'auto', minHeight: '3rem', resize: 'none', paddingLeft: '1.5rem', textAlign: 'right' }}
                value={wagerValue}
                onChange={(e) => {
                  const val = e.target.value;
                  if (/^\d*$/.test(val)) {
                    setWagerValue(val);
                    if (wagerError) setWagerError(null);
                  }
                }}
                disabled={wagerSubmitting}
                placeholder="0"
                aria-invalid={!!wagerError}
                aria-describedby={wagerError ? 'fj-wager-error' : undefined}
              />
            </div>
            {wagerError && (
              <span id="fj-wager-error" className="fj-entry__error" role="alert">
                {wagerError}
              </span>
            )}
          </div>

          <button
            type="submit"
            className="fj-entry__submit-button"
            disabled={wagerSubmitting}
          >
            {wagerSubmitting ? 'Submitting…' : 'Submit Wager'}
          </button>
        </form>
      </div>
    );
  }

  // ─── Wager submitted, waiting for clue ────────────────────────────────────

  // Answer already submitted — show confirmation regardless of lock state
  if (hasSubmittedAnswer) {
    return (
      <div className="fj-entry">
        <div className="fj-entry__header">
          <p className="fj-entry__player-name">{playerName}</p>
        </div>
        <div className="fj-entry__confirmation">
          <p className="fj-entry__confirmation-text">
            Your answer has been submitted
          </p>
        </div>
      </div>
    );
  }

  if (submissionsLocked) {
    return (
      <div className="fj-entry">
        <div className="fj-entry__header">
          <p className="fj-entry__player-name">{playerName}</p>
          <p className="fj-entry__player-score" style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
            Final Jeopardy
          </p>
        </div>
        <div className="fj-entry__confirmation">
          <p className="fj-entry__confirmation-text">
            Wager submitted! Waiting for the clue to be revealed…
          </p>
        </div>
      </div>
    );
  }

  // ─── Answer entry phase ───────────────────────────────────────────────────

  const charsRemaining = MAX_ANSWER_LENGTH - answer.length;
  const isSubmitting = answerStatus === 'submitting';

  return (
    <div className="fj-entry">
      <div className="fj-entry__header">
        <p className="fj-entry__player-name">{playerName}</p>
        <p className="fj-entry__player-score" style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
          Final Jeopardy — Enter Your Answer
        </p>
      </div>

      <form className="fj-entry__form" onSubmit={(e) => { e.preventDefault(); submitAnswer(); }} noValidate>
        <div className="fj-entry__field">
          <label className="fj-entry__label" htmlFor="fj-answer">
            Your Answer
          </label>
          <textarea
            id="fj-answer"
            className={`fj-entry__textarea${answerError ? ' fj-entry__textarea--error' : ''}`}
            value={answer}
            onChange={(e) => { if (e.target.value.length <= MAX_ANSWER_LENGTH) setAnswer(e.target.value); }}
            maxLength={MAX_ANSWER_LENGTH}
            disabled={isSubmitting}
            placeholder="What is..."
            aria-invalid={!!answerError}
            aria-describedby="fj-answer-counter fj-answer-error"
          />
          <span
            id="fj-answer-counter"
            className={`fj-entry__char-counter${
              charsRemaining <= 20 && charsRemaining > 0
                ? ' fj-entry__char-counter--warning'
                : charsRemaining <= 0
                  ? ' fj-entry__char-counter--over'
                  : ''
            }`}
          >
            {charsRemaining} characters remaining
          </span>
          {answerError && (
            <span id="fj-answer-error" className="fj-entry__error" role="alert">
              {answerError}
            </span>
          )}
        </div>

        <button
          type="submit"
          className="fj-entry__submit-button"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Submitting…' : 'Submit Answer'}
        </button>
      </form>

      {answerStatus === 'error' && (
        <div className="fj-entry__submission-error" role="alert">
          Submission failed. Please try again.
        </div>
      )}
    </div>
  );
}
