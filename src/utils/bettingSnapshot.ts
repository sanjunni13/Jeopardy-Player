/**
 * Tab-scoped persistence for the player-side betting phase.
 *
 * The betting phase is announced over the realtime channel (`betting_start`) and
 * lives only in `PlaySessionPage` component state, while the persisted session
 * phase stays `'buzzer'`. Reloading the buzzer page mid-betting therefore used to
 * drop the player onto the generic buzzer screen and lose the fact that they had
 * already submitted or skipped (bug condition `C_restore`).
 *
 * A snapshot of everything needed to re-render `PlayerBettingPanel` is kept in
 * `sessionStorage` under `betting_state_${sessionId}`, matching the existing
 * `buzzer_name_${sessionId}` pattern: tab-scoped, survives a reload, no database
 * schema change.
 */

export interface BettingSnapshotBet {
  betType: string;
  wager: number;
  prediction: string;
}

export interface BettingSnapshot {
  availableBets: { betType: string; description: string }[];
  timerDuration: number;
  playerBalances: Record<string, number>;
  placedBets: BettingSnapshotBet[];
  /** True once the player submitted or skipped — they must not submit twice. */
  finalized: boolean;
}

/** The `sessionStorage` key a session's betting snapshot lives under. */
export function bettingSnapshotKey(sessionId: string): string {
  return `betting_state_${sessionId}`;
}

/** `sessionStorage` is unavailable in some embedded/SSR contexts and can throw. */
function getStorage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseAvailableBets(value: unknown): { betType: string; description: string }[] | null {
  if (!Array.isArray(value)) return null;
  const bets: { betType: string; description: string }[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) return null;
    if (typeof entry.betType !== 'string' || typeof entry.description !== 'string') return null;
    bets.push({ betType: entry.betType, description: entry.description });
  }
  return bets;
}

function parsePlacedBets(value: unknown): BettingSnapshotBet[] | null {
  if (!Array.isArray(value)) return null;
  const bets: BettingSnapshotBet[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) return null;
    if (
      typeof entry.betType !== 'string' ||
      typeof entry.wager !== 'number' ||
      !Number.isFinite(entry.wager) ||
      typeof entry.prediction !== 'string'
    ) {
      return null;
    }
    bets.push({ betType: entry.betType, wager: entry.wager, prediction: entry.prediction });
  }
  return bets;
}

function parseBalances(value: unknown): Record<string, number> | null {
  if (!isRecord(value)) return null;
  const balances: Record<string, number> = {};
  for (const [name, balance] of Object.entries(value)) {
    if (typeof balance !== 'number' || !Number.isFinite(balance)) return null;
    balances[name] = balance;
  }
  return balances;
}

/** Writes the snapshot, replacing any previous one for this session. */
export function persistBettingSnapshot(sessionId: string, snapshot: BettingSnapshot): void {
  if (!sessionId) return;
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(
      bettingSnapshotKey(sessionId),
      JSON.stringify({
        availableBets: snapshot.availableBets.map((bet) => ({
          betType: bet.betType,
          description: bet.description,
        })),
        timerDuration: snapshot.timerDuration,
        playerBalances: { ...snapshot.playerBalances },
        placedBets: snapshot.placedBets.map((bet) => ({
          betType: bet.betType,
          wager: bet.wager,
          prediction: bet.prediction,
        })),
        finalized: snapshot.finalized,
      }),
    );
  } catch {
    // Storage full or blocked — betting still works, it just won't survive a reload.
  }
}

/**
 * Reads the snapshot back. Returns `null` when nothing is stored or the stored
 * value is malformed, so a bad entry degrades to "no active betting phase"
 * instead of rendering a broken panel.
 */
export function restoreBettingSnapshot(sessionId: string): BettingSnapshot | null {
  if (!sessionId) return null;
  const storage = getStorage();
  if (!storage) return null;

  let raw: string | null;
  try {
    raw = storage.getItem(bettingSnapshotKey(sessionId));
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;

  const availableBets = parseAvailableBets(parsed.availableBets);
  const placedBets = parsePlacedBets(parsed.placedBets);
  const playerBalances = parseBalances(parsed.playerBalances);
  if (
    availableBets === null ||
    placedBets === null ||
    playerBalances === null ||
    typeof parsed.timerDuration !== 'number' ||
    !Number.isFinite(parsed.timerDuration) ||
    typeof parsed.finalized !== 'boolean'
  ) {
    return null;
  }

  return {
    availableBets,
    timerDuration: parsed.timerDuration,
    playerBalances,
    placedBets,
    finalized: parsed.finalized,
  };
}

/** Removes the snapshot — the betting phase is over (`betting_complete`, `session_ended`). */
export function clearBettingSnapshot(sessionId: string): void {
  if (!sessionId) return;
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(bettingSnapshotKey(sessionId));
  } catch {
    // Nothing to do — a stale snapshot is discarded on the next validate/restore.
  }
}
