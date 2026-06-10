import { useNavigate } from '@tanstack/react-router'
import { BackgroundGradient } from '../../components/ui/background-gradient'
import './HomePage.css'

export function HomePage() {
  const navigate = useNavigate()

  return (
    <div className="home-page">
      <BackgroundGradient
        containerClassName="home-gradient-container"
        className="home-card"
      >
        <h1 className="home-title">Welcome!</h1>
        <p className="home-subtitle">How would you like to play today?</p>

        <div className="home-actions">
          <button
            type="button"
            onClick={() => navigate({ to: '/home/library' })}
            className="home-action-btn"
          >
            Play a Game
          </button>
          <button
            type="button"
            onClick={() => navigate({ to: '/home/upload' })}
            className="home-action-btn"
          >
            Upload a Game
          </button>
        </div>
      </BackgroundGradient>
    </div>
  )
}
