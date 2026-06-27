/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBuzzer } from './useBuzzer';
import type { BuzzState } from '../types/session';
import type { RealtimeChannel } from '@supabase/supabase-js';

vi.mock('../utils/sessionChannel', () => ({
  broadcastMessage: vi.fn().mockResolvedValue(undefined),
}));

import { broadcastMessage } from '../utils/sessionChannel';

function createMockChannel(): RealtimeChannel {
  return {} as RealtimeChannel;
}

function createBuzzState(overrides: Partial<BuzzState> = {}): BuzzState {
  return {
    clueActive: true,
    queue: [],
    lockedOut: [],
    systemLocked: false,
    ...overrides,
  };
}

describe('useBuzzer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('canBuzz', () => {
    it('returns true when clue is active, system unlocked, player not in queue or locked out', () => {
      const channel = createMockChannel();
      const buzzState = createBuzzState();

      const { result } = renderHook(() => useBuzzer(channel, buzzState, 'Alice'));

      expect(result.current.canBuzz).toBe(true);
    });

    it('returns false when channel is null', () => {
      const buzzState = createBuzzState();

      const { result } = renderHook(() => useBuzzer(null, buzzState, 'Alice'));

      expect(result.current.canBuzz).toBe(false);
    });

    it('returns false when clue is not active', () => {
      const channel = createMockChannel();
      const buzzState = createBuzzState({ clueActive: false });

      const { result } = renderHook(() => useBuzzer(channel, buzzState, 'Alice'));

      expect(result.current.canBuzz).toBe(false);
    });

    it('returns false when system is locked', () => {
      const channel = createMockChannel();
      const buzzState = createBuzzState({ systemLocked: true });

      const { result } = renderHook(() => useBuzzer(channel, buzzState, 'Alice'));

      expect(result.current.canBuzz).toBe(false);
    });

    it('returns false when player already buzzed', () => {
      const channel = createMockChannel();
      const buzzState = createBuzzState({
        queue: [{ playerName: 'Alice', timestamp: 1000 }],
      });

      const { result } = renderHook(() => useBuzzer(channel, buzzState, 'Alice'));

      expect(result.current.canBuzz).toBe(false);
    });

    it('returns false when player is locked out', () => {
      const channel = createMockChannel();
      const buzzState = createBuzzState({ lockedOut: ['Alice'] });

      const { result } = renderHook(() => useBuzzer(channel, buzzState, 'Alice'));

      expect(result.current.canBuzz).toBe(false);
    });
  });

  describe('hasBuzzed', () => {
    it('returns false when player is not in the queue', () => {
      const channel = createMockChannel();
      const buzzState = createBuzzState();

      const { result } = renderHook(() => useBuzzer(channel, buzzState, 'Alice'));

      expect(result.current.hasBuzzed).toBe(false);
    });

    it('returns true when player is in the queue', () => {
      const channel = createMockChannel();
      const buzzState = createBuzzState({
        queue: [{ playerName: 'Alice', timestamp: 1000 }],
      });

      const { result } = renderHook(() => useBuzzer(channel, buzzState, 'Alice'));

      expect(result.current.hasBuzzed).toBe(true);
    });

    it('returns false when only other players are in the queue', () => {
      const channel = createMockChannel();
      const buzzState = createBuzzState({
        queue: [{ playerName: 'Bob', timestamp: 1000 }],
      });

      const { result } = renderHook(() => useBuzzer(channel, buzzState, 'Alice'));

      expect(result.current.hasBuzzed).toBe(false);
    });
  });

  describe('buzzIn', () => {
    it('broadcasts a buzz message when player can buzz', async () => {
      const channel = createMockChannel();
      const buzzState = createBuzzState();

      const { result } = renderHook(() => useBuzzer(channel, buzzState, 'Alice'));

      await act(async () => {
        await result.current.buzzIn();
      });

      expect(broadcastMessage).toHaveBeenCalledWith(channel, {
        type: 'buzz',
        playerName: 'Alice',
        timestamp: expect.any(Number),
      });
    });

    it('does not broadcast when player cannot buzz (system locked)', async () => {
      const channel = createMockChannel();
      const buzzState = createBuzzState({ systemLocked: true });

      const { result } = renderHook(() => useBuzzer(channel, buzzState, 'Alice'));

      await act(async () => {
        await result.current.buzzIn();
      });

      expect(broadcastMessage).not.toHaveBeenCalled();
    });

    it('sets error when channel is null', async () => {
      const buzzState = createBuzzState();

      const { result } = renderHook(() => useBuzzer(null, buzzState, 'Alice'));

      await act(async () => {
        await result.current.buzzIn();
      });

      expect(result.current.error).toBe('Not connected to session');
      expect(broadcastMessage).not.toHaveBeenCalled();
    });

    it('sets error when broadcast fails', async () => {
      const channel = createMockChannel();
      const buzzState = createBuzzState();
      vi.mocked(broadcastMessage).mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useBuzzer(channel, buzzState, 'Alice'));

      await act(async () => {
        await result.current.buzzIn();
      });

      expect(result.current.error).toBe('Network error');
    });

    it('clears error on successful retry after failure', async () => {
      const channel = createMockChannel();
      const buzzState = createBuzzState();
      vi.mocked(broadcastMessage).mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useBuzzer(channel, buzzState, 'Alice'));

      // First call fails
      await act(async () => {
        await result.current.buzzIn();
      });
      expect(result.current.error).toBe('Network error');

      // Retry succeeds
      vi.mocked(broadcastMessage).mockResolvedValueOnce(undefined);
      await act(async () => {
        await result.current.buzzIn();
      });
      expect(result.current.error).toBeNull();
    });
  });
});
