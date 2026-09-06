// ─── Raw file shapes ────────────────────────────────────────────────────────

export interface RawClue {
  value: number;
  clue: string;
  solution: string;
  dailyDouble?: boolean;
  html?: boolean;
}

export interface RawCategory {
  category: string;
  clues: RawClue[];
}

export interface RawFinalRound {
  category: string;
  clue: string;
  solution: string;
  html?: boolean;
}

/** Top-level shape of an uploaded .json file */
export interface GameFile {
  game: Record<string, RawCategory[] | RawFinalRound>;
}

// ─── Normalised / runtime shapes ─────────────────────────────────────────────

export type RoundName =
  | 'single'
  | 'double'
  | 'triple'
  | 'quadruple'
  | 'quintuple'
  | 'sextuple';

export interface Clue {
  value: number;
  clue: string;
  solution: string;
  dailyDouble: boolean;
  html: boolean;
}

export interface Category {
  category: string;
  clues: Clue[];
}

export interface FinalRound {
  category: string;
  clue: string;
  solution: string;
  html: boolean;
}

/** Game object after normalisation — always word-descriptor keys */
export interface NormalizedGame {
  rounds: Record<RoundName, Category[]>;
  final: FinalRound;
  totalRounds: number;
}

// ─── Analytics types ──────────────────────────────────────────────────────────

export interface DailyDoubleRecord {
  /** Format: `${roundName}-${categoryIndex}-${clueIndex}` */
  clueKey: string;
  playerName: string;
  wager: number;
  outcome: 'correct' | 'incorrect';
}

// ─── Special Game Toggle types ────────────────────────────────────────────────

export interface CoopConfig {
  enabled: boolean
  targetPercentage: number  // integer 50-100, default 75
}

export interface WageringConfig {
  enabled: boolean
  wagerFloor: number  // integer 1-10000, default 100
}

export interface StealBonusConfig {
  enabled: boolean
  bonusPoints: number  // integer 1-5000, default 200
}

export interface StreakMultiplierConfig {
  enabled: boolean
  threshold: number    // integer 2-5, default 3
  multiplier: number   // integer 2-5, default 2
}

export interface PenaltyDoublerConfig {
  enabled: boolean     // no additional configuration
}

export interface RulesEngineConfig {
  enabled: boolean
  stealBonus: StealBonusConfig
  streakMultiplier: StreakMultiplierConfig
  penaltyDoubler: PenaltyDoublerConfig
}

export interface TimedClueConfig {
  enabled: boolean
  timerDuration: number  // integer 5-120, default 30
}

// ─── Gambling Problem types ──────────────────────────────────────────────────

export interface GamblingConfig {
  enabled: boolean
  /** Starting balance for each player in the gambling mode */
  startingBalance: number  // integer 500-10000, default 1000
  /** Seconds allowed per auction round for bidding */
  auctionTimer: number  // integer 10-60, default 20
}

/**
 * Where a bid or wager was funded from — the player's Real_Balance or a
 * Gambling_Allowance. An absent value reads as `'balance'`, so sessions
 * recorded before the allowance existed need no migration.
 *
 * Canonical home per the design is `src/utils/gamblingAllowance.ts`; declared
 * here until that module lands so the type modules stay dependency-free.
 */
export type FundingSource = 'balance' | 'allowance'

/** A single bet placed by a player during the betting side games phase */
export interface SideBet {
  playerName: string
  betType: SideBetType
  wager: number
  prediction: string
  /** Funding source for the wager. Absent reads as `'balance'`. */
  fundedBy?: FundingSource
}

export type SideBetType =
  | 'round_leader'
  | 'daily_double_finder'
  | 'most_incorrect'
  | 'sweep_category'
  | 'zero_score_round'
  | 'no_wrong_answers'
  | 'highest_single_clue'
  | 'most_correct'
  | 'first_incorrect'
  | 'biggest_earner'
  | 'bottom_feeder'

/** Tracks category ownership from auctions */
export interface CategoryOwnership {
  /** Key: `${roundName}-${categoryIndex}`, Value: player name who owns it */
  [categoryKey: string]: string
}

// ─── Round Tracking (for bet resolution) ─────────────────────────────────────

export interface ClueAnswerEvent {
  playerName: string
  clueKey: string
  result: 'correct' | 'incorrect'
  pointValue: number
  /**
   * Points actually credited to the player for this event, including the
   * category-ownership multiplier (Gambling Problem mode) and any
   * modifier-adjusted base value. Falls back to `pointValue` when absent.
   */
  earnedPoints?: number
  /** Monotonically increasing index representing chronological order */
  chronologicalOrder: number
  categoryIndex: number
}

export interface RoundTrackingData {
  /** All players participating in this round */
  players: Player[]
  /** Scores at the START of the round (for computing score deltas) */
  startOfRoundScores: Record<string, number>
  /** Every answer event that occurred during the round, in chronological order */
  answerEvents: ClueAnswerEvent[]
  /** The player who selected the first Daily Double clue, or null */
  dailyDoubleFinderPlayer: string | null
  /** Number of clues per category (for sweep detection) */
  cluesPerCategory: Record<number, number>
}

// ─── Gambling Ledger ─────────────────────────────────────────────────────────

export type GamblingLedgerEntryType =
  | 'bid'
  | 'bet_placed'
  | 'bet_won'
  | 'bet_lost'
  | 'ownership_bonus';

