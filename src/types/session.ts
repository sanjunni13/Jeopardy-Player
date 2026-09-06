// ─── Session Types ────────────────────────────────────────────────────────────

export interface SessionPlayer {
  name: string;
  score: number;
  joinedAt: string; // ISO timestamp
}

export interface GameSessionRow {
  id: string;
  host_user_id: string;
  game_id: string;
  phase: SessionPhase;
  is_locked: boolean;
  players: SessionPlayer[];
  buzz_state: BuzzState;
  final_jeopardy_state: FinalJeopardyState;
  team_pool?: number;
  target_score?: number;
  coop_mode?: boolean;
  created_at: string;
  updated_at: string;
}

export type SessionPhase = 'lobby' | 'buzzer' | 'final-jeopardy' | 'ended';

// ─── Presence Types ───────────────────────────────────────────────────────────

/** Payload tracked by each player via Supabase Presence */
export interface PresencePayload {
  playerName: string;
  joinedAt: string; // ISO timestamp of when they started tracking
}

/** A presence record as returned by Supabase (includes presence_ref) */
export interface PresenceRecord extends PresencePayload {
  presence_ref: string;
}

// ─── Buzzer Types ─────────────────────────────────────────────────────────────

export interface BuzzState {
  clueActive: boolean;
  queue: BuzzEvent[];
  lockedOut: string[];      // player names who already buzzed or were marked incorrect
  systemLocked: boolean;    // host manually locked the buzzer system
}

export interface BuzzEvent {
  playerName: string;
  timestamp: number;        // server-side epoch ms
}

// ─── Final Jeopardy Types ─────────────────────────────────────────────────────

export interface FinalJeopardyWager {
  playerName: string;
  wager: number;
  submittedAt: string;      // ISO timestamp
}

export interface FinalJeopardyState {
  wagers: FinalJeopardyWager[];
  submissions: FinalJeopardySubmission[];
  revealedIndex: number;    // -1 = none revealed, 0+ = revealing in sequence
  coopMode?: boolean;       // true when co-op mode is active (host-set, stored in DB)
  /**
   * Wager range inputs written once when the Final Jeopardy wager phase begins
   * and read-only thereafter, so the host and player surfaces derive an
   * identical range and a mid-phase reload restores it unchanged.
   * Absent for sessions that started before this field existed.
   */
  wagerConfig?: {
    wagerFloor: number;
    /** Smallest Real_Balance strictly above $0 at wager-phase start, or null. */
    lowestPositiveBalance: number | null;
  };
}

export interface FinalJeopardySubmission {
  playerName: string;
  wager: number;
  answer: string;
  submittedAt: string;      // ISO timestamp
}

// ─── Gambling Budget Broadcast Types ──────────────────────────────────────────

/**
 * What a player device needs to render its spendable budget during the
 * Auction_Phase and Betting_Phase.
 *
 * Canonical home per the design is `src/utils/gamblingAllowance.ts`; declared
 * here until that module lands so the type modules stay dependency-free.
 */
export interface PlayerBudgetView {
  realBalance: number;
  unspent: number;
  isAllowance: boolean;
}

// ─── Realtime Channel Message Types ───────────────────────────────────────────

export type ChannelMessage =
  | { type: 'phase_change'; phase: SessionPhase }
  | { type: 'player_joined'; player: SessionPlayer }
  | { type: 'player_rejoined'; player: SessionPlayer }
  | { type: 'player_removed'; playerName: string }
  | { type: 'clue_activated' }
  | { type: 'clue_deactivated' }
  | { type: 'buzz'; playerName: string; timestamp: number }
  | { type: 'buzz_queue_update'; queue: BuzzEvent[] }
  | { type: 'buzzer_locked' }
  | { type: 'buzzer_unlocked' }
  | { type: 'buzz_state_sync'; buzzState: BuzzState }
  | { type: 'buzz_queue_cleared'; lockedOut: string[] }
  | { type: 'player_incorrect'; playerName: string }
  | { type: 'fj_wager_received'; playerName: string }
  | { type: 'fj_all_wagers_in' }
  | { type: 'fj_submission_received'; playerName: string }
  | { type: 'fj_reveal'; index: number; submission: FinalJeopardySubmission }
  | { type: 'fj_score_update'; playerName: string; newScore: number }
  | { type: 'coop_pool_update'; teamPool: number; targetScore: number }
  | { type: 'session_ended' }
  | { type: 'auction_start'; category: string; categoryIndex: number; roundName: string; timerDuration: number; playerBalances: Record<string, number>; budgets?: Record<string, PlayerBudgetView> }
  | { type: 'auction_bid'; playerName: string; categoryIndex: number; amount: number }
  | { type: 'auction_result'; categoryIndex: number; winner: string | null; winningBid: number }
  | { type: 'auction_complete'; ownership: Record<string, string> }
  | { type: 'betting_start'; availableBets: { betType: string; description: string }[]; timerDuration: number; playerBalances: Record<string, number>; budgets?: Record<string, PlayerBudgetView> }
  | { type: 'betting_placed'; playerName: string; betType: string; wager: number; prediction: string }
  | { type: 'betting_submitted'; playerName: string; bets: { betType: string; wager: number; prediction: string }[] }
  | { type: 'betting_done'; playerName: string }
  | { type: 'betting_complete' }
  | { type: 'gambling_balance_update'; balances: Record<string, number> };

// ─── Gambling Analytics Types ─────────────────────────────────────────────────

export interface PlayerGamblingStats {
  playerName: string;
  categoriesOwned: number;
  ownershipBonusEarned: number;
  totalBidSpend: number;
  betsPlaced: number;
  betsWon: number;
  betsLost: number;
  /** Total bid and wager spend funded by a Gambling_Allowance, excluded from net profit. */
  allowanceSpend: number;
  netGamblingProfit: number;
}
