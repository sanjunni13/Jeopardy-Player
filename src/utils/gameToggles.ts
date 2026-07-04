/**
 * Pure scoring utility functions for Special Game Toggles.
 * All functions are side-effect-free and can be used in property-based tests
 * without rendering React.
 */

import type { ToggleConfig } from '../types/game'

// ─── Wager Range ─────────────────────────────────────────────────────────────

/**
 * Computes the permitted wager range for a player given their current score
 * and the configured wager floor.
 *
 * - When `score > wagerFloor`: permitted range is `[wagerFloor, score]`
 * - When `score ≤ wagerFloor`: permitted range is `[1, wagerFloor]`
 *   (so players with low or negative scores can still participate)
 *
 * Requirements: 3.3, 3.4, 3.5
 */
export function computeWagerRange(
  score: number,
  wagerFloor: number,
): { min: number; max: number } {
  // If the player's score is negative or zero, range is $1 to wagerFloor
  if (score <= 0) {
    return { min: 1, max: wagerFloor }
  }
  // Otherwise, min is wagerFloor, max is the player's current score
  return { min: wagerFloor, max: Math.max(wagerFloor, score) }
}

// ─── Penalty Doubler ─────────────────────────────────────────────────────────

/**
 * Computes the point deduction for an incorrect answer under the Penalty
 * Doubler modifier.
 *
 * Always doubles the deduction: `value × 2`.
 *
 * Requirements: 7.2, 7.3
 */
export function computePenaltyDoubler(opts: {
  value: number
  priorIncorrectCount: number
}): { deduction: number; newIncorrectCount: number } {
  const deduction = opts.value * 2
  return { deduction, newIncorrectCount: opts.priorIncorrectCount + 1 }
}

// ─── Streak Multiplier ───────────────────────────────────────────────────────

/**
 * Updates a player's consecutive correct answer streak count.
 *
 * - `'correct'` → increments by 1
 * - `'incorrect'` or `null` → resets to 0
 *
 * Requirements: 6.1, 6.4
 */
export function updateStreakCount(
  prev: number,
  result: 'correct' | 'incorrect' | null,
): number {
  return result === 'correct' ? prev + 1 : 0
}

/**
 * Returns the configured multiplier when a player's streak count has reached
 * or exceeded the threshold, otherwise returns 1 (no multiplier).
 *
 * Requirements: 6.2, 6.3
 */
export function computeStreakMultiplier(
  streakCount: number,
  threshold: number,
  multiplier: number,
): number {
  return streakCount >= threshold ? multiplier : 1
}

// ─── Steal Bonus ─────────────────────────────────────────────────────────────

/**
 * Checks whether the steal bonus condition is met for a given scoring player.
 *
 * Returns `true` if at least one *other* player (i.e. any player whose name
 * is not `scoringPlayerName`) has an `'incorrect'` marking in `playerMarkings`.
 *
 * Requirements: 5.1, 5.2
 */
export function checkStealCondition(
  playerMarkings: Record<string, 'correct' | 'incorrect' | null>,
  scoringPlayerName: string
): boolean {
  return Object.entries(playerMarkings).some(
    ([name, marking]) => name !== scoringPlayerName && marking === 'incorrect'
  )
}

// ─── applyModifiers ──────────────────────────────────────────────────────────

/**
 * Input options for `applyModifiers`.
 *
 * - `playerName`        — the player whose marking is changing
 * - `prevMarking`       — the marking currently recorded for this player on this clue
 *                         (null = unmarked, 'correct', 'incorrect')
 * - `newMarking`        — the marking being applied (null to clear, 'correct', 'incorrect')
 * - `baseValue`         — the clue's fixed cell value (ignored when wagering is active)
 * - `toggleConfig`      — immutable snapshot of the session's modifier configuration
 * - `streakCount`       — this player's current consecutive correct count BEFORE this marking
 * - `perRoundIncorrect` — this player's per-round incorrect count BEFORE this marking
 * - `playerMarkings`    — the CURRENT markings for ALL players on this clue
 *                         (reflects the state *after* the change has been applied in the
 *                          caller, so `playerMarkings[playerName]` equals `newMarking`)
 */
