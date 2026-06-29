import './SupportSection.css'
import SocialIcons from '../../../components/ui/social-links.tsx'

const appVersion = __APP_VERSION__ || '0.0.0'

export function SupportSection() {
  return (
    <section className="support-section" aria-labelledby="support-heading">
      <h2 id="support-heading" className="support-section__heading">
        Support
      </h2>

      <SocialIcons/>

      <p className="support-section__version">
        Version {appVersion}
      </p>
    </section>
  )
}
