/**
 * Pure scoring utility functions for the Gambling Problem game mode.
 * Handles category ownership double-points, auction balance management,
 * side bet resolution, ledger operations, and analytics computation.
 */

import type {
  Player,
  SideBet,
  SideBetType,
  CategoryOwnership,
  GamblingLedger,
  GamblingLedgerEntry,
  RoundTrackingData,
  ClueAnswerEvent,
} from '../types/game'

export type { SideBetType }
import type { PlayerGamblingStats } from '../types/session'

// ─── Category Ownership Double Points ─────────────────────────────────────────

/**
 * Determines if a player owns the category for the given clue, and returns
 * the effective point multiplier (2 if owned, 1 otherwise).
 *
 * @param roundName - The current round name
 * @param categoryIndex - The category index within the round
 * @param playerName - The player who answered
 * @param ownership - The category ownership map from auctions
 */
export function getCategoryOwnerMultiplier(
  roundName: string,
  categoryIndex: number,
  playerName: string,
  ownership: CategoryOwnership,
): number {
  const key = `${roundName}-${categoryIndex}`
  return ownership[key] === playerName ? 2 : 1
}

/**
 * Checks whether a player owns a given category.
 */
export function isPlayerCategoryOwner(
  roundName: string,
  categoryIndex: number,
  playerName: string,
  ownership: CategoryOwnership,
): boolean {
  const key = `${roundName}-${categoryIndex}`
  return ownership[key] === playerName
}

// ─── Score Initialization ─────────────────────────────────────────────────────

/**
 * Initialize player scores with gambling starting balance.
 * Sets Player.score = startingBalance for each player.
 */
export function initializeGamblingScores(
  players: Player[],
  startingBalance: number,
): Player[] {
  return players.map((player) => ({
    ...player,
    score: startingBalance,
  }))
}

// ─── Score Deductions & Credits ───────────────────────────────────────────────

/**
 * Apply auction result to player score.
 * Returns updated player with score reduced by bid amount.
 */
export function applyAuctionBidDeduction(
  player: Player,
  bidAmount: number,
): Player {
  return { ...player, score: player.score - bidAmount }
}

/**
 * Apply bet wager deduction to player score.
 * Returns updated player with score reduced by wager amount.
 */
export function applyBetWagerDeduction(
  player: Player,
  wagerAmount: number,
): Player {
  return { ...player, score: player.score - wagerAmount }
}

/**
 * Apply bet payout to player score.
 * Returns updated player with score increased by payout (wager * 2).
 */
export function applyBetPayout(
  player: Player,
  wagerAmount: number,
): Player {
  return { ...player, score: player.score + wagerAmount * 2 }
}

// ─── Side Bet Resolution ──────────────────────────────────────────────────────

/**
 * Results of a completed round, used to evaluate side bets.
 * Contains all data needed to resolve every bet type.
 */
export interface RoundResult {
  /** The player with the highest cumulative score at round end */
  roundLeader: string | null
  /** The player who selected the first Daily Double clue in the round */
  dailyDoubleFinderPlayer: string | null
  /** The player with the most incorrect answers in the round */
  mostIncorrectPlayer: string | null
  /** The player who achieved a category sweep in the round */
  sweepCategoryPlayer: string | null
  /** All players whose score delta is zero or negative for the round */
  zeroScoreRoundPlayers: string[]
  /** All players who answered zero clues incorrectly during the round */
  noWrongAnswersPlayers: string[]
  /** The player who earned the highest point value from a single correct answer */
  highestSingleCluePlayer: string | null
  /** The player with the most correct answers in the round */
  mostCorrectPlayer: string | null
  /** The player who gave the first incorrect answer chronologically in the round */
  firstIncorrectPlayer: string | null
  /** The player with the highest total points earned from correct answers in the round */
  biggestEarnerPlayer: string | null
  /** The player with the lowest cumulative score at round end */
  bottomFeederPlayer: string | null
}

// ─── Bet Descriptions ─────────────────────────────────────────────────────────

