interface LossStreakEntry {
  playerName: string
  streakLength: number
  totalLost: number
  lowestScore: number
}

interface LongestLossStreakProps {
  streaks: LossStreakEntry[]
}

function formatDollar(value: number): string {
  if (value < 0) return `-$${Math.abs(value).toLocaleString()}`
  return `$${value.toLocaleString()}`
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
            -{formatDollar(entry.totalLost)} lost
          </div>
          <div className="loss-streak-low">
            Lowest score: {formatDollar(entry.lowestScore)}
          </div>
        </div>
      ))}
    </div>
  )
}
