import { useContext } from 'react'
import { PlayerProfileContext } from '../contexts/PlayerProfileContext'
import type { PlayerProfileContextValue } from '../contexts/PlayerProfileContext'

/**
 * Consumes the PlayerProfileContext. Must be used within a PlayerProfileProvider.
 */
export function usePlayerProfileContext(): PlayerProfileContextValue {
  const context = useContext(PlayerProfileContext)
  if (context === undefined) {
    throw new Error('usePlayerProfileContext must be used within a PlayerProfileProvider')
  }
  return context
}
