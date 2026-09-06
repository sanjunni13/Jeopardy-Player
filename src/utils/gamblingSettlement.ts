/**
 * Funding-aware settlement arithmetic for the Gambling_Mode Auction_Phase,
 * Betting_Phase, and round-end bet resolution.
 *
 * Every helper here is pure: it takes the current budget state, players,
 * ledger, and ownership map and returns new values, never mutating an input.
 * The funding source of a commitment always comes from the classification
 * frozen at Auction_Phase start (`fundingSourceFor`), so a mid-round
 * Real_Balance change never moves a player between funding sources
 * (Requirement 2.11).
 *
 * The `'balance'` path delegates to `applyAuctionBidDeduction`,
 * `applyBetWagerDeduction`, and `applyBetPayout` in `gamblingScoring.ts`, so
 * the existing payout arithmetic and its tests remain the single source of
 * truth for Real_Balance-funded play. The `'allowance'` path leaves
 * Real_Balance untouched when committing and credits the wager once on a win.
 *
 * No settlement clamps a Real_Balance at $0 in either direction
 * (Requirements 2.5, 3.1).
 */

import type {
  CategoryOwnership,
  FundingSource,
  GamblingLedger,
  GamblingLedgerEntry,
  Player,
  SideBet,
  SideBetType,
} from '../types/game'

import {
  commit,
  fundingSourceFor,
  isAdmissibleCommitment,
  unspentBudget,
  type GamblingBudgetState,
} from './gamblingAllowance'

import {
  appendLedgerEntry,
  applyAuctionBidDeduction,
  applyBetPayout,
  applyBetWagerDeduction,
  evaluateBet,
  getCategoryOwnerMultiplier,
  type RoundResult,
} from './gamblingScoring'

// ─── Shared helpers ───────────────────────────────────────────────────────────

/**
 * The funding source recorded on a placed bet or ledger entry. An absent value
 * reads as `'balance'`, so records written before the Gambling_Allowance
 * existed settle exactly as they did before (Requirement 2.9, 2.12).
 */
export function fundingSourceOf(record: { fundedBy?: FundingSource }): FundingSource {
  return record.fundedBy === 'allowance' ? 'allowance' : 'balance'
}

/**
 * Requirement 2.4 — the Real_Balance credit for a won bet. A Real_Balance-funded
 * bet had its wager deducted up front and is paid `wager * 2` gross; an
 * allowance-funded bet was never deducted from Real_Balance and is credited
 * `wager * 1`. Both give a net Real_Balance change of exactly `+wager`.
 */
export function betWinCredit(wager: number, fundedBy: FundingSource): number {
  return fundedBy === 'allowance' ? wager : wager * 2
}

/** Replaces one player in the list, leaving every other entry untouched. */
function replacePlayer(
  players: Player[],
  playerName: string,
  update: (player: Player) => Player,
): Player[] {
  return players.map((player) => (player.name === playerName ? update(player) : player))
}

/** The category ownership key used throughout Gambling_Mode. */
function ownershipKey(roundName: string, categoryIndex: number): string {
  return `${roundName}-${categoryIndex}`
}

// ─── Auction settlement ───────────────────────────────────────────────────────

/** The mutable-by-round records an auction settlement reads and rewrites. */
export interface AuctionSettlementContext {
  budgetState: GamblingBudgetState
  players: Player[]
  ledger: GamblingLedger
  ownership: CategoryOwnership
}

/** The resolved outcome of one category auction. */
export interface AuctionOutcome {
  /** The winning bidder, or `null` for a tie or a released category. */
  winner: string | null
  /** The winning bid amount. Ignored when `winner` is `null`. */
  winningBid: number
  /** Category name, used as the `bid` ledger entry label. */
  category: string
  roundName: string
  categoryIndex: number
}

export interface AuctionSettlementResult extends AuctionSettlementContext {
  /** True only when a winning bid was admissible and has been settled. */
  accepted: boolean
  /** The funding source used, or `null` when nothing was settled. */
  fundedBy: FundingSource | null
  /** The appended `bid` entry, or `null` when nothing was settled. */
  entry: GamblingLedgerEntry | null
}

/**
 * Settles a resolved category auction.
 *
 * - Requirement 2.1 — an allowance-funded winning bid draws the Gambling_Allowance
 *   down by exactly the bid and leaves Real_Balance unchanged.
 * - Requirement 2.2 — ownership is recorded identically for both funding sources.
 * - Requirement 2.8 — a losing bid (no winner, or a released category) leaves the
 *   unspent budget, Real_Balance, ownership, and the ledger untouched.
 * - Requirement 2.9 — the appended `bid` entry carries `fundedBy`.
 * - Requirement 2.10 — a bid of $0 or less, or one above the unspent budget, is
 *   rejected: no ledger entry, no ownership, no balance or budget change.
 */
