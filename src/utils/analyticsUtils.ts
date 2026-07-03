import type {
  NormalizedGame,
  Player,
  GameSession,
  ClueState,
  DailyDoubleRecord,
  RoundName,
} from '../types/game';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface ScoreTimelinePoint {
  ordinal: number;
  score: number;
}

export interface CategoryAccuracyRow {
  category: string;
  correct: number;
  total: number;
}

export interface HeadToHeadResult {
  playerA: string;
  playerB: string;
  correctA: number;
  correctB: number;
  incorrectA: number;
  incorrectB: number;
  ddAttemptedA: number;
  ddAttemptedB: number;
  ddWonA: number;
  ddWonB: number;
  finalScoreA: number;
  finalScoreB: number;
}

export interface EnrichedDDRecord extends DailyDoubleRecord {
  roundDisplayName: string;
  categoryName: string;
  clueValue: number;
  netImpact: number;
}

export interface ComputedAnalytics {
  sortedPlayers: Player[];
  scoreTimelines: Map<string, ScoreTimelinePoint[]>;
  categoryAccuracy: Map<string, CategoryAccuracyRow[]>;
  dailyDoubleRecordsEnriched: EnrichedDDRecord[];
  biggestComebacks: { playerName: string; delta: number; lowestScore: number }[];
  longestLossStreaks: { playerName: string; streakLength: number; totalLost: number; lowestScore: number }[];
  headToHeads: HeadToHeadResult[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const ROUND_LABELS: Record<RoundName, string> = {
  single: 'Single Jeopardy',
  double: 'Double Jeopardy',
  triple: 'Triple Jeopardy',
  quadruple: 'Quadruple Jeopardy',
  quintuple: 'Quintuple Jeopardy',
  sextuple: 'Sextuple Jeopardy',
};

// ─── computeScoreTimeline ────────────────────────────────────────────────────

/**
 * Computes a per-player score timeline as an ordered sequence of
 * (ordinal, cumulative score) pairs. The first point is always { ordinal: 0, score: 0 }.
 * One point is appended per non-null player marking, in board order.
 * Daily Double wagers are used for DD clues (from DailyDoubleRecord entries).
 * Final Jeopardy delta is appended as the last point when present.
 */
export function computeScoreTimeline(
  playerName: string,
  orderedRoundNames: RoundName[],
  game: NormalizedGame,
  clueStates: Record<string, ClueState>,
  players: Player[],
  dailyDoubleRecords: DailyDoubleRecord[],
): ScoreTimelinePoint[] {
  const points: ScoreTimelinePoint[] = [{ ordinal: 0, score: 0 }];
  let ordinal = 0;
  let runningScore = 0;

  // Build a lookup map for DD records by clue key for quick access
  const ddByKey = new Map<string, DailyDoubleRecord>();
  for (const record of dailyDoubleRecords) {
    if (record.playerName === playerName) {
      ddByKey.set(record.clueKey, record);
    }
  }

  // Iterate over all regular rounds in board order
  for (const roundName of orderedRoundNames) {
    const categories = game.rounds[roundName];
    if (!categories) continue;

    for (let catIdx = 0; catIdx < categories.length; catIdx++) {
      const category = categories[catIdx];
      for (let clueIdx = 0; clueIdx < category.clues.length; clueIdx++) {
        const clue = category.clues[clueIdx];
        const key = `${roundName}-${catIdx}-${clueIdx}`;
        const clueState = clueStates[key];
        if (!clueState) continue;

        const marking = clueState.playerMarkings[playerName];
        if (marking === null || marking === undefined) continue;

        let delta = 0;
        if (clue.dailyDouble) {
          // Use wager from the DD record for this player
          const ddRecord = ddByKey.get(key);
          if (ddRecord) {
            delta = marking === 'correct' ? ddRecord.wager : -ddRecord.wager;
          }
          // If no DD record found (shouldn't happen), delta stays 0
        } else {
          delta = marking === 'correct' ? clue.value : -clue.value;
        }

        runningScore += delta;
        ordinal++;
        points.push({ ordinal, score: runningScore });
      }
    }
  }

  // Append Final Jeopardy delta as the last point when present
  const player = players.find((p) => p.name === playerName);
  if (player && game.final) {
    const hasFjActivity =
      player.correctFinalJeopardy > 0 || player.incorrectFinalJeopardy > 0;
    if (hasFjActivity) {
      // FJ delta = final player score minus what we've accumulated so far
      const fjDelta = player.score - runningScore;
      runningScore += fjDelta;
      ordinal++;
      points.push({ ordinal, score: runningScore });
    }
  }

  return points;
}

// ─── computeCategoryAccuracy ─────────────────────────────────────────────────

/**
 * Computes per-category accuracy for a single player.
 * Aggregates same-named categories across rounds into a single row.
 * Omits categories where the player has zero non-null markings.
 * Includes a "Final Jeopardy" row when hasFinalJeopardy is true and the player
 * has at least one FJ marking.
 */
export function computeCategoryAccuracy(
  playerName: string,
  orderedRoundNames: RoundName[],
  game: NormalizedGame,
  clueStates: Record<string, ClueState>,
  hasFinalJeopardy: boolean,
  player: Player,
): CategoryAccuracyRow[] {
  // Use a map keyed by category name for aggregation
  const accMap = new Map<string, { correct: number; total: number }>();

  for (const roundName of orderedRoundNames) {
    const categories = game.rounds[roundName];
    if (!categories) continue;

    for (let catIdx = 0; catIdx < categories.length; catIdx++) {
      const category = categories[catIdx];
      const categoryName = category.category;

      for (let clueIdx = 0; clueIdx < category.clues.length; clueIdx++) {
        const key = `${roundName}-${catIdx}-${clueIdx}`;
        const clueState = clueStates[key];
        if (!clueState) continue;

        const marking = clueState.playerMarkings[playerName];
        if (marking === null || marking === undefined) continue;

        const existing = accMap.get(categoryName) ?? { correct: 0, total: 0 };
        accMap.set(categoryName, {
          correct: existing.correct + (marking === 'correct' ? 1 : 0),
          total: existing.total + 1,
        });
      }
    }
  }

  // Build result array from map, omitting zero-total entries
  const rows: CategoryAccuracyRow[] = [];
  for (const [category, counts] of accMap) {
    if (counts.total > 0) {
      rows.push({ category, correct: counts.correct, total: counts.total });
    }
  }

  // Add Final Jeopardy row if applicable
  if (hasFinalJeopardy) {
    const fjTotal = player.correctFinalJeopardy + player.incorrectFinalJeopardy;
    if (fjTotal > 0) {
      rows.push({
        category: 'Final Jeopardy',
        correct: player.correctFinalJeopardy,
        total: fjTotal,
      });
    }
  }

  return rows;
}

// ─── enrichDailyDoubleRecords ────────────────────────────────────────────────

/**
 * Enriches each DailyDoubleRecord with human-readable display fields:
 * - roundDisplayName: e.g. "Single Jeopardy"
 * - categoryName: from the game's category data
 * - clueValue: face value of the clue
 * - netImpact: +wager if correct, -wager if incorrect
 *
 * Output length always equals input length.
 *
 * Requirements: 6.2, 6.3, 6.4
 */
export function enrichDailyDoubleRecords(
  records: DailyDoubleRecord[],
  game: NormalizedGame,
  orderedRoundNames: RoundName[],
): EnrichedDDRecord[] {
  // orderedRoundNames is accepted for API consistency but round lookup is via game directly
  void orderedRoundNames;

  return records.map((record) => {
    // Parse clueKey: "${roundName}-${categoryIndex}-${clueIndex}"
    // RoundName values are single words (no hyphens), so splitting on '-' is safe:
    // parts[0] = roundName, parts[1] = catIdx, parts[2] = clueIdx
    const parts = record.clueKey.split('-');
    const roundName = parts[0] as RoundName;
    const catIdx = parseInt(parts[1], 10);
    const clueIdx = parseInt(parts[2], 10);

    const roundDisplayName = ROUND_LABELS[roundName] ?? roundName;

    const category = game.rounds[roundName]?.[catIdx];
    const categoryName = category?.category ?? '';
    const clueValue = category?.clues[clueIdx]?.value ?? 0;

    const netImpact =
      record.outcome === 'correct' ? record.wager : -record.wager;

    return {
      ...record,
      roundDisplayName,
      categoryName,
      clueValue,
      netImpact,
    };
  });
}

// ─── computeBiggestComebacks ─────────────────────────────────────────────────

/**
 * For each player timeline, computes delta = Math.max(0, finalScore - lowestScore).
 * Returns all players sorted by descending delta.
 * Caller should filter for delta > 0 before displaying.
 */
export function computeBiggestComebacks(
  timelines: Map<string, ScoreTimelinePoint[]>,
): { playerName: string; delta: number; lowestScore: number }[] {
  const results: { playerName: string; delta: number; lowestScore: number }[] = [];

  for (const [playerName, points] of timelines) {
    if (points.length === 0) continue;

    const scores = points.map((p) => p.score);
    const lowestScore = Math.min(...scores);
    const finalScore = scores[scores.length - 1];
    const delta = Math.max(0, finalScore - lowestScore);

    results.push({ playerName, delta, lowestScore });
  }

  // Sort by descending delta
  results.sort((a, b) => b.delta - a.delta);

  return results;
}

// ─── computeHeadToHead ───────────────────────────────────────────────────────

/**
 * Generates all unique unordered player pairs (n*(n-1)/2 total).
 * Within each pair, playerA comes before playerB alphabetically.
 * Computes correct/incorrect/DD stats from Player fields and DailyDoubleRecord entries.
 */
export function computeHeadToHead(
  players: Player[],
  dailyDoubleRecords: DailyDoubleRecord[],
): HeadToHeadResult[] {
  const results: HeadToHeadResult[] = [];

  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      // Sort alphabetically within the pair
      const [pa, pb] =
        players[i].name.localeCompare(players[j].name) <= 0
          ? [players[i], players[j]]
          : [players[j], players[i]];

      const ddA = dailyDoubleRecords.filter((r) => r.playerName === pa.name);
      const ddB = dailyDoubleRecords.filter((r) => r.playerName === pb.name);

      results.push({
        playerA: pa.name,
        playerB: pb.name,
        correctA: pa.correctCount,
        correctB: pb.correctCount,
        incorrectA: pa.incorrectCount,
        incorrectB: pb.incorrectCount,
        ddAttemptedA: ddA.length,
        ddAttemptedB: ddB.length,
        ddWonA: ddA.filter((r) => r.outcome === 'correct').length,
        ddWonB: ddB.filter((r) => r.outcome === 'correct').length,
        finalScoreA: pa.score,
        finalScoreB: pb.score,
      });
    }
  }

