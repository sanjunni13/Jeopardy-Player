/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFinalJeopardyEntry } from './useFinalJeopardyEntry';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { GameSessionRow } from '../types/session';

vi.mock('../utils/sessionApi', () => ({
  fetchSession: vi.fn(),
  updateFinalJeopardyState: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../utils/sessionChannel', () => ({
  broadcastMessage: vi.fn().mockResolvedValue(undefined),
}));

import { fetchSession, updateFinalJeopardyState } from '../utils/sessionApi';
import { broadcastMessage } from '../utils/sessionChannel';

function createMockChannel(): RealtimeChannel {
  return {} as RealtimeChannel;
}

function createMockSession(overrides: Partial<GameSessionRow> = {}): GameSessionRow {
  return {
    id: 'test-session-id',
    host_user_id: 'host-123',
    game_id: 'game-456',
    phase: 'final-jeopardy',
    is_locked: false,
    players: [{ name: 'Alice', score: 500, joinedAt: '2024-01-01T00:00:00Z' }],
    buzz_state: { clueActive: false, queue: [], lockedOut: [], systemLocked: false },
    final_jeopardy_state: { submissions: [], revealedIndex: -1 },
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('useFinalJeopardyEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('returns default form state', () => {
      const { result } = renderHook(() =>
        useFinalJeopardyEntry('session-1', 'Alice', 500, createMockChannel())
      );

      expect(result.current.wager).toBe(0);
      expect(result.current.answer).toBe('');
      expect(result.current.status).toBe('idle');
      expect(result.current.wagerError).toBeNull();
      expect(result.current.answerError).toBeNull();
      expect(result.current.hasSubmitted).toBe(false);
    });
  });

  describe('setWager and setAnswer', () => {
    it('updates wager value', () => {
      const { result } = renderHook(() =>
        useFinalJeopardyEntry('session-1', 'Alice', 500, createMockChannel())
      );

      act(() => {
        result.current.setWager(250);
      });

      expect(result.current.wager).toBe(250);
    });

    it('updates answer value', () => {
      const { result } = renderHook(() =>
        useFinalJeopardyEntry('session-1', 'Alice', 500, createMockChannel())
      );

      act(() => {
        result.current.setAnswer('What is gravity?');
      });

      expect(result.current.answer).toBe('What is gravity?');
    });
  });

  describe('validation on submit', () => {
    it('sets wagerError when wager exceeds player score', async () => {
      const { result } = renderHook(() =>
        useFinalJeopardyEntry('session-1', 'Alice', 500, createMockChannel())
      );

      act(() => {
        result.current.setWager(600);
        result.current.setAnswer('What is gravity?');
      });

      await act(async () => {
        await result.current.submit();
      });

      expect(result.current.wagerError).toBe('Wager must be between $0 and $500');
      expect(result.current.status).toBe('idle');
      expect(fetchSession).not.toHaveBeenCalled();
    });

    it('sets wagerError when wager is not an integer', async () => {
      const { result } = renderHook(() =>
        useFinalJeopardyEntry('session-1', 'Alice', 500, createMockChannel())
      );

      act(() => {
        result.current.setWager(250.5);
        result.current.setAnswer('What is gravity?');
      });

      await act(async () => {
        await result.current.submit();
      });

      expect(result.current.wagerError).toBe('Wager must be a whole dollar amount');
      expect(result.current.status).toBe('idle');
    });

    it('sets answerError when answer is empty', async () => {
      const { result } = renderHook(() =>
        useFinalJeopardyEntry('session-1', 'Alice', 500, createMockChannel())
      );

      act(() => {
        result.current.setWager(100);
        result.current.setAnswer('');
      });

      await act(async () => {
        await result.current.submit();
      });

      expect(result.current.answerError).toBe('Answer cannot be empty');
      expect(result.current.status).toBe('idle');
    });

    it('sets answerError when answer exceeds 200 characters', async () => {
      const { result } = renderHook(() =>
        useFinalJeopardyEntry('session-1', 'Alice', 500, createMockChannel())
      );

      act(() => {
        result.current.setWager(100);
        result.current.setAnswer('x'.repeat(201));
      });

      await act(async () => {
        await result.current.submit();
      });

      expect(result.current.answerError).toBe('Answer cannot exceed 200 characters');
      expect(result.current.status).toBe('idle');
    });
  });

  describe('successful submission', () => {
    it('submits to Supabase and broadcasts notification', async () => {
      const channel = createMockChannel();
      const session = createMockSession();
      vi.mocked(fetchSession).mockResolvedValue(session);

      const { result } = renderHook(() =>
        useFinalJeopardyEntry('test-session-id', 'Alice', 500, channel)
      );

      act(() => {
        result.current.setWager(200);
        result.current.setAnswer('What is gravity?');
      });

      await act(async () => {
        await result.current.submit();
      });

      expect(result.current.status).toBe('submitted');
      expect(result.current.hasSubmitted).toBe(true);
      expect(updateFinalJeopardyState).toHaveBeenCalledWith('test-session-id', {
        submissions: [
          {
            playerName: 'Alice',
            wager: 200,
            answer: 'What is gravity?',
            submittedAt: expect.any(String),
          },
        ],
        revealedIndex: -1,
      });
      expect(broadcastMessage).toHaveBeenCalledWith(channel, {
        type: 'fj_submission_received',
        playerName: 'Alice',
      });
    });

    it('transitions to submitted when player already has a submission', async () => {
      const channel = createMockChannel();
      const session = createMockSession({
        final_jeopardy_state: {
          submissions: [
            { playerName: 'Alice', wager: 100, answer: 'Test', submittedAt: '2024-01-01T00:00:00Z' },
          ],
          revealedIndex: -1,
        },
      });
      vi.mocked(fetchSession).mockResolvedValue(session);

      const { result } = renderHook(() =>
        useFinalJeopardyEntry('test-session-id', 'Alice', 500, channel)
      );

      act(() => {
        result.current.setWager(200);
        result.current.setAnswer('What is gravity?');
      });

      await act(async () => {
        await result.current.submit();
      });

      expect(result.current.status).toBe('submitted');
      expect(result.current.hasSubmitted).toBe(true);
      // Should NOT update state since player already submitted
      expect(updateFinalJeopardyState).not.toHaveBeenCalled();
    });
  });

  describe('error handling and retry', () => {
    it('sets error status when session is not found', async () => {
      vi.mocked(fetchSession).mockResolvedValue(null);

      const { result } = renderHook(() =>
        useFinalJeopardyEntry('bad-session', 'Alice', 500, createMockChannel())
      );

      act(() => {
        result.current.setWager(100);
        result.current.setAnswer('What is gravity?');
      });

      await act(async () => {
        await result.current.submit();
      });

      expect(result.current.status).toBe('error');
      expect(result.current.wagerError).toBe('Session not found');
    });

    it('sets error status when updateFinalJeopardyState fails', async () => {
      const session = createMockSession();
      vi.mocked(fetchSession).mockResolvedValue(session);
      vi.mocked(updateFinalJeopardyState).mockRejectedValueOnce(
        new Error('Network failure')
      );

      const { result } = renderHook(() =>
        useFinalJeopardyEntry('test-session-id', 'Alice', 500, createMockChannel())
      );

      act(() => {
        result.current.setWager(100);
        result.current.setAnswer('What is gravity?');
      });

      await act(async () => {
        await result.current.submit();
      });

      expect(result.current.status).toBe('error');
      expect(result.current.wagerError).toBe('Network failure');
      // Form values remain populated for retry
      expect(result.current.wager).toBe(100);
      expect(result.current.answer).toBe('What is gravity?');
    });

    it('allows retry after failure', async () => {
      const channel = createMockChannel();
      const session = createMockSession();
      vi.mocked(fetchSession).mockResolvedValue(session);
      vi.mocked(updateFinalJeopardyState)
        .mockRejectedValueOnce(new Error('Network failure'))
        .mockResolvedValueOnce(undefined);

      const { result } = renderHook(() =>
        useFinalJeopardyEntry('test-session-id', 'Alice', 500, channel)
      );

      act(() => {
        result.current.setWager(100);
        result.current.setAnswer('What is gravity?');
      });

      // First attempt fails
      await act(async () => {
        await result.current.submit();
      });
      expect(result.current.status).toBe('error');

      // Retry succeeds
      await act(async () => {
        await result.current.submit();
      });
      expect(result.current.status).toBe('submitted');
      expect(result.current.hasSubmitted).toBe(true);
    });
  });

  describe('wager range for zero/negative scores', () => {
    it('allows wager up to 1000 when score is 0', async () => {
      const channel = createMockChannel();
      const session = createMockSession();
      vi.mocked(fetchSession).mockResolvedValue(session);

      const { result } = renderHook(() =>
        useFinalJeopardyEntry('test-session-id', 'Alice', 0, channel)
      );

      act(() => {
        result.current.setWager(1000);
        result.current.setAnswer('What is gravity?');
      });

      await act(async () => {
        await result.current.submit();
      });

      expect(result.current.status).toBe('submitted');
    });

    it('rejects wager over 1000 when score is negative', async () => {
      const { result } = renderHook(() =>
        useFinalJeopardyEntry('test-session-id', 'Alice', -200, createMockChannel())
      );

      act(() => {
        result.current.setWager(1001);
        result.current.setAnswer('What is gravity?');
      });

      await act(async () => {
        await result.current.submit();
      });

      expect(result.current.wagerError).toBe('Wager must be between $0 and $1000');
      expect(result.current.status).toBe('idle');
    });
  });
});
