import { createContext } from 'react'

export interface PlayerProfile {
  playerId: number
  playerName: string
  authUuid: string
}

export interface PlayerProfileContextValue {
  profile: PlayerProfile | null
  loading: boolean
  refreshProfile: () => Promise<void>
}

export const PlayerProfileContext = createContext<PlayerProfileContextValue | undefined>(undefined)