export interface GamblingLedgerEntry {
  type: GamblingLedgerEntryType;
  playerName: string;
  amount: number;
  /** Contextual label — category name for bids/ownership, bet type for bets */
  label: string;
  /** Monotonically increasing index assigned at insertion time */
  order: number;
  /**
   * Funding source for a `bid` or `bet_placed` entry. Absent reads as
   * `'balance'`, so ledgers persisted before the Gambling_Allowance existed
   * compute exactly as they do today.
   */
  fundedBy?: FundingSource;
}

export type GamblingLedger = GamblingLedgerEntry[];

/**
 * Immutable snapshot of all toggle states captured at game-start (Play).
 * Stored in GameSession. Never mutated after the session begins.
 */
export interface ToggleConfig {
  coop: CoopConfig
  wagering: WageringConfig
  rulesEngine: RulesEngineConfig
  timedClues: TimedClueConfig
  gambling: GamblingConfig
}

export const DEFAULT_TOGGLE_CONFIG: ToggleConfig = {
  coop: { enabled: false, targetPercentage: 75 },
  wagering: { enabled: false, wagerFloor: 100 },
  rulesEngine: {
    enabled: false,
    stealBonus: { enabled: false, bonusPoints: 200 },
    streakMultiplier: { enabled: false, threshold: 3, multiplier: 2 },
    penaltyDoubler: { enabled: false },
  },
  timedClues: { enabled: false, timerDuration: 30 },
  gambling: { enabled: false, startingBalance: 1000, auctionTimer: 20 },
}

// ─── Session types ────────────────────────────────────────────────────────────

export interface Player {
  name: string;
  score: number;
  correctCount: number;
  incorrectCount: number;
  correctDailyDoubles: number;
  incorrectDailyDoubles: number;
  correctFinalJeopardy: number;   // 0 or 1
  incorrectFinalJeopardy: number; // 0 or 1
  totalEarned: number;            // cumulative sum of all correct clue values (always positive)
}

/** Per-clue tracking */
export interface ClueState {
  chosen: boolean;
  playerMarkings: Record<string, 'correct' | 'incorrect' | null>;
}

export interface GameSession {
  game: NormalizedGame;
  gameId: string;
  players: Player[];
  currentRoundIndex: number;
  orderedRoundNames: RoundName[];
  /** key: `${roundName}-${categoryIndex}-${clueIndex}` */
  clueStates: Record<string, ClueState>;
  dailyDoubleRecords: DailyDoubleRecord[];
  /** Immutable snapshot of toggle configuration captured at game-start */
  toggleConfig: ToggleConfig;
  /** Per-player consecutive correct answer count for Streak Multiplier */
  streakCounts: Record<string, number>;
  /** Per-player incorrect answer count for the current round (Penalty Doubler) */
  perRoundIncorrect: Record<string, number>;
  /** Wagers recorded during WagerEntry phase; null when not in wagering phase */
  activeWagers: Record<string, number> | null;
  /** Shared co-op score pool; starts at 0, only used when toggleConfig.coop.enabled */
  teamPool: number;
  /** Target score the team must reach (boardTotal × targetPercentage / 100); frozen at game start */
  targetScore: number;
  /** Sum of all clue point values across all rounds (excluding Final Jeopardy) */
  boardTotal: number;
  /** Ordered log of all gambling actions for analytics */
  gamblingLedger: GamblingLedger;
  /** Gambling Problem: category ownership map (key: `${roundName}-${catIdx}`) */
  categoryOwnership: CategoryOwnership;
  /** Gambling Problem: active side bets for the current round */
  activeSideBets: SideBet[];
}

export type GamePhase =
  | 'player-entry'
  | 'category-reveal'
  | 'category-auction'
  | 'betting'
  | 'board'
  | 'daily-double'
  | 'daily-double-wager'
  | 'wager-entry'
  | 'clue'
  | 'round-transition'
  | 'final-jeopardy'
  | 'game-over';

export interface ActiveClue {
  roundName: RoundName;
  categoryIndex: number;
  clueIndex: number;
}

// ─── Edge Function request / response shapes ─────────────────────────────────

export interface SaveGameRequest {
  gameName: string;
  gameData: NormalizedGame;
}

export interface SaveGameSuccessResponse {
  success: true;
  id: string;
}

export interface SaveGameAlreadyExistsResponse {
  error: string;
  alreadyExists: true;
}

export interface SaveGameErrorResponse {
  error: string;
}

export type SaveGameResponse =
  | SaveGameSuccessResponse
  | SaveGameAlreadyExistsResponse
  | SaveGameErrorResponse;

export interface UpdateStatsRequest {
  gameId: string;
  players: Array<{
    name: string;
    finalScore: number;
    correctCount: number;
    incorrectCount: number;
    isWinner: boolean;
  }>;
  winnerNames: string[];
}

export interface UpdateStatsResponse {
  success: boolean;
  error?: string;
}

// ─── Database record types ────────────────────────────────────────────────────

/** Row shape returned when selecting from the `games` table */
export interface GameRecord {
  id: string
  game_name: string
  total_rounds: number
  times_played: number
  winners: string[]
  created_by: number | null
  source: string | null
  /** Highest score ever achieved on this game */
  high_score: number | null
  /** Name of the player who achieved the high score */
  high_score_player: string | null
  /** Joined player_name from the players table via created_by FK */
  creator_name: string | null
}

// ─── Utility result types ─────────────────────────────────────────────────────

export type ValidationResult =
  | { valid: true; raw: GameFile }
  | { valid: false; error: string };

export type NormalizeResult =
  | { ok: true; game: NormalizedGame }
  | { ok: false; error: string };

/** Extended GameRecord with rating summary for library display */
export interface GameRecordWithRating extends GameRecord {
  averageRating: number | null
  ratingCount: number
}