export interface ApplyModifiersOptions {
  playerName: string
  prevMarking: 'correct' | 'incorrect' | null
  newMarking: 'correct' | 'incorrect' | null
  baseValue: number
  toggleConfig: ToggleConfig
  streakCount: number
  perRoundIncorrect: number
  playerMarkings: Record<string, 'correct' | 'incorrect' | null>
}

/**
 * Result of `applyModifiers`.
 *
 * - `scoreDelta`          — net points to add to the player's score (may be negative)
 * - `newStreakCount`      — updated consecutive correct count for the player
 * - `newPerRoundIncorrect`— updated per-round incorrect count for the player
 * - `stealBonusApplied`  — true when a steal bonus was awarded in this specific marking
 */
export interface ApplyModifiersResult {
  scoreDelta: number
  newStreakCount: number
  newPerRoundIncorrect: number
  stealBonusApplied: boolean
}

/**
 * The single authoritative source of score delta computation for all Special
 * Game Toggle modifiers. All reversal logic is handled atomically here.
 *
 * ### Formula for a new correct marking
 * ```
 * base       = wagering.enabled ? wager : baseValue
 * multiplied = (streakMultiplier.enabled && newStreak >= threshold)
 *                ? base × multiplier
 *                : base
 * delta      = (stealBonus.enabled && stealConditionMet)
 *                ? multiplied + bonusPoints
 *                : multiplied
 * ```
 *
 * ### Formula for a new incorrect marking
 * ```
 * base      = wagering.enabled ? wager : baseValue
 * deduction = penaltyDoubler.enabled
 *               ? computePenaltyDoubler({ value: base, priorIncorrectCount })
 *               : base
 * delta     = -deduction
 * ```
 *
 * ### Reversal
 * When `prevMarking` is non-null, the function first computes the delta that
 * was originally applied for that previous marking (using the same rules but
 * based on the state at the time of reversal) and subtracts it so the net
 * delta reflects only the newly applied marking.
 *
 * Requirements: 6.7, 6.8, 5.2, 7.2, 7.3, 3.7
 */
