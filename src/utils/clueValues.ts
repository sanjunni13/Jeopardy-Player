/**
 * Computes the standard Jeopardy clue value based on row position and round number.
 *
 * @param rowPosition - 1-based index of the clue within its category (e.g., 1–5)
 * @param roundNumber - 1-based round number (e.g., 1 for Round 1, 2 for Round 2)
 * @returns The computed clue value (rowPosition × 200 × roundNumber)
 */
export function computeClueValue(rowPosition: number, roundNumber: number): number {
  return rowPosition * 200 * roundNumber;
}