  return results;
}

// ─── computeLongestLossStreaks ────────────────────────────────────────────────

/**
 * For each player, finds the longest consecutive run of score-decreasing
 * timeline points (i.e., each step's delta < 0).
 * Returns: streakLength (number of losing answers in a row), totalLost (sum of
 * negative deltas across that streak), and lowestScore (the score at the end
 * of the streak).
 * Only players with streakLength >= 2 are included. Results are sorted by
 * descending streakLength, then descending totalLost.
 */
export function computeLongestLossStreaks(
  timelines: Map<string, ScoreTimelinePoint[]>,
): { playerName: string; streakLength: number; totalLost: number; lowestScore: number }[] {
  const results: { playerName: string; streakLength: number; totalLost: number; lowestScore: number }[] = [];

  for (const [playerName, points] of timelines) {
    if (points.length < 2) continue;

    let bestStreakLen = 0;
    let bestTotalLost = 0;
    let bestLowestScore = 0;

    let curStreakLen = 0;
    let curTotalLost = 0;

    for (let i = 1; i < points.length; i++) {
      const delta = points[i].score - points[i - 1].score;
      if (delta < 0) {
        curStreakLen++;
        curTotalLost += delta; // delta is negative, so this accumulates loss
        if (curStreakLen > bestStreakLen) {
          bestStreakLen = curStreakLen;
          bestTotalLost = curTotalLost;
          bestLowestScore = points[i].score;
        }
      } else {
        curStreakLen = 0;
        curTotalLost = 0;
      }
    }

    if (bestStreakLen >= 2) {
      results.push({
        playerName,
        streakLength: bestStreakLen,
        totalLost: Math.abs(bestTotalLost),
        lowestScore: bestLowestScore,
      });
    }
  }

  results.sort((a, b) => b.streakLength - a.streakLength || b.totalLost - a.totalLost);
  return results;
}

