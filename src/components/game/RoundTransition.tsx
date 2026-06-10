import { useEffect } from 'react'
import './RoundTransition.css'

interface RoundTransitionProps {
  label: string
  onContinue: () => void
}

export function RoundTransition({ label, onContinue }: RoundTransitionProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        onContinue()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onContinue])

  return (
    <div className="round-transition">
      <div className="round-transition-content">
        <h1 className="round-transition-label">
          {label}
        </h1>
        <button
          type="button"
          onClick={onContinue}
          className="round-transition-btn"
        >
          Continue
        </button>
      </div>
    </div>
  )
}
