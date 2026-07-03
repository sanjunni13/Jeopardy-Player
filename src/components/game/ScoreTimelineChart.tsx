import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { ScoreTimelinePoint } from '../../utils/analyticsUtils'

interface ScoreTimelineChartProps {
  timelines: Map<string, ScoreTimelinePoint[]>
  playerNames: string[]
}

// 6 visually distinct colours — Requirements 5.3
const PALETTE = [
  '#6A1B9A', // purple
  '#1976D2', // blue
  '#388E3C', // green
  '#F57C00', // orange
  '#D32F2F', // red
  '#00838F', // teal
]

function formatDollar(value: number): string {
  if (value < 0) return `-$${Math.abs(value).toLocaleString()}`
  return `$${value.toLocaleString()}`
}

export function ScoreTimelineChart({ timelines, playerNames }: ScoreTimelineChartProps) {
  // Merge all timelines into one array of objects keyed by ordinal.
  // Each object: { ordinal: number, [playerName]: number }
  const ordinalSet = new Set<number>()
  for (const points of timelines.values()) {
    for (const pt of points) {
      ordinalSet.add(pt.ordinal)
    }
  }

  const sortedOrdinals = Array.from(ordinalSet).sort((a, b) => a - b)

  // Build a cumulative-forward fill so every player has a value at every ordinal.
  const chartData = sortedOrdinals.map((ordinal) => {
    const entry: Record<string, number> = { ordinal }
    for (const name of playerNames) {
      const points = timelines.get(name) ?? []
      // Last point whose ordinal <= current ordinal
      let score = 0
      for (const pt of points) {
        if (pt.ordinal <= ordinal) score = pt.score
      }
      entry[name] = score
    }
    return entry
  })

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData} margin={{ top: 8, right: 24, bottom: 8, left: 16 }}>
        <XAxis
          dataKey="ordinal"
          label={{ value: 'Clue #', position: 'insideBottomRight', offset: -4, fill: '#94a3b8', fontSize: 12 }}
          tick={{ fill: '#94a3b8', fontSize: 11 }}
        />
        <YAxis
          tickFormatter={formatDollar}
          tick={{ fill: '#94a3b8', fontSize: 11 }}
          width={72}
        />
        <Tooltip
          formatter={(value: number, name: string) => [formatDollar(value), name]}
          contentStyle={{ background: '#1e1e2e', border: '1px solid #444', borderRadius: '6px', color: '#e2e8f0' }}
          labelStyle={{ color: '#94a3b8', fontSize: 11 }}
        />
        <Legend
          wrapperStyle={{ fontSize: 13, color: '#e2e8f0', paddingTop: 8 }}
        />
        {playerNames.map((name, index) => (
          <Line
            key={name}
            type="monotone"
            dataKey={name}
            stroke={PALETTE[index % PALETTE.length]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
