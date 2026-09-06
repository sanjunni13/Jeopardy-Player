import { useState, useEffect, useCallback, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { broadcastMessage } from '../../utils/sessionChannel';
import { formatCurrency } from '../../utils/currency';
import {
  MIN_COMMITMENT,
  isAdmissibleCommitment,
  type PlayerBudgetView,
} from '../../utils/gamblingAllowance';
import './PlayerAuctionPanel.css';

interface PlayerAuctionPanelProps {
  category: string;
  categoryIndex: number;
  roundName: string;
  playerBalance: number;
  timerDuration: number;
  channel: RealtimeChannel | null;
  playerName: string;
  onBidSubmitted: () => void;
  /**
   * Spendable_Budget for this Auction_Phase, broadcast by the Auction_Controller
   * on `auction_start`. Optional: a tab running older code never receives it, so
   * the panel falls back to treating the Real_Balance as the whole budget.
   */
  budget?: PlayerBudgetView;
}

/**
 * Player-side auction panel displayed on the player device during
 * the category auction phase. Allows the player to submit a single
 * sealed bid for the current category.
 *
 * - Shows category name, Spendable_Budget, Real_Balance, and a countdown timer
 * - An Allowance_Player sees the Gambling_Allowance remaining, labelled
 *   distinctly from Real_Balance (Requirement 1.7); every other player sees
 *   their unspent budget with no allowance label (Requirement 1.13)
 * - Validates the bid in four ordered steps — non-numeric, non-integer,
 *   at or below zero, over budget — each returning before any state change
 *   so a rejected bid leaves the entered value and the budget untouched
 *   (Requirement 1.5, 1.6)
 * - On submit, broadcasts `auction_bid` via the session channel
 * - On timer expiry with no bid, the player abstains (no message sent)
 */
export function PlayerAuctionPanel(props: PlayerAuctionPanelProps) {
  const {
    category,
    categoryIndex,
    playerBalance,
    timerDuration,
    channel,
    playerName,
    onBidSubmitted,
    budget,
  } = props;

  // Backward-compatible fallback: without a broadcast budget the Real_Balance is
  // the entire Spendable_Budget and no allowance is in play, which is exactly the
  // behaviour this panel had before the Gambling_Allowance existed.
  const realBalance = budget ? budget.realBalance : playerBalance;
  const unspent = budget ? budget.unspent : playerBalance;
  const isAllowance = budget ? budget.isAllowance : false;

  const [bidValue, setBidValue] = useState('');
  const [bidError, setBidError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(timerDuration);
  const [expired, setExpired] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const submittedRef = useRef(false);

  // Keep ref in sync with state for timer callback
  useEffect(() => {
    submittedRef.current = submitted;
  }, [submitted]);

  // Countdown timer
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setTimeRemaining(timerDuration);
    setExpired(false);

    intervalRef.current = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          // Timer expired
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          setExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [timerDuration]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSubmit = useCallback(async () => {
    setBidError(null);
    const num = Number(bidValue);

    // Requirement 1.5, 1.6 — four ordered checks, each returning before any
    // state mutation so the message always names the actual failure and a
    // rejected bid changes nothing.
    if (bidValue.trim() === '' || Number.isNaN(num)) {
      setBidError('Enter a valid number');
      return;
    }
    if (!Number.isInteger(num)) {
      setBidError('Bid must be a whole number');
      return;
    }
    if (num <= 0) {
      setBidError('Bid must be greater than zero');
      return;
    }
    if (!isAdmissibleCommitment(num, unspent)) {
      setBidError(`Maximum bid is ${formatCurrency(unspent)}`);
      return;
    }

    if (!channel) {
      setBidError('Not connected to session');
      return;
    }

    setSubmitting(true);
    try {
      await broadcastMessage(channel, {
        type: 'auction_bid',
        playerName,
        categoryIndex,
        amount: num,
      });
      setSubmitted(true);
      onBidSubmitted();
    } catch {
      setBidError('Failed to submit bid. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [bidValue, unspent, channel, playerName, categoryIndex, onBidSubmitted]);

  // Timer display classes
  const timerClassName = [
    'auction-panel__timer',
    timeRemaining <= 5 ? 'auction-panel__timer--critical' : '',
    timeRemaining <= 10 && timeRemaining > 5 ? 'auction-panel__timer--warning' : '',
  ]
    .filter(Boolean)
    .join(' ');

  // Requirement 1.7, 1.13, 5.5 — the allowance line is present only for an
  // Allowance_Player and is styled apart from Real_Balance; every amount is
  // Currency_Formatter output verbatim.
  const budgetSummary = (
    <>
      {isAllowance ? (
        <p className="auction-panel__allowance">
          Allowance remaining: {formatCurrency(unspent)}
        </p>
      ) : (
        <p className="auction-panel__available">
          Available: {formatCurrency(unspent)}
        </p>
      )}
      <p className="auction-panel__balance">
        Your balance: {formatCurrency(realBalance)}
      </p>
    </>
  );

  // ─── Submitted confirmation ─────────────────────────────────────────────

  if (submitted) {
    return (
      <div className="auction-panel">
        <div className="auction-panel__header">
          <p className="auction-panel__category">{category}</p>
          {budgetSummary}
        </div>
        <div className="auction-panel__confirmation">
          <p className="auction-panel__confirmation-text">
            ✓ Bid submitted!
          </p>
        </div>
      </div>
    );
  }

  // ─── Timer expired without bid ──────────────────────────────────────────

  if (expired && !submitted) {
    return (
      <div className="auction-panel">
        <div className="auction-panel__header">
          <p className="auction-panel__category">{category}</p>
        </div>
        <div className="auction-panel__abstained">
          <p className="auction-panel__abstained-text">
            Time's up — you abstained from this auction.
          </p>
        </div>
      </div>
    );
  }

  // ─── Active bidding ─────────────────────────────────────────────────────

  const isDisabled = submitting || expired;

  return (
    <div className="auction-panel">
      <div className="auction-panel__header">
        <p className="auction-panel__category">{category}</p>
        {budgetSummary}
        <p className={timerClassName} aria-live="polite" aria-label="Time remaining">
          {timeRemaining}s
        </p>
      </div>

      <form
        className="auction-panel__form"
        onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
        noValidate
      >
        <div className="auction-panel__field">
          <label className="auction-panel__label" htmlFor="auction-bid">
            Your Bid
          </label>
          <div className="auction-panel__input-wrapper">
            <span className="auction-panel__currency-symbol">$</span>
            <input
              id="auction-bid"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              className={`auction-panel__input monetary-input${bidError ? ' auction-panel__input--error' : ''}`}
              value={bidValue}
              onChange={(e) => {
                const val = e.target.value;
                if (/^\d*$/.test(val)) {
                  setBidValue(val);
                  if (bidError) setBidError(null);
                }
              }}
              disabled={isDisabled}
              placeholder="Enter bid..."
              aria-invalid={!!bidError}
              aria-describedby={bidError ? 'auction-bid-error' : 'auction-bid-hint'}
              autoFocus
            />
          </div>
          <span id="auction-bid-hint" className="auction-panel__range-hint">
            Enter a bid between {formatCurrency(MIN_COMMITMENT)} and {formatCurrency(unspent)}
          </span>
          {bidError && (
            <span id="auction-bid-error" className="auction-panel__error" role="alert">
              {bidError}
            </span>
          )}
        </div>

        <button
          type="submit"
          className="auction-panel__submit-button"
          disabled={isDisabled}
        >
          {submitting ? 'Submitting…' : 'Place Bid'}
        </button>
      </form>
    </div>
  );
}