/**
 * Human-readable descriptions for all side bet types.
 * Used by betting UI and analytics displays.
 */
export const BET_DESCRIPTIONS: Record<SideBetType, string> = {
  round_leader: 'Who will lead after this round?',
  daily_double_finder: 'Who will be first to find a Daily Double?',
  most_incorrect: 'Who will get the most wrong?',
  sweep_category: 'Who will sweep a category?',
  zero_score_round: 'Who will gain zero or negative points?',
  no_wrong_answers: 'Who will have a perfect round?',
  highest_single_clue: 'Who will earn the most from one clue?',
  most_correct: 'Who will get the most right?',
  first_incorrect: 'Who will be first to get one wrong?',
  biggest_earner: 'Who will earn the most points?',
  bottom_feeder: 'Who will have the lowest score?',
}

/**
 * Plain-English explanations of what each bet type means.
 * Displayed below the bet type label in betting UIs.
 */
export const BET_EXPLANATIONS: Record<SideBetType, string> = {
  round_leader: 'Predict who will have the highest total score when this round ends.',
  daily_double_finder: 'Predict who will be the first player to select a Daily Double clue this round.',
  most_incorrect: 'Predict who will answer the most questions incorrectly this round.',
  sweep_category: 'Predict who will correctly answer every clue in a single category.',
  zero_score_round: 'Predict who will gain zero or negative points during this round.',
  no_wrong_answers: 'Predict who will answer every attempted clue correctly this round.',
  highest_single_clue:
    'Predict who will earn the most points from a single clue, counting category-ownership doubles and Daily Double wagers.',
  most_correct: 'Predict who will answer the most questions correctly this round.',
  first_incorrect: 'Predict who will be the first player to answer a question incorrectly.',
  biggest_earner: 'Predict who will earn the most total points from correct answers.',
  bottom_feeder: 'Predict who will have the lowest total score when this round ends.',
}

/**
 * Evaluates whether a single bet was correct based on round results.
 * All bet types use player-pick predictions.
 */
export function evaluateBet(bet: SideBet, result: RoundResult): boolean {
  switch (bet.betType) {
    case 'round_leader':
      return result.roundLeader === bet.prediction
    case 'daily_double_finder':
      return result.dailyDoubleFinderPlayer === bet.prediction
    case 'most_incorrect':
      return result.mostIncorrectPlayer === bet.prediction
    case 'sweep_category':
      return result.sweepCategoryPlayer === bet.prediction
    case 'zero_score_round':
      return result.zeroScoreRoundPlayers.includes(bet.prediction)
    case 'no_wrong_answers':
      return result.noWrongAnswersPlayers.includes(bet.prediction)
    case 'highest_single_clue':
      return result.highestSingleCluePlayer === bet.prediction
    case 'most_correct':
      return result.mostCorrectPlayer === bet.prediction
    case 'first_incorrect':
      return result.firstIncorrectPlayer === bet.prediction
    case 'biggest_earner':
      return result.biggestEarnerPlayer === bet.prediction
    case 'bottom_feeder':
      return result.bottomFeederPlayer === bet.prediction
    default:
      return false
  }
}

/**
 * Resolves all side bets placed for the round and returns the net balance
 * changes for each player. Payouts are 2:1 (win returns wager + equal profit).
 *
 * @param bets - All side bets placed for this round
 * @param roundResult - The actual round results used to evaluate bets
 * @returns A record of player name → balance change (positive for wins)
 */
export function resolveSideBets(
  bets: SideBet[],
  roundResult: RoundResult,
): Record<string, number> {
  const balanceChanges: Record<string, number> = {}

  for (const bet of bets) {
    const won = evaluateBet(bet, roundResult)
    // The wager was already deducted when the bet was placed.
    // If they win, they get wager back + equal profit (2:1 payout).
    // If they lose, they already lost the wager (balance change = 0 for loss).
    const payout = won ? bet.wager * 2 : 0
    balanceChanges[bet.playerName] = (balanceChanges[bet.playerName] ?? 0) + payout
  }

  return balanceChanges
}

