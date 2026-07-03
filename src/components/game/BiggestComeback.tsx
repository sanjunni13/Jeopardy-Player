interface ComebackEntry {
  playerName: string
  delta: number
  lowestScore: number
}

interface BiggestComebackProps {
  comebacks: ComebackEntry[]
}

function formatDollar(value: number): string {
  if (value < 0) return `-$${Math.abs(value).toLocaleString()}`
  return `$${value.toLocaleString()}`
}

export function BiggestComeback({ comebacks }: BiggestComebackProps) {
  // Render nothing when all deltas are 0 — Requirement 7.5
  const hasComeback = comebacks.some((c) => c.delta > 0)
  if (!hasComeback) return null

  // Find the maximum delta value
  const maxDelta = Math.max(...comebacks.map((c) => c.delta))

  // Highlight all players tied for the top comeback — Requirement 7.4
  const topPlayers = comebacks.filter((c) => c.delta === maxDelta)

  return (
    <div className="biggest-comeback">
      {topPlayers.map((entry) => (
        <div key={entry.playerName} className="biggest-comeback-card">
          <div className="biggest-comeback-player">{entry.playerName}</div>
          <div className="biggest-comeback-delta">
            +{formatDollar(entry.delta)}
          </div>
          <div className="biggest-comeback-low">
            Lowest score: {formatDollar(entry.lowestScore)}
          </div>
        </div>
      ))}
    </div>
  )
}
