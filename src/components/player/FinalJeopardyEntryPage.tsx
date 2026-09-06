import { useState, useEffect, useCallback } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useFinalJeopardyEntry } from '../../hooks/useFinalJeopardyEntry';
import { fetchSession, updateFinalJeopardyState } from '../../utils/sessionApi';
import { broadcastMessage } from '../../utils/sessionChannel';
import type { FinalJeopardyState, FinalJeopardyWager, SessionPlayer } from '../../types/session';
import { DEFAULT_TOGGLE_CONFIG } from '../../types/game';
import {
  computeBalanceRelativeWagerRange,
  computeLowestPositiveBalance,
} from '../../utils/gameToggles';
import { formatCurrency } from '../../utils/currency';
import { ScoreboardStrip } from './ScoreboardStrip';
import './FinalJeopardyEntryPage.css';

interface FinalJeopardyEntryPageProps {
  sessionId: string;
  playerName: string;
  playerScore: number;
  channel: RealtimeChannel | null;
  submissionsLocked?: boolean;
  players?: SessionPlayer[];
  teamPool?: number | null;
  targetScore?: number | null;
  coopMode?: boolean;
}

const MAX_ANSWER_LENGTH = 200;

/** The wager range inputs the host persists at wager-phase start. */
type WagerConfig = NonNullable<FinalJeopardyState['wagerConfig']>;

