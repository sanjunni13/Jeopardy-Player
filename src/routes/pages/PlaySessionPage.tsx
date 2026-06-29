import { useState, useEffect, useRef } from 'react';
import { useParams } from '@tanstack/react-router';
import { PlayerJoinPage } from '../../components/player/PlayerJoinPage';
import { BuzzerPage } from '../../components/player/BuzzerPage';
import { FinalJeopardyEntryPage } from '../../components/player/FinalJeopardyEntryPage';
import { SessionEndedPage } from '../../components/player/SessionEndedPage';
import { ConnectionStatusBanner } from '../../components/player/ConnectionStatusBanner';
import { useGameSession } from '../../hooks/useGameSession';
import { broadcastMessage, trackPresence, untrackPresence } from '../../utils/sessionChannel';

/**
 * Route page for /play/$sessionId.
 *
 * This is a public, unauthenticated route that players navigate to by scanning a QR code.
 * It manages the top-level player flow: join → phase-based interaction (buzzer, final jeopardy, ended).
 */
export function PlaySessionPage() {
  const { sessionId } = useParams({ strict: false }) as { sessionId: string };

  // Auto-restore player name from sessionStorage if they previously joined this session
  const storageKey = `buzzer_name_${sessionId}`;
  const [playerName, setPlayerName] = useState<string | null>(
    () => sessionStorage.getItem(storageKey)
  );
  const { session, connectionState, channel, error } = useGameSession(
    playerName ? sessionId : undefined
  );

  // Track whether we've broadcast the join/rejoin message for this player
  const hasBroadcastJoin = useRef(false);

  // Broadcast player_joined and track presence once channel is connected
  useEffect(() => {
    if (!playerName || !channel || connectionState !== 'connected' || hasBroadcastJoin.current) return;

    hasBroadcastJoin.current = true;

    // Broadcast join message to host
    broadcastMessage(channel, {
      type: 'player_joined',
      player: { name: playerName, score: 0, joinedAt: new Date().toISOString() },
    }).catch(() => {});

    // Track presence so others know we're online
    trackPresence(channel, {
      playerName,
      joinedAt: new Date().toISOString(),
    }).catch(() => {});

    // Untrack on unmount (intentional leave)
    return () => {
      untrackPresence(channel).catch(() => {});
    };
  }, [playerName, channel, connectionState]);

  // Before joining, show the join page
  if (!playerName) {
    return <PlayerJoinPage sessionId={sessionId} onJoined={setPlayerName} />;
  }

  // Derive the player's score from the session state
  const player = session?.players.find(
    (p) => p.name.toLowerCase() === playerName.toLowerCase()
  );
  const playerScore = player?.score ?? 0;

  // Render the appropriate phase-based content
  function renderPhaseContent() {
    // If we haven't loaded session yet, show a loading/waiting state
    if (!session) {
      return (
        <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', color: '#f1f5f9', textAlign: 'center', padding: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Welcome, {playerName}!</h2>
            <p style={{ color: '#94a3b8' }}>Connecting to session…</p>
          </div>
        </div>
      );
    }

    switch (session.phase) {
      case 'ended':
        return <SessionEndedPage />;

      case 'final-jeopardy':
        return (
          <FinalJeopardyEntryPage
            sessionId={sessionId}
            playerName={playerName}
            playerScore={playerScore}
            channel={channel}
            submissionsLocked={!session.buzz_state.clueActive}
          />
        );

      case 'buzzer':
        // If a clue is active, show the buzzer page
        if (session.buzz_state.clueActive) {
          return (
            <BuzzerPage
              playerName={playerName}
              buzzState={session.buzz_state}
              channel={channel}
            />
          );
        }
        // Buzzer phase but no clue active — show buzzer in disabled/waiting state
        return (
          <BuzzerPage
            playerName={playerName}
            buzzState={session.buzz_state}
            channel={channel}
          />
        );

      case 'lobby':
      default:
        return (
          <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', color: '#f1f5f9', textAlign: 'center', padding: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Welcome, {playerName}!</h2>
              <p style={{ color: '#94a3b8' }}>Waiting for the game to begin…</p>
            </div>
          </div>
        );
    }
  }

  return (
    <>
      <ConnectionStatusBanner
        connectionState={connectionState}
        error={error}
      />
      {renderPhaseContent()}
    </>
  );
}
