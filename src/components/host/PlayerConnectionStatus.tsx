import type { SessionPlayer } from '../../types/session'
import './PlayerConnectionStatus.css'

interface PlayerConnectionStatusProps {
  players: SessionPlayer[]
  isLocked: boolean
  onLock: () => void
  onUnlock: () => void
}

const MAX_PLAYERS = 10

export function PlayerConnectionStatus({
  players,
  isLocked,
  onLock,
  onUnlock,
}: PlayerConnectionStatusProps) {
  return (
    <div className="player-connection-status">
      <div className="player-connection-status-header">
        <span className="player-connection-status-count">
          {players.length}/{MAX_PLAYERS} players
        </span>
        {isLocked ? (
          <div className="player-connection-status-lock-group">
            <span className="player-connection-status-locked-indicator" aria-label="Session is locked">
              🔒 Session Locked
            </span>
            <button
              type="button"
              className="player-connection-status-btn player-connection-status-btn--unlock"
              onClick={onUnlock}
            >
              Unlock
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="player-connection-status-btn player-connection-status-btn--lock"
            onClick={onLock}
          >
            Lock Session
          </button>
        )}
      </div>

      {players.length > 0 && (
        <ul className="player-connection-status-list" aria-label="Connected players">
          {players.map((player) => (
            <li key={player.name} className="player-connection-status-player">
              {player.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
