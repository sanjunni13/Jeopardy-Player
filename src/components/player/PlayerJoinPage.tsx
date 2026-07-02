import { useState, useEffect } from 'react';
import { useGameSession } from '../../hooks/useGameSession';
import { canRegisterPlayer } from '../../utils/sessionRegistration';
import { joinSession } from '../../utils/sessionApi';
import { getOnlinePlayerNames } from '../../utils/sessionChannel';
import './PlayerJoinPage.css';

interface PlayerJoinPageProps {
  sessionId: string;
  onJoined: (playerName: string) => void;
}

/**
 * Player join screen displayed when a player scans the QR code.
 *
 * Shows the host's player list as a picker so players select their name
 * rather than typing it free-form. This prevents name mismatches and makes
 * reconnection straightforward — returning players see a "Rejoin as X" shortcut.
 *
 * Taken names (currently online by someone else) are shown but disabled.
 */
export function PlayerJoinPage({ sessionId, onJoined }: PlayerJoinPageProps) {
  const { session, connectionState, channel, error: sessionError } = useGameSession(sessionId);

  const storageKey = `buzzer_name_${sessionId}`;
  const previousName = sessionStorage.getItem(storageKey);

  // When a previous name exists, start in "returning" mode — show the rejoin shortcut.
  // The player can tap "I'm someone else" to switch to picker mode.
  const [mode, setMode] = useState<'returning' | 'picking'>(
    previousName ? 'returning' : 'picking'
  );
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [onlinePlayers, setOnlinePlayers] = useState<string[]>([]);
  const [mountTime] = useState(() => Date.now());

  // Keep online players list updated from presence state
  useEffect(() => {
    if (!channel || connectionState !== 'connected') return;
    const immediate = setTimeout(() => {
      setOnlinePlayers(getOnlinePlayerNames(channel));
    }, 0);
    const interval = setInterval(() => {
      setOnlinePlayers(getOnlinePlayerNames(channel));
    }, 2000);
    return () => {
      clearTimeout(immediate);
      clearInterval(interval);
    };
  }, [channel, connectionState]);

  // ─── Session error / loading states ────────────────────────────────────

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

  // ─── Helpers ─────────────────────────────────────────────────────────

  /**
   * A name is "taken" when it's currently online AND it isn't the returning
   * player's own name (which they're allowed to reclaim).
   */
  function isNameTaken(name: string): boolean {
    const lower = name.toLowerCase();
    const isOnline = onlinePlayers.some(n => n.toLowerCase() === lower);
    const isOwnName = previousName?.toLowerCase() === lower;
    return isOnline && !isOwnName;
  }

  // ─── Submit ───────────────────────────────────────────────────────────

  async function handleSubmit(nameToJoin: string) {
    setError(null);

    const trimmed = nameToJoin.trim();
    if (!trimmed) return;

    // Guard: name must still be in the session player list (could have been
    // removed by the host between the player opening the picker and tapping Join)
    const isInPlayerList = session!.players.some(
      p => p.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (!isInPlayerList) {
      setError('That player is no longer in the session. Please refresh and try again.');
      return;
    }

    // Guard: name taken by an active player who isn't us
    const currentOnline = channel ? getOnlinePlayerNames(channel) : onlinePlayers;
    const isCurrentlyOnline = currentOnline.some(n => n.toLowerCase() === trimmed.toLowerCase());
    const isOwnName = previousName?.toLowerCase() === trimmed.toLowerCase();

    if (isCurrentlyOnline && !isOwnName) {
      setError('That name is currently in use by an active player.');
      return;
    }

    // Guard: this browser already has a different name locked in (anti-impersonation)
    const isExistingPlayer = session!.players.some(
      p => p.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (isExistingPlayer && previousName && !isOwnName) {
      setError('That name belongs to another player in this session.');
      return;
    }

    // Guard: registration eligibility for genuinely new players
    if (!isExistingPlayer && !canRegisterPlayer(session!.is_locked, session!.players.length, 10)) {
      setError(session!.is_locked ? 'Session is locked by the host.' : 'Session is full.');
      return;
    }

    setSubmitting(true);
    try {
      await joinSession(sessionId, trimmed);
      sessionStorage.setItem(storageKey, trimmed);
      onJoined(trimmed);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to join session';
      setError(message.includes('not found') ? 'Session not found or has ended.' : message);
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Returning player view ────────────────────────────────────────────

  if (mode === 'returning' && previousName) {
    const taken = isNameTaken(previousName);

    return (
      <div className="player-join-page">
        <div className="player-join-page__card">
          <h1 className="player-join-page__title">Welcome back</h1>
          <p className="player-join-page__subtitle">
            You previously joined as:
          </p>

          <div className="player-join-page__returning">
            <p className="player-join-page__returning-name">
              <span>{previousName}</span>
            </p>

            {error && (
              <p className="player-join-page__error" role="alert">{error}</p>
            )}

            <button
              type="button"
              className="player-join-page__submit"
              disabled={submitting || taken}
              onClick={() => handleSubmit(previousName)}
            >
              {submitting ? 'Rejoining…' : taken ? 'Name is taken' : `Rejoin as ${previousName}`}
            </button>

            <button
              type="button"
              className="player-join-page__switch-link"
              disabled={submitting}
              onClick={() => {
                setMode('picking');
                setError(null);
                setSelectedName(null);
              }}
            >
              I'm someone else
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Picker view ──────────────────────────────────────────────────────

  const hasPlayers = session.players.length > 0;

  return (
    <div className="player-join-page">
      <div className="player-join-page__card">
        <h1 className="player-join-page__title">Join Game</h1>

        {hasPlayers ? (
          <>
            <p className="player-join-page__picker-label">
              Select your name
            </p>

            <div className="player-join-page__picker" role="list">
              {session.players.map((player) => {
                const taken = isNameTaken(player.name);
                const isSelected = selectedName === player.name;
                // A name is "online" but NOT taken means it's the returning player's
                // own name visible in the list — show a green "you" badge instead.
                const isOwnOnline =
                  onlinePlayers.some(n => n.toLowerCase() === player.name.toLowerCase()) &&
                  previousName?.toLowerCase() === player.name.toLowerCase();

                return (
                  <button
                    key={player.name}
                    type="button"
                    role="listitem"
                    disabled={taken || submitting}
                    className={[
                      'player-join-page__player-btn',
                      isSelected ? 'player-join-page__player-btn--selected' : '',
                    ].filter(Boolean).join(' ')}
                    aria-pressed={isSelected}
                    onClick={() => {
                      setSelectedName(player.name);
                      setError(null);
                    }}
                  >
                    <span className="player-join-page__player-btn-name">
                      {player.name}
                    </span>

                    {taken && (
                      <span className="player-join-page__player-btn-badge player-join-page__player-btn-badge--taken">
                        taken
                      </span>
                    )}
                    {isOwnOnline && (
                      <span className="player-join-page__player-btn-badge player-join-page__player-btn-badge--online">
                        you
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {error && (
              <p className="player-join-page__error" role="alert">{error}</p>
            )}

            <button
              type="button"
              className="player-join-page__submit"
              disabled={!selectedName || submitting}
              onClick={() => selectedName && handleSubmit(selectedName)}
            >
              {submitting
                ? 'Joining…'
                : selectedName
                  ? `Join as ${selectedName}`
                  : 'Select your name'}
            </button>
          </>
        ) : (
          <p className="player-join-page__subtitle">
            No players have been added yet. Wait for the host to add your name, then refresh this page.
          </p>
        )}
      </div>
    </div>
  );
}
