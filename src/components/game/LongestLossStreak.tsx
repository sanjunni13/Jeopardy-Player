import { formatCurrency, formatSignedChange } from '../../utils/currency'

interface LossStreakEntry {
  playerName: string
  streakLength: number
  totalLost: number
  lowestScore: number
}

interface LongestLossStreakProps {
  streaks: LossStreakEntry[]
}

export function LongestLossStreak({ streaks }: LongestLossStreakProps) {
  if (streaks.length === 0) return null

  // Only highlight players tied for the longest streak
  const maxStreak = streaks[0].streakLength
  const topStreaks = streaks.filter((s) => s.streakLength === maxStreak)

  return (
    <div className="loss-streak">
      {topStreaks.map((entry) => (
        <div key={entry.playerName} className="loss-streak-card">
          <div className="loss-streak-player">{entry.playerName}</div>
          <div className="loss-streak-count">
            {entry.streakLength} wrong in a row
          </div>
          <div className="loss-streak-lost">
            {/* `totalLost` is a positive magnitude, so negate it and let the
                formatter own the sign — Requirement 5.10 */}
            {formatSignedChange(-entry.totalLost)} lost
          </div>
          <div className="loss-streak-low">
            Lowest score: {formatCurrency(entry.lowestScore)}
          </div>
        </div>
      ))}
    </div>
  )
}
