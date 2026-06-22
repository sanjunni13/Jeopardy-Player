import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { getCheatSheetRounds, getRoundAnswers, getFinalJeopardyAnswer } from './cheatSheetUtils';
import type { NormalizedGame, RoundName, Category, Clue, FinalRound } from '../../types/game';

// ─── Arbitraries ──────────────────────────────────────────────────────────────

const ROUND_NAMES: RoundName[] = ['single', 'double', 'triple', 'quadruple', 'quintuple', 'sextuple'];

/**
 * Generates a unique clue question string that is easily identifiable
 * and won't accidentally appear in solution text.
 */
function arbUniqueClueQuestion(index: number): fc.Arbitrary<string> {
  return fc.uuid().map((uuid) => `CLUE_QUESTION_${index}_${uuid}`);
}

/**
 * Generates a solution string that does NOT contain any "CLUE_QUESTION" marker.
 */
function arbSolution(): fc.Arbitrary<string> {
  return fc.string({ minLength: 1, maxLength: 30 })
    .map((s) => `solution_${s.replace(/CLUE_QUESTION/g, 'answer')}`);
}

/**
 * Generates a Clue with a unique identifiable question string.
 */
function arbClue(index: number): fc.Arbitrary<Clue> {
  return fc.tuple(
    fc.integer({ min: 100, max: 2000 }),
    arbUniqueClueQuestion(index),
    arbSolution(),
    fc.boolean(),
    fc.boolean(),
  ).map(([value, clue, solution, dailyDouble, html]) => ({
    value,
    clue,
    solution,
    dailyDouble,
    html,
  }));
}

/**
 * Generates a Category with 1-5 clues, each having unique question text.
 */
function arbCategory(baseIndex: number): fc.Arbitrary<{ category: Category; clueCount: number }> {
  return fc.integer({ min: 1, max: 5 }).chain((numClues) => {
    const clueArbs = Array.from({ length: numClues }, (_, i) => arbClue(baseIndex + i));
    return fc.tuple(
      fc.string({ minLength: 1, maxLength: 20 }).map((s) => `Category_${s}`),
      fc.tuple(...(clueArbs as [fc.Arbitrary<Clue>, ...fc.Arbitrary<Clue>[]])),
    ).map(([categoryName, clues]) => ({
      category: { category: categoryName, clues: [...clues] },
      clueCount: numClues,
    }));
  });
}

/**
 * Generates a NormalizedGame with 1-3 rounds, each with 1-3 categories.
 * All clue questions are unique UUID-based strings.
 */
function arbNormalizedGame(): fc.Arbitrary<NormalizedGame> {
  return fc.integer({ min: 1, max: 3 }).chain((numRounds) => {
    return fc.integer({ min: 1, max: 3 }).chain((catsPerRound) => {
      // We need numRounds * catsPerRound categories, each with up to 5 clues
      const totalCategories = numRounds * catsPerRound;
      // Generate all categories with unique clue indices
      const categoryArbs: fc.Arbitrary<{ category: Category; clueCount: number }>[] = [];
      for (let i = 0; i < totalCategories; i++) {
        categoryArbs.push(arbCategory(i * 5)); // offset by 5 per category to ensure unique indices
      }

      return fc.tuple(
        fc.tuple(...(categoryArbs as [typeof categoryArbs[0], ...typeof categoryArbs[number][]])),
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 30 }),
        arbSolution(),
        fc.boolean(),
      ).map(([categories, finalCat, finalClue, finalSolution, finalHtml]) => {
        const rounds: Record<RoundName, Category[]> = {} as Record<RoundName, Category[]>;
        const roundNames = ROUND_NAMES.slice(0, numRounds);

        for (let r = 0; r < numRounds; r++) {
          const roundCategories: Category[] = [];
          for (let c = 0; c < catsPerRound; c++) {
            roundCategories.push(categories[r * catsPerRound + c].category);
          }
          rounds[roundNames[r]] = roundCategories;
        }

        const final: FinalRound = {
          category: finalCat,
          clue: finalClue,
          solution: finalSolution,
          html: finalHtml,
        };

        return {
          rounds,
          final,
          totalRounds: numRounds,
        };
      });
    });
  });
}

// ─── Property Tests ───────────────────────────────────────────────────────────

