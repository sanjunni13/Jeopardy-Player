import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateDraftForPublish } from './draftValidation';
import type { BuilderDraft } from './draftApi';
import type { RoundName, Category, Clue } from '../types/game';

// ─── Generators ───────────────────────────────────────────────────────────────

/** Generates a non-empty, non-whitespace string */
const nonEmptyString = fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0);

/** Generates a positive integer for clue values */
const positiveInt = fc.integer({ min: 1, max: 10000 });

/** Generates a valid Clue (all fields populated) */
const validClueArb: fc.Arbitrary<Clue> = fc.record({
  value: positiveInt,
  clue: nonEmptyString,
  solution: nonEmptyString,
  dailyDouble: fc.boolean(),
  html: fc.boolean(),
});

/** Generates a valid Category (non-empty name, 1-5 valid clues) */
const validCategoryArb: fc.Arbitrary<Category> = fc.record({
  category: nonEmptyString,
  clues: fc.array(validClueArb, { minLength: 1, maxLength: 5 }),
});

/** Generates a valid rounds record with at least one round */
const validRoundsArb: fc.Arbitrary<Record<RoundName, Category[]>> = fc
  .subarray(['single', 'double', 'triple'] as RoundName[], { minLength: 1, maxLength: 3 })
  .chain((roundNames) =>
    fc.tuple(...roundNames.map(() => fc.array(validCategoryArb, { minLength: 1, maxLength: 6 }))).map(
      (categoryArrays) => {
        const rounds: Partial<Record<RoundName, Category[]>> = {};
        roundNames.forEach((name, i) => {
          rounds[name] = categoryArrays[i];
        });
        return rounds as Record<RoundName, Category[]>;
      }
    )
  );

/** Generates a fully valid BuilderDraft */
const validDraftArb: fc.Arbitrary<BuilderDraft> = fc.record({
  gameName: nonEmptyString,
  totalRounds: fc.integer({ min: 1, max: 3 }),
  categoriesPerRound: fc.integer({ min: 1, max: 6 }),
  rounds: validRoundsArb,
  final: fc.record({
    category: nonEmptyString,
    clue: nonEmptyString,
    solution: nonEmptyString,
    html: fc.boolean(),
  }),
});

// ─── Invalid Draft Generators ─────────────────────────────────────────────────

/** Generates a draft with an empty game name */
const draftWithEmptyGameName: fc.Arbitrary<BuilderDraft> = validDraftArb.map((draft) => ({
  ...draft,
  gameName: fc.sample(fc.constantFrom('', '   ', '\t', '\n'), 1)[0],
}));

/** Generates a draft with at least one empty category name */
const draftWithEmptyCategoryName: fc.Arbitrary<BuilderDraft> = validDraftArb.map((draft) => {
  const rounds = { ...draft.rounds };
  const roundNames = Object.keys(rounds) as RoundName[];
  if (roundNames.length > 0) {
    const roundName = roundNames[0];
    const categories = [...rounds[roundName]];
    if (categories.length > 0) {
      categories[0] = { ...categories[0], category: '' };
      rounds[roundName] = categories;
    }
  }
  return { ...draft, rounds };
});

/** Generates a draft with at least one empty clue text */
const draftWithEmptyClueText: fc.Arbitrary<BuilderDraft> = validDraftArb.map((draft) => {
  const rounds = { ...draft.rounds };
  const roundNames = Object.keys(rounds) as RoundName[];
  if (roundNames.length > 0) {
    const roundName = roundNames[0];
    const categories = [...rounds[roundName]];
    if (categories.length > 0 && categories[0].clues.length > 0) {
      const clues = [...categories[0].clues];
      clues[0] = { ...clues[0], clue: '' };
      categories[0] = { ...categories[0], clues };
      rounds[roundName] = categories;
    }
  }
  return { ...draft, rounds };
});

/** Generates a draft with at least one empty solution */
const draftWithEmptySolution: fc.Arbitrary<BuilderDraft> = validDraftArb.map((draft) => {
  const rounds = { ...draft.rounds };
  const roundNames = Object.keys(rounds) as RoundName[];
  if (roundNames.length > 0) {
    const roundName = roundNames[0];
    const categories = [...rounds[roundName]];
    if (categories.length > 0 && categories[0].clues.length > 0) {
      const clues = [...categories[0].clues];
      clues[0] = { ...clues[0], solution: '' };
      categories[0] = { ...categories[0], clues };
      rounds[roundName] = categories;
    }
  }
  return { ...draft, rounds };
});

