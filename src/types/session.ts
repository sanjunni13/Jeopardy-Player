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
}

export interface FinalJeopardySubmission {
  playerName: string;
  wager: number;
  answer: string;
  submittedAt: string;      // ISO timestamp
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
  | { type: 'session_ended' };
