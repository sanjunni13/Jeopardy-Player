import { describe, it, expect } from 'vitest';
import {
  computeScoreTimeline,
  computeCategoryAccuracy,
  enrichDailyDoubleRecords,
  computeBiggestComebacks,
  computeHeadToHead,
  computeAllAnalytics,
  ROUND_LABELS,
} from './analyticsUtils';
import type {
  NormalizedGame,
  Player,
  GameSession,
  ClueState,
  DailyDoubleRecord,
  RoundName,
} from '../types/game';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    name: 'Alice',
    score: 0,
    correctCount: 0,
    incorrectCount: 0,
    correctDailyDoubles: 0,
    incorrectDailyDoubles: 0,
    correctFinalJeopardy: 0,
    incorrectFinalJeopardy: 0,
    totalEarned: 0,
    ...overrides,
  };
}

/** Minimal NormalizedGame with one Single round (2 categories × 2 clues). */
function makeGame(hasFinal = false): NormalizedGame {
  return {
    rounds: {
      single: [
        {
          category: 'History',
          clues: [
            { value: 200, clue: 'Q1', solution: 'A1', dailyDouble: false, html: false },
            { value: 400, clue: 'Q2', solution: 'A2', dailyDouble: false, html: false },
          ],
        },
        {
          category: 'Science',
          clues: [
            { value: 200, clue: 'Q3', solution: 'A3', dailyDouble: false, html: false },
            { value: 400, clue: 'Q4', solution: 'A4', dailyDouble: false, html: false },
          ],
        },
      ],
    } as unknown as NormalizedGame['rounds'],
    final: hasFinal
      ? { category: 'Final', clue: 'FQ', solution: 'FA', html: false }
      : (null as unknown as NormalizedGame['final']),
    totalRounds: 1,
  };
}

/** Build a clueStates record for the single round of makeGame(). */
function makeClueStates(
  aliceMarkings: Array<'correct' | 'incorrect' | null>,
  bobMarkings?: Array<'correct' | 'incorrect' | null>,
): Record<string, ClueState> {
  const keys = ['single-0-0', 'single-0-1', 'single-1-0', 'single-1-1'];
  const states: Record<string, ClueState> = {};
  keys.forEach((key, i) => {
    const playerMarkings: Record<string, 'correct' | 'incorrect' | null> = {
      Alice: aliceMarkings[i] ?? null,
    };
    if (bobMarkings) {
      playerMarkings['Bob'] = bobMarkings[i] ?? null;
    }
    states[key] = { chosen: true, playerMarkings };
  });
  return states;
}

function makeSession(overrides: Partial<GameSession> = {}): GameSession {
  const game = makeGame();
  return {
    game,
    gameId: 'test-game',
    players: [makePlayer({ name: 'Alice', score: 0 })],
    currentRoundIndex: 0,
    orderedRoundNames: ['single'] as RoundName[],
    clueStates: {},
    dailyDoubleRecords: [],
    ...overrides,
  };
}

// ─── computeScoreTimeline ─────────────────────────────────────────────────────

