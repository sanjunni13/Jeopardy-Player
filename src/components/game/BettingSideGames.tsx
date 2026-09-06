import { useState } from 'react'
import type { Player, SideBet, SideBetType } from '../../types/game'
import { BET_DESCRIPTIONS, BET_EXPLANATIONS } from '../../utils/gamblingScoring'
import { formatCurrency } from '../../utils/currency'
import {
  MIN_COMMITMENT,
  fundingSourceFor,
  isAdmissibleCumulativeCommitment,
  isAllowancePlayer,
  unspentBudget,
  type GamblingBudgetState,
} from '../../utils/gamblingAllowance'
import './BettingSideGames.css'

interface BettingSideGamesProps {
  players: Player[]
  /**
   * Spendable_Budget for this round's Auction_Phase + Betting_Phase, already
   * drawn down by any winning bids. Wagers are validated against it, so bids and
   * wagers share one pool (Requirement 1.4).
   */
  budgetState: GamblingBudgetState
  roundHasDailyDouble: boolean
  onBettingComplete: (bets: SideBet[], updatedBalances: Record<string, number>) => void
}

interface BetFormState {
  betType: SideBetType | ''
  wager: string
  prediction: string
  error: string | null
}

/**
 * Host-side component for Betting Side Games (solo, single-device flow).
 * Players wager from their Spendable_Budget on outcomes before each round starts.
 * This takes place right after all categories are bid out (before the board is displayed).
 *
 * An Allowance_Player wagers from the Gambling_Allowance and their Real_Balance is
 * left untouched by the wager; everyone else wagers from Real_Balance, which the
 * reported balances draw down (Requirements 2.3, 2.9).
 */
