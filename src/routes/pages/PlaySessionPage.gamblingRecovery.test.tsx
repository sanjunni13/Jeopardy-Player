// @vitest-environment jsdom
/**
 * Regression coverage for the round-transition "stuck on the locked buzzer" bug.
 *
 * The auction (bidding) and betting sub-phases are persisted to
 * `session.gambling_state`, not only broadcast. So a player device that never
 * received the ephemeral `auction_start` / `betting_start` broadcast — because
 * it was mid-reconnect, subscribed a beat late, or had just refreshed (a fresh
 * mount starts at gamblingPhase 'idle') — recovers the correct panel from the DB
 * via the periodic reconcile instead of being stranded on the locked buzzer.
 *
 * These tests mount the real `PlaySessionPage` with `useGameSession` mocked and
 * fire NO broadcasts at all, so the only thing that can drive a gambling panel
 * is the persisted `gambling_state`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { GameSessionRow, GamblingState } from '../../types/session';

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ sessionId: 'SESSION1' }),
}));

const hoisted = vi.hoisted(() => ({
  gameSession: {
    session: null as GameSessionRow | null,
    connectionState: 'connected' as string,
    channel: { on: () => {}, send: async () => 'ok' } as unknown,
    error: null as string | null,
  },
}));

vi.mock('../../hooks/useGameSession', () => ({
  useGameSession: () => hoisted.gameSession,
}));

// Channel side effects are irrelevant to DB-driven recovery; stub them so no
// broadcast can influence the screen.
vi.mock('../../utils/sessionChannel', () => ({
  broadcastMessage: vi.fn().mockResolvedValue(undefined),
  onChannelMessage: vi.fn(),
  trackPresence: vi.fn().mockResolvedValue(undefined),
  untrackPresence: vi.fn().mockResolvedValue(undefined),
}));

import { PlaySessionPage } from './PlaySessionPage';

function makeSession(overrides: Partial<GameSessionRow> = {}): GameSessionRow {
  return {
    id: 'SESSION1',
    host_user_id: 'host-1',
    game_id: 'game-1',
    phase: 'buzzer',
    is_locked: false,
    players: [{ name: 'Alice', score: 1000, joinedAt: '2024-01-01T00:00:00.000Z' }],
    buzz_state: { clueActive: false, queue: [], lockedOut: [], systemLocked: false },
    final_jeopardy_state: { wagers: [], submissions: [], revealedIndex: -1 },
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function setSession(session: GameSessionRow | null) {
  hoisted.gameSession = { ...hoisted.gameSession, session };
}

const AUCTION_STATE: GamblingState = {
  phase: 'auction',
  auction: {
    category: 'Science',
    categoryIndex: 0,
    roundName: 'double',
    timerDuration: 30,
    playerBalances: { Alice: 1000 },
  },
};

const BETTING_STATE: GamblingState = {
  phase: 'betting',
  betting: {
    availableBets: [{ betType: 'round_leader', description: 'Who will lead this round?' }],
    timerDuration: 60,
    playerBalances: { Alice: 1000 },
  },
};

beforeEach(() => {
  // A returning player: name restored from sessionStorage, so the join gate is
  // skipped and the phase content renders directly.
  sessionStorage.setItem('buzzer_name_SESSION1', 'Alice');
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.clearAllMocks();
});

describe('PlaySessionPage recovers the gambling screen from persisted state', () => {
  it('renders the auction panel on mount from a persisted auction phase (the refresh case), with no broadcast', () => {
    setSession(makeSession({ gambling_state: AUCTION_STATE }));

    render(<PlaySessionPage />);

    expect(screen.getByLabelText('Your Bid')).toBeInTheDocument();
  });

  it('renders the betting panel on mount from a persisted betting phase, with no broadcast', () => {
    setSession(makeSession({ gambling_state: BETTING_STATE }));

    render(<PlaySessionPage />);

    expect(screen.getByRole('heading', { name: 'Place Your Bets' })).toBeInTheDocument();
  });

  it('recovers from the locked buzzer to the auction panel when a later reconcile delivers gambling_state (the missed-broadcast case)', () => {
    // The player missed `auction_start`: the DB still looks like buzzer play.
    setSession(makeSession({ gambling_state: null }));
    const { rerender } = render(<PlaySessionPage />);
    expect(screen.queryByLabelText('Your Bid')).not.toBeInTheDocument();

    // The 3s reconcile in useGameSession fetches the row that now carries the
    // persisted auction phase; no broadcast is involved.
    setSession(makeSession({ gambling_state: AUCTION_STATE }));
    rerender(<PlaySessionPage />);

    expect(screen.getByLabelText('Your Bid')).toBeInTheDocument();
  });

  it('follows the auction to a later category when that category\'s broadcast was missed', () => {
    setSession(makeSession({ gambling_state: AUCTION_STATE }));
    const { rerender } = render(<PlaySessionPage />);
    expect(screen.getByLabelText('Your Bid')).toBeInTheDocument();

    const laterCategory: GamblingState = {
      phase: 'auction',
      auction: { ...AUCTION_STATE.auction!, category: 'History', categoryIndex: 3 },
    };
    setSession(makeSession({ gambling_state: laterCategory }));
    rerender(<PlaySessionPage />);

    // Still bidding, now on the category the DB advanced to.
    expect(screen.getByLabelText('Your Bid')).toBeInTheDocument();
    expect(screen.getByText('History')).toBeInTheDocument();
  });

  it('stays off the gambling panels when gambling_state is null', () => {
    setSession(makeSession({ gambling_state: null }));

    render(<PlaySessionPage />);

    expect(screen.queryByLabelText('Your Bid')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Place Your Bets' })).not.toBeInTheDocument();
  });

  it('does not fall back from betting to auction if a stale reconcile reports the earlier phase', () => {
    setSession(makeSession({ gambling_state: BETTING_STATE }));
    const { rerender } = render(<PlaySessionPage />);
    expect(screen.getByRole('heading', { name: 'Place Your Bets' })).toBeInTheDocument();

    // A poll that started before the betting write could return the older auction
    // state; the player must not be yanked back to bidding.
    setSession(makeSession({ gambling_state: AUCTION_STATE }));
    rerender(<PlaySessionPage />);

    expect(screen.getByRole('heading', { name: 'Place Your Bets' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Your Bid')).not.toBeInTheDocument();
  });
});
