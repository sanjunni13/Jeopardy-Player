import type { NormalizedGame, RoundName, GamePhase } from '../../types/game';

// ─── Return types ────────────────────────────────────────────────────────────

export interface CheatSheetClue {
  value: number;
  solution: string;
}

export interface CheatSheetCategory {
  category: string;
  clues: CheatSheetClue[];
}

export interface FinalJeopardyAnswer {
  category: string;
  solution: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns an array of round tab labels: the ordered round names followed by "Final Jeopardy".
 */
export function getCheatSheetRounds(
  _game: NormalizedGame,
  orderedRoundNames: RoundName[],
): string[] {
  return [...orderedRoundNames, 'Final Jeopardy'];
}

/**
 * Returns categories with solutions sorted by ascending point value for the given round.
 * Only includes value and solution — not the clue question text.
 */
export function getRoundAnswers(
  game: NormalizedGame,
  roundName: RoundName,
): CheatSheetCategory[] {
  const categories = game.rounds[roundName];
  if (!categories) return [];

  return categories.map((cat) => ({
    category: cat.category,
    clues: [...cat.clues]
      .sort((a, b) => a.value - b.value)
      .map((clue) => ({ value: clue.value, solution: clue.solution })),
  }));
}

/**
 * Returns the Final Jeopardy category and solution (no point value).
 */
export function getFinalJeopardyAnswer(game: NormalizedGame): FinalJeopardyAnswer {
  return {
    category: game.final.category,
    solution: game.final.solution,
  };
}

/**
 * Returns true if the cheat sheet should be shown:
 * - source must be 'ai', 'labs', or 'archive'
 * - phase must NOT be 'player-entry' or 'game-over'
 */
export function shouldShowCheatSheet(
  source: string | null,
  phase: GamePhase,
): boolean {
  const validSources: string[] = ['ai', 'labs', 'archive'];
  const hiddenPhases: GamePhase[] = ['player-entry', 'game-over'];

  if (!source || !validSources.includes(source)) return false;
  if (hiddenPhases.includes(phase)) return false;

  return true;
}