/**
 * Resolve all side bets for a round and return updated players + ledger entries.
 * For each bet: if prediction matches roundResult, apply payout and add bet_won entry;
 * otherwise add bet_lost entry.
 */
export function resolveRoundBets(
  players: Player[],
  bets: SideBet[],
  roundResult: RoundResult,
): { updatedPlayers: Player[]; ledgerEntries: GamblingLedgerEntry[] } {
  const ledgerEntries: GamblingLedgerEntry[] = []
  // Track cumulative score changes by player name
  const scoreChanges: Record<string, number> = {}

  for (const bet of bets) {
    const won = evaluateBet(bet, roundResult)

    if (won) {
      const payout = bet.wager * 2
      scoreChanges[bet.playerName] = (scoreChanges[bet.playerName] ?? 0) + payout
      ledgerEntries.push({
        type: 'bet_won',
        playerName: bet.playerName,
        amount: payout,
        label: bet.betType,
        order: 0, // order will be assigned when appended to the actual ledger
      })
    } else {
      ledgerEntries.push({
        type: 'bet_lost',
        playerName: bet.playerName,
        amount: bet.wager,
        label: bet.betType,
        order: 0, // order will be assigned when appended to the actual ledger
      })
    }
  }

  const updatedPlayers = players.map((player) => {
    const change = scoreChanges[player.name]
    if (change) {
      return { ...player, score: player.score + change }
    }
    return player
  })

  return { updatedPlayers, ledgerEntries }
}

/**
 * Computes the expanded round result from tracking data accumulated during round play.
 *
 * @param data - All tracking data gathered during the round
 * @returns The complete RoundResult for bet evaluation
 */
export function computeRoundResult(data: RoundTrackingData): RoundResult {
  const { players, startOfRoundScores, answerEvents, dailyDoubleFinderPlayer, cluesPerCategory } = data

  // 1. roundLeader: highest cumulative score, null on tie
  const roundLeader = computeRoundLeader(players)

  // 2. dailyDoubleFinderPlayer: directly from data
  // (already available as dailyDoubleFinderPlayer)

  // 3. mostIncorrectPlayer: highest incorrect count, player-order tie-break
  const mostIncorrectPlayer = computeMostIncorrectPlayer(players, answerEvents)

  // 4. sweepCategoryPlayer: first player to sweep a category chronologically
  const sweepCategoryPlayer = computeSweepCategoryPlayer(answerEvents, cluesPerCategory)

  // 5. zeroScoreRoundPlayers: all players with score delta <= 0
  const zeroScoreRoundPlayers = computeZeroScoreRoundPlayers(players, startOfRoundScores)

  // 6. noWrongAnswersPlayers: all players with zero incorrect events
  const noWrongAnswersPlayers = computeNoWrongAnswersPlayers(players, answerEvents)

  // 7. highestSingleCluePlayer: max pointValue among correct events
  const highestSingleCluePlayer = computeHighestSingleCluePlayer(answerEvents)

  // 8. mostCorrectPlayer: highest correct count
  const mostCorrectPlayer = computeMostCorrectPlayer(answerEvents)

  // 9. firstIncorrectPlayer: lowest chronologicalOrder among incorrect events
  const firstIncorrectPlayer = computeFirstIncorrectPlayer(answerEvents)

  // 10. biggestEarnerPlayer: highest sum of correct pointValues, player-order tie-break
  const biggestEarnerPlayer = computeBiggestEarnerPlayer(players, answerEvents)

  // 11. bottomFeederPlayer: lowest cumulative score
  const bottomFeederPlayer = computeBottomFeederPlayer(players)

  return {
    roundLeader,
    dailyDoubleFinderPlayer,
    mostIncorrectPlayer,
    sweepCategoryPlayer,
    zeroScoreRoundPlayers,
    noWrongAnswersPlayers,
    highestSingleCluePlayer,
    mostCorrectPlayer,
    firstIncorrectPlayer,
    biggestEarnerPlayer,
    bottomFeederPlayer,
  }
}

