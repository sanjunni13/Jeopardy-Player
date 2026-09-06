import { useState, useEffect, useCallback } from 'react'
import type { Player, CategoryOwnership, FundingSource } from '../../types/game'
import { formatCurrency } from '../../utils/currency'
import {
  commit,
  eligibleBidders,
  fundingSourceFor,
  isAdmissibleCommitment,
  isAllowancePlayer,
  unspentBudget,
  type GamblingBudgetState,
} from '../../utils/gamblingAllowance'
import './CategoryAuction.css'

/** Record of winning bids: category key → { playerName, amount } */
export interface AuctionWinningBid {
  playerName: string
  amount: number
  categoryName: string
  /**
   * Where the winning bid was funded from, taken from the frozen
   * Allowance_Player classification (Requirements 2.9, 2.11). The host writes
   * this straight onto the `bid` ledger entry.
   */
  fundedBy: FundingSource
}

interface CategoryAuctionProps {
  categories: string[]
  roundName: string
  players: Player[]
  /**
   * Spendable_Budget bookkeeping for this Auction_Phase, created by the
   * Auction_Controller with `beginGamblingPhases`. Classification and the
   * start-of-phase Real_Balance snapshot are frozen inside it, so an
   * Allowance_Player bids from the $500 pool and everyone else from their
   * Real_Balance (Requirements 1.1, 1.2, 1.11, 1.12).
   */
  budgetState: GamblingBudgetState
  auctionTimer: number
  onAuctionComplete: (ownership: CategoryOwnership, updatedBalances: Record<string, number>, winningBids: AuctionWinningBid[]) => void
}

type AuctionPhase = 'bidding' | 'tied'

interface AuctionRoundState {
  currentCategoryIndex: number
  phase: AuctionPhase
  tiedPlayers: string[]
  tiedAmount: number
  retryCount: number
  timerKey: number // increment to restart timer
}

/**
 * Host-side component for the Timed Category Auctions.
 * Players bid from their Spendable_Budget to "own" categories — the Real_Balance
 * for a player above $0, the $500 Gambling_Allowance for a player at or below it.
 * The owner earns double points on clues in that category but loses their bid regardless.
 * Tied bids repeat once; if still tied, the category is released (no owner).
 *
 * A winning bid draws the budget down; an allowance-funded win leaves Real_Balance
 * untouched (Requirement 2.1). A losing bid commits nothing, so the amount stays
 * spendable for the rest of the phase (Requirement 2.8).
 */
