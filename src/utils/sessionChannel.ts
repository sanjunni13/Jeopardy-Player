import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { ChannelMessage } from '../types/session';

// ─── Constants ────────────────────────────────────────────────────────────────

const RECONNECT_INTERVAL_MS = 2000;
const MAX_RECONNECT_ATTEMPTS = 5;

// ─── Channel Lifecycle ────────────────────────────────────────────────────────

/**
 * Creates a Supabase Realtime channel for the given session ID.
 * Channel name follows the pattern `session:{sessionId}`.
 */
export function createSessionChannel(sessionId: string): RealtimeChannel {
  return supabase.channel(`session:${sessionId}`);
}

/**
 * Subscribes to a Realtime channel with error handling.
 * Returns a promise that resolves when subscribed or rejects on error.
 */
export function subscribeToChannel(
  channel: RealtimeChannel
): Promise<RealtimeChannel> {
  return new Promise((resolve, reject) => {
    channel.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        resolve(channel);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        reject(err ?? new Error(`Channel subscription failed: ${status}`));
      }
    });
  });
}

/**
 * Unsubscribes from a Realtime channel and removes it from the client.
 */
export async function unsubscribeFromChannel(
  channel: RealtimeChannel
): Promise<void> {
  await supabase.removeChannel(channel);
}

// ─── Broadcasting ─────────────────────────────────────────────────────────────

/**
 * Broadcasts a typed ChannelMessage on the given channel.
 * Uses the 'session_event' broadcast event name.
 */
export async function broadcastMessage(
  channel: RealtimeChannel,
  message: ChannelMessage
): Promise<void> {
  await channel.send({
    type: 'broadcast',
    event: 'session_event',
    payload: message,
  });
}

// ─── Listening ────────────────────────────────────────────────────────────────

/**
 * Registers a listener for incoming ChannelMessages on the channel.
 * Listens for 'session_event' broadcast events and invokes the callback
 * with the typed payload.
 */
export function onChannelMessage(
  channel: RealtimeChannel,
  callback: (message: ChannelMessage) => void
): RealtimeChannel {
  return channel.on('broadcast', { event: 'session_event' }, (payload) => {
    callback(payload.payload as ChannelMessage);
  });
}

// ─── Reconnection Logic ───────────────────────────────────────────────────────

export interface ReconnectionState {
  attempts: number;
  maxAttempts: number;
  isReconnecting: boolean;
  timerId: ReturnType<typeof setTimeout> | null;
}

export interface ReconnectionCallbacks {
  onReconnecting?: (attempt: number) => void;
  onReconnected?: (channel: RealtimeChannel) => void;
  onReconnectFailed?: () => void;
}

/**
 * Creates a reconnection handler for a session channel.
 * Attempts to reconnect at 2-second intervals up to a maximum of 5 attempts.
 * Returns controls to start/stop reconnection and query current state.
 */
export function createReconnectionHandler(
  sessionId: string,
  callbacks?: ReconnectionCallbacks
) {
  const state: ReconnectionState = {
    attempts: 0,
    maxAttempts: MAX_RECONNECT_ATTEMPTS,
    isReconnecting: false,
    timerId: null,
  };

  async function attemptReconnect(): Promise<void> {
    if (state.attempts >= state.maxAttempts) {
      state.isReconnecting = false;
      callbacks?.onReconnectFailed?.();
      return;
    }

    state.attempts++;
    state.isReconnecting = true;
    callbacks?.onReconnecting?.(state.attempts);

    try {
      const channel = createSessionChannel(sessionId);
      await subscribeToChannel(channel);
      state.isReconnecting = false;
      state.attempts = 0;
      callbacks?.onReconnected?.(channel);
    } catch {
      // Schedule next attempt
      state.timerId = setTimeout(attemptReconnect, RECONNECT_INTERVAL_MS);
    }
  }

  function startReconnection(): void {
    if (state.isReconnecting) return;
    state.attempts = 0;
    state.isReconnecting = true;
    attemptReconnect();
  }

  function stopReconnection(): void {
    state.isReconnecting = false;
    if (state.timerId !== null) {
      clearTimeout(state.timerId);
      state.timerId = null;
    }
  }

  function getState(): Readonly<ReconnectionState> {
    return { ...state };
  }

  return {
    startReconnection,
    stopReconnection,
    getState,
  };
}
