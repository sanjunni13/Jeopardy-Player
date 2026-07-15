import type { SessionPlayer } from '../../types/session';
import './ScoreboardStrip.css';

interface ScoreboardStripProps {
  players: SessionPlayer[];
  currentPlayerName: string;
}

/**
 * Compact scoreboard displayed on player devices during Final Jeopardy.
 * Shows all players and their scores, highlighting the current player.
 */
export function ScoreboardStrip({ players, currentPlayerName }: ScoreboardStripProps) {
  if (players.length === 0) return null;

  // Sort players by score descending
  const sorted = [...players].sort((a, b) => b.score - a.score);

  return (
    <div className="scoreboard-strip" aria-label="Player scores">
      <h3 className="scoreboard-strip__title">Scores</h3>
      <ul className="scoreboard-strip__list">
        {sorted.map((player) => {
          const isCurrent = player.name.toLowerCase() === currentPlayerName.toLowerCase();
          const scoreDisplay = player.score < 0
            ? `-$${Math.abs(player.score).toLocaleString()}`
            : `$${player.score.toLocaleString()}`;

          return (
            <li
              key={player.name}
              className={`scoreboard-strip__item${isCurrent ? ' scoreboard-strip__item--current' : ''}`}
            >
              <span className="scoreboard-strip__name">
                {player.name}
                {isCurrent && <span className="scoreboard-strip__you-badge">(you)</span>}
              </span>
              <span className="scoreboard-strip__score">{scoreDisplay}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