export function CategoryAuction({
  categories,
  roundName,
  players,
  budgetState,
  auctionTimer,
  onAuctionComplete,
}: CategoryAuctionProps) {
  const [auctionState, setAuctionState] = useState<AuctionRoundState>({
    currentCategoryIndex: 0,
    phase: 'bidding',
    tiedPlayers: [],
    tiedAmount: 0,
    retryCount: 0,
    timerKey: 0,
  })
  const [ownership, setOwnership] = useState<CategoryOwnership>({})
  // The budget is snapshotted once: classification and the start-of-phase
  // balances are frozen for the whole Auction_Phase, and only `committed`
  // moves as bids are won (Requirements 1.11, 1.12, 2.11).
  const [budget, setBudget] = useState<GamblingBudgetState>(budgetState)
  const [currentBalances, setCurrentBalances] = useState<Record<string, number>>(
    () => ({ ...budgetState.startBalances })
  )
  const [playerBids, setPlayerBids] = useState<Record<string, number>>({})
  const [allCategoriesDone, setAllCategoriesDone] = useState(false)
  const [pendingResolve, setPendingResolve] = useState(false)
  const [winningBids, setWinningBids] = useState<AuctionWinningBid[]>([])

  // Countdown timer — driven entirely by the timerKey in auctionState
  const [timeRemaining, setTimeRemaining] = useState(auctionTimer)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (allCategoriesDone) return

    setTimeRemaining(auctionTimer)
    const interval = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          clearInterval(interval)
          setPendingResolve(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [auctionState.timerKey, auctionTimer, allCategoriesDone])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Resolve logic — triggered when pendingResolve becomes true
  const resolve = useCallback(() => {
    const catKey = `${roundName}-${auctionState.currentCategoryIndex}`
    const bids = Object.entries(playerBids)

    function advance() {
      const nextIndex = auctionState.currentCategoryIndex + 1
      if (nextIndex >= categories.length) {
        setAllCategoriesDone(true)
      } else {
        setPlayerBids({})
        setAuctionState({
          currentCategoryIndex: nextIndex,
          phase: 'bidding',
          tiedPlayers: [],
          tiedAmount: 0,
          retryCount: 0,
          timerKey: auctionState.timerKey + 1,
        })
      }
    }

    if (bids.length === 0) {
      advance()
      return
    }

    const maxBid = Math.max(...bids.map(([, amount]) => amount))
    const topBidders = bids.filter(([, amount]) => amount === maxBid)

    if (topBidders.length === 1) {
      const [winner, winningBid] = topBidders[0]
      const fundedBy = fundingSourceFor(budget, winner)
      // Requirement 2.1 — an allowance-funded win draws down the allowance only;
      // Real_Balance is left exactly where it was.
      if (fundedBy === 'balance') {
        setCurrentBalances(prev => ({ ...prev, [winner]: (prev[winner] ?? 0) - winningBid }))
      }
      setBudget(prev => commit(prev, winner, winningBid))
      // Requirement 2.2 — ownership is recorded identically for both sources.
      setOwnership(prev => ({ ...prev, [catKey]: winner }))
      setWinningBids(prev => [...prev, {
        playerName: winner,
        amount: winningBid,
        categoryName: categories[auctionState.currentCategoryIndex],
        fundedBy,
      }])
      advance()
    } else if (auctionState.retryCount === 0) {
      // Tie — retry
      setPlayerBids({})
      setAuctionState(prev => ({
        ...prev,
        phase: 'tied',
        tiedPlayers: topBidders.map(([name]) => name),
        tiedAmount: maxBid,
        retryCount: 1,
        timerKey: prev.timerKey + 1,
      }))
    } else {
      // Second tie — release category
      advance()
    }
  }, [playerBids, budget, auctionState.currentCategoryIndex, auctionState.retryCount, auctionState.timerKey, roundName, categories])

  // When pendingResolve flips to true, run the resolve logic
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!pendingResolve) return
    setPendingResolve(false)
    resolve()
  }, [pendingResolve, resolve])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Fire completion when done
  useEffect(() => {
    if (!allCategoriesDone) return
    const timeout = setTimeout(() => {
      onAuctionComplete(ownership, currentBalances, winningBids)
    }, 1500)
    return () => clearTimeout(timeout)
  }, [allCategoriesDone, ownership, currentBalances, onAuctionComplete, winningBids])

  function handleHostBid(playerName: string, amount: number) {
    // Requirements 1.3, 1.6, 2.10 — $1 through the unspent budget inclusive.
    if (!isAdmissibleCommitment(amount, unspentBudget(budget, playerName))) return
    setPlayerBids(prev => ({ ...prev, [playerName]: amount }))
  }

  function handleSkipTimer() {
    setPendingResolve(true)
  }

  const currentCategory = categories[auctionState.currentCategoryIndex]
  // Requirement 1.8 — anyone who can still commit at least $1 may bid, which
  // includes an Allowance_Player whose Real_Balance is at or below $0.
  const eligiblePlayers = auctionState.phase === 'tied'
    ? players.filter(p => auctionState.tiedPlayers.includes(p.name))
    : eligibleBidders(budget, players)

  if (allCategoriesDone) {
    return (
      <div className="category-auction">
        <div className="category-auction__complete">
          <h2 className="category-auction__title">Auctions Complete</h2>
          <div className="category-auction__ownership-summary">
            {Object.entries(ownership).length === 0 ? (
              <p className="category-auction__no-owners">No categories were claimed</p>
            ) : (
              <ul className="category-auction__owners-list">
                {Object.entries(ownership).map(([key, owner]) => {
                  const catIdx = parseInt(key.split('-').pop()!, 10)
                  return (
                    <li key={key} className="category-auction__owner-item">
                      <span className="category-auction__owner-category">{categories[catIdx]}</span>
                      <span className="category-auction__owner-name">{owner}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="category-auction">
      <div className="category-auction__header">
        <h2 className="category-auction__title">Category Auction</h2>
        <p className="category-auction__subtitle">
          Category {auctionState.currentCategoryIndex + 1} of {categories.length}
        </p>
      </div>

      <div className="category-auction__current">
        <h3 className="category-auction__category-name">{currentCategory}</h3>
        {auctionState.phase === 'tied' && (
          <p className="category-auction__tied-notice">
            Tied at {formatCurrency(auctionState.tiedAmount)}! Rebid between: {auctionState.tiedPlayers.join(', ')}
          </p>
        )}
      </div>

      <div className="category-auction__timer">
        <span className={`category-auction__time ${timeRemaining <= 5 ? 'category-auction__time--urgent' : ''}`}>
          {timeRemaining}s
        </span>
        <button
          type="button"
          className="category-auction__skip-btn"
          onClick={handleSkipTimer}
        >
          End Bidding
        </button>
      </div>

      <div className="category-auction__players">
        {eligiblePlayers.map(player => (
          <AuctionPlayerRow
            key={player.name}
            playerName={player.name}
            unspent={unspentBudget(budget, player.name)}
            realBalance={currentBalances[player.name] ?? 0}
            isAllowance={isAllowancePlayer(budget, player.name)}
            currentBid={playerBids[player.name] ?? null}
            onBid={(amount) => handleHostBid(player.name, amount)}
          />
        ))}
      </div>

      {eligiblePlayers.length === 0 && (
        <p className="category-auction__no-eligible">
          No players have any remaining budget to bid.
        </p>
      )}
    </div>
  )
}

// ─── Player Bid Row ─────────────────────────────────────────────────────────

interface AuctionPlayerRowProps {
  playerName: string
  /** Spendable_Budget still uncommitted this phase. */
  unspent: number
  /** The player's Real_Balance, shown alongside the budget. */
  realBalance: number
  isAllowance: boolean
  currentBid: number | null
  onBid: (amount: number) => void
}

function AuctionPlayerRow({ playerName, unspent, realBalance, isAllowance, currentBid, onBid }: AuctionPlayerRowProps) {
  const [inputValue, setInputValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleSubmitBid() {
    // Requirements 1.5, 1.6 — four ordered checks, each returning before any
    // state change so a rejected bid leaves the entered value, the accepted
    // bids, and the budget untouched.
    const amount = Number(inputValue)
    if (inputValue.trim() === '' || Number.isNaN(amount)) {
      setError('Enter a valid number')
      return
    }
    if (!Number.isInteger(amount)) {
      setError('Bid must be a whole number')
      return
    }
    if (amount <= 0) {
      setError('Bid must be greater than zero')
      return
    }
    if (!isAdmissibleCommitment(amount, unspent)) {
      setError(`Maximum bid is ${formatCurrency(unspent)}`)
      return
    }
    setError(null)
    onBid(amount)
  }

  return (
    <div className="auction-player-row">
      <div className="auction-player-row__info">
        <span className="auction-player-row__name">{playerName}</span>
        {/* Requirements 1.7, 1.13, 5.5 — the allowance line appears only for an
            Allowance_Player and is styled apart from Real_Balance; every amount
            is Currency_Formatter output verbatim. */}
        {isAllowance ? (
          <span className="auction-player-row__allowance">
            Allowance remaining: {formatCurrency(unspent)}
          </span>
        ) : (
          <span className="auction-player-row__available">
            Available: {formatCurrency(unspent)}
          </span>
        )}
        <span className="auction-player-row__balance">
          Balance: {formatCurrency(realBalance)}
        </span>
      </div>
      {currentBid !== null ? (
        <div className="auction-player-row__bid-placed">
          <span className="auction-player-row__bid-amount">
            Bid: {formatCurrency(currentBid)}
          </span>
        </div>
      ) : (
        <div className="auction-player-row__input-group">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={unspent}
            value={inputValue}
            onChange={e => {
              setInputValue(e.target.value)
              if (error) setError(null)
            }}
            onKeyDown={e => { if (e.key === 'Enter') handleSubmitBid() }}
            className={`auction-player-row__input monetary-input${error ? ' auction-player-row__input--error' : ''}`}
            placeholder="Bid amount..."
            aria-label={`Bid for ${playerName}`}
          />
          <button
            type="button"
            onClick={handleSubmitBid}
            className="auction-player-row__bid-btn"
          >
            Bid
          </button>
          {error && <p className="auction-player-row__error">{error}</p>}
        </div>
      )}
    </div>
  )
}
