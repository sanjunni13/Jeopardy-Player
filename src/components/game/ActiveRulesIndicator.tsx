import type { ToggleConfig } from '../../types/game'
import './ActiveRulesIndicator.css'

interface ActiveRulesIndicatorProps {
  config: ToggleConfig
}

/**
 * A compact, always-visible strip that displays the active game modifiers.
 * Renders nothing when all toggles are disabled.
 * Requirements: 8.1, 8.2, 8.3
 */
export function ActiveRulesIndicator({ config }: ActiveRulesIndicatorProps) {
  const labels: string[] = []

  if (config.coop.enabled) {
    labels.push(`Co-op: Target ${config.coop.targetPercentage}%`)
  }

  if (config.wagering.enabled) {
    labels.push(`Wagering: ${config.wagering.wagerFloor} pt min`)
  }

  if (config.rulesEngine.enabled && config.rulesEngine.stealBonus.enabled) {
    labels.push(`Steal Bonus: +${config.rulesEngine.stealBonus.bonusPoints} pts`)
  }

  if (config.rulesEngine.enabled && config.rulesEngine.streakMultiplier.enabled) {
    labels.push(`Streak ×${config.rulesEngine.streakMultiplier.multiplier} at ${config.rulesEngine.streakMultiplier.threshold}`)
  }

  if (config.timedClues.enabled) {
    labels.push(`Timed: ${config.timedClues.timerDuration}s`)
  }

  if (labels.length === 0) {
    return null
  }

  return (
    <div className="active-rules-strip" role="status" aria-label="Active game rules">
      {labels.map((label) => (
        <span key={label} className="active-rules-label">
          {label}
        </span>
      ))}
    </div>
  )
}