describe('computeScoreTimeline', () => {
  it('returns only the origin point for an empty session (no answered clues)', () => {
    const game = makeGame();
    const player = makePlayer({ name: 'Alice', score: 0 });
    const clueStates = makeClueStates([null, null, null, null]);

    const timeline = computeScoreTimeline(
      'Alice',
      ['single'],
      game,
      clueStates,
      [player],
      [],
    );

    expect(timeline).toEqual([{ ordinal: 0, score: 0 }]);
  });

  it('first point is always { ordinal: 0, score: 0 }', () => {
    const game = makeGame();
    const player = makePlayer({ name: 'Alice', score: 200 });
    const clueStates = makeClueStates(['correct', null, null, null]);

    const timeline = computeScoreTimeline('Alice', ['single'], game, clueStates, [player], []);

    expect(timeline[0]).toEqual({ ordinal: 0, score: 0 });
  });

  it('single player with some correct answers accumulates score correctly', () => {
    const game = makeGame();
    // clue values: single-0-0=200, single-0-1=400, single-1-0=200, single-1-1=400
    const player = makePlayer({ name: 'Alice', score: 600 });
    const clueStates = makeClueStates(['correct', 'incorrect', 'correct', null]);

    const timeline = computeScoreTimeline('Alice', ['single'], game, clueStates, [player], []);

    expect(timeline).toEqual([
      { ordinal: 0, score: 0 },
      { ordinal: 1, score: 200 },   // correct 200
      { ordinal: 2, score: -200 },  // incorrect 400
      { ordinal: 3, score: 0 },     // correct 200
    ]);
  });

  it('all null markings produce a flat line (only origin point)', () => {
    const game = makeGame();
    const player = makePlayer({ name: 'Alice', score: 0 });
    const clueStates = makeClueStates([null, null, null, null]);

    const timeline = computeScoreTimeline('Alice', ['single'], game, clueStates, [player], []);

    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toEqual({ ordinal: 0, score: 0 });
  });

  it('ordinals are strictly increasing', () => {
    const game = makeGame();
    const player = makePlayer({ name: 'Alice', score: 600 });
    const clueStates = makeClueStates(['correct', 'correct', 'incorrect', 'correct']);

    const timeline = computeScoreTimeline('Alice', ['single'], game, clueStates, [player], []);

    for (let i = 1; i < timeline.length; i++) {
      expect(timeline[i].ordinal).toBeGreaterThan(timeline[i - 1].ordinal);
    }
  });

  it('uses DD wager instead of clue value for Daily Double clues', () => {
    const game: NormalizedGame = {
      rounds: {
        single: [
          {
            category: 'History',
            clues: [
              { value: 200, clue: 'Q1', solution: 'A1', dailyDouble: true, html: false },
              { value: 400, clue: 'Q2', solution: 'A2', dailyDouble: false, html: false },
            ],
          },
        ],
      } as unknown as NormalizedGame['rounds'],
      final: null as unknown as NormalizedGame['final'],
      totalRounds: 1,
    };
    const player = makePlayer({ name: 'Alice', score: 1000 });
    const clueStates: Record<string, ClueState> = {
      'single-0-0': { chosen: true, playerMarkings: { Alice: 'correct' } },
      'single-0-1': { chosen: true, playerMarkings: { Alice: 'correct' } },
    };
    const ddRecords: DailyDoubleRecord[] = [
      { clueKey: 'single-0-0', playerName: 'Alice', wager: 600, outcome: 'correct' },
    ];

    const timeline = computeScoreTimeline('Alice', ['single'], game, clueStates, [player], ddRecords);

    expect(timeline[1]).toEqual({ ordinal: 1, score: 600 }); // wager 600 used, not clue value 200
    expect(timeline[2]).toEqual({ ordinal: 2, score: 1000 }); // clue value 400
  });

  it('DD wager of 0 produces netImpact of 0 regardless of outcome', () => {
    const game: NormalizedGame = {
      rounds: {
        single: [
          {
            category: 'History',
            clues: [
              { value: 200, clue: 'Q1', solution: 'A1', dailyDouble: true, html: false },
            ],
          },
        ],
      } as unknown as NormalizedGame['rounds'],
      final: null as unknown as NormalizedGame['final'],
      totalRounds: 1,
    };
    const player = makePlayer({ name: 'Alice', score: 0 });
    const clueStates: Record<string, ClueState> = {
      'single-0-0': { chosen: true, playerMarkings: { Alice: 'correct' } },
    };
    const ddRecords: DailyDoubleRecord[] = [
      { clueKey: 'single-0-0', playerName: 'Alice', wager: 0, outcome: 'correct' },
    ];

    const timeline = computeScoreTimeline('Alice', ['single'], game, clueStates, [player], ddRecords);

    expect(timeline[1]).toEqual({ ordinal: 1, score: 0 }); // wager 0 → no change
  });

  it('FJ present: appends FJ delta as final point', () => {
    const game = makeGame(true);
    // Player answered 1 correct regular clue (200), then got FJ correct for +800 → final score 1000
    const player = makePlayer({
      name: 'Alice',
      score: 1000,
      correctFinalJeopardy: 1,
      incorrectFinalJeopardy: 0,
    });
    const clueStates = makeClueStates(['correct', null, null, null]);

    const timeline = computeScoreTimeline('Alice', ['single'], game, clueStates, [player], []);

    const lastPoint = timeline[timeline.length - 1];
    expect(lastPoint.score).toBe(1000);
    // At least 3 points: origin, one regular clue, FJ
    expect(timeline.length).toBe(3);
  });

  it('FJ absent: no FJ point appended', () => {
    const game = makeGame(false);
    const player = makePlayer({ name: 'Alice', score: 200 });
    const clueStates = makeClueStates(['correct', null, null, null]);

    const timeline = computeScoreTimeline('Alice', ['single'], game, clueStates, [player], []);

    expect(timeline).toHaveLength(2); // origin + one clue
  });
});

