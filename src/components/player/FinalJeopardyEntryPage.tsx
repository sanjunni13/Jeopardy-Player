import type { RealtimeChannel } from '@supabase/supabase-js';
import { useFinalJeopardyEntry } from '../../hooks/useFinalJeopardyEntry';
import { getValidWagerRange } from '../../utils/finalJeopardyValidation';
import './FinalJeopardyEntryPage.css';

interface FinalJeopardyEntryPageProps {
  sessionId: string;
  playerName: string;
  playerScore: number;
  channel: RealtimeChannel | null;
}

const MAX_ANSWER_LENGTH = 200;

export function FinalJeopardyEntryPage({
  sessionId,
  playerName,
  playerScore,
  channel,
}: FinalJeopardyEntryPageProps) {
  const {
    wager,
    setWager,
    answer,
    setAnswer,
    submit,
    status,
    wagerError,
    answerError,
    hasSubmitted,
  } = useFinalJeopardyEntry(sessionId, playerName, playerScore, channel);

  const { min, max } = getValidWagerRange(playerScore);
  const charsRemaining = MAX_ANSWER_LENGTH - answer.length;
  const isSubmitting = status === 'submitting';
  const isDisabled = isSubmitting || hasSubmitted;

  const handleWagerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow empty input for clearing the field
    if (value === '') {
      setWager(0);
      return;
    }
    const parsed = parseInt(value, 10);
    if (!isNaN(parsed)) {
      setWager(parsed);
    }
  };

  const handleAnswerChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    if (value.length <= MAX_ANSWER_LENGTH) {
      setAnswer(value);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit();
  };

  // After successful submission, show confirmation
  if (hasSubmitted) {
    return (
      <div className="fj-entry">
        <div className="fj-entry__header">
          <p className="fj-entry__player-name">{playerName}</p>
          <p className="fj-entry__player-score">
            Score: ${playerScore.toLocaleString()}
          </p>
        </div>
        <div className="fj-entry__confirmation">
          <p className="fj-entry__confirmation-text">
            Your answer has been submitted
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fj-entry">
      <div className="fj-entry__header">
        <p className="fj-entry__player-name">{playerName}</p>
        <p className="fj-entry__player-score">
          Score: ${playerScore.toLocaleString()}
        </p>
      </div>

      <form className="fj-entry__form" onSubmit={handleSubmit} noValidate>
        {/* Wager input */}
        <div className="fj-entry__field">
          <label className="fj-entry__label" htmlFor="fj-wager">
            Wager
          </label>
          <input
            id="fj-wager"
            type="number"
            className={`fj-entry__input${wagerError ? ' fj-entry__input--error' : ''}`}
            value={wager}
            onChange={handleWagerChange}
            min={min}
            max={max}
            step={1}
            disabled={isDisabled}
            aria-invalid={!!wagerError}
            aria-describedby="fj-wager-range fj-wager-error"
          />
          <span id="fj-wager-range" className="fj-entry__wager-range">
            ${min.toLocaleString()} – ${max.toLocaleString()}
          </span>
          {wagerError && (
            <span id="fj-wager-error" className="fj-entry__error" role="alert">
              {wagerError}
            </span>
          )}
        </div>

        {/* Answer textarea */}
        <div className="fj-entry__field">
          <label className="fj-entry__label" htmlFor="fj-answer">
            Answer
          </label>
          <textarea
            id="fj-answer"
            className={`fj-entry__textarea${answerError ? ' fj-entry__textarea--error' : ''}`}
            value={answer}
            onChange={handleAnswerChange}
            maxLength={MAX_ANSWER_LENGTH}
            disabled={isDisabled}
            aria-invalid={!!answerError}
            aria-describedby="fj-answer-counter fj-answer-error"
          />
          <span
            id="fj-answer-counter"
            className={`fj-entry__char-counter${
              charsRemaining <= 20 && charsRemaining > 0
                ? ' fj-entry__char-counter--warning'
                : charsRemaining <= 0
                  ? ' fj-entry__char-counter--over'
                  : ''
            }`}
          >
            {charsRemaining} characters remaining
          </span>
          {answerError && (
            <span id="fj-answer-error" className="fj-entry__error" role="alert">
              {answerError}
            </span>
          )}
        </div>

        {/* Submit button */}
        <button
          type="submit"
          className="fj-entry__submit-button"
          disabled={isDisabled}
        >
          {isSubmitting ? 'Submitting…' : 'Submit'}
        </button>
      </form>

      {/* Submission error message */}
      {status === 'error' && (
        <div className="fj-entry__submission-error" role="alert">
          Submission failed. Please check your entries and try again.
        </div>
      )}
    </div>
  );
}
