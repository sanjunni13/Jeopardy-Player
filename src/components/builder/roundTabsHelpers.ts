/**
 * Generate tab labels for a given number of rounds.
 * Returns ["Round 1", "Round 2", ..., "Final Jeopardy"]
 */
export function generateTabLabels(totalRounds: number): string[] {
  const labels: string[] = []
  for (let i = 1; i <= totalRounds; i++) {
    labels.push(`Round ${i}`)
  }
  labels.push('Final Jeopardy')
  return labels
}

/**
 * Compute the next focus index when navigating with arrow keys, with wrapping.
 * direction: -1 for left, +1 for right
 */
export function getNextFocusIndex(
  currentIndex: number,
  direction: number,
  tabCount: number
): number {
  return (currentIndex + direction + tabCount) % tabCount
}
