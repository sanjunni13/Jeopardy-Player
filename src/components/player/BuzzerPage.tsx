import type { RealtimeChannel } from '@supabase/supabase-js';
import type { BuzzState } from '../../types/session';
import { useBuzzer } from '../../hooks/useBuzzer';
import './BuzzerPage.css';

interface BuzzerPageProps {
  playerName: string;
  buzzState: BuzzState;
  channel: RealtimeChannel | null;
}

/**
 * Full-screen buzzer page for players.
 *
 * Displays:
 * - Player name at the top
 * - Large, centered buzz-in button (min 44×44px, much larger for mobile)
 * - Disabled state with visual cues beyond color (dashed border, reduced opacity)
 * - Buzzed confirmation feedback
 * - Error state with retry option
 */
export function BuzzerPage({ playerName, buzzState, channel }: BuzzerPageProps) {
  const { canBuzz, buzzIn, hasBuzzed, error } = useBuzzer(channel, buzzState, playerName);

  const isDisabled = !canBuzz || hasBuzzed;

  function getButtonLabel(): string {
    if (hasBuzzed) return 'BUZZED!';
    if (!canBuzz) return 'Wait…';
    return 'BUZZ';
  }

  function getStatusContent(): { text: string; className: string } | null {
    if (hasBuzzed) {
      return { text: '✓ Buzz registered', className: 'buzzer-page__status--buzzed' };
    }
    if (!buzzState.clueActive) {
      return { text: 'Waiting for the next clue…', className: 'buzzer-page__status--waiting' };
    }
    if (buzzState.systemLocked) {
      return { text: 'Buzzer is locked by host', className: 'buzzer-page__status--waiting' };
    }
    return null;
  }

  const status = getStatusContent();

  const buttonClassName = [
    'buzzer-page__button',
    hasBuzzed ? 'buzzer-page__button--buzzed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="buzzer-page">
      <p className="buzzer-page__player-name" aria-label="Player name">
        {playerName}
      </p>

      <div className="buzzer-page__button-container">
        <button
          type="button"
          className={buttonClassName}
          disabled={isDisabled}
          onClick={buzzIn}
          aria-label={hasBuzzed ? 'Buzz registered' : canBuzz ? 'Buzz in' : 'Buzzer disabled'}
          aria-pressed={hasBuzzed}
        >
          {getButtonLabel()}
        </button>
      </div>

      {status && (
        <p className={`buzzer-page__status ${status.className}`} aria-live="polite">
          {status.text}
        </p>
      )}

      {error && (
        <div className="buzzer-page__error" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="buzzer-page__retry-button"
            onClick={buzzIn}
            aria-label="Retry buzz"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
