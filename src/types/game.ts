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
}

export type GamePhase =
  | 'player-entry'
  | 'category-reveal'
  | 'board'
  | 'daily-double'
  | 'daily-double-wager'
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
