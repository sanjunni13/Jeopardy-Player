import { useState } from 'react'
import type { Player } from '../../types/game'
import { BackButton } from '../BackButton'
import { DeleteButton } from '../DeleteButton'
import { BackgroundGradient } from '../ui/background-gradient'
import './PlayerEntry.css'

interface PlayerEntryProps {
  onPlay: (players: Player[]) => void
  onBack?: () => void
  onPlayerRemoved?: (playerName: string) => void
  onPlayerAdded?: (playerName: string) => void
}

export function PlayerEntry({ onPlay, onBack, onPlayerRemoved, onPlayerAdded }: PlayerEntryProps) {
  const [players, setPlayers] = useState<Player[]>([])
  const [inputValue, setInputValue] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  function addPlayer() {
    const trimmed = inputValue.trim()

    if (!trimmed) {
      setErrorMessage('Player name cannot be empty.')
      return
    }

    if (trimmed.length > 30) {
      setErrorMessage('Player name must be 30 characters or fewer.')
      return
    }

    if (players.some(p => p.name.toLowerCase() === trimmed.toLowerCase())) {
      setErrorMessage('A player with that name already exists.')
      return
    }

    setPlayers([...players, { name: trimmed, score: 0, correctCount: 0, incorrectCount: 0, correctDailyDoubles: 0, incorrectDailyDoubles: 0, correctFinalJeopardy: 0, incorrectFinalJeopardy: 0, totalEarned: 0 }])
    setInputValue('')
    setErrorMessage(null)
    onPlayerAdded?.(trimmed)
  }

  function removePlayer(index: number) {
    const removed = players[index]
    setPlayers(players.filter((_, i) => i !== index))
    onPlayerRemoved?.(removed.name)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      addPlayer()
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setInputValue(e.target.value)
    if (errorMessage) setErrorMessage(null)
  }

  const isMaxPlayers = players.length >= 10

  return (
    <div className="player-entry-page">
      <BackgroundGradient containerClassName="player-entry-gradient-container" className="player-entry-card">
        {/* Back navigation */}
        {onBack && (
          <BackButton onClick={onBack} label="Back" />
        )}

        <h1 className="player-entry-title">Players</h1>
        <p className="player-entry-subtitle">
          Add players to the game. You need at least one player to start.
        </p>

        {/* Player list */}
        {players.length > 0 && (
          <ul className="player-list">
            {players.map((player, i) => (
              <li
                key={player.name}
                className="player-list-item"
              >
                <span className="player-list-name">{player.name}</span>
                <DeleteButton onClick={() => removePlayer(i)} label={`Remove ${player.name}`} />
              </li>
            ))}
          </ul>
        )}

        {/* Add player input */}
        <div className="player-add-row">
          <input
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={isMaxPlayers}
            placeholder={isMaxPlayers ? 'Maximum players reached' : 'Player name'}
            autoFocus
            className={`player-input ${errorMessage ? 'player-input-error' : ''}`}
          />
          <button
            type="button"
            onClick={addPlayer}
            disabled={isMaxPlayers}
            className="player-add-btn"
            aria-label="Add player"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>

        {/* Error message */}
        {errorMessage && (
          <p className="player-error">{errorMessage}</p>
        )}

        {/* Play button */}
        <button
          type="button"
          onClick={() => onPlay(players)}
          disabled={players.length === 0}
          className="player-play-btn"
        >
          Play
        </button>
      </BackgroundGradient>
    </div>
  )
}
