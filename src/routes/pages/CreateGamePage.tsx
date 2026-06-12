import { useNavigate } from '@tanstack/react-router'
import { sampleGame } from '../../assets/sampleGame'
import { BackButton } from '../../components/BackButton'
import { BackgroundGradient } from '../../components/ui/background-gradient'
import './CreateGamePage.css'

export function CreateGamePage() {
  const navigate = useNavigate()

  function handleDownload() {
    const json = JSON.stringify(sampleGame, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'sample_game.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="create-page">
      <BackgroundGradient containerClassName="create-gradient-container" className="create-card">
        <BackButton onClick={() => navigate({ to: '/home' })} label="Back to home" />

        <h1 className="create-title">Create a Game</h1>

        <div className="create-instructions">
          <p>
            You can create a custom Jeopardy game by writing a JSON file that follows a specific structure.
            Download the sample template below to get started, then edit it with your own categories and clues.
          </p>
          <p>The JSON file must have the following structure:</p>
          <ul>
            <li>
              A top-level <code>game</code> key containing all game data.
            </li>
            <li>
              Round keys using word-descriptors: <code>single</code>, <code>double</code>, <code>triple</code>, etc.
            </li>
            <li>
              Each round is an array of categories. Each category has a <code>category</code> name
              and a <code>clues</code> array.
            </li>
            <li>
              Each clue object contains: <code>value</code> (number), <code>clue</code> (string),{' '}
              <code>solution</code> (string), <code>dailyDouble</code> (boolean), and <code>html</code> (boolean).
            </li>
            <li>
              A <code>final</code> object with <code>category</code>, <code>clue</code>, and <code>solution</code> strings
              for the Final Jeopardy round.
            </li>
          </ul>
        </div>

        <button
          type="button"
          onClick={handleDownload}
          className="create-download-btn"
          aria-label="Download sample game JSON template"
        >
          Download Sample Template
        </button>

        <section className="create-coming-soon">
          <h2 className="create-coming-soon-title">Coming Soon</h2>
          <p>
            A full in-app game creator is on the way. In a future update, you'll be able to:
          </p>
          <ul>
            <li>Set a game name</li>
            <li>Choose the number of rounds (1–6)</li>
            <li>Choose categories per round (1–6)</li>
            <li>Enter category names</li>
            <li>Enter clue/answer pairs with point values</li>
            <li>Upload directly to your library or start playing immediately</li>
          </ul>
          <p>
            In the meantime, users who want an automated approach can use "Generate a Game" from the home page.
          </p>
        </section>
      </BackgroundGradient>
    </div>
  )
}