// ─── computeRoundResult Helper Functions ──────────────────────────────────────

function computeRoundLeader(players: Player[]): string | null {
  if (players.length === 0) return null

  let maxScore = -Infinity
  let leader: string | null = null
  let tied = false

  for (const player of players) {
    if (player.score > maxScore) {
      maxScore = player.score
      leader = player.name
      tied = false
    } else if (player.score === maxScore) {
      tied = true
    }
  }

  return tied ? null : leader
}

function computeMostIncorrectPlayer(players: Player[], answerEvents: ClueAnswerEvent[]): string | null {
  const incorrectEvents = answerEvents.filter((e) => e.result === 'incorrect')
  if (incorrectEvents.length === 0) return null

  // Count incorrect per player
  const counts: Record<string, number> = {}
  for (const event of incorrectEvents) {
    counts[event.playerName] = (counts[event.playerName] ?? 0) + 1
  }

  // Find max count
  let maxCount = 0
  for (const count of Object.values(counts)) {
    if (count > maxCount) maxCount = count
  }

  // Tie-break: first player in players array order
  for (const player of players) {
    if ((counts[player.name] ?? 0) === maxCount) {
      return player.name
    }
  }

  return null
}

function computeSweepCategoryPlayer(
  answerEvents: ClueAnswerEvent[],
  cluesPerCategory: Record<number, number>,
): string | null {
  // For each category, check if any single player has correct answers equal to cluesPerCategory[catIdx]
  const correctEvents = answerEvents.filter((e) => e.result === 'correct')

  // Group correct events by category and player
  const categoryPlayerCounts: Record<number, Record<string, { count: number; maxOrder: number }>> = {}
  for (const event of correctEvents) {
    const catIdx = event.categoryIndex
    if (!categoryPlayerCounts[catIdx]) {
      categoryPlayerCounts[catIdx] = {}
    }
    const playerData = categoryPlayerCounts[catIdx][event.playerName]
    if (!playerData) {
      categoryPlayerCounts[catIdx][event.playerName] = { count: 1, maxOrder: event.chronologicalOrder }
    } else {
      playerData.count += 1
      if (event.chronologicalOrder > playerData.maxOrder) {
        playerData.maxOrder = event.chronologicalOrder
      }
    }
  }

  // Find all sweepers: players who have correct answers equal to cluesPerCategory for that category
  let bestSweeper: string | null = null
  let bestCompletionOrder = Infinity

  for (const catIdxStr of Object.keys(categoryPlayerCounts)) {
    const catIdx = Number(catIdxStr)
    const requiredClues = cluesPerCategory[catIdx]
    if (requiredClues === undefined || requiredClues <= 0) continue

    const playersInCat = categoryPlayerCounts[catIdx]
    for (const [playerName, data] of Object.entries(playersInCat)) {
      if (data.count >= requiredClues) {
        // This player swept this category; maxOrder is when the sweep was completed
        if (data.maxOrder < bestCompletionOrder) {
          bestCompletionOrder = data.maxOrder
          bestSweeper = playerName
        }
      }
    }
  }

  return bestSweeper
}

function computeZeroScoreRoundPlayers(
  players: Player[],
  startOfRoundScores: Record<string, number>,
): string[] {
  return players
    .filter((player) => {
      const startScore = startOfRoundScores[player.name] ?? 0
      const scoreDelta = player.score - startScore
      return scoreDelta <= 0
    })
    .map((player) => player.name)
}

function computeNoWrongAnswersPlayers(
  players: Player[],
  answerEvents: ClueAnswerEvent[],
): string[] {
  const playersWithIncorrect = new Set<string>()
  for (const event of answerEvents) {
    if (event.result === 'incorrect') {
      playersWithIncorrect.add(event.playerName)
    }
  }

  return players
    .filter((player) => !playersWithIncorrect.has(player.name))
    .map((player) => player.name)
}