export function settleWinningBid(
  context: AuctionSettlementContext,
  outcome: AuctionOutcome,
): AuctionSettlementResult {
  const rejected: AuctionSettlementResult = {
    ...context,
    accepted: false,
    fundedBy: null,
    entry: null,
  }

  const { winner, winningBid } = outcome
  if (winner === null) return rejected
  if (!isAdmissibleCommitment(winningBid, unspentBudget(context.budgetState, winner))) {
    return rejected
  }

  const fundedBy = fundingSourceFor(context.budgetState, winner)

  const players =
    fundedBy === 'balance'
      ? replacePlayer(context.players, winner, (player) =>
          applyAuctionBidDeduction(player, winningBid),
        )
      : context.players

  const ledger = appendLedgerEntry(context.ledger, {
    type: 'bid',
    playerName: winner,
    amount: winningBid,
    label: outcome.category,
    fundedBy,
  })

  return {
    budgetState: commit(context.budgetState, winner, winningBid),
    players,
    ledger,
    ownership: {
      ...context.ownership,
      [ownershipKey(outcome.roundName, outcome.categoryIndex)]: winner,
    },
    accepted: true,
    fundedBy,
    entry: ledger[ledger.length - 1],
  }
}

/**
 * Requirement 2.7, 3.8 — the credited value for a correct answer in a category
 * won at auction. The category-ownership multiplier applies to the submitted
 * value (a clue's face value, or a Daily Double wager) with no reduction for the
 * winning bid having been allowance-funded, so this takes no funding argument.
 */
export function computeOwnedClueCredit(
  pointValue: number,
  roundName: string,
  categoryIndex: number,
  playerName: string,
  ownership: CategoryOwnership,
): number {
  return pointValue * getCategoryOwnerMultiplier(roundName, categoryIndex, playerName, ownership)
}

// ─── Placed wager settlement ──────────────────────────────────────────────────

/** The records a wager settlement reads and rewrites. */
export interface WagerSettlementContext {
  budgetState: GamblingBudgetState
  players: Player[]
  ledger: GamblingLedger
}

/** One wager submitted during the Betting_Phase. */
export interface PlacedWager {
  playerName: string
  betType: SideBetType
  wager: number
  prediction: string
}

export interface WagerSettlementResult extends WagerSettlementContext {
  /** True only when the wager was admissible and has been settled. */
  accepted: boolean
  /** The funding source used, or `null` when the wager was rejected. */
  fundedBy: FundingSource | null
  /** The accepted bet with its funding source attached, or `null`. */
  bet: SideBet | null
  /** The appended `bet_placed` entry, or `null` when the wager was rejected. */
  entry: GamblingLedgerEntry | null
}

/**
 * Settles one placed side bet.
 *
 * - Requirement 2.3 — an allowance-funded wager draws the Gambling_Allowance down
 *   by exactly the wager and leaves Real_Balance unchanged.
 * - Requirement 2.9 — the appended `bet_placed` entry and the returned `SideBet`
 *   both carry `fundedBy`, so round-end settlement and analytics keep the source
 *   after the Gambling_Allowance is discarded.
 * - Requirement 2.10 — a wager of $0 or less, or one beyond the unspent budget,
 *   is rejected with no ledger entry and no balance or budget change.
 */
export function settlePlacedWager(
  context: WagerSettlementContext,
  wager: PlacedWager,
): WagerSettlementResult {
  const rejected: WagerSettlementResult = {
    ...context,
    accepted: false,
    fundedBy: null,
    bet: null,
    entry: null,
  }

  const { playerName, wager: amount } = wager
  if (!isAdmissibleCommitment(amount, unspentBudget(context.budgetState, playerName))) {
    return rejected
  }

  const fundedBy = fundingSourceFor(context.budgetState, playerName)

  const players =
    fundedBy === 'balance'
      ? replacePlayer(context.players, playerName, (player) =>
          applyBetWagerDeduction(player, amount),
        )
      : context.players

  const ledger = appendLedgerEntry(context.ledger, {
    type: 'bet_placed',
    playerName,
    amount,
    label: wager.betType,
    fundedBy,
  })

  return {
    budgetState: commit(context.budgetState, playerName, amount),
    players,
    ledger,
    accepted: true,
    fundedBy,
    bet: {
      playerName,
      betType: wager.betType,
      wager: amount,
      prediction: wager.prediction,
      fundedBy,
    },
    entry: ledger[ledger.length - 1],
  }
}

