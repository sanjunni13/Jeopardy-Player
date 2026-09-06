import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { BET_EXPLANATIONS } from '../../utils/gamblingScoring';
import type { SideBetType } from '../../utils/gamblingScoring';
import { broadcastMessage } from '../../utils/sessionChannel';
import { formatCurrency } from '../../utils/currency';
import {
  MIN_COMMITMENT,
  isAdmissibleCumulativeCommitment,
  type PlayerBudgetView,
} from '../../utils/gamblingAllowance';
import './PlayerBettingPanel.css';

interface PlayerBettingPanelProps {
  availableBets: { betType: string; description: string }[];
  playerBalance: number;
  timerDuration: number;
  channel: RealtimeChannel | null;
  playerName: string;
  players: string[];
  onBettingDone: () => void;
  /**
   * Spendable_Budget for this Betting_Phase, broadcast by the Betting_Controller
   * on `betting_start`. Optional: a tab running older code never receives it, so
   * the panel falls back to treating the Real_Balance as the whole budget.
   */
  budget?: PlayerBudgetView;
  /** Bets restored from the tab's betting snapshot after a reload. Read at mount only. */
  initialPlacedBets?: PlacedBet[];
  /** True when the restored snapshot says this player already submitted or skipped. */
  initialFinalized?: boolean;
  /**
   * Called whenever the local betting state changes (placement, removal, submit,
   * skip) so the parent can persist it. The parent owns the snapshot because it
   * holds the rest of it (`availableBets`, `timerDuration`, `playerBalances`).
   */
  onSnapshotChange?: (state: { placedBets: PlacedBet[]; finalized: boolean }) => void;
}

interface PlacedBet {
  betType: string;
  wager: number;
  prediction: string;
}

/**
 * Player-device betting panel for the Side Bets phase.
 *
 * Displays available bet types with a unified player-pick prediction dropdown.
 * All bet types use a "pick a player" prediction model.
 *
 * Players can place one bet per bet type. Cumulative wagers are checked against
 * the Spendable_Budget for the phase, which winning bids have already drawn down,
 * so bids and wagers share one pool (Requirement 1.4).
 *
 * An Allowance_Player sees the Gambling_Allowance remaining, labelled distinctly
 * from Real_Balance (Requirement 1.7); every other player sees their unspent
 * budget with no allowance label (Requirement 1.13).
 *
 * No timer — betting ends when the player clicks "Submit Bets" / "Skip Betting" or the host force-ends.
 */