/** Generates a draft with at least one non-positive clue value */
const draftWithInvalidClueValue: fc.Arbitrary<BuilderDraft> = validDraftArb.chain((draft) => {
  return fc.integer({ min: -1000, max: 0 }).map((badValue) => {
    const rounds = { ...draft.rounds };
    const roundNames = Object.keys(rounds) as RoundName[];
    if (roundNames.length > 0) {
      const roundName = roundNames[0];
      const categories = [...rounds[roundName]];
      if (categories.length > 0 && categories[0].clues.length > 0) {
        const clues = [...categories[0].clues];
        clues[0] = { ...clues[0], value: badValue };
        categories[0] = { ...categories[0], clues };
        rounds[roundName] = categories;
      }
    }
    return { ...draft, rounds };
  });
});

/** Generates a draft with empty Final Jeopardy category */
const draftWithEmptyFinalCategory: fc.Arbitrary<BuilderDraft> = validDraftArb.map((draft) => ({
  ...draft,
  final: { ...draft.final, category: '' },
}));

/** Generates a draft with empty Final Jeopardy clue */
const draftWithEmptyFinalClue: fc.Arbitrary<BuilderDraft> = validDraftArb.map((draft) => ({
  ...draft,
  final: { ...draft.final, clue: '' },
}));

/** Generates a draft with empty Final Jeopardy solution */
const draftWithEmptyFinalSolution: fc.Arbitrary<BuilderDraft> = validDraftArb.map((draft) => ({
  ...draft,
  final: { ...draft.final, solution: '' },
}));

/** Union of all invalid draft generators — always has at least one invalid field */
const invalidDraftArb: fc.Arbitrary<BuilderDraft> = fc.oneof(
  draftWithEmptyGameName,
  draftWithEmptyCategoryName,
  draftWithEmptyClueText,
  draftWithEmptySolution,
  draftWithInvalidClueValue,
  draftWithEmptyFinalCategory,
  draftWithEmptyFinalClue,
  draftWithEmptyFinalSolution
);

// ─── Property Tests ───────────────────────────────────────────────────────────

// Feature: misc-app-updates, Property 3: Publish validation detects all invalid fields
describe('validateDraftForPublish — Property 3: Publish validation detects all invalid fields', () => {
  /**
   * **Validates: Requirements 5.2**
   *
   * For any BuilderDraft with all fields valid, validateDraftForPublish returns valid: true
   */
  it('returns valid: true for any fully valid draft', () => {
    fc.assert(
      fc.property(validDraftArb, (draft) => {
        const result = validateDraftForPublish(draft);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 5.2**
   *
   * For any BuilderDraft with at least one invalid field, validateDraftForPublish returns valid: false with errors
   */
  it('returns valid: false with errors for any draft with at least one invalid field', () => {
    fc.assert(
      fc.property(invalidDraftArb, (draft) => {
        const result = validateDraftForPublish(draft);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 5.2**
   *
   * Empty game name is detected as invalid
   */
  it('detects empty game name', () => {
    fc.assert(
      fc.property(draftWithEmptyGameName, (draft) => {
        const result = validateDraftForPublish(draft);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.field === 'gameName')).toBe(true);
      }),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 5.2**
   *
   * Empty category name is detected as invalid
   */
  it('detects empty category name', () => {
    fc.assert(
      fc.property(draftWithEmptyCategoryName, (draft) => {
        const result = validateDraftForPublish(draft);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.field.includes('.name'))).toBe(true);
      }),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 5.2**
   *
   * Non-positive clue values are detected as invalid
   */
  it('detects non-positive clue values', () => {
    fc.assert(
      fc.property(draftWithInvalidClueValue, (draft) => {
        const result = validateDraftForPublish(draft);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.field.includes('.value'))).toBe(true);
      }),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 5.2**
   *
   * Empty Final Jeopardy fields are detected as invalid
   */
  it('detects empty Final Jeopardy category', () => {
    fc.assert(
      fc.property(draftWithEmptyFinalCategory, (draft) => {
        const result = validateDraftForPublish(draft);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.field === 'final.category')).toBe(true);
      }),
      { numRuns: 50 }
    );
  });

  it('detects empty Final Jeopardy clue', () => {
    fc.assert(
      fc.property(draftWithEmptyFinalClue, (draft) => {
        const result = validateDraftForPublish(draft);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.field === 'final.clue')).toBe(true);
      }),
      { numRuns: 50 }
    );
  });

  it('detects empty Final Jeopardy solution', () => {
    fc.assert(
      fc.property(draftWithEmptyFinalSolution, (draft) => {
        const result = validateDraftForPublish(draft);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.field === 'final.solution')).toBe(true);
      }),
      { numRuns: 50 }
    );
  });
});
