import type { SessionPlayer } from '../../types/session';
import './ScoreboardStrip.css';

interface ScoreboardStripProps {
  players: SessionPlayer[];
  currentPlayerName: string;
  teamPool?: number | null;
  targetScore?: number | null;
}

/**
 * Compact scoreboard displayed on player devices.
 * Shows all players and their scores, highlighting the current player.
 *
 * In co-op mode (when teamPool and targetScore are present), displays the
 * shared team pool value and a mini progress bar toward the target instead
 * of individual player scores.
 */
export function ScoreboardStrip({ players, currentPlayerName, teamPool, targetScore }: ScoreboardStripProps) {
  if (players.length === 0) return null;

  const isCoopMode = teamPool != null && targetScore != null;

  if (isCoopMode) {
    const progressPercent = targetScore > 0
      ? Math.min(100, Math.max(0, (teamPool / targetScore) * 100))
      : 0;
    const hasReachedTarget = teamPool >= targetScore;
    const poolDisplay = teamPool < 0
      ? `-$${Math.abs(teamPool).toLocaleString()}`
      : `$${teamPool.toLocaleString()}`;

    return (
      <div className="scoreboard-strip scoreboard-strip--coop" aria-label="Team score">
        <h3 className="scoreboard-strip__title">Team Pool</h3>
        <div className="scoreboard-strip__pool-value" aria-live="polite">
          {poolDisplay}
        </div>
        <div className="scoreboard-strip__progress-container" role="progressbar" aria-valuenow={teamPool} aria-valuemin={0} aria-valuemax={targetScore}>
          <div
            className={`scoreboard-strip__progress-bar${hasReachedTarget ? ' scoreboard-strip__progress-bar--success' : ''}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <p className="scoreboard-strip__target-label">
          Target: ${targetScore.toLocaleString()} pts
          {hasReachedTarget && <span className="scoreboard-strip__checkmark"> ✓</span>}
        </p>
      </div>
    );
  }

  // Competitive mode: show individual scores
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
