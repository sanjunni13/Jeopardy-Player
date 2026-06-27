/**
 * Applies a score mark: adds wager if correct, subtracts if incorrect.
 */
export function applyScoreMark(currentScore: number, wager: number, isCorrect: boolean): number {
  return isCorrect ? currentScore + wager : currentScore - wager;
}

/**
 * Reverses a previous mark and applies a new one.
 * First reverses the previousMark effect, then applies the newMark.
 */
export function reverseAndApplyMark(currentScore: number, wager: number, previousMark: boolean, newMark: boolean): number {
  // Reverse previous mark
  const reversed = previousMark ? currentScore - wager : currentScore + wager;
  // Apply new mark
  return newMark ? reversed + wager : reversed - wager;
}