export interface WagersSettlementResult extends WagerSettlementContext {
  /** Every wager that was accepted, in submission order. */
  bets: SideBet[]
  /** Every wager that was rejected, in submission order. */
  rejected: PlacedWager[]
}

/**
 * Settles a batch of wagers in submission order. Each accepted wager draws the
 * shared pool down before the next is checked, so the cumulative limit in
 * Requirement 1.4 holds across the batch; a wager that would exceed the
 * remaining budget is rejected and the rest continue.
 */
export function settlePlacedWagers(
  context: WagerSettlementContext,
  wagers: PlacedWager[],
): WagersSettlementResult {
  let current: WagerSettlementContext = context
  const bets: SideBet[] = []
  const rejected: PlacedWager[] = []

  for (const wager of wagers) {
    const result = settlePlacedWager(current, wager)
    current = {
      budgetState: result.budgetState,
      players: result.players,
      ledger: result.ledger,
    }
    if (result.accepted && result.bet) {
      bets.push(result.bet)
    } else {
      rejected.push(wager)
    }
  }

  return { ...current, bets, rejected }
}

// ─── Round-end bet resolution ─────────────────────────────────────────────────

/** The records a resolved bet reads and rewrites. Budgets are already discarded. */
export interface BetResolutionContext {
  players: Player[]
  ledger: GamblingLedger
}

export interface BetResolutionResult extends BetResolutionContext {
  /** True when the bet was resolved as won. */
  won: boolean
  /** The Real_Balance credit applied — 0 for a loss. */
  credit: number
  /** The appended `bet_won` or `bet_lost` entry. */
  entry: GamblingLedgerEntry
}

/**
 * Settles one resolved side bet against Real_Balance.
 *
 * - Requirement 2.4, 2.5 — a won bet credits `wager * 2` when funded from
 *   Real_Balance and `wager * 1` when funded from a Gambling_Allowance, with no
 *   clamping, so the net change is `+wager` either way and a player at -$1,000
 *   who wins a $500 allowance-funded bet lands at -$500.
 * - Requirement 2.6 — a lost bet applies no further Real_Balance change: an
 *   allowance-funded wager was never charged to Real_Balance, and a
 *   Real_Balance-funded wager was charged when the bet was placed.
 * - The `bet_won` entry records the credit applied; the `bet_lost` entry records
 *   the wager. Both echo `fundedBy` so analytics stays funding-aware.
 */
export function settleResolvedBet(
  context: BetResolutionContext,
  bet: SideBet,
  won: boolean,
): BetResolutionResult {
  const fundedBy = fundingSourceOf(bet)
  const credit = won ? betWinCredit(bet.wager, fundedBy) : 0

  let players = context.players
  if (won && fundedBy === 'balance') {
    // Gross payout of twice the wager, the wager itself having been deducted
    // when the bet was placed.
    players = replacePlayer(players, bet.playerName, (player) =>
      applyBetPayout(player, bet.wager),
    )
  } else if (won) {
    // Allowance-funded: nothing was deducted from Real_Balance, so the credit is
    // the wager alone. No clamping at $0. The score is read as `score ?? 0` to
    // match `gamblingAllowance`, because a player who joined mid-game and holds
    // no recorded score is exactly the player Requirement 1.1 classifies as an
    // Allowance_Player, and so is the only one who reaches this branch.
    players = replacePlayer(players, bet.playerName, (player) => ({
      ...player,
      score: (player.score ?? 0) + credit,
    }))
  }

  const ledger = appendLedgerEntry(context.ledger, {
    type: won ? 'bet_won' : 'bet_lost',
    playerName: bet.playerName,
    amount: won ? credit : bet.wager,
    label: bet.betType,
    fundedBy,
  })

  return {
    players,
    ledger,
    won,
    credit,
    entry: ledger[ledger.length - 1],
  }
}

/**
 * Settles every side bet placed for the round, evaluating each against the round
 * result and applying the funding-aware credit from `settleResolvedBet` in bet
 * order.
 */
export function settleRoundBets(
  context: BetResolutionContext,
  bets: SideBet[],
  roundResult: RoundResult,
): BetResolutionContext & { entries: GamblingLedgerEntry[] } {
  let current: BetResolutionContext = context
  const entries: GamblingLedgerEntry[] = []

  for (const bet of bets) {
    const result = settleResolvedBet(current, bet, evaluateBet(bet, roundResult))
    current = { players: result.players, ledger: result.ledger }
    entries.push(result.entry)
  }

  return { ...current, entries }
}
