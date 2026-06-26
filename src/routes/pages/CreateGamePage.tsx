import { useNavigate } from '@tanstack/react-router'
import { sampleGame } from '../../assets/sampleGame'
import { BackButton } from '../../components/BackButton'
import { BackgroundGradient } from '../../components/ui/background-gradient'
import { UnfinishedGamesLibrary } from '../../components/builder/UnfinishedGamesLibrary'
import { FAQCard } from '../../components/ui/FAQCard'
import { createGameFAQ } from '../../data/faqData'
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

        <button
          type="button"
          onClick={() => navigate({ to: '/home/create/builder' })}
          className="create-builder-btn"
          aria-label="Open interactive game builder"
        >
          <span className="create-builder-btn-title">Build a Game</span>
          <span className="create-builder-btn-desc">
            Use our interactive game builder to create a custom Jeopardy game step by step.
          </span>
        </button>

        <div className="create-instructions">
          <p>
            You can also create a custom Jeopardy game by writing a JSON file that follows a specific structure.
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

        <p className="create-download-desc">
          If you would rather design a game this way, please press the button below to download a customizable template.
        </p>

        <button
          type="button"
          onClick={handleDownload}
          className="create-download-btn"
          aria-label="Download sample game JSON template"
        >
          Download Sample Template
        </button>
      </BackgroundGradient>

      <UnfinishedGamesLibrary />

      <FAQCard items={createGameFAQ} />
    </div>
  )
}
