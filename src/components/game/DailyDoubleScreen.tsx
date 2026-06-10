import { useEffect, useState } from 'react'
import type { Player } from '../../types/game'
import './DailyDoubleScreen.css'

interface DailyDoubleScreenProps {
  players: Player[]
  onPlayerSelect: (playerName: string) => void
}

export function DailyDoubleScreen({ players, onPlayerSelect }: DailyDoubleScreenProps) {
  const [soundPlayed, setSoundPlayed] = useState(false)
  const [animationComplete, setAnimationComplete] = useState(false)

  // Play Daily Double sound on mount
  useEffect(() => {
    if (!soundPlayed) {
      const audio = new Audio('/sounds/dailydouble.mp3')
      audio.play().catch(() => { /* autoplay may be blocked */ })
      setSoundPlayed(true)
    }
  }, [soundPlayed])

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
