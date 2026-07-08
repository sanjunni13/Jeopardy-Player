import { useState, useCallback } from 'react'
import { useRating } from '../hooks/useRating'
import { StarRating } from './StarRating'
import './RatingPrompt.css'

interface RatingPromptProps {
  gameId: string
  playerId: number
  onRated?: () => void
}

const MAX_RETRIES = 3

export function RatingPrompt({ gameId, playerId, onRated }: RatingPromptProps) {
  const { rating, loading, submitting, submitRating } = useRating(gameId, playerId)
  const [confirmed, setConfirmed] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const isDisabled = retryCount >= MAX_RETRIES

  const handleRatingChange = useCallback(
    async (value: number) => {
      if (submitting || isDisabled) return

      setErrorMessage(null)

      const success = await submitRating(value)

      if (success) {
        setConfirmed(true)
        setRetryCount(0)
        setErrorMessage(null)
        onRated?.()

        setTimeout(() => {
          setConfirmed(false)
        }, 2000)
      } else {
        const newRetryCount = retryCount + 1
        setRetryCount(newRetryCount)

        if (newRetryCount >= MAX_RETRIES) {
          setErrorMessage(null)
        } else {
          setErrorMessage('Rating could not be saved. Please try again.')
        }
      }
    },
    [submitting, isDisabled, submitRating, retryCount, onRated]
  )

  if (loading) return null

  return (
    <div className="rating-prompt">
      <p className="rating-prompt__title">Rate this game</p>

      <StarRating
        value={rating}
        onChange={isDisabled ? undefined : handleRatingChange}
        disabled={submitting || isDisabled}
        size="lg"
      />

      {confirmed && (
        <span className="rating-prompt__confirmation" aria-live="polite">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Rated!
        </span>
      )}

      {errorMessage && !isDisabled && (
        <p className="rating-prompt__error" role="alert">
          {errorMessage}
        </p>
      )}

      {isDisabled && (
        <p className="rating-prompt__disabled-msg" role="status">
          Cannot save at this time
        </p>
      )}
    </div>
  )
}
