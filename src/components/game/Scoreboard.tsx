import type { Player } from '../../types/game'
import './Scoreboard.css'

interface ScoreboardProps {
  players: Player[]
}

export function Scoreboard({ players }: ScoreboardProps) {
  return (
    <div className="scoreboard">
      <ul className="scoreboard-list">
        {players.map((player) => (
          <li
            key={player.name}
            className="scoreboard-item"
          >
            <span className="scoreboard-player-name">
              {player.name}
            </span>
            <span
              className={player.score < 0 ? 'scoreboard-score-negative' : 'scoreboard-score'}
            >
              {player.score < 0 ? `-$${Math.abs(player.score).toLocaleString()}` : `$${player.score.toLocaleString()}`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
