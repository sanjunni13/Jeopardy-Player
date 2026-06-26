import './RoundsSelector.css'

interface RoundsSelectorProps {
  value: number
  onChange: (rounds: number) => void
}

const ROUNDS_OPTIONS = [1, 2, 3, 4, 5]

export function RoundsSelector({ value, onChange }: RoundsSelectorProps) {
  return (
    <div
      className="rounds-selector"
      role="group"
      aria-label="Select number of rounds"
    >
      {ROUNDS_OPTIONS.map((round) => (
        <button
          key={round}
          type="button"
          className={`rounds-btn${round === value ? ' rounds-btn--active' : ''}`}
          onClick={() => onChange(round)}
          aria-pressed={round === value}
        >
          {round}
        </button>
      ))}
    </div>
  )
}
