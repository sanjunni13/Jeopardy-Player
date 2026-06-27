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
  created_at: string;
  updated_at: string;
}

export type SessionPhase = 'lobby' | 'buzzer' | 'final-jeopardy' | 'ended';

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

export interface FinalJeopardyState {
  submissions: FinalJeopardySubmission[];
  revealedIndex: number;    // -1 = none revealed, 0+ = revealing in sequence
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
  | { type: 'clue_activated' }
  | { type: 'clue_deactivated' }
  | { type: 'buzz'; playerName: string; timestamp: number }
  | { type: 'buzz_queue_update'; queue: BuzzEvent[] }
  | { type: 'buzzer_locked' }
  | { type: 'buzzer_unlocked' }
  | { type: 'buzz_state_sync'; buzzState: BuzzState }
  | { type: 'buzz_queue_cleared'; lockedOut: string[] }
  | { type: 'player_incorrect'; playerName: string }
  | { type: 'fj_submission_received'; playerName: string }
  | { type: 'fj_reveal'; index: number; submission: FinalJeopardySubmission }
  | { type: 'fj_score_update'; playerName: string; newScore: number }
  | { type: 'session_ended' };