export function PlayerBettingPanel({
  availableBets,
  playerBalance,
  channel,
  playerName,
  players,
  onBettingDone,
  initialPlacedBets,
  initialFinalized,
  onSnapshotChange,
  budget,
}: PlayerBettingPanelProps) {
  // Backward-compatible fallback: without a broadcast budget the Real_Balance is
  // the entire Spendable_Budget and no allowance is in play, which is exactly the
  // behaviour this panel had before the Gambling_Allowance existed.
  const realBalance = budget ? budget.realBalance : playerBalance;
  const unspent = budget ? budget.unspent : playerBalance;
  const isAllowance = budget ? budget.isAllowance : false;

  // Seeded from the restored snapshot on mount so a reload during betting keeps
  // the bets already placed and the fact that the player is already done.
  const [placedBets, setPlacedBets] = useState<PlacedBet[]>(() => initialPlacedBets ?? []);
  const [userSelectedBetType, setUserSelectedBetType] = useState('');
  const [userSelectedPrediction, setUserSelectedPrediction] = useState('');
  const [wagerValue, setWagerValue] = useState('');
  const [wagerError, setWagerError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isFinalized, setIsFinalized] = useState(() => initialFinalized ?? false);

  // Betting is done for this device exactly once — whether by submitting, skipping,
  // or using every available bet type.
  const bettingDoneNotifiedRef = useRef(false);
  const notifyBettingDone = useCallback(() => {
    if (bettingDoneNotifiedRef.current) return;
    bettingDoneNotifiedRef.current = true;
    onBettingDone();
  }, [onBettingDone]);

  // Everything already committed in this Betting_Phase by this device. The unspent
  // budget it draws down already excludes winning bids from the Auction_Phase.
  const totalWagered = placedBets.reduce((sum, bet) => sum + bet.wager, 0);
  const remainingBudget = unspent - totalWagered;
  // Nothing left to commit: the smallest permitted wager no longer fits.
  const budgetExhausted = remainingBudget < MIN_COMMITMENT;

  // Determine which bet types haven't been placed yet
  const placedBetTypes = useMemo(() => new Set(placedBets.map(b => b.betType)), [placedBets]);
  const unplacedBets = useMemo(() => availableBets.filter(b => !placedBetTypes.has(b.betType)), [availableBets, placedBetTypes]);

  // Derive effective selected bet type: user pick if still valid, otherwise first unplaced
  const selectedBetType = useMemo(() => {
    if (userSelectedBetType && !placedBetTypes.has(userSelectedBetType)) {
      return userSelectedBetType;
    }
    return unplacedBets[0]?.betType ?? '';
  }, [userSelectedBetType, placedBetTypes, unplacedBets]);

  // Derive effective prediction: default to first non-bettor player
  const defaultPrediction = useMemo(() => {
    const otherPlayers = players.filter((p) => p !== playerName);
    return otherPlayers[0] ?? players[0] ?? '';
  }, [players, playerName]);

  const prediction = userSelectedPrediction || defaultPrediction;

  // Wrap setters so we can reset user selections on bet placement
  const setSelectedBetType = useCallback((value: string) => setUserSelectedBetType(value), []);
  const setPrediction = useCallback((value: string) => setUserSelectedPrediction(value), []);

  const handlePlaceBet = useCallback(() => {
    setWagerError(null);

    const wager = Number(wagerValue);

    // Requirement 1.5, 1.6 — four ordered checks, each returning before any state
    // mutation, so the message names the actual failure and a rejected wager leaves
    // the entered value, the placed-bet list, and the budget untouched.
    if (wagerValue === '' || isNaN(wager)) {
      setWagerError('Enter a valid wager amount');
      return;
    }

    if (!Number.isInteger(wager)) {
      setWagerError('Wager must be a whole number');
      return;
    }

    if (wager <= 0) {
      setWagerError('Wager must be greater than zero');
      return;
    }

    // Requirement 1.4 — the new wager plus every wager already placed must fit in
    // the unspent budget, so bids and wagers draw down one shared pool.
    if (!isAdmissibleCumulativeCommitment(totalWagered, wager, unspent)) {
      setWagerError(
        isAllowance
          ? `Exceeds remaining allowance (${formatCurrency(remainingBudget)})`
          : `Exceeds remaining balance (${formatCurrency(remainingBudget)})`
      );
      return;
    }

    if (!prediction) {
      setWagerError('Select a prediction');
      return;
    }

    // Check one bet per type
    if (placedBetTypes.has(selectedBetType)) {
      setWagerError('You already placed a bet on this');
      return;
    }

    // Store bet locally only — no broadcast on placement.
    // Bets are submitted in batch via "Submit Bets" (task 5.3).
    setPlacedBets((prev) => [...prev, { betType: selectedBetType, wager, prediction }]);
    setWagerValue('');
    setWagerError(null);
    setUserSelectedBetType('');
    setUserSelectedPrediction('');
  }, [
    wagerValue,
    totalWagered,
    unspent,
    isAllowance,
    remainingBudget,
    prediction,
    selectedBetType,
    placedBetTypes,
  ]);

  const handleRemoveBet = useCallback((index: number) => {
    setPlacedBets(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmitBets = useCallback(() => {
    // Defensive guard: an empty submission is inert — no broadcast, no state change.
    // The `disabled` attribute is the view-layer guard; this covers programmatic
    // or re-entrant invocations that bypass it.
    if (placedBets.length === 0) {
      return;
    }

    setSubmitError(null);

    if (!channel) {
      setSubmitError('Connection unavailable. Please try again.');
      return;
    }

    broadcastMessage(channel, {
      type: 'betting_submitted',
      playerName,
      bets: placedBets.map(b => ({
        betType: b.betType,
        wager: b.wager,
        prediction: b.prediction,
      })),
    }).catch(() => {
      setSubmitError('Connection unavailable. Please try again.');
    });

    setIsFinalized(true);
    notifyBettingDone();
  }, [channel, playerName, placedBets, notifyBettingDone]);

  // Skipping finalizes locally first so the panel swaps to the "Betting Complete /
  // No bets placed" confirmation instead of leaving the active form rendered (Req 2.6).
  const handleSkipBetting = useCallback(() => {
    setIsFinalized(true);
    notifyBettingDone();
  }, [notifyBettingDone]);

  // Get a readable label for a bet type
  function getBetTypeLabel(betType: string): string {
    const bet = availableBets.find((b) => b.betType === betType);
    return bet?.description ?? betType;
  }

  // All bets placed (one per available type) — auto-finalize
  const allBetsPlaced = unplacedBets.length === 0;

  // Submit Bets needs at least one placed bet; the reason is surfaced via aria-describedby
  const submitBetsDisabled = placedBets.length === 0;

  // Auto-finalize when every available bet type has been used. The render branch
  // below already treats `allBetsPlaced` as finalized, so this only has to notify
  // the parent — done in an effect (never during render) and exactly once.
  useEffect(() => {
    if (allBetsPlaced) {
      notifyBettingDone();
    }
  }, [allBetsPlaced, notifyBettingDone]);

  // Mirror the local betting state into the parent's snapshot so a reload during
  // betting restores both the placed bets and the finalized flag.
  useEffect(() => {
    onSnapshotChange?.({ placedBets, finalized: isFinalized });
  }, [placedBets, isFinalized, onSnapshotChange]);

  // Requirement 1.7, 1.13, 5.6 — the allowance line is present only for an
  // Allowance_Player and is styled apart from Real_Balance; every amount is
  // Currency_Formatter output verbatim.
  const budgetSummary = (
    <>
      {isAllowance ? (
        <p className="betting-panel__allowance">
          Allowance remaining: {formatCurrency(remainingBudget)}
        </p>
      ) : (
        <p className="betting-panel__available">
          Available: {formatCurrency(remainingBudget)}
        </p>
      )}
      <p className="betting-panel__balance">
        Your balance: {formatCurrency(realBalance)}
      </p>
    </>
  );

  // ─── Finalized state ──────────────────────────────────────────────────────

  if (isFinalized || allBetsPlaced) {
    return (
      <div className="betting-panel">
        <div className="betting-panel__header">
          <h2 className="betting-panel__title">Betting Complete</h2>
          {budgetSummary}
        </div>
        {placedBets.length > 0 && (
          <div className="betting-panel__placed-bets">
            <p className="betting-panel__placed-bets-title">Your Bets</p>
            {placedBets.map((bet, idx) => (
              <div key={idx} className="betting-panel__placed-bet-item">
                <span className="betting-panel__placed-bet-label">
                  {getBetTypeLabel(bet.betType)}: {bet.prediction}
                </span>
                <span className="betting-panel__placed-bet-amount">
                  {formatCurrency(bet.wager)}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="betting-panel__finalized">
          <p className="betting-panel__finalized-text">
            {placedBets.length > 0
              ? `${placedBets.length} bet${placedBets.length > 1 ? 's' : ''} placed — ${formatCurrency(totalWagered)} wagered`
              : 'No bets placed'}
          </p>
        </div>
      </div>
    );
  }

  // ─── Active betting ───────────────────────────────────────────────────────

  return (
    <div className="betting-panel">
      <div className="betting-panel__header">
        <h2 className="betting-panel__title">Place Your Bets</h2>
        {budgetSummary}
      </div>

      {/* Placed bets summary */}
      {placedBets.length > 0 && (
        <div className="betting-panel__placed-bets">
          <p className="betting-panel__placed-bets-title">Bets Placed</p>
          {placedBets.map((bet, idx) => (
            <div key={idx} className="betting-panel__placed-bet-item">
              <span className="betting-panel__placed-bet-label">
                {getBetTypeLabel(bet.betType)}: {bet.prediction}
              </span>
              <span className="betting-panel__placed-bet-amount">
                {formatCurrency(bet.wager)}
              </span>
              <button
                type="button"
                className="betting-panel__remove-bet-button"
                onClick={() => handleRemoveBet(idx)}
                aria-label={`Remove bet on ${getBetTypeLabel(bet.betType)}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Bet form */}
      <form
        className="betting-panel__form"
        onSubmit={(e) => {
          e.preventDefault();
          handlePlaceBet();
        }}
        noValidate
      >
        {/* Bet Type Selector — only unplaced types */}
        <div className="betting-panel__field">
          <label className="betting-panel__label" htmlFor="bet-type-select">
            Bet Type
          </label>
          <select
            id="bet-type-select"
            className="betting-panel__select"
            value={selectedBetType}
            onChange={(e) => setSelectedBetType(e.target.value)}
            disabled={budgetExhausted}
          >
            {unplacedBets.map((bet) => (
              <option key={bet.betType} value={bet.betType}>
                {bet.description}
              </option>
            ))}
          </select>
        </div>

        {selectedBetType && (
          <p className="betting-panel__explanation">
            {BET_EXPLANATIONS[selectedBetType as SideBetType]}
          </p>
        )}

        {/* Prediction Selector — unified player-pick for all bet types */}
        <div className="betting-panel__field">
          <label className="betting-panel__label" htmlFor="prediction-select">
            Prediction
          </label>
          <select
            id="prediction-select"
            className="betting-panel__select"
            value={prediction}
            onChange={(e) => setPrediction(e.target.value)}
            disabled={budgetExhausted}
          >
            {players.map((player) => (
              <option key={player} value={player}>
                {player}
              </option>
            ))}
          </select>
        </div>

        {/* Wager Input */}
        <div className="betting-panel__field">
          <label className="betting-panel__label" htmlFor="wager-input">
            Wager
          </label>
          <input
            id="wager-input"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            className={`betting-panel__input monetary-input${wagerError ? ' betting-panel__input--error' : ''}`}
            value={wagerValue}
            onChange={(e) => {
              const val = e.target.value;
              if (/^\d*$/.test(val)) {
                setWagerValue(val);
                if (wagerError) setWagerError(null);
              }
            }}
            disabled={budgetExhausted}
            placeholder={formatCurrency(0)}
            aria-invalid={!!wagerError}
            aria-describedby={wagerError ? 'wager-error' : 'wager-hint'}
          />
          <span id="wager-hint" className="betting-panel__wager-hint">
            Max: {formatCurrency(remainingBudget)}
          </span>
          {wagerError && (
            <span id="wager-error" className="betting-panel__error" role="alert">
              {wagerError}
            </span>
          )}
        </div>

        {/* Action Buttons */}
        <button
          type="submit"
          className="betting-panel__submit-button"
          disabled={budgetExhausted}
        >
          Add Bet
        </button>

        <button
          type="button"
          className="betting-panel__submit-bets-button"
          disabled={submitBetsDisabled}
          onClick={handleSubmitBets}
          aria-describedby={submitBetsDisabled ? 'submit-bets-hint' : undefined}
        >
          Submit Bets
        </button>

        {submitBetsDisabled && (
          <span id="submit-bets-hint" className="betting-panel__submit-hint">
            Add at least one bet to submit.
          </span>
        )}

        {submitError && (
          <span className="betting-panel__submit-error" role="alert">
            {submitError}
          </span>
        )}

        <button
          type="button"
          className="betting-panel__skip-button"
          onClick={handleSkipBetting}
        >
          Skip Betting
        </button>
      </form>
    </div>
  );
}
