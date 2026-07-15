import { useEffect } from 'react'
import { Component as EtherealShadows } from '../ui/framer-motion-animations/etherealShadows'
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
      <div className="round-transition-bg">
        <EtherealShadows
          color="rgba(0, 22, 153, 1)"
          animation={{ scale: 100, speed: 90 }}
          noise={{ opacity: 1, scale: 1.2 }}
          sizing="fill"
        />
      </div>
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
