import type { RealtimeChannel } from '@supabase/supabase-js';
import { useFinalJeopardyEntry } from '../../hooks/useFinalJeopardyEntry';
import './FinalJeopardyEntryPage.css';

interface FinalJeopardyEntryPageProps {
  sessionId: string;
  playerName: string;
  playerScore: number;
  channel: RealtimeChannel | null;
  submissionsLocked?: boolean;
}

const MAX_ANSWER_LENGTH = 200;

export function FinalJeopardyEntryPage({
  sessionId,
  playerName,
  playerScore,
  channel,
  submissionsLocked = true,
}: FinalJeopardyEntryPageProps) {
  const {
    answer,
    setAnswer,
    submit,
    status,
    answerError,
    hasSubmitted,
  } = useFinalJeopardyEntry(sessionId, playerName, playerScore, channel);

  const charsRemaining = MAX_ANSWER_LENGTH - answer.length;
  const isSubmitting = status === 'submitting';
  const isDisabled = isSubmitting || hasSubmitted || submissionsLocked;

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
        </div>
        <div className="fj-entry__confirmation">
          <p className="fj-entry__confirmation-text">
            Your answer has been submitted
          </p>
        </div>
      </div>
    );
  }

  // While submissions are locked, show waiting message
  if (submissionsLocked) {
    return (
      <div className="fj-entry">
        <div className="fj-entry__header">
          <p className="fj-entry__player-name">{playerName}</p>
          <p className="fj-entry__player-score" style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
            Final Jeopardy
          </p>
        </div>
        <div className="fj-entry__confirmation">
          <p className="fj-entry__confirmation-text">
            Waiting for the clue to be revealed…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fj-entry">
      <div className="fj-entry__header">
        <p className="fj-entry__player-name">{playerName}</p>
        <p className="fj-entry__player-score" style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
          Final Jeopardy
        </p>
      </div>

      <form className="fj-entry__form" onSubmit={handleSubmit} noValidate>
        {/* Answer textarea */}
        <div className="fj-entry__field">
          <label className="fj-entry__label" htmlFor="fj-answer">
            Your Answer
          </label>
          <textarea
            id="fj-answer"
            className={`fj-entry__textarea${answerError ? ' fj-entry__textarea--error' : ''}`}
            value={answer}
            onChange={handleAnswerChange}
            maxLength={MAX_ANSWER_LENGTH}
            disabled={isDisabled}
            placeholder="What is..."
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
          {isSubmitting ? 'Submitting…' : 'Submit Answer'}
        </button>
      </form>

      {/* Submission error message */}
      {status === 'error' && (
        <div className="fj-entry__submission-error" role="alert">
          Submission failed. Please try again.
        </div>
      )}
    </div>
  );
}
