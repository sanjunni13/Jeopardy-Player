// ─── Display Types ────────────────────────────────────────────────────────────
// This file will be fully populated by task 1.2. These are minimal stubs to
// satisfy the import from session.ts.

export type DisplayPhase =
  | 'waiting'
  | 'board'
  | 'clue'
  | 'daily-double'
  | 'daily-double-wager'
  | 'round-transition'
  | 'final-jeopardy'
  | 'game-over';

export interface DisplayPlayer {
  name: string;
  score: number;
}

export interface DisplayActiveClue {
  category: string;
  value: number;
  clueText: string;
  html: boolean;
  solution: string;
}

export interface DisplayFJState {
  category: string;
  clueText: string;
  solution: string;
  teamWager?: number;
  submissions: Array<{ playerName: string; answer: string; wager: number; correct?: boolean }>;
  revealedIndex: number;
}

export interface DisplayState {
  phase: DisplayPhase;
  game: unknown | null;
  currentRoundIndex: number;
  currentRoundName: string;
  chosenClues: Set<string>;
  players: DisplayPlayer[];
  activeClue: DisplayActiveClue | null;
  answerRevealed: boolean;
  buzzedPlayer: string | null;
  buzzResult: 'correct' | 'incorrect' | null;
  timerRemaining: number | null;
  timerActive: boolean;
  dailyDoublePlayer: string | null;
  dailyDoubleWager: number | null;
  fjState: DisplayFJState | null;
}

export interface DisplayFullSyncPayload {
  phase: DisplayPhase;
  currentRoundIndex: number;
  currentRoundName: string;
  chosenClueKeys: string[];
  players: Array<{ name: string; score: number }>;
  activeClue: { roundName: string; categoryIndex: number; clueIndex: number } | null;
  /** Full clue content for display (avoids needing game file download) */
  activeClueContent?: { category: string; value: number; clueText: string; html: boolean; solution: string } | null;
  answerRevealed: boolean;
  timerRemaining: number | null;
  dailyDoublePlayer: string | null;
  dailyDoubleWager: number | null;
  /** Storage path for the game JSON file (e.g., "userId/gameName.json") */
  gameStoragePath?: string;
}
