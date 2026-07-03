import { useNavigate } from '@tanstack/react-router'
import type { GameRecord } from '../types/game'

/**
 * Selects a uniformly random game from the provided array.
 * Exported as a pure function to enable isolated unit and property-based testing.
 *
 * @param games - Non-empty array of available games.
 * @returns A reference-equal element from the input array.
 */
export function selectRandomGame(games: GameRecord[]): GameRecord {
  const index = Math.floor(Math.random() * games.length)
  return games[index]
}

/**
 * Hook that wraps `selectRandomGame` and navigates to the player-entry screen
 * for the selected game when `pickRandom` is called.
 *
 * The caller is responsible for ensuring `games` is the full unfiltered list
 * (Requirement 1.5).
 */
export function useRandomGamePicker() {
  const navigate = useNavigate()

  function pickRandom(games: GameRecord[]): void {
    if (games.length === 0) return
    const game = selectRandomGame(games)
    navigate({
      to: '/home/game/$gameId',
      params: { gameId: game.id },
      state: { fromLibrary: true },
    })
  }

  return { pickRandom }
}
