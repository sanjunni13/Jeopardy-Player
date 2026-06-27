import { useState } from 'react';
import { useGameSession } from '../../hooks/useGameSession';
import { validatePlayerName, isDuplicateName } from '../../utils/playerNameValidation';
import { canRegisterPlayer } from '../../utils/sessionRegistration';
import { joinSession } from '../../utils/sessionApi';
import './PlayerJoinPage.css';

interface PlayerJoinPageProps {
  sessionId: string;
  onJoined: (playerName: string) => void;
}

/**
 * Name entry form displayed when a player scans the QR code and lands on the session page.
 *
 * Validates the name (1-20 chars, at least one non-whitespace), checks for duplicates
 * (case-insensitive), and verifies the session can accept new registrations before submitting.
 */
export function PlayerJoinPage({ sessionId, onJoined }: PlayerJoinPageProps) {
  const { session, connectionState, error: sessionError } = useGameSession(sessionId);

  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ─── Session error states ───────────────────────────────────────────────

  if (connectionState === 'connecting') {
    return (
      <div className="player-join-page">
        <p className="player-join-page__loading">Loading session…</p>
      </div>
    );
  }

  if (!session && sessionError) {
    return (
      <div className="player-join-page">
        <div className="player-join-page__error-card" role="alert">
          <h2 className="player-join-page__error-title">Session Not Found</h2>
          <p className="player-join-page__error-message">
            This session does not exist or has ended.
          </p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="player-join-page">
        <p className="player-join-page__loading">Loading session…</p>
      </div>
    );
  }

  if (session.phase === 'ended') {
    return (
      <div className="player-join-page">
        <div className="player-join-page__error-card" role="alert">
          <h2 className="player-join-page__error-title">Session Ended</h2>
          <p className="player-join-page__error-message">
            This session has already ended.
          </p>
        </div>
      </div>
    );
  }

  // ─── Form submission ────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    // Validate name format
    const validation = validatePlayerName(name);
    if (!validation.valid) {
      setError(validation.error);
      return;
    }

    // Check for duplicate name
    if (isDuplicateName(session!.players, name)) {
      setError('That name is already taken');
      return;
    }

    // Check registration eligibility
    if (!canRegisterPlayer(session!.is_locked, session!.players.length, 10)) {
      if (session!.is_locked) {
        setError('Session is locked by the host');
      } else {
        setError('Session is full');
      }
      return;
    }

    // Submit registration
    setSubmitting(true);
    try {
      await joinSession(sessionId, name);
      onJoined(name);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to join session';
      if (message.includes('not found')) {
        setError('Session not found or has ended');
      } else {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    setName(e.target.value);
    if (error) {
      setError(null);
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="player-join-page">
      <div className="player-join-page__card">
        <h1 className="player-join-page__title">Join Game</h1>
        <p className="player-join-page__subtitle">
          Enter your name to join the session.
        </p>

        <form onSubmit={handleSubmit} className="player-join-page__form">
          <div className="player-join-page__field">
            <label htmlFor="player-name" className="player-join-page__label">
              Your Name
            </label>
            <input
              id="player-name"
              type="text"
              value={name}
              onChange={handleNameChange}
              placeholder="Enter your name"
              maxLength={20}
              autoComplete="off"
              className={`player-join-page__input ${error ? 'player-join-page__input--error' : ''}`}
              aria-describedby={error ? 'player-name-error' : undefined}
              aria-invalid={!!error}
              disabled={submitting}
            />
            <span className="player-join-page__char-count" aria-hidden="true">
              {name.length}/20
            </span>
          </div>

          {error && (
            <p id="player-name-error" className="player-join-page__error" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="player-join-page__submit"
          >
            {submitting ? 'Joining…' : 'Join'}
          </button>
        </form>
      </div>
    </div>
  );
}