// ─── computeAllAnalytics ─────────────────────────────────────────────────────

/**
 * Single entry point called by AnalyticsScreen.
 * Calls all individual analytics functions and returns the aggregated result.
 *
 * Requirements: 3.2, 3.3, 10.1
 */
export function computeAllAnalytics(session: GameSession): ComputedAnalytics {
  const { game, players, orderedRoundNames, clueStates, dailyDoubleRecords } = session;

  const hasFinalJeopardy = Boolean(game.final?.clue);

  // Sort players by descending score; stable (preserves insertion order for ties)
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

  // Compute score timelines for all players
  const scoreTimelines = new Map<string, ScoreTimelinePoint[]>();
  for (const player of players) {
    scoreTimelines.set(
      player.name,
      computeScoreTimeline(
        player.name,
        orderedRoundNames,
        game,
        clueStates,
        players,
        dailyDoubleRecords,
      ),
    );
  }

  // Compute category accuracy for all players
  const categoryAccuracy = new Map<string, CategoryAccuracyRow[]>();
  for (const player of players) {
    categoryAccuracy.set(
      player.name,
      computeCategoryAccuracy(
        player.name,
        orderedRoundNames,
        game,
        clueStates,
        hasFinalJeopardy,
        player,
      ),
    );
  }

  // Enrich daily double records
  const dailyDoubleRecordsEnriched = enrichDailyDoubleRecords(
    dailyDoubleRecords,
    game,
    orderedRoundNames,
  );

  // Compute biggest comebacks
  const biggestComebacks = computeBiggestComebacks(scoreTimelines);

  // Compute longest loss streaks
  const longestLossStreaks = computeLongestLossStreaks(scoreTimelines);

  // Compute head-to-head comparisons (only meaningful for 2+ players)
  const headToHeads =
    players.length >= 2 ? computeHeadToHead(players, dailyDoubleRecords) : [];

  return {
    sortedPlayers,
    scoreTimelines,
    categoryAccuracy,
    dailyDoubleRecordsEnriched,
    biggestComebacks,
    longestLossStreaks,
    headToHeads,
  };
}