function computeHighestSingleCluePlayer(answerEvents: ClueAnswerEvent[]): string | null {
  const correctEvents = answerEvents.filter((e) => e.result === 'correct')
  if (correctEvents.length === 0) return null

  let maxValue = -Infinity
  let bestOrder = Infinity
  let player: string | null = null

  for (const event of correctEvents) {
    // Resolve on the points actually credited (includes the category-ownership
    // multiplier and Daily Double wagers); fall back to the raw face value when
    // the event predates the earnedPoints field.
    const credited = event.earnedPoints ?? event.pointValue
    const isGreater = credited > maxValue
    // Explicit chronological tie-break: array order can diverge from
    // chronological order after a re-marking, so compare the recorded order.
    const isEarlierTie = credited === maxValue && event.chronologicalOrder < bestOrder

    if (isGreater || isEarlierTie) {
      maxValue = credited
      bestOrder = event.chronologicalOrder
      player = event.playerName
    }
  }

  return player
}

function computeMostCorrectPlayer(answerEvents: ClueAnswerEvent[]): string | null {
  const correctEvents = answerEvents.filter((e) => e.result === 'correct')
  if (correctEvents.length === 0) return null

  const counts: Record<string, number> = {}
  for (const event of correctEvents) {
    counts[event.playerName] = (counts[event.playerName] ?? 0) + 1
  }

  let maxCount = 0
  let player: string | null = null
  for (const [name, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count
      player = name
    }
  }

  return player
}

function computeFirstIncorrectPlayer(answerEvents: ClueAnswerEvent[]): string | null {
  const incorrectEvents = answerEvents.filter((e) => e.result === 'incorrect')
  if (incorrectEvents.length === 0) return null

  let minOrder = Infinity
  let player: string | null = null

  for (const event of incorrectEvents) {
    if (event.chronologicalOrder < minOrder) {
      minOrder = event.chronologicalOrder
      player = event.playerName
    }
  }

  return player
}

function computeBiggestEarnerPlayer(players: Player[], answerEvents: ClueAnswerEvent[]): string | null {
  const correctEvents = answerEvents.filter((e) => e.result === 'correct')
  if (correctEvents.length === 0) return null

  // Sum pointValue of correct events per player
  const sums: Record<string, number> = {}
  for (const event of correctEvents) {
    sums[event.playerName] = (sums[event.playerName] ?? 0) + event.pointValue
  }

  // Find max sum
  let maxSum = 0
  for (const sum of Object.values(sums)) {
    if (sum > maxSum) maxSum = sum
  }

  // Tie-break: first player in players array order
  for (const player of players) {
    if ((sums[player.name] ?? 0) === maxSum) {
      return player.name
    }
  }

  return null
}

function computeBottomFeederPlayer(players: Player[]): string | null {
  if (players.length === 0) return null

  let minScore = Infinity
  let player: string | null = null

  for (const p of players) {
    if (p.score < minScore) {
      minScore = p.score
      player = p.name
    }
  }

  return player
}

// ─── Validation Functions ─────────────────────────────────────────────────────

/**
 * Determines whether the auction auto-resolve effect should fire.
 * Returns true only when the timer has counted down to zero from a real value.
 * When timeRemaining is null (sentinel for "not started"), returns false.
 */
export function shouldAutoResolveAuction(timeRemaining: number | null): boolean {
  return timeRemaining === 0
}

/**
 * Validate a bid amount against a player's available balance.
 * Returns true if bidAmount > 0 AND bidAmount <= availableBalance.
 */
export function isValidBid(bidAmount: number, availableBalance: number): boolean {
  return bidAmount > 0 && bidAmount <= availableBalance
}

/**
 * Validate that cumulative wagers do not exceed available balance.
 * Returns true if newWager > 0 AND (existingWagers + newWager) <= availableBalance.
 */
export function isValidCumulativeWager(
  existingWagers: number,
  newWager: number,
  availableBalance: number,
): boolean {
  return newWager > 0 && existingWagers + newWager <= availableBalance
}

// ─── Wager Ranges ─────────────────────────────────────────────────────────────

