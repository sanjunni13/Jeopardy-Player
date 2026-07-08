import { useRef, useState } from 'react'
import './FavoriteToggle.css'

interface FavoriteToggleProps {
  isFavorited: boolean
  onToggle: () => void
  disabled?: boolean
  ariaLabel: string
}

export function FavoriteToggle({ isFavorited, onToggle, disabled, ariaLabel }: FavoriteToggleProps) {
  // Only enable animations after the user has interacted (not on initial render)
  const [hasInteracted, setHasInteracted] = useState(false)
  const interactedRef = useRef(false)

  const handleChange = () => {
    if (!interactedRef.current) {
      interactedRef.current = true
      setHasInteracted(true)
    }
    onToggle()
  }

  const className = [
    'ui-bookmark',
    disabled ? 'ui-bookmark--disabled' : '',
    hasInteracted ? '' : 'ui-bookmark--no-animate',
  ].filter(Boolean).join(' ')

  return (
    <label
      className={className}
      aria-label={ariaLabel}
      role="checkbox"
      aria-checked={isFavorited}
    >
      <input
        type="checkbox"
        checked={isFavorited}
        onChange={handleChange}
        disabled={disabled}
      />
      <div className="bookmark">
        <svg viewBox="0 0 32 32">
          <g>
            <path d="M27 4v27a1 1 0 0 1-1.625.781L16 24.281l-9.375 7.5A1 1 0 0 1 5 31V4a4 4 0 0 1 4-4h14a4 4 0 0 1 4 4z"></path>
          </g>
        </svg>
      </div>
    </label>
  )
}
