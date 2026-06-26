import { useState } from 'react'
import { Outlet, useNavigate } from '@tanstack/react-router'
import { toast } from 'react-toastify'
import { PlayerProfileProvider } from '../contexts/PlayerProfileProvider'
import { ProfileGuard } from './ProfileGuard'
import { LogoutDialog } from './LogoutDialog'
import { SettingsIcon } from './SettingsIcon'
import './AuthenticatedLayout.css'

export function AuthenticatedLayout() {
  const [showLogout, setShowLogout] = useState(false)
  const navigate = useNavigate()

  return (
    <PlayerProfileProvider>
      <ProfileGuard>
        <div className="authenticated-layout">
          {/* ── Header ── */}
          <header className="layout-header">
            <button
              type="button"
              className="layout-brand"
              onClick={() => navigate({ to: '/home' })}
            >
              Jeopardy Player by Sanjay Unni
            </button>
            <div className="layout-header__actions">
              <SettingsIcon />
              <button
                type="button"
                onClick={() => setShowLogout(true)}
                className="logout-header-btn"
              >
                <div className="logout-header-sign">
                  <svg viewBox="0 0 512 512">
                    <path d="M377.9 105.9L500.7 228.7c7.2 7.2 11.3 17.1 11.3 27.3s-4.1 20.1-11.3 27.3L377.9 406.1c-6.4 6.4-15 9.9-24 9.9c-18.7 0-33.9-15.2-33.9-33.9l0-62.1-128 0c-17.7 0-32-14.3-32-32l0-64c0-17.7 14.3-32 32-32l128 0 0-62.1c0-18.7 15.2-33.9 33.9-33.9c9 0 17.6 3.6 24 9.9zM160 96L96 96c-17.7 0-32 14.3-32 32l0 256c0 17.7 14.3 32 32 32l64 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-64 0c-53 0-96-43-96-96L0 128C0 75 43 32 96 32l64 0c17.7 0 32 14.3 32 32s-14.3 32-32 32z" />
                  </svg>
                </div>
                <div className="logout-header-text">Logout</div>
              </button>
            </div>
          </header>

          {/* ── Page content ── */}
          <main className="layout-main">
            <Outlet />
          </main>

          {/* ── Logout dialog ── */}
          {showLogout && (
            <LogoutDialog
              onClose={() => setShowLogout(false)}
              onError={(msg) => toast.error(msg)}
            />
          )}
        </div>
      </ProfileGuard>
    </PlayerProfileProvider>
  )
}
