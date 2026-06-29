import type { BuzzState } from '../../types/session'
import { orderBuzzQueue } from '../../utils/buzzerLogic'
import './BuzzerHostPanel.css'

interface BuzzerHostPanelProps {
  buzzState: BuzzState
  onClearQueue: () => void
  onLock: () => void
  onUnlock: () => void
  onlinePlayers?: string[]
}

export function BuzzerHostPanel({
  buzzState,
  onClearQueue,
  onLock,
  onUnlock,
  onlinePlayers,
}: BuzzerHostPanelProps) {
  const sortedQueue = orderBuzzQueue(buzzState.queue).slice(0, 8)

  function isOnline(playerName: string): boolean {
    if (!onlinePlayers) return true // If no presence data, assume online
    return onlinePlayers.some(n => n.toLowerCase() === playerName.toLowerCase())
  }

  return (
    <div className="buzzer-host-panel" aria-label="Buzzer host controls">
      <div className="buzzer-host-panel__header">
        <h2 className="buzzer-host-panel__title">Buzz Queue</h2>
        {buzzState.systemLocked && (
          <span className="buzzer-host-panel__locked-indicator" aria-live="polite">
            Locked
          </span>
        )}
      </div>

      <div className="buzzer-host-panel__queue" aria-label="Buzz queue">
        {sortedQueue.length === 0 ? (
          <p className="buzzer-host-panel__queue-empty">Waiting for buzzes…</p>
        ) : (
          <ol className="buzzer-host-panel__queue-list">
            {sortedQueue.map((event, index) => {
              const isFirst = index === 0
              return (
                <li
                  key={`${event.playerName}-${event.timestamp}`}
                  className={`buzzer-host-panel__queue-item${isFirst ? ' buzzer-host-panel__queue-item--active' : ''}`}
                >
                  <div className="buzzer-host-panel__queue-item-info">
                    <span className="buzzer-host-panel__queue-position">
                      {index + 1}.
                    </span>
                    <span
                      className="buzzer-host-panel__presence-dot"
                      style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', marginRight: 6, backgroundColor: isOnline(event.playerName) ? '#22c55e' : '#ef4444' }}
                      aria-label={isOnline(event.playerName) ? 'Online' : 'Offline'}
                    />
                    <span className="buzzer-host-panel__queue-name">
                      {event.playerName}
                    </span>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </div>

      <div className="buzzer-host-panel__controls">
        {buzzState.systemLocked ? (
          <button
            type="button"
            className="buzzer-host-panel__btn buzzer-host-panel__btn--unlock"
            onClick={onUnlock}
          >
            Unlock Buzzers
          </button>
        ) : (
          <button
            type="button"
            className="buzzer-host-panel__btn buzzer-host-panel__btn--lock"
            onClick={onLock}
          >
            Lock Buzzers
          </button>
        )}
        <button
          type="button"
          className="buzzer-host-panel__btn buzzer-host-panel__btn--clear"
          onClick={onClearQueue}
        >
          Clear Queue
        </button>
      </div>
    </div>
  )
}
