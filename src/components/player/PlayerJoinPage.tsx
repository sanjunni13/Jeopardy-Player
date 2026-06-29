import { useState, useEffect } from 'react';
import { useGameSession } from '../../hooks/useGameSession';
import { validatePlayerName, isDuplicateName } from '../../utils/playerNameValidation';
import { canRegisterPlayer } from '../../utils/sessionRegistration';
import { joinSession } from '../../utils/sessionApi';
import { getOnlinePlayerNames } from '../../utils/sessionChannel';
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
  const { session, connectionState, channel, error: sessionError } = useGameSession(sessionId);

  // Check if this browser previously joined this session under a specific name
  const storageKey = `buzzer_name_${sessionId}`;
  const previousName = sessionStorage.getItem(storageKey);

  const [name, setName] = useState(previousName ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [onlinePlayers, setOnlinePlayers] = useState<string[]>([]);
  const [mountTime] = useState(() => Date.now());

  // Keep online players list updated from presence state
  useEffect(() => {
    if (!channel || connectionState !== 'connected') return;
    // Immediate first read after a microtask (avoids synchronous setState in effect)
    const immediate = setTimeout(() => {
      setOnlinePlayers(getOnlinePlayerNames(channel));
    }, 0);
    // Then poll every 2 seconds
    const interval = setInterval(() => {
      setOnlinePlayers(getOnlinePlayerNames(channel));
    }, 2000);
    return () => {
      clearTimeout(immediate);
      clearInterval(interval);
    };
  }, [channel, connectionState]);

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

  // Treat sessions inactive for 30+ minutes as stale/ended
  const STALE_TIMEOUT_MS = 30 * 60 * 1000;
  const lastUpdated = new Date(session.updated_at).getTime();
  const isStale = mountTime - lastUpdated > STALE_TIMEOUT_MS;

  if (isStale) {
    return (
      <div className="player-join-page">
        <div className="player-join-page__error-card" role="alert">
          <h2 className="player-join-page__error-title">Session Expired</h2>
          <p className="player-join-page__error-message">
            This session has been inactive for too long and is no longer available.
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

    // Validate that the name exists in the host's player list (1:1 match required)
    if (session!.players.length === 0) {
      setError('No players have been added yet. Wait for the host to add your name.');
      return;
    }

    const isInPlayerList = session!.players.some(
      p => p.name.toLowerCase() === name.trim().toLowerCase()
    );
    if (!isInPlayerList) {
      setError('Your name must match a player in the host\'s player list');
      return;
    }

    // Check for duplicate name — allow rejoin if player is offline (disconnected)
    const isExistingPlayer = isDuplicateName(session!.players, name);
    // Read presence state fresh at submit time to avoid stale onlinePlayers
    const currentOnline = channel ? getOnlinePlayerNames(channel) : onlinePlayers;
    const isCurrentlyOnline = currentOnline.some(
      n => n.toLowerCase() === name.trim().toLowerCase()
    );
    const isOwnName = previousName?.toLowerCase() === name.trim().toLowerCase();

    // Block if the name is currently online AND it's not our own reconnect
    // (someone else is actively using that buzzer)
    if (isExistingPlayer && isCurrentlyOnline && !isOwnName) {
      setError('That name is currently in use by an active player');
      return;
    }

    // Block if we have a previous name stored and are trying to switch to a different
    // existing player (prevents impersonation from the same browser tab)
    if (isExistingPlayer && previousName && !isOwnName) {
      setError('That name belongs to another player in this session');
      return;
    }

    // Check registration eligibility (only for new players, not rejoins)
    if (!isExistingPlayer && !canRegisterPlayer(session!.is_locked, session!.players.length, 10)) {
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
      // Remember the name for this session so the player can only rejoin as themselves
      sessionStorage.setItem(storageKey, name.trim());
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