// ─── computeCategoryAccuracy ──────────────────────────────────────────────────

describe('computeCategoryAccuracy', () => {
  it('returns empty array when no clues are answered', () => {
    const game = makeGame();
    const player = makePlayer({ name: 'Alice' });
    const clueStates = makeClueStates([null, null, null, null]);

    const rows = computeCategoryAccuracy('Alice', ['single'], game, clueStates, false, player);

    expect(rows).toHaveLength(0);
  });

  it('omits categories where the player has zero non-null markings', () => {
    const game = makeGame();
    const player = makePlayer({ name: 'Alice', score: 200, correctCount: 1 });
    // Only answers clues in 'History' (index 0), not 'Science' (index 1)
    const clueStates = makeClueStates(['correct', null, null, null]);

    const rows = computeCategoryAccuracy('Alice', ['single'], game, clueStates, false, player);

    expect(rows).toHaveLength(1);
    expect(rows[0].category).toBe('History');
  });

  it('correct count never exceeds total count', () => {
    const game = makeGame();
    const player = makePlayer({ name: 'Alice', score: 0, correctCount: 1, incorrectCount: 3 });
    const clueStates = makeClueStates(['correct', 'incorrect', 'incorrect', 'incorrect']);

    const rows = computeCategoryAccuracy('Alice', ['single'], game, clueStates, false, player);

    for (const row of rows) {
      expect(row.correct).toBeLessThanOrEqual(row.total);
    }
  });

  it('every returned row has total >= 1', () => {
    const game = makeGame();
    const player = makePlayer({ name: 'Alice', score: 200, correctCount: 2 });
    const clueStates = makeClueStates(['correct', 'correct', null, null]);

    const rows = computeCategoryAccuracy('Alice', ['single'], game, clueStates, false, player);

    for (const row of rows) {
      expect(row.total).toBeGreaterThanOrEqual(1);
    }
  });

  it('merges same-named categories across rounds into a single row', () => {
    // Two rounds both named "History"
    const game: NormalizedGame = {
      rounds: {
        single: [{ category: 'History', clues: [{ value: 200, clue: 'Q', solution: 'A', dailyDouble: false, html: false }] }],
        double: [{ category: 'History', clues: [{ value: 400, clue: 'Q', solution: 'A', dailyDouble: false, html: false }] }],
      } as unknown as NormalizedGame['rounds'],
      final: null as unknown as NormalizedGame['final'],
      totalRounds: 2,
    };
    const player = makePlayer({ name: 'Alice', score: 600, correctCount: 2 });
    const clueStates: Record<string, ClueState> = {
      'single-0-0': { chosen: true, playerMarkings: { Alice: 'correct' } },
      'double-0-0': { chosen: true, playerMarkings: { Alice: 'correct' } },
    };

    const rows = computeCategoryAccuracy('Alice', ['single', 'double'], game, clueStates, false, player);

    expect(rows).toHaveLength(1);
    expect(rows[0].category).toBe('History');
    expect(rows[0].correct).toBe(2);
    expect(rows[0].total).toBe(2);
  });

  it('includes FJ row when hasFinalJeopardy=true and player has FJ activity', () => {
    const game = makeGame(true);
    const player = makePlayer({
      name: 'Alice',
      score: 1000,
      correctFinalJeopardy: 1,
      incorrectFinalJeopardy: 0,
    });
    const clueStates = makeClueStates([null, null, null, null]);

    const rows = computeCategoryAccuracy('Alice', ['single'], game, clueStates, true, player);

    const fjRow = rows.find((r) => r.category === 'Final Jeopardy');
    expect(fjRow).toBeDefined();
    expect(fjRow?.correct).toBe(1);
    expect(fjRow?.total).toBe(1);
  });

  it('omits FJ row when hasFinalJeopardy=false', () => {
    const game = makeGame(false);
    const player = makePlayer({ name: 'Alice' });
    const clueStates = makeClueStates([null, null, null, null]);

    const rows = computeCategoryAccuracy('Alice', ['single'], game, clueStates, false, player);

    expect(rows.find((r) => r.category === 'Final Jeopardy')).toBeUndefined();
  });

  it('omits FJ row when hasFinalJeopardy=true but player has no FJ activity', () => {
    const game = makeGame(true);
    const player = makePlayer({
      name: 'Alice',
      correctFinalJeopardy: 0,
      incorrectFinalJeopardy: 0,
    });
    const clueStates = makeClueStates([null, null, null, null]);

    const rows = computeCategoryAccuracy('Alice', ['single'], game, clueStates, true, player);

    expect(rows.find((r) => r.category === 'Final Jeopardy')).toBeUndefined();
  });
});