export function BettingSideGames({
  players,
  budgetState,
  roundHasDailyDouble,
  onBettingComplete,
}: BettingSideGamesProps) {
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0)
  const [bets, setBets] = useState<SideBet[]>([])
  // Wagers accepted so far in this Betting_Phase, per player. Added to the budget
  // state's own committed amounts when checking the cumulative limit.
  const [wageredThisPhase, setWageredThisPhase] = useState<Record<string, number>>({})
  // Real_Balance deductions applied so far — Real_Balance-funded wagers only.
  const [balanceDeductions, setBalanceDeductions] = useState<Record<string, number>>({})
  const [formState, setFormState] = useState<BetFormState>({
    betType: '',
    wager: '',
    prediction: '',
    error: null,
  })

  const currentPlayer = players[currentPlayerIndex]
  const allPlayersDone = currentPlayerIndex >= players.length

  const playerName = currentPlayer?.name ?? ''
  const isAllowance = isAllowancePlayer(budgetState, playerName)
  const alreadyWagered = wageredThisPhase[playerName] ?? 0
  const unspent = unspentBudget(budgetState, playerName)
  // What this player may still commit: the unspent budget less this phase's wagers.
  const remainingBudget = unspent - alreadyWagered
  const realBalance = (currentPlayer?.score ?? 0) - (balanceDeductions[playerName] ?? 0)
  // Nothing left to commit: the smallest permitted wager no longer fits.
  const budgetExhausted = remainingBudget < MIN_COMMITMENT

  const availableBetTypes: SideBetType[] = [
    'round_leader',
    'most_incorrect',
    'sweep_category',
    'zero_score_round',
    'no_wrong_answers',
    'highest_single_clue',
    'most_correct',
    'first_incorrect',
    'biggest_earner',
    'bottom_feeder',
    ...(roundHasDailyDouble ? ['daily_double_finder' as SideBetType] : []),
  ]

  /** Real_Balance for every player after this phase's balance-funded wagers. */
  function currentBalances(deductions: Record<string, number>): Record<string, number> {
    const balances: Record<string, number> = {}
    for (const player of players) {
      balances[player.name] = (player.score ?? 0) - (deductions[player.name] ?? 0)
    }
    return balances
  }

  function handlePlaceBet() {
    if (!formState.betType) {
      setFormState(prev => ({ ...prev, error: 'Select a bet type.' }))
      return
    }

    // Requirement 1.5, 1.6 — ordered checks, each returning before any state
    // mutation, so the message names the actual failure and a rejected wager leaves
    // the entered value, the placed-bet list, and the budget untouched.
    const wager = Number(formState.wager)
    if (formState.wager.trim() === '' || isNaN(wager)) {
      setFormState(prev => ({ ...prev, error: 'Enter a valid wager amount.' }))
      return
    }
    if (!Number.isInteger(wager)) {
      setFormState(prev => ({ ...prev, error: 'Wager must be a whole number.' }))
      return
    }
    if (wager <= 0) {
      setFormState(prev => ({ ...prev, error: 'Wager must be greater than zero.' }))
      return
    }
    // Requirement 1.4 — the new wager plus everything already committed this round
    // must fit in the unspent budget.
    if (!isAdmissibleCumulativeCommitment(alreadyWagered, wager, unspent)) {
      setFormState(prev => ({
        ...prev,
        error: isAllowance
          ? `Exceeds remaining allowance (${formatCurrency(remainingBudget)}).`
          : `Exceeds remaining balance (${formatCurrency(remainingBudget)}).`,
      }))
      return
    }

    if (!formState.prediction) {
      setFormState(prev => ({ ...prev, error: 'Select a prediction.' }))
      return
    }

    // Requirement 2.9 — the funding source comes from the classification frozen at
    // Auction_Phase start and travels with the bet, so round-end settlement and
    // analytics stay funding-aware after the allowance is discarded.
    const fundedBy = fundingSourceFor(budgetState, playerName)

    const bet: SideBet = {
      playerName,
      betType: formState.betType as SideBetType,
      wager,
      prediction: formState.prediction,
      fundedBy,
    }

    setBets(prev => [...prev, bet])
    setWageredThisPhase(prev => ({
      ...prev,
      [playerName]: (prev[playerName] ?? 0) + wager,
    }))
    // Requirement 2.3 — an allowance-funded wager never touches Real_Balance.
    if (fundedBy === 'balance') {
      setBalanceDeductions(prev => ({
        ...prev,
        [playerName]: (prev[playerName] ?? 0) + wager,
      }))
    }
    moveToNextPlayer()
  }

  function handleSkip() {
    moveToNextPlayer()
  }

  function moveToNextPlayer() {
    setFormState({ betType: '', wager: '', prediction: '', error: null })
    setCurrentPlayerIndex(prev => prev + 1)
  }

  function handleFinish() {
    onBettingComplete(bets, currentBalances(balanceDeductions))
  }

  if (allPlayersDone) {
    return (
      <div className="betting-side-games">
        <div className="betting-side-games__complete">
          <h2 className="betting-side-games__title">Bets Placed</h2>
          {bets.length === 0 ? (
            <p className="betting-side-games__no-bets">No bets were placed this round.</p>
          ) : (
            <ul className="betting-side-games__bets-list">
              {bets.map((bet, i) => (
                <li key={i} className="betting-side-games__bet-item">
                  <span className="betting-side-games__bet-player">{bet.playerName}</span>
                  <span className="betting-side-games__bet-detail">
                    {formatCurrency(bet.wager)} on "{BET_DESCRIPTIONS[bet.betType]}" → {bet.prediction}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="betting-side-games__continue-btn"
            onClick={handleFinish}
          >
            Start Round
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="betting-side-games">
      <div className="betting-side-games__header">
        <h2 className="betting-side-games__title">Side Bets</h2>
        <p className="betting-side-games__subtitle">
          Player {currentPlayerIndex + 1} of {players.length}
        </p>
      </div>

      {/* Requirement 1.7, 1.13, 5.6 — the allowance line is present only for an
          Allowance_Player and is styled apart from Real_Balance; every amount is
          Currency_Formatter output verbatim. */}
      <div className="betting-side-games__current-player">
        <h3 className="betting-side-games__player-name">{currentPlayer.name}</h3>
        {isAllowance ? (
          <p className="betting-side-games__allowance">
            Allowance remaining: {formatCurrency(remainingBudget)}
          </p>
        ) : (
          <p className="betting-side-games__available">
            Available: {formatCurrency(remainingBudget)}
          </p>
        )}
        <p className="betting-side-games__player-balance">
          Your balance: {formatCurrency(realBalance)}
        </p>
      </div>

      {budgetExhausted ? (
        <div className="betting-side-games__no-balance">
          <p>No budget available to bet.</p>
          <button
            type="button"
            className="betting-side-games__skip-btn"
            onClick={handleSkip}
          >
            Skip
          </button>
        </div>
      ) : (
        <div className="betting-side-games__form">
          {/* Bet Type Selection */}
          <div className="betting-side-games__field">
            <label className="betting-side-games__label">Bet Type</label>
            <div className="betting-side-games__bet-types">
              {availableBetTypes.map(betType => (
                <button
                  key={betType}
                  type="button"
                  className={`betting-side-games__bet-type-btn ${formState.betType === betType ? 'betting-side-games__bet-type-btn--active' : ''}`}
                  onClick={() => {
                    const defaultPrediction = players.find(p => p.name !== currentPlayer.name)?.name ?? players[0]?.name ?? ''
                    setFormState(prev => ({ ...prev, betType, prediction: defaultPrediction, error: null }))
                  }}
                >
                  {BET_DESCRIPTIONS[betType]}
                  <span className="betting-side-games__bet-type-explanation">
                    {BET_EXPLANATIONS[betType]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Prediction */}
          {formState.betType && (
            <div className="betting-side-games__field">
              <label className="betting-side-games__label">Prediction</label>
              <div className="betting-side-games__prediction-options">
                {players.map(p => (
                  <button
                    key={p.name}
                    type="button"
                    className={`betting-side-games__prediction-btn ${formState.prediction === p.name ? 'betting-side-games__prediction-btn--active' : ''}`}
                    onClick={() => setFormState(prev => ({ ...prev, prediction: p.name, error: null }))}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Wager */}
          {formState.betType && formState.prediction && (
            <div className="betting-side-games__field">
              <label className="betting-side-games__label">Wager Amount</label>
              <input
                type="number"
                inputMode="numeric"
                min={MIN_COMMITMENT}
                max={remainingBudget}
                value={formState.wager}
                onChange={e => setFormState(prev => ({ ...prev, wager: e.target.value, error: null }))}
                className={`betting-side-games__wager-input monetary-input${formState.error ? ' betting-side-games__wager-input--error' : ''}`}
                placeholder={`${formatCurrency(MIN_COMMITMENT)} – ${formatCurrency(remainingBudget)}`}
                aria-label={`Wager for ${currentPlayer.name}`}
              />
            </div>
          )}

          {formState.error && (
            <p className="betting-side-games__error" role="alert">{formState.error}</p>
          )}

          <div className="betting-side-games__actions">
            <button
              type="button"
              className="betting-side-games__place-btn"
              onClick={handlePlaceBet}
              disabled={!formState.betType || !formState.prediction || !formState.wager}
            >
              Place Bet
            </button>
            <button
              type="button"
              className="betting-side-games__skip-btn"
              onClick={handleSkip}
            >
              Skip
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
