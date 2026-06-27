import { useState, useEffect, useRef, useCallback } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { GameSessionRow, ChannelMessage } from '../types/session';
import {
  createSessionChannel,
  subscribeToChannel,
  unsubscribeFromChannel,
  onChannelMessage,
  createReconnectionHandler,
} from '../utils/sessionChannel';
import { fetchSession } from '../utils/sessionApi';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'failed';

export interface UseGameSessionResult {
  session: GameSessionRow | null;
  connectionState: ConnectionState;
  channel: RealtimeChannel | null;
  error: string | null;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Manages Supabase Realtime channel subscription, session state sync,
 * automatic reconnection (2s intervals, max 5 attempts), and state
 * reconciliation on reconnect.
 *
 * Used by both host and player to stay in sync with the game session.
 */
export function useGameSession(sessionId: string | undefined): UseGameSessionResult {
  const [session, setSession] = useState<GameSessionRow | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    sessionId ? 'connecting' : 'disconnected'
  );
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);
  const [error, setError] = useState<string | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const reconnectionRef = useRef<ReturnType<typeof createReconnectionHandler> | null>(null);
  const mountedRef = useRef(true);

  // ─── Message Handler ──────────────────────────────────────────────────────

  const handleMessage = useCallback((message: ChannelMessage) => {
    setSession((prev) => {
      if (!prev) return prev;

      switch (message.type) {
        case 'phase_change':
          return { ...prev, phase: message.phase, updated_at: new Date().toISOString() };

        case 'player_joined':
          return {
            ...prev,
            players: [...prev.players, message.player],
            updated_at: new Date().toISOString(),
          };

        case 'clue_activated':
          return {
            ...prev,
            buzz_state: { ...prev.buzz_state, clueActive: true },
            updated_at: new Date().toISOString(),
          };

        case 'clue_deactivated':
          return {
            ...prev,
            buzz_state: { ...prev.buzz_state, clueActive: false },
            updated_at: new Date().toISOString(),
          };

        case 'buzz': {
          const newEvent = { playerName: message.playerName, timestamp: message.timestamp };
          return {
            ...prev,
            buzz_state: {
              ...prev.buzz_state,
              queue: [...prev.buzz_state.queue, newEvent],
            },
            updated_at: new Date().toISOString(),
          };
        }

        case 'buzz_queue_update':
          return {
            ...prev,
            buzz_state: { ...prev.buzz_state, queue: message.queue },
            updated_at: new Date().toISOString(),
          };

        case 'buzzer_locked':
          return {
            ...prev,
            buzz_state: { ...prev.buzz_state, systemLocked: true, queue: [] },
            updated_at: new Date().toISOString(),
          };

        case 'buzzer_unlocked':
          return {
            ...prev,
            buzz_state: { ...prev.buzz_state, systemLocked: false },
            updated_at: new Date().toISOString(),
          };

        case 'buzz_state_sync':
          return {
            ...prev,
            buzz_state: message.buzzState,
            updated_at: new Date().toISOString(),
          };

        case 'buzz_queue_cleared':
          return {
            ...prev,
            buzz_state: {
              ...prev.buzz_state,
              queue: [],
              lockedOut: message.lockedOut,
            },
            updated_at: new Date().toISOString(),
          };

        case 'player_incorrect':
          return {
            ...prev,
            buzz_state: {
              ...prev.buzz_state,
              lockedOut: [...prev.buzz_state.lockedOut, message.playerName],
            },
            updated_at: new Date().toISOString(),
          };

        case 'fj_submission_received':
          return prev;

        case 'fj_reveal':
          return {
            ...prev,
            final_jeopardy_state: {
              ...prev.final_jeopardy_state,
              revealedIndex: message.index,
              submissions: prev.final_jeopardy_state.submissions.map((s, i) =>
                i === message.index ? message.submission : s
              ),
            },
            updated_at: new Date().toISOString(),
          };

        case 'fj_score_update': {
          const updatedPlayers = prev.players.map((p) =>
            p.name === message.playerName ? { ...p, score: message.newScore } : p
          );
          return { ...prev, players: updatedPlayers, updated_at: new Date().toISOString() };
        }

        case 'session_ended':
          return { ...prev, phase: 'ended', updated_at: new Date().toISOString() };

        default:
          return prev;
      }
    });
  }, []);

  // ─── Reconcile State from DB ──────────────────────────────────────────────

  const reconcileState = useCallback(async () => {
    if (!sessionId) return;
    try {
      const latestSession = await fetchSession(sessionId);
      if (mountedRef.current) {
        setSession(latestSession);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to fetch session state');
      }
    }
  }, [sessionId]);

  // ─── Setup Channel and Subscribe ─────────────────────────────────────────

  const setupChannel = useCallback(
    async (ch: RealtimeChannel): Promise<void> => {
      onChannelMessage(ch, handleMessage);

      try {
        await subscribeToChannel(ch);
        if (mountedRef.current) {
          channelRef.current = ch;
          setChannel(ch);
          setConnectionState('connected');
          setError(null);
        }
      } catch (err) {
        if (mountedRef.current) {
          setError(
            err instanceof Error ? err.message : 'Failed to subscribe to channel'
          );
          setConnectionState('disconnected');
        }
      }
    },
    [handleMessage]
  );

  // ─── Main Effect ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    mountedRef.current = true;
    let cleaned = false;

    const reconnection = createReconnectionHandler(sessionId, {
      onReconnecting: (attempt) => {
        if (!cleaned && mountedRef.current) {
          setConnectionState('reconnecting');
          setError(`Reconnecting... attempt ${attempt}/5`);
        }
      },
      onReconnected: async (newChannel) => {
        if (cleaned || !mountedRef.current) {
          await unsubscribeFromChannel(newChannel);
          return;
        }
        channelRef.current = newChannel;
        onChannelMessage(newChannel, handleMessage);
        setChannel(newChannel);
        setConnectionState('connected');
        setError(null);
        await reconcileState();
      },
      onReconnectFailed: () => {
        if (!cleaned && mountedRef.current) {
          setConnectionState('failed');
          setError('Connection could not be restored after 5 attempts');
        }
      },
    });
    reconnectionRef.current = reconnection;

    async function initialize() {
      try {
        const initialSession = await fetchSession(sessionId!);
        if (cleaned || !mountedRef.current) return;

        if (!initialSession) {
          setError('Session not found');
          setConnectionState('disconnected');
          return;
        }

        setSession(initialSession);

        if (initialSession.phase === 'ended') {
          setConnectionState('disconnected');
          return;
        }

        const ch = createSessionChannel(sessionId!);
        await setupChannel(ch);
      } catch (err) {
        if (cleaned || !mountedRef.current) return;
        setError(err instanceof Error ? err.message : 'Failed to initialize session');
        setConnectionState('disconnected');
        reconnection.startReconnection();
      }
    }

    initialize();

    return () => {
      cleaned = true;
      mountedRef.current = false;
      reconnection.stopReconnection();
      if (channelRef.current) {
        unsubscribeFromChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [sessionId, setupChannel, reconcileState, handleMessage]);

  // When no sessionId is provided, return disconnected state
  if (!sessionId) {
    return { session: null, connectionState: 'disconnected' as ConnectionState, channel: null, error: null };
  }

  return { session, connectionState, channel, error };
}