// ─── enrichDailyDoubleRecords ────────────────────────────────────────────────

describe('enrichDailyDoubleRecords', () => {
  const game: NormalizedGame = {
    rounds: {
      single: [
        {
          category: 'History',
          clues: [
            { value: 200, clue: 'Q1', solution: 'A1', dailyDouble: true, html: false },
            { value: 400, clue: 'Q2', solution: 'A2', dailyDouble: false, html: false },
          ],
        },
      ],
    } as unknown as NormalizedGame['rounds'],
    final: null as unknown as NormalizedGame['final'],
    totalRounds: 1,
  };

  it('returns empty array for empty input', () => {
    const result = enrichDailyDoubleRecords([], game, ['single']);
    expect(result).toEqual([]);
  });

  it('output length equals input length', () => {
    const records: DailyDoubleRecord[] = [
      { clueKey: 'single-0-0', playerName: 'Alice', wager: 500, outcome: 'correct' },
    ];
    const result = enrichDailyDoubleRecords(records, game, ['single']);
    expect(result).toHaveLength(1);
  });

  it('netImpact is positive (=wager) when outcome is correct', () => {
    const records: DailyDoubleRecord[] = [
      { clueKey: 'single-0-0', playerName: 'Alice', wager: 800, outcome: 'correct' },
    ];
    const result = enrichDailyDoubleRecords(records, game, ['single']);
    expect(result[0].netImpact).toBe(800);
  });

  it('netImpact is negative (-wager) when outcome is incorrect', () => {
    const records: DailyDoubleRecord[] = [
      { clueKey: 'single-0-0', playerName: 'Alice', wager: 800, outcome: 'incorrect' },
    ];
    const result = enrichDailyDoubleRecords(records, game, ['single']);
    expect(result[0].netImpact).toBe(-800);
  });

  it('netImpact is 0 when wager is 0 (regardless of outcome)', () => {
    const recordCorrect: DailyDoubleRecord = {
      clueKey: 'single-0-0', playerName: 'Alice', wager: 0, outcome: 'correct',
    };
    const recordIncorrect: DailyDoubleRecord = {
      clueKey: 'single-0-0', playerName: 'Alice', wager: 0, outcome: 'incorrect',
    };

    const [r1] = enrichDailyDoubleRecords([recordCorrect], game, ['single']);
    const [r2] = enrichDailyDoubleRecords([recordIncorrect], game, ['single']);

    expect(r1.netImpact).toBe(0);
    // -0 * 1 === 0 in IEEE 754; both represent "no score change"
    expect(Math.abs(r2.netImpact)).toBe(0);
  });

  it('roundDisplayName matches ROUND_LABELS', () => {
    const records: DailyDoubleRecord[] = [
      { clueKey: 'single-0-0', playerName: 'Alice', wager: 200, outcome: 'correct' },
    ];
    const result = enrichDailyDoubleRecords(records, game, ['single']);
    expect(result[0].roundDisplayName).toBe(ROUND_LABELS.single);
  });

  it('categoryName and clueValue are resolved from game data', () => {
    const records: DailyDoubleRecord[] = [
      { clueKey: 'single-0-0', playerName: 'Alice', wager: 200, outcome: 'correct' },
    ];
    const result = enrichDailyDoubleRecords(records, game, ['single']);
    expect(result[0].categoryName).toBe('History');
    expect(result[0].clueValue).toBe(200);
  });

  it('preserves all original record fields in enriched output', () => {
    const record: DailyDoubleRecord = {
      clueKey: 'single-0-0', playerName: 'Bob', wager: 1200, outcome: 'incorrect',
    };
    const [result] = enrichDailyDoubleRecords([record], game, ['single']);
    expect(result.clueKey).toBe(record.clueKey);
    expect(result.playerName).toBe(record.playerName);
    expect(result.wager).toBe(record.wager);
    expect(result.outcome).toBe(record.outcome);
  });
});

