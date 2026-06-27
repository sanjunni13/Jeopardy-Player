import { supabase } from './supabase';
import { generateSessionId } from './sessionIdGenerator';
import type {
  GameSessionRow,
  SessionPhase,
  BuzzState,
  FinalJeopardyState,
  SessionPlayer,
} from '../types/session';

// ─── Session CRUD ─────────────────────────────────────────────────────────────

/**
 * Creates a new game session for the given host and game.
 * Generates a cryptographically secure session ID.
 */
export async function createSession(
  hostUserId: string,
  gameId: string
): Promise<GameSessionRow> {
  const id = generateSessionId();

  const { data, error } = await supabase
    .from('game_sessions')
    .insert({
      id,
      host_user_id: hostUserId,
      game_id: gameId,
      phase: 'lobby' as SessionPhase,
      is_locked: false,
      players: [],
      buzz_state: {
        clueActive: false,
        queue: [],
        lockedOut: [],
        systemLocked: false,
      },
      final_jeopardy_state: {
        submissions: [],
        revealedIndex: -1,
      },
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create session: ${error.message}`);
  return data as GameSessionRow;
}

/**
 * Registers a player in an existing session by appending to the players array.
 */
export async function joinSession(
  sessionId: string,
  playerName: string
): Promise<GameSessionRow> {
  // Fetch current session to get existing players
  const session = await fetchSession(sessionId);
  if (!session) throw new Error('Session not found');

  const newPlayer: SessionPlayer = {
    name: playerName,
    score: 0,
    joinedAt: new Date().toISOString(),
  };

  const updatedPlayers = [...session.players, newPlayer];

  const { data, error } = await supabase
    .from('game_sessions')
    .update({ players: updatedPlayers, updated_at: new Date().toISOString() })
    .eq('id', sessionId)
    .select()
    .single();

  if (error) throw new Error(`Failed to join session: ${error.message}`);
  return data as GameSessionRow;
}

/**
 * Fetches the current state of a session by ID.
 * Returns null if the session does not exist.
 */
export async function fetchSession(
  sessionId: string
): Promise<GameSessionRow | null> {
  const { data, error } = await supabase
    .from('game_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch session: ${error.message}`);
  return data as GameSessionRow | null;
}

/**
 * Updates the phase of a session.
 */
export async function updateSessionPhase(
  sessionId: string,
  phase: SessionPhase
): Promise<void> {
  const { error } = await supabase
    .from('game_sessions')
    .update({ phase, updated_at: new Date().toISOString() })
    .eq('id', sessionId);

  if (error) throw new Error(`Failed to update session phase: ${error.message}`);
}

/**
 * Updates the buzz state of a session.
 */
export async function updateBuzzState(
  sessionId: string,
  buzzState: BuzzState
): Promise<void> {
  const { error } = await supabase
    .from('game_sessions')
    .update({ buzz_state: buzzState, updated_at: new Date().toISOString() })
    .eq('id', sessionId);

  if (error) throw new Error(`Failed to update buzz state: ${error.message}`);
}

/**
 * Updates the Final Jeopardy state of a session.
 */
export async function updateFinalJeopardyState(
  sessionId: string,
  fjState: FinalJeopardyState
): Promise<void> {
  const { error } = await supabase
    .from('game_sessions')
    .update({ final_jeopardy_state: fjState, updated_at: new Date().toISOString() })
    .eq('id', sessionId);

  if (error)
    throw new Error(`Failed to update Final Jeopardy state: ${error.message}`);
}

/**
 * Locks the session, preventing new players from joining.
 */
export async function lockSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('game_sessions')
    .update({ is_locked: true, updated_at: new Date().toISOString() })
    .eq('id', sessionId);

  if (error) throw new Error(`Failed to lock session: ${error.message}`);
}

/**
 * Unlocks the session, allowing new players to join.
 */
export async function unlockSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('game_sessions')
    .update({ is_locked: false, updated_at: new Date().toISOString() })
    .eq('id', sessionId);

  if (error) throw new Error(`Failed to unlock session: ${error.message}`);
}

/**
 * Updates the players array in a session (e.g. score changes).
 */
export async function updateSessionPlayers(
  sessionId: string,
  players: SessionPlayer[]
): Promise<void> {
  const { error } = await supabase
    .from('game_sessions')
    .update({ players, updated_at: new Date().toISOString() })
    .eq('id', sessionId);

  if (error) throw new Error(`Failed to update session players: ${error.message}`);
}

/**
 * Ends the session by setting phase to 'ended'.
 */
export async function endSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('game_sessions')
    .update({ phase: 'ended' as SessionPhase, updated_at: new Date().toISOString() })
    .eq('id', sessionId);

  if (error) throw new Error(`Failed to end session: ${error.message}`);
}
