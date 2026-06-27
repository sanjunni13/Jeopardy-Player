import { Link } from '@tanstack/react-router'
import './SessionEndedPage.css'

interface SessionEndedPageProps {
  message?: string
}

export function SessionEndedPage({ message }: SessionEndedPageProps) {
  return (
    <div className="session-ended-page">
      <div className="session-ended-page__card">
        <div className="session-ended-page__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </div>

        <h1 className="session-ended-page__heading">Session Ended</h1>

        <p className="session-ended-page__message">
          {message || 'The game session has ended. Thanks for playing!'}
        </p>

        <Link to="/" className="session-ended-page__home-link">
          Return Home
        </Link>
      </div>
    </div>
  )
}