// ─── computeBiggestComebacks ─────────────────────────────────────────────────

describe('computeBiggestComebacks', () => {
  it('returns empty array for empty timelines map', () => {
    const result = computeBiggestComebacks(new Map());
    expect(result).toEqual([]);
  });

  it('delta is non-negative for a player whose score only rises', () => {
    const timelines = new Map([
      ['Alice', [{ ordinal: 0, score: 0 }, { ordinal: 1, score: 200 }, { ordinal: 2, score: 600 }]],
    ]);
    const result = computeBiggestComebacks(timelines);
    expect(result[0].delta).toBeGreaterThanOrEqual(0);
  });

  it('delta = finalScore - lowestScore when score dips then recovers', () => {
    const timelines = new Map([
      ['Alice', [
        { ordinal: 0, score: 0 },
        { ordinal: 1, score: -400 },  // lowest
        { ordinal: 2, score: 200 },   // final
      ]],
    ]);
    const result = computeBiggestComebacks(timelines);
    expect(result[0].delta).toBe(600); // 200 - (-400)
    expect(result[0].lowestScore).toBe(-400);
  });

  it('delta is 0 when final score is below the lowest (net decline — no comeback)', () => {
    const timelines = new Map([
      ['Alice', [
        { ordinal: 0, score: 0 },
        { ordinal: 1, score: 800 },
        { ordinal: 2, score: 200 }, // ended lower than peak but above 0
      ]],
    ]);
    const result = computeBiggestComebacks(timelines);
    // lowest is 0 (origin), final is 200, delta = max(0, 200-0) = 200
    expect(result[0].delta).toBe(200);
  });

  it('delta is clamped to 0 when final score <= lowest score', () => {
    const timelines = new Map([
      ['Alice', [
        { ordinal: 0, score: 0 },
        { ordinal: 1, score: 1000 }, // peak
        { ordinal: 2, score: -200 }, // final below lowest
      ]],
    ]);
    const result = computeBiggestComebacks(timelines);
    // lowest = -200 (final is also -200), delta = max(0, -200 - (-200)) = 0
    expect(result[0].delta).toBeGreaterThanOrEqual(0);
  });

  it('tied comebacks — both players appear in results', () => {
    const timelines = new Map([
      ['Alice', [{ ordinal: 0, score: 0 }, { ordinal: 1, score: -500 }, { ordinal: 2, score: 500 }]],
      ['Bob',   [{ ordinal: 0, score: 0 }, { ordinal: 1, score: -500 }, { ordinal: 2, score: 500 }]],
    ]);
    const result = computeBiggestComebacks(timelines);
    expect(result).toHaveLength(2);
    expect(result[0].delta).toBe(result[1].delta);
    const names = result.map((r) => r.playerName);
    expect(names).toContain('Alice');
    expect(names).toContain('Bob');
  });

  it('results are sorted by descending delta', () => {
    const timelines = new Map([
      ['Alice', [{ ordinal: 0, score: 0 }, { ordinal: 1, score: -200 }, { ordinal: 2, score: 400 }]],
      ['Bob',   [{ ordinal: 0, score: 0 }, { ordinal: 1, score: -800 }, { ordinal: 2, score: 1000 }]],
    ]);
    const result = computeBiggestComebacks(timelines);
    expect(result[0].delta).toBeGreaterThanOrEqual(result[1].delta);
  });
});

// ─── computeHeadToHead ───────────────────────────────────────────────────────