export function FinalJeopardyEntryPage({
  sessionId,
  playerName,
  playerScore,
  channel,
  submissionsLocked = true,
  players = [],
  teamPool,
  targetScore,
  coopMode = false,
}: FinalJeopardyEntryPageProps) {
  const [wagerValue, setWagerValue] = useState('');
  const [wagerError, setWagerError] = useState<string | null>(null);
  const [wagerSubmitted, setWagerSubmitted] = useState(false);
  const [wagerSubmitting, setWagerSubmitting] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  /**
   * The wager range the host persisted into `FinalJeopardyState` when the
   * phase began. Read once from the mount fetch and held for the rest of the
   * phase, so a mid-phase reload restores the identical range.
   *
   * Requirements: 4.9, 4.10
   */
  const [persistedConfig, setPersistedConfig] = useState<WagerConfig | null>(null);

  /**
   * Used only when the session carries no `wagerConfig` — an older session or
   * a host that has not written it yet. Frozen on mount for the same reason
   * the persisted config is read-only.
   */
  const [fallbackConfig] = useState<WagerConfig>(() => ({
    wagerFloor: DEFAULT_TOGGLE_CONFIG.wagering.wagerFloor,
    lowestPositiveBalance: computeLowestPositiveBalance(players),
  }));

  // Frozen on mount: a balance change during the wager phase leaves the
  // already-computed range untouched (Requirement 4.10).
  const [frozenScore] = useState(playerScore);

  const wagerConfig = persistedConfig ?? fallbackConfig;

  // The one shared balance-relative range, identical to the host surface's
  // (Requirements 4.1–4.4, 4.7, 4.8).
  const { min: minWager, max: maxWager } = computeBalanceRelativeWagerRange(
    frozenScore,
    wagerConfig.wagerFloor,
    wagerConfig.lowestPositiveBalance,
  );

  // Check on mount if wager was already submitted (reconnect case)
  const [coopDetectedFromDb, setCoopDetectedFromDb] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchSession(sessionId).then(session => {
      if (cancelled || !session) return;
      // Check if co-op mode is flagged in the FJ state (stored in DB by host)
      if ((session.final_jeopardy_state as { coopMode?: boolean }).coopMode) {
        setCoopDetectedFromDb(true);
      }
      const config = session.final_jeopardy_state.wagerConfig;
      if (config) setPersistedConfig(config);
      const wagers = session.final_jeopardy_state.wagers ?? [];
      const existing = wagers.find(w => w.playerName.toLowerCase() === playerName.toLowerCase());
      if (existing) {
        setWagerSubmitted(true);
      }
    }).catch(() => {}).finally(() => {
      if (!cancelled) setInitialLoading(false);
    });
    return () => { cancelled = true; };
  }, [sessionId, playerName]);

  const submitWager = useCallback(async () => {
    setWagerError(null);
    const num = Number(wagerValue);

    if (wagerValue === '' || isNaN(num)) {
      setWagerError('Enter a valid number');
      return;
    }
    if (!Number.isInteger(num)) {
      setWagerError('Wager must be a whole number');
      return;
    }
    // Requirement 4.6 — the rejection names both bounds of the permitted range.
    if (num < minWager || num > maxWager) {
      setWagerError(
        `Wager must be between ${formatCurrency(minWager)} and ${formatCurrency(maxWager)}.`
      );
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
  }, [sessionId, playerName, wagerValue, minWager, maxWager, channel]);

  // Answer entry hook (only used after wager is submitted and clue is revealed)
  const {
    answer,
    setAnswer,
    submit: submitAnswer,
    status: answerStatus,
    answerError,
    hasSubmitted: hasSubmittedAnswer,
  } = useFinalJeopardyEntry(sessionId, playerName, playerScore, channel);

  // ─── Loading: wait for initial fetchSession before deciding what to show ──

  if (initialLoading) {
    return (
      <div className="fj-entry">
        <div className="fj-entry__header">
          <p className="fj-entry__player-name">{playerName}</p>
          <p className="fj-entry__player-score" style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
            Final Jeopardy
          </p>
        </div>
        <div className="fj-entry__confirmation">
          <p className="fj-entry__confirmation-text">Loading…</p>
        </div>
      </div>
    );
  }

  // ─── Co-op mode: skip wager/answer entry entirely ─────────────────────────

  const isCoopMode = coopMode || coopDetectedFromDb || (teamPool != null && targetScore != null);

  if (isCoopMode) {
    return (
      <div className="fj-entry">
        <div className="fj-entry__header">
          <p className="fj-entry__player-name">{playerName}</p>
          <p className="fj-entry__player-score" style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
            Final Jeopardy — Co-op Mode
          </p>
        </div>
        <div className="fj-entry__confirmation">
          <p className="fj-entry__confirmation-text">
            The host is handling the team wager and answer.
          </p>
          <p style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.5rem' }}>
            Discuss the answer with your team!
          </p>
        </div>
      </div>
    );
  }

  // ─── Wager phase ──────────────────────────────────────────────────────────

  if (!wagerSubmitted) {
    const scoreDisplay = formatCurrency(frozenScore);

    return (
      <div className="fj-entry">
        <div className="fj-entry__header">
          <p className="fj-entry__player-name">{playerName}</p>
          <p className="fj-entry__player-score" style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
            Final Jeopardy — Enter Your Wager
          </p>
          <p style={{ fontSize: '0.8125rem', color: '#64748b', margin: '0.25rem 0 0' }}>
            Your score: {scoreDisplay} • Wager range: {formatCurrency(minWager)} – {formatCurrency(maxWager)}
          </p>
        </div>

        <ScoreboardStrip players={players} currentPlayerName={playerName} teamPool={teamPool} targetScore={targetScore} />

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
                className={`fj-entry__textarea monetary-input${wagerError ? ' fj-entry__textarea--error' : ''}`}
                style={{ width: '100%', height: 'auto', minHeight: '3rem', resize: 'none', paddingLeft: '1.5rem' }}
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
        <ScoreboardStrip players={players} currentPlayerName={playerName} teamPool={teamPool} targetScore={targetScore} />
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
        <ScoreboardStrip players={players} currentPlayerName={playerName} teamPool={teamPool} targetScore={targetScore} />
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

      <ScoreboardStrip players={players} currentPlayerName={playerName} teamPool={teamPool} targetScore={targetScore} />

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