/**
 * The floor the Daily Double maximum wager never drops below.
 * A player at or below $0, or with a small positive balance, may still wager
 * up to this amount.
 */
export const DAILY_DOUBLE_WAGER_FLOOR = 1000

/**
 * The permitted Daily Double wager range for a player, derived from Real_Balance
 * only — a Daily Double wager is never funded from a Gambling_Allowance, so this
 * takes no allowance parameter.
 *
 * Requirement 3.1, 3.2, 3.9 — $1 through max($1,000, Real_Balance).
 * `Math.max` covers both criteria: a non-positive score yields exactly $1,000,
 * and no maximum is derived from the highest clue value on the board.
 *
 * @param score - The player's Real_Balance
 */
export function computeDailyDoubleWagerRange(score: number): { min: number; max: number } {
  return { min: 1, max: Math.max(DAILY_DOUBLE_WAGER_FLOOR, score) }
}

// ─── Auction Resolution ───────────────────────────────────────────────────────

/**
 * Resolve auction bids: highest unique bid wins; tie triggers rebid; second tie releases.
 *
 * - If no bids, winner is null.
 * - If exactly one player has the highest bid, that player wins.
 * - If multiple players tie for the highest bid and !isRetry, returns { winner: null, isTied: true }
 *   (triggers a rebid among tied players).
 * - If multiple players tie for the highest bid and isRetry, returns
 *   { winner: null, winningBid: 0, isTied: true } (category released).
 */
export function resolveAuctionBids(
  bids: Record<string, number>,
  isRetry: boolean,
): { winner: string | null; winningBid: number; isTied: boolean } {
  const entries = Object.entries(bids)

  // No bids at all
  if (entries.length === 0) {
    return { winner: null, winningBid: 0, isTied: false }
  }

  // Find the highest bid amount
  let maxBid = -Infinity
  for (const [, amount] of entries) {
    if (amount > maxBid) {
      maxBid = amount
    }
  }

  // Find all players with the highest bid
  const topBidders = entries.filter(([, amount]) => amount === maxBid)

  if (topBidders.length === 1) {
    // Unique highest bid — winner
    return { winner: topBidders[0][0], winningBid: maxBid, isTied: false }
  }

  // Tie scenario
  if (isRetry) {
    // Second tie — category released
    return { winner: null, winningBid: 0, isTied: true }
  }

  // First tie — trigger rebid
  return { winner: null, winningBid: maxBid, isTied: true }
}

// ─── Ledger Operations ────────────────────────────────────────────────────────

/**
 * Append a ledger entry and return the updated ledger.
 * Assigns order = max existing order + 1 (or 0 for empty ledger).
 */
export function appendLedgerEntry(
  ledger: GamblingLedger,
  entry: Omit<GamblingLedgerEntry, 'order'>,
): GamblingLedger {
  const maxOrder = ledger.length > 0
    ? Math.max(...ledger.map((e) => e.order))
    : -1
  const newEntry: GamblingLedgerEntry = { ...entry, order: maxOrder + 1 }
  return [...ledger, newEntry]
}

// ─── Analytics Computation ────────────────────────────────────────────────────

/**
 * Whether a committed ledger entry was funded by a Gambling_Allowance.
 * An absent `fundedBy` reads as `'balance'`, so ledgers written before the
 * field existed compute exactly as they did before. Requirement 2.12.
 */
function isAllowanceFunded(entry: GamblingLedgerEntry): boolean {
  return entry.fundedBy === 'allowance'
}

/**
 * Compute per-player gambling stats from a ledger for analytics display.
 */