// Feature: faq-cards-and-cheat-sheet, Property 5: Cheat sheet content never includes clue question text
describe('Property 5: Cheat sheet content never includes clue question text', () => {
  /**
   * Validates: Requirements 7.3
   *
   * For any valid NormalizedGame with unique clue question strings,
   * the output of getRoundAnswers must never contain any of the original
   * clue question text — only category names, point values, and solutions.
   */
  it('getRoundAnswers output does not contain any clue question text', () => {
    fc.assert(
      fc.property(arbNormalizedGame(), (game) => {
        // Collect all clue question strings from all rounds
        const allClueQuestions: string[] = [];
        for (const roundName of Object.keys(game.rounds) as RoundName[]) {
          const categories = game.rounds[roundName];
          if (!categories) continue;
          for (const cat of categories) {
            for (const clue of cat.clues) {
              allClueQuestions.push(clue.clue);
            }
          }
        }

        // For each round, get the cheat sheet output and verify no clue questions appear
        for (const roundName of Object.keys(game.rounds) as RoundName[]) {
          const result = getRoundAnswers(game, roundName);

          for (const cheatCat of result) {
            for (const cheatClue of cheatCat.clues) {
              // The cheat sheet output should only have value and solution
              // Verify none of the original clue questions appear in the solution
              for (const question of allClueQuestions) {
                expect(cheatClue.solution).not.toContain(question);
              }

              // Verify the output object only has value and solution keys (no clue field)
              const keys = Object.keys(cheatClue);
              expect(keys).toContain('value');
              expect(keys).toContain('solution');
              expect(keys).not.toContain('clue');
            }
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});


// ─── Property 2: Cheat sheet defaults to first round on every open ────────────

// Feature: faq-cards-and-cheat-sheet, Property 2: Cheat sheet defaults to first round on every open
describe('Property 2: Cheat sheet defaults to first round on every open', () => {
  /**
   * **Validates: Requirements 6.2, 6.6**
   *
   * For any valid NormalizedGame and any sequence of open/navigate/close operations,
   * when the cheat sheet is opened (or reopened), the initially displayed round SHALL
   * always be the first round in the ordered round names array.
   *
   * The CheatSheet component unmounts/remounts on close/open, so the default tab is
   * always `rounds[0]` (i.e., `orderedRoundNames[0]`). We verify that
   * `getCheatSheetRounds(game, orderedRoundNames)[0] === orderedRoundNames[0]`
   * for any valid game, regardless of how many times it's opened.
   */
  it('the first round in getCheatSheetRounds always equals orderedRoundNames[0]', () => {
    fc.assert(
      fc.property(arbNormalizedGame(), (game) => {
        const activeRounds = ROUND_NAMES.filter((name) => game.rounds[name]?.length > 0);

        const rounds = getCheatSheetRounds(game, activeRounds);

        // The default selected round (first element) must always be activeRounds[0]
        expect(rounds[0]).toBe(activeRounds[0]);
      }),
      { numRuns: 100 },
    );
  });

  it('default round is always orderedRoundNames[0] regardless of open/close sequence count', () => {
    fc.assert(
      fc.property(
        arbNormalizedGame(),
        fc.integer({ min: 1, max: 20 }), // number of open/close cycles
        (game, openCloseCount) => {
          const activeRounds = ROUND_NAMES.filter((name) => game.rounds[name]?.length > 0);

          // Simulate multiple open/close cycles — each time the cheat sheet opens,
          // it remounts and the default tab resets to the first round.
          for (let i = 0; i < openCloseCount; i++) {
            const rounds = getCheatSheetRounds(game, activeRounds);
            // On every open, the default selected round is always the first one
            expect(rounds[0]).toBe(activeRounds[0]);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ─── Property 3: Selected round displays correct categories with correct answers in order ────

// Feature: faq-cards-and-cheat-sheet, Property 3: Selected round displays correct categories with correct answers in order
describe('Property 3: Selected round displays correct categories with correct answers in order', () => {
  /**
   * **Validates: Requirements 6.4, 7.1**
   *
   * For any valid NormalizedGame and any selectable round name, when that round
   * is selected in the cheat sheet, the displayed categories SHALL appear in the
   * same order as `game.rounds[roundName]` and each category SHALL contain exactly
   * the solutions from its clues array.
   */
  it('getRoundAnswers returns categories in same order as game.rounds[roundName] with matching solutions', () => {
    fc.assert(
      fc.property(arbNormalizedGame(), (game) => {
        const activeRounds = ROUND_NAMES.filter((name) => game.rounds[name]?.length > 0);

        for (const roundName of activeRounds) {
          const result = getRoundAnswers(game, roundName);
          const sourceCategories = game.rounds[roundName];

          // Category count must match
          expect(result.length).toBe(sourceCategories.length);

          // Categories must be in the same order
          for (let i = 0; i < result.length; i++) {
            // Category names must match in order
            expect(result[i].category).toBe(sourceCategories[i].category);

            // Each category's clues must contain exactly the same solutions as source
            const expectedSolutions = sourceCategories[i].clues
              .map((clue) => clue.solution)
              .sort();
            const actualSolutions = result[i].clues
              .map((clue) => clue.solution)
              .sort();

            expect(actualSolutions).toEqual(expectedSolutions);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});


// ─── Property 6: Final Jeopardy displays category and solution without point value ────

// Feature: faq-cards-and-cheat-sheet, Property 6: Final Jeopardy displays category and solution without point value
describe('Property 6: Final Jeopardy displays category and solution without point value', () => {
  /**
   * **Validates: Requirements 7.5**
   *
   * For any valid NormalizedGame, when Final Jeopardy is selected in the round
   * selector, the cheat sheet SHALL display exactly the `final.category` and
   * `final.solution` fields, and SHALL NOT display any numeric point value.
   */
  it('getFinalJeopardyAnswer returns exactly category and solution with no value field', () => {
    fc.assert(
      fc.property(arbNormalizedGame(), (game) => {
        const result = getFinalJeopardyAnswer(game);

        // 1. category matches game.final.category
        expect(result.category).toBe(game.final.category);

        // 2. solution matches game.final.solution
        expect(result.solution).toBe(game.final.solution);

        // 3. The returned object has NO value or numeric point value field
        const keys = Object.keys(result);
        expect(keys).toContain('category');
        expect(keys).toContain('solution');
        expect(keys).not.toContain('value');
        expect(keys).not.toContain('points');
        expect(keys).not.toContain('pointValue');

        // Only category and solution — exactly 2 keys
        expect(keys.length).toBe(2);
      }),
      { numRuns: 100 },
    );
  });
});


// ─── Property 7: Opening and closing the cheat sheet preserves game session state ────

// Feature: faq-cards-and-cheat-sheet, Property 7: Opening and closing the cheat sheet preserves game session state
describe('Property 7: Opening and closing the cheat sheet preserves game session state', () => {
  /**
   * **Validates: Requirements 6.5**
   *
   * For any valid GameSession state (players, currentRoundIndex, clueStates, orderedRoundNames),
   * calling cheat sheet helper functions (getCheatSheetRounds, getRoundAnswers, getFinalJeopardyAnswer)
   * SHALL NOT mutate the game session state. The session object must be identical (deep equality)
   * before and after all operations.
   */

  // Arbitrary for Player objects
  const arbPlayer = fc.record({
    name: fc.string({ minLength: 1, maxLength: 15 }),
    score: fc.integer({ min: -10000, max: 100000 }),
    correctCount: fc.integer({ min: 0, max: 50 }),
    incorrectCount: fc.integer({ min: 0, max: 50 }),
    correctDailyDoubles: fc.integer({ min: 0, max: 5 }),
    incorrectDailyDoubles: fc.integer({ min: 0, max: 5 }),
    correctFinalJeopardy: fc.integer({ min: 0, max: 1 }),
    incorrectFinalJeopardy: fc.integer({ min: 0, max: 1 }),
    totalEarned: fc.integer({ min: 0, max: 100000 }),
  });

  // Arbitrary for ClueState objects
  const arbClueState = fc.record({
    chosen: fc.boolean(),
    playerMarkings: fc.dictionary(
      fc.string({ minLength: 1, maxLength: 10 }),
      fc.constantFrom('correct' as const, 'incorrect' as const, null),
    ),
  });

  // Arbitrary for a GameSession-like object
  function arbGameSession() {
    return arbNormalizedGame().chain((game) => {
      const activeRounds = ROUND_NAMES.filter((name) => game.rounds[name]?.length > 0);
      const maxRoundIndex = activeRounds.length - 1;

      return fc.tuple(
        fc.constant(game),
        fc.uuid(),
        fc.array(arbPlayer, { minLength: 1, maxLength: 4 }),
        fc.integer({ min: 0, max: Math.max(0, maxRoundIndex) }),
        fc.constant(activeRounds),
        fc.dictionary(
          fc.string({ minLength: 5, maxLength: 20 }),
          arbClueState,
        ),
      ).map(([gameObj, gameId, players, currentRoundIndex, orderedRoundNames, clueStates]) => ({
        game: gameObj,
        gameId,
        players,
        currentRoundIndex,
        orderedRoundNames,
        clueStates,
      }));
    });
  }

  it('cheat sheet helper functions do not mutate the game session state', () => {
    fc.assert(
      fc.property(arbGameSession(), (session) => {
        // Deep clone the session state before operations
        const sessionBefore = JSON.parse(JSON.stringify(session));

        // Simulate cheat sheet operations:
        // 1. Open cheat sheet — get round tabs
        getCheatSheetRounds(session.game, session.orderedRoundNames);

        // 2. Navigate through all rounds — get answers for each
        for (const roundName of session.orderedRoundNames) {
          getRoundAnswers(session.game, roundName);
        }

        // 3. View Final Jeopardy
        getFinalJeopardyAnswer(session.game);

        // Assert the session state is identical after all operations
        expect(session.players).toEqual(sessionBefore.players);
        expect(session.currentRoundIndex).toBe(sessionBefore.currentRoundIndex);
        expect(session.clueStates).toEqual(sessionBefore.clueStates);
        expect(session.orderedRoundNames).toEqual(sessionBefore.orderedRoundNames);
        expect(session.game).toEqual(sessionBefore.game);
        expect(session.gameId).toBe(sessionBefore.gameId);
      }),
      { numRuns: 100 },
    );
  });
});