describe('computeHeadToHead', () => {
  it('returns empty array for fewer than 2 players (handled by caller)', () => {
    const players = [makePlayer({ name: 'Alice', score: 100, correctCount: 1 })];
    const result = computeHeadToHead(players, []);
    expect(result).toHaveLength(0);
  });

  it('returns 1 result for 2 players', () => {
    const players = [
      makePlayer({ name: 'Alice', score: 200, correctCount: 1 }),
      makePlayer({ name: 'Bob', score: 400, correctCount: 2 }),
    ];
    const result = computeHeadToHead(players, []);
    expect(result).toHaveLength(1);
  });

  it('returns n*(n-1)/2 results for n players', () => {
    const players = [
      makePlayer({ name: 'Alice', score: 200 }),
      makePlayer({ name: 'Bob', score: 400 }),
      makePlayer({ name: 'Carol', score: 600 }),
      makePlayer({ name: 'Dave', score: 800 }),
    ];
    const result = computeHeadToHead(players, []);
    expect(result).toHaveLength(6); // 4*(4-1)/2
  });

  it('playerA is alphabetically before playerB in every result', () => {
    const players = [
      makePlayer({ name: 'Zara', score: 200 }),
      makePlayer({ name: 'Alice', score: 400 }),
    ];
    const result = computeHeadToHead(players, []);
    expect(result[0].playerA).toBe('Alice');
    expect(result[0].playerB).toBe('Zara');
  });

  it('alphabetical ordering is independent of insertion order', () => {
    const players1 = [
      makePlayer({ name: 'Charlie' }),
      makePlayer({ name: 'Alice' }),
      makePlayer({ name: 'Bob' }),
    ];
    const players2 = [
      makePlayer({ name: 'Alice' }),
      makePlayer({ name: 'Bob' }),
      makePlayer({ name: 'Charlie' }),
    ];

    const result1 = computeHeadToHead(players1, []);
    const result2 = computeHeadToHead(players2, []);

    // Both should produce pairs with playerA < playerB alphabetically
    result1.forEach((r) => expect(r.playerA.localeCompare(r.playerB)).toBeLessThan(0));
    result2.forEach((r) => expect(r.playerA.localeCompare(r.playerB)).toBeLessThan(0));
  });

  it('ddAttemptedA counts DD records for playerA', () => {
    const players = [
      makePlayer({ name: 'Alice', score: 200 }),
      makePlayer({ name: 'Bob', score: 400 }),
    ];
    const ddRecords: DailyDoubleRecord[] = [
      { clueKey: 'single-0-0', playerName: 'Alice', wager: 200, outcome: 'correct' },
      { clueKey: 'single-0-1', playerName: 'Alice', wager: 400, outcome: 'incorrect' },
      { clueKey: 'single-1-0', playerName: 'Bob', wager: 600, outcome: 'correct' },
    ];
    const result = computeHeadToHead(players, ddRecords);
    const pair = result[0]; // Alice vs Bob

    expect(pair.playerA).toBe('Alice');
    expect(pair.ddAttemptedA).toBe(2);
    expect(pair.ddWonA).toBe(1);
    expect(pair.ddAttemptedB).toBe(1);
    expect(pair.ddWonB).toBe(1);
  });

  it('final scores are populated from Player.score', () => {
    const players = [
      makePlayer({ name: 'Alice', score: 1200 }),
      makePlayer({ name: 'Bob', score: 800 }),
    ];
    const result = computeHeadToHead(players, []);
    expect(result[0].finalScoreA).toBe(1200);
    expect(result[0].finalScoreB).toBe(800);
  });

  it('correct and incorrect counts come from Player fields', () => {
    const players = [
      makePlayer({ name: 'Alice', score: 200, correctCount: 3, incorrectCount: 1 }),
      makePlayer({ name: 'Bob', score: 400, correctCount: 5, incorrectCount: 2 }),
    ];
    const result = computeHeadToHead(players, []);
    expect(result[0].correctA).toBe(3);
    expect(result[0].incorrectA).toBe(1);
    expect(result[0].correctB).toBe(5);
    expect(result[0].incorrectB).toBe(2);
  });
});

// ─── computeAllAnalytics ─────────────────────────────────────────────────────

