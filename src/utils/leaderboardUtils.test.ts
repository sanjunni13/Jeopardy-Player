import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { computeRate, formatCurrency, sortPlayers, getSortValue } from './leaderboardUtils';
import type { PlayerRow, SortableColumn } from './leaderboardUtils';

const playerRowArb = fc.record({
  id: fc.uuid(),
  player_name: fc.string({ minLength: 1, maxLength: 20 }),
  total_games_played: fc.nat({ max: 1000 }),
  total_games_won: fc.nat({ max: 1000 }),
  total_correct_answers: fc.nat({ max: 10000 }),
  total_incorrect_answers: fc.nat({ max: 10000 }),
  total_correct_daily_doubles: fc.nat({ max: 500 }),
  total_incorrect_daily_doubles: fc.nat({ max: 500 }),
  total_correct_final_jeopardies: fc.nat({ max: 500 }),
  total_incorrect_final_jeopardies: fc.nat({ max: 500 }),
  current_balance: fc.integer({ min: -1000000, max: 1000000 }),
  total_money_earned: fc.nat({ max: 10000000 }),
});

const sortableColumnArb: fc.Arbitrary<SortableColumn> = fc.constantFrom(
  'player_name',
  'win_rate',
  'total_games_played',
  'accuracy_rate',
  'fj_accuracy_rate',
  'total_money_earned',
  'current_balance',
);

const directionArb: fc.Arbitrary<'asc' | 'desc'> = fc.constantFrom('asc', 'desc');

describe('sortPlayers', () => {
  /**
   * Feature: scores-leaderboard, Property 3: Sort order correctness
   * Validates: Requirements 4.2, 4.7, 4.8
   */
  it('should preserve array length after sorting', () => {
    fc.assert(
      fc.property(
        fc.array(playerRowArb, { minLength: 0, maxLength: 50 }),
        sortableColumnArb,
        directionArb,
        (players, column, direction) => {
          const sorted = sortPlayers(players, column, direction);
          expect(sorted.length).toBe(players.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should satisfy ordering constraint for every adjacent pair', () => {
    fc.assert(
      fc.property(
        fc.array(playerRowArb, { minLength: 2, maxLength: 50 }),
        sortableColumnArb,
        directionArb,
        (players, column, direction) => {
          const sorted = sortPlayers(players, column, direction);

          for (let i = 0; i < sorted.length - 1; i++) {
            const aVal = getSortValue(sorted[i], column);
            const bVal = getSortValue(sorted[i + 1], column);

            let cmp: number;
            if (typeof aVal === 'string' && typeof bVal === 'string') {
              cmp = aVal.localeCompare(bVal);
            } else {
              cmp = (aVal as number) - (bVal as number);
            }

            if (direction === 'asc') {
              expect(cmp).toBeLessThanOrEqual(0);
            } else {
              expect(cmp).toBeGreaterThanOrEqual(0);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should sort tied elements by player_name in ascending order', () => {
    fc.assert(
      fc.property(
        fc.array(playerRowArb, { minLength: 2, maxLength: 50 }),
        sortableColumnArb,
        directionArb,
        (players, column, direction) => {
          const sorted = sortPlayers(players, column, direction);

          for (let i = 0; i < sorted.length - 1; i++) {
            const aVal = getSortValue(sorted[i], column);
            const bVal = getSortValue(sorted[i + 1], column);

            const areEqual =
              typeof aVal === 'string' && typeof bVal === 'string'
                ? aVal === bVal
                : aVal === bVal;

            if (areEqual) {
              expect(
                sorted[i].player_name.localeCompare(sorted[i + 1].player_name),
              ).toBeLessThanOrEqual(0);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePlayer(overrides: Partial<PlayerRow> = {}): PlayerRow {
  return {
    id: '1',
    player_name: 'Test Player',
    total_games_played: 10,
    total_games_won: 5,
    total_correct_answers: 50,
    total_incorrect_answers: 20,
    total_correct_daily_doubles: 3,
    total_incorrect_daily_doubles: 1,
    total_correct_final_jeopardies: 4,
    total_incorrect_final_jeopardies: 2,
    current_balance: 10000,
    total_money_earned: 25000,
    ...overrides,
  };
}

// ─── Edge Cases ───────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('computeRate(0, 0) returns 0', () => {
    expect(computeRate(0, 0)).toBe(0);
  });

  it('formatCurrency(-3200) returns "-$3,200"', () => {
    expect(formatCurrency(-3200)).toBe('-$3,200');
  });

  it('formatCurrency(0) returns "$0"', () => {
    expect(formatCurrency(0)).toBe('$0');
  });

  it('sortPlayers with empty array returns empty array', () => {
    expect(sortPlayers([], 'total_money_earned', 'desc')).toEqual([]);
  });

  it('sortPlayers with single element returns same element', () => {
    const player = makePlayer({ player_name: 'Solo Player' });
    const result = sortPlayers([player], 'total_money_earned', 'desc');
    expect(result).toEqual([player]);
  });
});