export function computeGamblingStats(
  ledger: GamblingLedger,
  players: Player[],
): PlayerGamblingStats[] {
  // Initialize stats for all players
  const statsMap: Record<string, PlayerGamblingStats> = {}
  for (const player of players) {
    statsMap[player.name] = {
      playerName: player.name,
      categoriesOwned: 0,
      ownershipBonusEarned: 0,
      totalBidSpend: 0,
      betsPlaced: 0,
      betsWon: 0,
      betsLost: 0,
      allowanceSpend: 0,
      netGamblingProfit: 0,
    }
  }

  // Aggregate ledger entries
  for (const entry of ledger) {
    const stats = statsMap[entry.playerName]
    if (!stats) continue // skip entries for unknown players

    switch (entry.type) {
      case 'bid':
        // categoriesOwned and totalBidSpend count every bid regardless of
        // funding source, so the displayed columns stay complete.
        stats.categoriesOwned += 1
        stats.totalBidSpend += entry.amount
        if (isAllowanceFunded(entry)) {
          stats.allowanceSpend += entry.amount
        }
        break
      case 'bet_placed':
        stats.betsPlaced += 1
        if (isAllowanceFunded(entry)) {
          stats.allowanceSpend += entry.amount
        }
        break
      case 'bet_won':
        stats.betsWon += 1
        break
      case 'bet_lost':
        stats.betsLost += 1
        break
      case 'ownership_bonus':
        stats.ownershipBonusEarned += entry.amount
        break
    }
  }

  // Compute net gambling profit for each player.
  // netGamblingProfit = (Σ bet_won.amount + ownershipBonusEarned)
  //                   − (totalBidSpend + Σ bet_placed.amount − allowanceSpend)
  // Subtracting allowanceSpend removes allowance-funded bids and wagers from the
  // Real_Balance spend, since they were never charged to Real_Balance.
  // Requirement 2.12.
  for (const player of players) {
    const stats = statsMap[player.name]
    if (!stats) continue

    const totalBetWonAmount = ledger
      .filter((e) => e.playerName === player.name && e.type === 'bet_won')
      .reduce((sum, e) => sum + e.amount, 0)

    const totalBetPlacedAmount = ledger
      .filter((e) => e.playerName === player.name && e.type === 'bet_placed')
      .reduce((sum, e) => sum + e.amount, 0)

    stats.netGamblingProfit =
      (totalBetWonAmount + stats.ownershipBonusEarned) -
      (stats.totalBidSpend + totalBetPlacedAmount - stats.allowanceSpend)
  }

  return players.map((p) => statsMap[p.name])
}

// ─── Expanded Analytics ───────────────────────────────────────────────────────

/**
 * Per-bet-type win/loss breakdown for a player.
 */
export interface BetTypeStats {
  betType: string
  displayName: string
  won: number
  lost: number
}

/**
 * Extended gambling stats that include a per-bet-type breakdown.
 */
export interface PlayerGamblingStatsExpanded extends PlayerGamblingStats {
  betTypeBreakdown: BetTypeStats[]
}

/**
 * Compute per-player gambling stats with per-bet-type breakdown.
 * Only includes bet types where the player placed at least one bet.
 */
export function computeGamblingStatsExpanded(
  ledger: GamblingLedger,
  players: Player[],
): PlayerGamblingStatsExpanded[] {
  // Get base stats from the existing function
  const baseStats = computeGamblingStats(ledger, players)

  return baseStats.map((stats) => {
    // Find all bet types where this player has at least one bet_placed entry
    const placedBetTypes = new Set<string>()
    for (const entry of ledger) {
      if (entry.playerName === stats.playerName && entry.type === 'bet_placed') {
        placedBetTypes.add(entry.label)
      }
    }

    // For each bet type the player participated in, count wins and losses
    const betTypeBreakdown: BetTypeStats[] = []
    for (const betType of placedBetTypes) {
      let won = 0
      let lost = 0

      for (const entry of ledger) {
        if (entry.playerName !== stats.playerName) continue
        if (entry.label !== betType) continue

        if (entry.type === 'bet_won') {
          won += 1
        } else if (entry.type === 'bet_lost') {
          lost += 1
        }
      }

      betTypeBreakdown.push({
        betType,
        displayName: (BET_DESCRIPTIONS as Record<string, string>)[betType] ?? betType,
        won,
        lost,
      })
    }

    return {
      ...stats,
      betTypeBreakdown,
    }
  })
}

// ─── Legacy (kept for backward compatibility during migration) ────────────────

