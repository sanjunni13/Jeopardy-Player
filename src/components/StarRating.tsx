import { useState, useCallback } from 'react'
import './StarRating.css'

interface StarRatingProps {
  value: number | null
  onChange?: (value: number) => void
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
}

const STAR_COUNT = 5

const SIZE_MAP: Record<string, number> = {
  sm: 16,
  md: 24,
  lg: 32,
}

function StarIcon({ filled, size }: { filled: boolean; size: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

export function StarRating({ value, onChange, disabled = false, size = 'md' }: StarRatingProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const isInteractive = onChange !== undefined && !disabled
  const pixelSize = SIZE_MAP[size]

  const handleMouseEnter = useCallback(
    (index: number) => {
      if (isInteractive) {
        setHoveredIndex(index)
      }
    },
    [isInteractive]
  )

  const handleMouseLeave = useCallback(() => {
    if (isInteractive) {
      setHoveredIndex(null)
    }
  }, [isInteractive])

  const handleClick = useCallback(
    (index: number) => {
      if (isInteractive && onChange) {
        onChange(index + 1)
      }
    },
    [isInteractive, onChange]
  )

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent, index: number) => {
      if ((event.key === 'Enter' || event.key === ' ') && isInteractive && onChange) {
        event.preventDefault()
        onChange(index + 1)
      }
    },
    [isInteractive, onChange]
  )

  const getStarFilled = (index: number): boolean => {
    if (hoveredIndex !== null) {
      return index <= hoveredIndex
    }
    if (value === null) {
      return false
    }
    return index < value
  }

  const getStarHighlighted = (index: number): boolean => {
    return hoveredIndex !== null && index <= hoveredIndex
  }

  const containerClassName = `star-rating star-rating--${size}`

  return (
    <div
      className={containerClassName}
      role="group"
      aria-label="Rating"
      onMouseLeave={handleMouseLeave}
    >
      {Array.from({ length: STAR_COUNT }, (_, index) => {
        const filled = getStarFilled(index)
        const highlighted = getStarHighlighted(index)

        const starClasses = [
          'star-rating__star',
          filled ? 'star-rating__star--filled' : '',
          highlighted ? 'star-rating__star--hover' : '',
          isInteractive ? 'star-rating__star--interactive' : '',
        ]
          .filter(Boolean)
          .join(' ')

        if (isInteractive) {
          return (
            <button
              key={index}
              type="button"
              className={starClasses}
              aria-label={`Rate ${index + 1} out of 5 stars`}
              onMouseEnter={() => handleMouseEnter(index)}
              onClick={() => handleClick(index)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              disabled={disabled}
            >
              <StarIcon filled={filled} size={pixelSize} />
            </button>
          )
        }

        return (
          <span key={index} className={starClasses}>
            <StarIcon filled={filled} size={pixelSize} />
          </span>
        )
      })}
    </div>
  )
}
