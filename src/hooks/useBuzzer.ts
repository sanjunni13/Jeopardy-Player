import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { BuzzState } from '../types/session';
import { canPlayerBuzz } from '../utils/buzzerLogic';
import { broadcastMessage } from '../utils/sessionChannel';

export interface UseBuzzerReturn {
  canBuzz: boolean;
  buzzIn: () => Promise<void>;
  hasBuzzed: boolean;
  error: string | null;
}

/**
 * Encapsulates buzz-in logic for the player-side buzzer.
 */
export function useBuzzer(
  channel: RealtimeChannel | null,
  buzzState: BuzzState,
  playerName: string
): UseBuzzerReturn {
  const [error, setError] = useState<string | null>(null);
  const [hasBuzzedLocal, setHasBuzzedLocal] = useState(false);
  const prevClueActiveRef = useRef(buzzState.clueActive);

  // Reset local buzz state when a new clue starts (clueActive transitions from false to true)
  // or when the system is locked (queue gets cleared)
  useEffect(() => {
    const wasActive = prevClueActiveRef.current;
    const isActive = buzzState.clueActive;
    prevClueActiveRef.current = isActive;

    // New clue started or system was locked — reset
    if ((!wasActive && isActive) || buzzState.systemLocked) {
      setHasBuzzedLocal(false);
    }
  }, [buzzState.clueActive, buzzState.systemLocked]);

  // Player has buzzed if either the server state reflects it OR we optimistically set it
  const hasBuzzed = useMemo(
    () => hasBuzzedLocal || buzzState.queue.some(e => e.playerName === playerName),
    [hasBuzzedLocal, buzzState.queue, playerName]
  );

  const canBuzz = useMemo(
    () => (channel !== null && !hasBuzzedLocal && canPlayerBuzz(buzzState, playerName)),
    [channel, hasBuzzedLocal, buzzState, playerName]
  );

  const buzzIn = useCallback(async () => {
    if (!channel) {
      setError('Not connected to session');
      return;
    }

    if (hasBuzzedLocal) {
      return;
    }

    if (!canPlayerBuzz(buzzState, playerName)) {
      return;
    }

    setError(null);

    try {
      await broadcastMessage(channel, {
        type: 'buzz',
        playerName,
        timestamp: Date.now(),
      });
      // Optimistically mark as buzzed since we won't receive our own broadcast
      setHasBuzzedLocal(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to send buzz';
      setError(message);
    }
  }, [channel, buzzState, playerName, hasBuzzedLocal]);

  return { canBuzz, buzzIn, hasBuzzed, error };
}