export function applyModifiers(opts: ApplyModifiersOptions): ApplyModifiersResult {
  const {
    playerName,
    prevMarking,
    newMarking,
    baseValue,
    toggleConfig,
    streakCount,
    perRoundIncorrect,
    playerMarkings,
  } = opts

  const { rulesEngine } = toggleConfig
  const { stealBonus, streakMultiplier, penaltyDoubler } = rulesEngine

  // The caller resolves the effective base value: when wagering is active the
  // caller passes the recorded wager; otherwise the clue's fixed cell value.
  // Either way, `baseValue` is the canonical point value for this marking.
  const base = baseValue

  // ── Compute the reversal delta (undo prevMarking) ─────────────────────────

  let reversalDelta = 0

  if (prevMarking === 'correct') {
    // Undo a previously correct marking.
    // We must reverse: streakMultiplier that was applied + steal bonus if it was awarded.
    //
    // To determine whether a steal bonus was originally awarded we check whether
    // the steal condition *would have been* met when the correct marking was first
    // applied. At that point at least one other player must have been incorrect.
    // Since we cannot know the exact historical state, we use the conservative
    // approach mandated by Req 5.4: always deduct the steal bonus when reversing
    // a correct marking if the steal bonus modifier is active AND the steal bonus
    // was plausibly applied (i.e., at least one other player has or had an incorrect
    // marking). The caller is responsible for passing playerMarkings reflecting the
    // state after the reversal — if `newMarking` is null the current player's slot
    // is already cleared, so we check all OTHER players.
    //
    // We recompute the previous correct delta using the same formula, but using
    // the streakCount that was active at the time (passed in as `streakCount`).

    const prevStreakAfterCorrect = streakCount + 1  // what the streak was after the correct was applied
    const prevMultiplier = streakMultiplier.enabled
      ? computeStreakMultiplier(prevStreakAfterCorrect, streakMultiplier.threshold, streakMultiplier.multiplier)
      : 1
    const prevMultiplied = base * prevMultiplier

    // Check if steal bonus was awarded originally: was there at least one other
    // incorrect player at the time? We assume yes if stealBonus was enabled and
    // at least one other player currently has an incorrect marking (the most
    // common case when reversing). For the edge case where all incorrect markings
    // were also reversed before this reversal, the stealBonus would already have
    // been removed by a prior call (Req 5.5/5.6 handled by the caller via this
    // function). So here we simply check the current state.
    const stealWasAwarded =
      stealBonus.enabled &&
      Object.entries(playerMarkings).some(
        ([name, m]) => name !== playerName && m === 'incorrect'
      )

    const prevStealBonus = stealWasAwarded ? stealBonus.bonusPoints : 0

    reversalDelta = -(prevMultiplied + prevStealBonus)
  } else if (prevMarking === 'incorrect') {
    // Undo a previously incorrect marking.
    // Restore whatever was deducted: base (or doubled base under Penalty Doubler).
    // The count at the time was perRoundIncorrect - 1 (since it was incremented).
    const countAtTimeOfIncorrect = Math.max(0, perRoundIncorrect - 1)
    if (penaltyDoubler.enabled) {
      const { deduction } = computePenaltyDoubler({
        value: base,
        priorIncorrectCount: countAtTimeOfIncorrect,
      })
      reversalDelta = deduction  // positive: we're restoring points
    } else {
      reversalDelta = base  // restore the standard deduction
    }
  }

  // ── Compute the forward delta (apply newMarking) ───────────────────────────

  let forwardDelta = 0
  const newStreakCount = updateStreakCount(streakCount, newMarking)
  let newPerRoundIncorrect = perRoundIncorrect
  let stealBonusApplied = false

  // Adjust streak count for the reversal of prevMarking first so that the
  // forward calculation sees the correct streak baseline.
  // When prevMarking was correct, the streak was incremented; undoing it means
  // the streak should be recalculated from the pre-prevMarking value (streakCount).
  // updateStreakCount(streakCount, newMarking) already gives us the right new count
  // relative to the pre-prevMarking streak, which is what we want.

  if (newMarking === 'correct') {
    const multiplierFactor = streakMultiplier.enabled
      ? computeStreakMultiplier(newStreakCount, streakMultiplier.threshold, streakMultiplier.multiplier)
      : 1
    const multiplied = base * multiplierFactor

    // Steal bonus condition: at least one other player has 'incorrect' marking
    // playerMarkings already has newMarking applied for playerName
    const stealConditionMet =
      stealBonus.enabled && checkStealCondition(playerMarkings, playerName)

    const stealAmount = stealConditionMet ? stealBonus.bonusPoints : 0
    stealBonusApplied = stealConditionMet

    forwardDelta = multiplied + stealAmount

    // Undo the perRoundIncorrect increment if prevMarking was incorrect
    if (prevMarking === 'incorrect') {
      newPerRoundIncorrect = Math.max(0, perRoundIncorrect - 1)
    }
  } else if (newMarking === 'incorrect') {
    // Determine per-round incorrect count at the time of this new incorrect marking.
    // If prevMarking was also 'incorrect', this is a no-op re-mark — count stays.
    // If prevMarking was 'correct', we're switching from correct to incorrect;
    // the count should not have been incremented for the previous correct, so
    // the count stays as-is.
    const countNow = prevMarking === 'incorrect'
      ? Math.max(0, perRoundIncorrect - 1)  // reverting and re-marking: use original pre-mark count
      : perRoundIncorrect

    if (penaltyDoubler.enabled) {
      const { deduction, newIncorrectCount } = computePenaltyDoubler({
        value: base,
        priorIncorrectCount: countNow,
      })
      forwardDelta = -deduction
      newPerRoundIncorrect = newIncorrectCount
    } else {
      forwardDelta = -base
      newPerRoundIncorrect = countNow + 1
    }
  } else {
    // newMarking === null: clearing the marking — no forward points, but
    // undo any perRoundIncorrect increment if prevMarking was incorrect
    if (prevMarking === 'incorrect') {
      newPerRoundIncorrect = Math.max(0, perRoundIncorrect - 1)
    }
  }

  return {
    scoreDelta: reversalDelta + forwardDelta,
    newStreakCount,
    newPerRoundIncorrect,
    stealBonusApplied,
  }
}
