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

/**
 * Immutable snapshot of all toggle states captured at game-start (Play).
 * Stored in GameSession. Never mutated after the session begins.
 */
export interface ToggleConfig {
  coop: CoopConfig
  wagering: WageringConfig
  rulesEngine: RulesEngineConfig
  timedClues: TimedClueConfig
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
}

export type GamePhase =
  | 'player-entry'
  | 'category-reveal'
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
