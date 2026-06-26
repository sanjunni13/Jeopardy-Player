import './SupportSection.css'

const appVersion = __APP_VERSION__ || '0.0.0'

export function SupportSection() {
  return (
    <section className="support-section" aria-labelledby="support-heading">
      <h2 id="support-heading" className="support-section__heading">
        Support
      </h2>

      <a
        href="https://github.com/sanjunni13/Jeopardy-Player"
        target="_blank"
        rel="noopener noreferrer"
        className="support-section__link"
        aria-label="GitHub Repository (opens in new tab)"
      >
        GitHub Repository
        <span className="support-section__link-indicator" aria-hidden="true">
          ↗
        </span>
      </a>

      <p className="support-section__version">
        Version {appVersion}
      </p>
    </section>
  )
}
