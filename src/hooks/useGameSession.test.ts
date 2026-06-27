// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useGameSession } from './useGameSession';
import type { GameSessionRow, ChannelMessage } from '../types/session';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockChannel = {
  subscribe: vi.fn(),
  send: vi.fn(),
  on: vi.fn().mockReturnThis(),
  unsubscribe: vi.fn(),
};

let messageCallback: ((message: ChannelMessage) => void) | null = null;

vi.mock('../utils/sessionChannel', () => ({
  createSessionChannel: vi.fn(() => mockChannel),
  subscribeToChannel: vi.fn(() => Promise.resolve(mockChannel)),
  unsubscribeFromChannel: vi.fn(() => Promise.resolve()),
  onChannelMessage: vi.fn((_, cb) => {
    messageCallback = cb;
    return mockChannel;
  }),
  createReconnectionHandler: vi.fn(() => ({
    startReconnection: vi.fn(),
    stopReconnection: vi.fn(),
    getState: vi.fn(() => ({ attempts: 0, maxAttempts: 5, isReconnecting: false, timerId: null })),
  })),
}));

const mockSession: GameSessionRow = {
  id: 'test-session-id-12345678',
  host_user_id: 'host-uuid',
  game_id: 'game-123',
  phase: 'lobby',
  is_locked: false,
  players: [{ name: 'Alice', score: 0, joinedAt: '2024-01-01T00:00:00Z' }],
  buzz_state: { clueActive: false, queue: [], lockedOut: [], systemLocked: false },
  final_jeopardy_state: { submissions: [], revealedIndex: -1 },
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

vi.mock('../utils/sessionApi', () => ({
  fetchSession: vi.fn(() => Promise.resolve(mockSession)),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useGameSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    messageCallback = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns initial connecting state', () => {
    const { result } = renderHook(() => useGameSession('test-session-id'));

    // Initially should be in connecting state
    expect(result.current.connectionState).toBe('connecting');
    expect(result.current.error).toBeNull();
  });

  it('fetches session and transitions to connected', async () => {
    const { result } = renderHook(() => useGameSession('test-session-id'));

    await waitFor(() => {
      expect(result.current.connectionState).toBe('connected');
    });

    expect(result.current.session).toEqual(mockSession);
    expect(result.current.channel).toBe(mockChannel);
    expect(result.current.error).toBeNull();
  });

  it('returns disconnected state when sessionId is undefined', () => {
    const { result } = renderHook(() => useGameSession(undefined));

    expect(result.current.connectionState).toBe('disconnected');
    expect(result.current.session).toBeNull();
    expect(result.current.channel).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('updates session on phase_change message', async () => {
    const { result } = renderHook(() => useGameSession('test-session-id'));

    await waitFor(() => {
      expect(result.current.connectionState).toBe('connected');
    });

    act(() => {
      messageCallback?.({ type: 'phase_change', phase: 'buzzer' });
    });

    expect(result.current.session?.phase).toBe('buzzer');
  });

  it('updates session on player_joined message', async () => {
    const { result } = renderHook(() => useGameSession('test-session-id'));

    await waitFor(() => {
      expect(result.current.connectionState).toBe('connected');
    });

    act(() => {
      messageCallback?.({
        type: 'player_joined',
        player: { name: 'Bob', score: 0, joinedAt: '2024-01-01T01:00:00Z' },
      });
    });

    expect(result.current.session?.players).toHaveLength(2);
    expect(result.current.session?.players[1].name).toBe('Bob');
  });

  it('updates buzz_state on clue_activated message', async () => {
    const { result } = renderHook(() => useGameSession('test-session-id'));

    await waitFor(() => {
      expect(result.current.connectionState).toBe('connected');
    });

    act(() => {
      messageCallback?.({ type: 'clue_activated' });
    });

    expect(result.current.session?.buzz_state.clueActive).toBe(true);
  });

  it('updates buzz_state on buzz message', async () => {
    const { result } = renderHook(() => useGameSession('test-session-id'));

    await waitFor(() => {
      expect(result.current.connectionState).toBe('connected');
    });

    act(() => {
      messageCallback?.({ type: 'buzz', playerName: 'Alice', timestamp: 1000 });
    });

    expect(result.current.session?.buzz_state.queue).toHaveLength(1);
    expect(result.current.session?.buzz_state.queue[0].playerName).toBe('Alice');
  });

  it('updates session on session_ended message', async () => {
    const { result } = renderHook(() => useGameSession('test-session-id'));

    await waitFor(() => {
      expect(result.current.connectionState).toBe('connected');
    });

    act(() => {
      messageCallback?.({ type: 'session_ended' });
    });

    expect(result.current.session?.phase).toBe('ended');
  });

  it('handles buzzer_locked message', async () => {
    const { result } = renderHook(() => useGameSession('test-session-id'));

    await waitFor(() => {
      expect(result.current.connectionState).toBe('connected');
    });

    act(() => {
      messageCallback?.({ type: 'buzzer_locked' });
    });

    expect(result.current.session?.buzz_state.systemLocked).toBe(true);
    expect(result.current.session?.buzz_state.queue).toEqual([]);
  });

  it('handles buzzer_unlocked message', async () => {
    const { result } = renderHook(() => useGameSession('test-session-id'));

    await waitFor(() => {
      expect(result.current.connectionState).toBe('connected');
    });

    // First lock
    act(() => {
      messageCallback?.({ type: 'buzzer_locked' });
    });

    // Then unlock
    act(() => {
      messageCallback?.({ type: 'buzzer_unlocked' });
    });

    expect(result.current.session?.buzz_state.systemLocked).toBe(false);
  });

  it('handles fj_score_update message', async () => {
    const { result } = renderHook(() => useGameSession('test-session-id'));

    await waitFor(() => {
      expect(result.current.connectionState).toBe('connected');
    });

    act(() => {
      messageCallback?.({ type: 'fj_score_update', playerName: 'Alice', newScore: 500 });
    });

    expect(result.current.session?.players[0].score).toBe(500);
  });

  it('cleans up channel on unmount', async () => {
    const { unmount } = renderHook(() => useGameSession('test-session-id'));

    await waitFor(() => {
      // Wait for connection to establish
    });

    const { unsubscribeFromChannel } = await import('../utils/sessionChannel');

    unmount();

    expect(unsubscribeFromChannel).toHaveBeenCalled();
  });
});
