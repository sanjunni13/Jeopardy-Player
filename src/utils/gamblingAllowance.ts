/**
 * Spendable_Budget bookkeeping for the Gambling_Mode Auction_Phase and
 * Betting_Phase.
 *
 * A player whose Real_Balance is at or below $0 when the Auction_Phase begins
 * receives a single $500 Gambling_Allowance that covers the Auction_Phase and
 * the Betting_Phase together; every other player spends their Real_Balance as
 * it stood at that instant. Classification is frozen at Auction_Phase start,
 * so a mid-round balance change never moves a player between funding sources
 * (Requirements 1.11, 1.12, 2.11).
 *
 * Every function here is pure: no input object is mutated, and `commit` returns
 * the state unchanged for an inadmissible amount.
 */

import type { Player } from '../types/game'

// The canonical homes of these two types are the dependency-free type modules;
// re-exported here so the documented export surface of this module holds
// without a duplicate declaration or an import cycle.
export type { FundingSource } from '../types/game'
export type { PlayerBudgetView } from '../types/session'

import type { FundingSource } from '../types/game'
import type { PlayerBudgetView } from '../types/session'

/** The single shared pool granted to an Allowance_Player for both phases. */
export const GAMBLING_ALLOWANCE_AMOUNT = 500

/** The smallest permitted bid or wager. $0 is the floor, never a valid amount. */
export const MIN_COMMITMENT = 1

/**
 * Spendable_Budget bookkeeping for one round's Auction_Phase + Betting_Phase.
 * Every field is frozen at Auction_Phase start except `committed`.
 */
export interface GamblingBudgetState {
  /** Allowance_Player classification, frozen when the Auction_Phase began. */
  allowancePlayers: Record<string, boolean>
  /** Real_Balance snapshot taken when the Auction_Phase began. */
  startBalances: Record<string, number>
  /** Budget already committed this round: winning bids + placed wagers. */
  committed: Record<string, number>
}

/**
 * Reads a player's Real_Balance defensively. A player who joined mid-game and
 * holds no recorded score is treated as $0, so they classify as an
 * Allowance_Player (Requirement 1.1).
 */
function realBalanceOf(player: Player): number {
  return player.score ?? 0
}

/**
 * Requirement 1.1, 1.2 — grant the allowance to every player at or below $0
 * and set every other player's budget to their Real_Balance.
 */
export function beginGamblingPhases(players: Player[]): GamblingBudgetState {
  const allowancePlayers: Record<string, boolean> = {}
  const startBalances: Record<string, number> = {}
  const committed: Record<string, number> = {}

  for (const player of players) {
    const balance = realBalanceOf(player)
    allowancePlayers[player.name] = balance <= 0
    startBalances[player.name] = balance
    committed[player.name] = 0
  }

  return { allowancePlayers, startBalances, committed }
}

/**
 * Requirement 1.9 — the allowance is discarded when the Betting_Phase ends and
 * Real_Balance is left untouched by that discard. The next round's budgets are
 * derived only from a fresh `beginGamblingPhases` call.
 */
export function discardGamblingPhases(): null {
  return null
}

export function isAllowancePlayer(state: GamblingBudgetState, playerName: string): boolean {
  return state.allowancePlayers[playerName] === true
}

/** $500 for an Allowance_Player, the start-of-phase Real_Balance otherwise. */
export function budgetTotal(state: GamblingBudgetState, playerName: string): number {
  if (isAllowancePlayer(state, playerName)) return GAMBLING_ALLOWANCE_AMOUNT
  return state.startBalances[playerName] ?? 0
}

/** Requirement 1.3 — budgetTotal minus everything already committed. */
export function unspentBudget(state: GamblingBudgetState, playerName: string): number {
  return budgetTotal(state, playerName) - (state.committed[playerName] ?? 0)
}

/** Requirement 1.3, 1.6, 2.10 — a bid is admissible iff 1 ≤ amount ≤ unspent. */
export function isAdmissibleCommitment(amount: number, unspent: number): boolean {
  if (!Number.isFinite(amount) || !Number.isFinite(unspent)) return false
  return amount >= MIN_COMMITMENT && amount <= unspent
}

/**
 * Requirement 1.4 — a new wager is admissible iff it is at least $1 and the
 * running total of this phase's wagers stays within the unspent budget, so
 * bids and wagers draw down one shared pool.
 */
export function isAdmissibleCumulativeCommitment(
  alreadyCommittedThisPhase: number,
  amount: number,
  unspent: number,
): boolean {
  if (!Number.isFinite(alreadyCommittedThisPhase) || alreadyCommittedThisPhase < 0) return false
  if (!Number.isFinite(amount) || !Number.isFinite(unspent)) return false
  if (amount < MIN_COMMITMENT) return false
  return alreadyCommittedThisPhase + amount <= unspent
}

/**
 * Requirement 1.5, 1.6, 2.10 — draws an accepted amount down from the player's
 * budget. Returns the state unchanged for an inadmissible amount, leaving the
 * unspent budget and every previously accepted commitment untouched.
 */
export function commit(
  state: GamblingBudgetState,
  playerName: string,
  amount: number,
): GamblingBudgetState {
  if (!isAdmissibleCommitment(amount, unspentBudget(state, playerName))) return state

  return {
    allowancePlayers: state.allowancePlayers,
    startBalances: state.startBalances,
    committed: {
      ...state.committed,
      [playerName]: (state.committed[playerName] ?? 0) + amount,
    },
  }
}

/**
 * Requirement 1.8 — players who can still commit at least $1, in the input
 * player order.
 */
export function eligibleBidders(state: GamblingBudgetState, players: Player[]): Player[] {
  return players.filter((player) => unspentBudget(state, player.name) >= MIN_COMMITMENT)
}

/** Requirement 2.11 — funding source comes from the frozen classification. */
export function fundingSourceFor(state: GamblingBudgetState, playerName: string): FundingSource {
  return isAllowancePlayer(state, playerName) ? 'allowance' : 'balance'
}

/**
 * What each player device needs to render its budget (Requirement 1.7, 1.13).
 * `realBalance` reflects the player's current Real_Balance, while `unspent` and
 * `isAllowance` come from the frozen budget state.
 */
export function budgetViews(
  state: GamblingBudgetState,
  players: Player[],
): Record<string, PlayerBudgetView> {
  const views: Record<string, PlayerBudgetView> = {}

  for (const player of players) {
    views[player.name] = {
      realBalance: realBalanceOf(player),
      unspent: unspentBudget(state, player.name),
      isAllowance: isAllowancePlayer(state, player.name),
    }
  }

  return views
}
