import type { BuilderDraft } from './draftApi';
import type { RoundName } from '../types/game';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validates a BuilderDraft for publishing.
 *
 * Checks:
 * - Game name is non-empty
 * - All category names are non-empty
 * - All clue fields (value, clue text, solution text) are non-empty
 * - All clue values are positive integers
 * - Final Jeopardy category, clue, and solution are non-empty
 */
export function validateDraftForPublish(draft: BuilderDraft): ValidationResult {
  const errors: ValidationError[] = [];

  // Game name must be non-empty
  if (!draft.gameName || draft.gameName.trim() === '') {
    errors.push({
      field: 'gameName',
      message: 'Game name cannot be empty',
    });
  }

  // Validate each round's categories and clues
  const roundNames = Object.keys(draft.rounds) as RoundName[];
  for (const roundName of roundNames) {
    const categories = draft.rounds[roundName];
    if (!categories) continue;

    for (let catIdx = 0; catIdx < categories.length; catIdx++) {
      const category = categories[catIdx];

      // Category name must be non-empty
      if (!category.category || category.category.trim() === '') {
        errors.push({
          field: `rounds.${roundName}.categories[${catIdx}].name`,
          message: 'Category name cannot be empty',
        });
      }

      // Validate each clue in the category
      if (!category.clues) continue;
      for (let clueIdx = 0; clueIdx < category.clues.length; clueIdx++) {
        const clue = category.clues[clueIdx];
        const clueFieldBase = `rounds.${roundName}.categories[${catIdx}].clues[${clueIdx}]`;

        // Clue value must be a positive integer
        if (
          clue.value === undefined ||
          clue.value === null ||
          !Number.isInteger(clue.value) ||
          clue.value <= 0
        ) {
          errors.push({
            field: `${clueFieldBase}.value`,
            message: 'Clue value must be a positive integer',
          });
        }

        // Clue text must be non-empty
        if (!clue.clue || clue.clue.trim() === '') {
          errors.push({
            field: `${clueFieldBase}.clue`,
            message: 'Clue text cannot be empty',
          });
        }

        // Solution must be non-empty
        if (!clue.solution || clue.solution.trim() === '') {
          errors.push({
            field: `${clueFieldBase}.solution`,
            message: 'Solution cannot be empty',
          });
        }
      }
    }
  }

  // Final Jeopardy validation
  if (!draft.final.category || draft.final.category.trim() === '') {
    errors.push({
      field: 'final.category',
      message: 'Final Jeopardy category cannot be empty',
    });
  }

  if (!draft.final.clue || draft.final.clue.trim() === '') {
    errors.push({
      field: 'final.clue',
      message: 'Final Jeopardy clue cannot be empty',
    });
  }

  if (!draft.final.solution || draft.final.solution.trim() === '') {
    errors.push({
      field: 'final.solution',
      message: 'Final Jeopardy solution cannot be empty',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