describe('computeAllAnalytics', () => {
  it('players are sorted by descending final score', () => {
    const game = makeGame();
    const session = makeSession({
      game,
      players: [
        makePlayer({ name: 'Charlie', score: 400 }),
        makePlayer({ name: 'Alice', score: 1200 }),
        makePlayer({ name: 'Bob', score: 800 }),
      ],
      clueStates: makeClueStates([null, null, null, null], [null, null, null, null]),
    });

    const { sortedPlayers } = computeAllAnalytics(session);

    expect(sortedPlayers[0].name).toBe('Alice');
    expect(sortedPlayers[1].name).toBe('Bob');
    expect(sortedPlayers[2].name).toBe('Charlie');
  });

  it('tied scores maintain insertion order (stable sort)', () => {
    const game = makeGame();
    const session = makeSession({
      game,
      players: [
        makePlayer({ name: 'Alice', score: 500 }),
        makePlayer({ name: 'Bob', score: 500 }),
        makePlayer({ name: 'Carol', score: 500 }),
      ],
      clueStates: makeClueStates([null, null, null, null]),
    });

    const { sortedPlayers } = computeAllAnalytics(session);

    // All have the same score; insertion order (Alice, Bob, Carol) should be preserved
    expect(sortedPlayers[0].name).toBe('Alice');
    expect(sortedPlayers[1].name).toBe('Bob');
    expect(sortedPlayers[2].name).toBe('Carol');
  });

  it('scoreTimelines map has an entry for every player', () => {
    const game = makeGame();
    const players = [
      makePlayer({ name: 'Alice', score: 200 }),
      makePlayer({ name: 'Bob', score: 400 }),
    ];
    const session = makeSession({
      game,
      players,
      clueStates: makeClueStates([null, null, null, null], [null, null, null, null]),
    });

    const { scoreTimelines } = computeAllAnalytics(session);

    expect(scoreTimelines.has('Alice')).toBe(true);
    expect(scoreTimelines.has('Bob')).toBe(true);
  });

  it('categoryAccuracy map has an entry for every player', () => {
    const game = makeGame();
    const players = [
      makePlayer({ name: 'Alice', score: 0 }),
      makePlayer({ name: 'Bob', score: 0 }),
    ];
    const session = makeSession({
      game,
      players,
      clueStates: makeClueStates([null, null, null, null], [null, null, null, null]),
    });

    const { categoryAccuracy } = computeAllAnalytics(session);

    expect(categoryAccuracy.has('Alice')).toBe(true);
    expect(categoryAccuracy.has('Bob')).toBe(true);
  });

  it('headToHeads is empty when only one player', () => {
    const game = makeGame();
    const session = makeSession({
      game,
      players: [makePlayer({ name: 'Alice', score: 200 })],
      clueStates: makeClueStates([null, null, null, null]),
    });

    const { headToHeads } = computeAllAnalytics(session);

    expect(headToHeads).toHaveLength(0);
  });

  it('FJ present: hasFinalJeopardy is true and affects category accuracy', () => {
    const game = makeGame(true);
    const player = makePlayer({
      name: 'Alice',
      score: 1000,
      correctFinalJeopardy: 1,
      incorrectFinalJeopardy: 0,
    });
    const session = makeSession({
      game,
      players: [player],
      clueStates: makeClueStates([null, null, null, null]),
    });

    const { categoryAccuracy } = computeAllAnalytics(session);
    const aliceRows = categoryAccuracy.get('Alice') ?? [];
    const fjRow = aliceRows.find((r) => r.category === 'Final Jeopardy');

    expect(fjRow).toBeDefined();
  });

  it('FJ absent: no Final Jeopardy row in accuracy', () => {
    const game = makeGame(false);
    const player = makePlayer({ name: 'Alice', score: 0 });
    const session = makeSession({
      game,
      players: [player],
      clueStates: makeClueStates([null, null, null, null]),
    });

    const { categoryAccuracy } = computeAllAnalytics(session);
    const aliceRows = categoryAccuracy.get('Alice') ?? [];
    const fjRow = aliceRows.find((r) => r.category === 'Final Jeopardy');

    expect(fjRow).toBeUndefined();
  });

  it('dailyDoubleRecordsEnriched length equals dailyDoubleRecords length', () => {
    const game: NormalizedGame = {
      rounds: {
        single: [
          {
            category: 'History',
            clues: [
              { value: 200, clue: 'Q', solution: 'A', dailyDouble: true, html: false },
            ],
          },
        ],
      } as unknown as NormalizedGame['rounds'],
      final: null as unknown as NormalizedGame['final'],
      totalRounds: 1,
    };
    const ddRecords: DailyDoubleRecord[] = [
      { clueKey: 'single-0-0', playerName: 'Alice', wager: 400, outcome: 'correct' },
    ];
    const session = makeSession({
      game,
      players: [makePlayer({ name: 'Alice', score: 400 })],
      orderedRoundNames: ['single'],
      clueStates: { 'single-0-0': { chosen: true, playerMarkings: { Alice: 'correct' } } },
      dailyDoubleRecords: ddRecords,
    });

    const { dailyDoubleRecordsEnriched } = computeAllAnalytics(session);

    expect(dailyDoubleRecordsEnriched).toHaveLength(1);
  });
});
