import { useEffect, useRef, useState } from 'react'
import type { Player } from '../../types/game'
import './DailyDoubleScreen.css'

interface DailyDoubleScreenProps {
  players: Player[]
  onPlayerSelect: (playerName: string) => void
}

export function DailyDoubleScreen({ players, onPlayerSelect }: DailyDoubleScreenProps) {
  const soundPlayedRef = useRef(false)
  const [animationComplete, setAnimationComplete] = useState(false)

  // Play Daily Double sound on mount (once)
  useEffect(() => {
    if (!soundPlayedRef.current) {
      soundPlayedRef.current = true
      const audio = new Audio(`${import.meta.env.BASE_URL}sounds/dailydouble.mp3`)
      audio.play().catch(() => { /* autoplay may be blocked */ })
    }
  }, [])

  // Set animation complete after 3 seconds (matches dailyDoubleReveal duration)
  useEffect(() => {
    const timeout = setTimeout(() => {
      setAnimationComplete(true)
    }, 3000)

    return () => clearTimeout(timeout)
  }, [])

  return (
    <div className="daily-double-overlay">
      <div className="daily-double-content">
        <div className="daily-double-outline" />
        <h1 className={`daily-double-title ${animationComplete ? 'ready' : ''}`}>
          Daily Double!
        </h1>
      </div>

      {/* Player selection at bottom — only visible after animation completes */}
      {animationComplete && (
        <div className="daily-double-players">
          <p className="daily-double-players-label">Select the player:</p>
          <div className="daily-double-players-list">
            {players.map((player) => (
              <button
                key={player.name}
                type="button"
                onClick={() => onPlayerSelect(player.name)}
                className="daily-double-player-btn"
              >
                {player.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
