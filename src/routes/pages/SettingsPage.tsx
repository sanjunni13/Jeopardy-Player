import { useNavigate } from '@tanstack/react-router'
import { ProfileSection } from './settings/ProfileSection'
import { SupportSection } from './settings/SupportSection'
import { BackButton } from '../../components/BackButton'
import './SettingsPage.css'

export function SettingsPage() {
  const navigate = useNavigate()

  function handleBack() {
    if (window.history.length > 1) {
      window.history.back()
    } else {
      navigate({ to: '/home' })
    }
  }

  return (
    <main className="settings-page">
      <div className="settings-page__header">
        <BackButton onClick={handleBack} label="Go back" />
        <h1 className="settings-page__title">Settings</h1>
      </div>

      <div className="settings-page__content">
        <ProfileSection />
        <hr className="settings-page__divider" />
        <SupportSection />
      </div>
    </main>
  )
}
