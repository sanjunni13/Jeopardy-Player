import type { GameFile, ValidationResult } from '../types/game';

const WORD_KEYS = ['single', 'double', 'triple', 'quadruple', 'quintuple', 'sextuple'] as const;

function isNonEmptyString(v: unknown): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

function isNumericKey(key: string): boolean {
  return key !== 'final' && key !== 'isRandomlyGenerated' && !isNaN(Number(key));
}

function isWordKey(key: string): boolean {
  return (WORD_KEYS as readonly string[]).includes(key);
}

export async function validateGameFile(file: File): Promise<ValidationResult> {
  // Check 1: file size
  if (file.size > 5_242_880) {
    return { valid: false, error: 'File exceeds the 5 MB size limit.' };
  }

  // Check 2: parse JSON
  let data: unknown;
  try {
    const text = await file.text();
    data = JSON.parse(text);
  } catch {
    return { valid: false, error: 'Could not parse file as JSON. Please upload a valid JSON file.' };
  }

  // All remaining checks are synchronous

  // Check 3: top-level `game` key
  if (
    typeof data !== 'object' ||
    data === null ||
    !('game' in data) ||
    typeof (data as Record<string, unknown>).game !== 'object' ||
    (data as Record<string, unknown>).game === null
  ) {
    return { valid: false, error: "Invalid game file: missing 'game' key." };
  }

  const gameObj = (data as Record<string, unknown>).game as Record<string, unknown>;
  const allKeys = Object.keys(gameObj);

  // Check 4: detect key type — numeric vs word-descriptor
  const numericKeys = allKeys.filter(isNumericKey);
  const wordKeys = allKeys.filter(isWordKey);

  if (numericKeys.length > 0 && wordKeys.length > 0) {
    return {
      valid: false,
      error: 'Game file contains both numeric and word-descriptor round keys. Please use one format consistently.',
    };
  }

  // Check 5 (numeric keys): contiguous sequence starting at "1"
  if (numericKeys.length > 0) {
    const sorted = numericKeys.map(Number).sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i] !== i + 1) {
        return {
          valid: false,
          error: 'Numeric round keys must form a contiguous sequence starting at "1" with no gaps.',
        };
      }
    }
  }

  // Check 6 (word keys): contiguous subset starting at "single"
  if (wordKeys.length > 0) {
    const sortedByIndex = [...wordKeys].sort(
      (a, b) => WORD_KEYS.indexOf(a as typeof WORD_KEYS[number]) - WORD_KEYS.indexOf(b as typeof WORD_KEYS[number])
    );
    if (sortedByIndex[0] !== 'single') {
      return {
        valid: false,
        error: 'Word-descriptor round keys must start at "single" and form a contiguous sequence with no gaps.',
      };
    }
    for (let i = 0; i < sortedByIndex.length; i++) {
      if (sortedByIndex[i] !== WORD_KEYS[i]) {
        return {
          valid: false,
          error: 'Word-descriptor round keys must start at "single" and form a contiguous sequence with no gaps.',
        };
      }
    }
  }

  // Neither numeric nor word-descriptor keys found (no round keys at all)
  if (numericKeys.length === 0 && wordKeys.length === 0) {
    return { valid: false, error: 'Could not find any valid rounds in the game file.' };
  }

  // Check 7: `final` key must be present with valid fields
  const finalEntry = gameObj['final'];
  if (
    typeof finalEntry !== 'object' ||
    finalEntry === null ||
    !isNonEmptyString((finalEntry as Record<string, unknown>).category) ||
    !isNonEmptyString((finalEntry as Record<string, unknown>).clue) ||
    !isNonEmptyString((finalEntry as Record<string, unknown>).solution)
  ) {
    return {
      valid: false,
      error: 'Invalid final round: missing or empty category, clue, or solution.',
    };
  }

  // Determine round keys to validate
  const roundKeys = numericKeys.length > 0 ? numericKeys : wordKeys;

  for (const key of roundKeys) {
    const round = gameObj[key];

    // Check 8: each round must be a non-empty array
    if (!Array.isArray(round) || round.length === 0) {
      return {
        valid: false,
        error: `Round "${key}" must be a non-empty array of categories.`,
      };
    }

    for (const category of round) {
      // Check 8 (continued): each element must have non-empty category string and non-empty clues array
      if (
        typeof category !== 'object' ||
        category === null ||
        !isNonEmptyString((category as Record<string, unknown>).category) ||
        !Array.isArray((category as Record<string, unknown>).clues) ||
        ((category as Record<string, unknown>).clues as unknown[]).length === 0
      ) {
        return {
          valid: false,
          error: `Round "${key}" contains an invalid category: missing or empty category name or clues array.`,
        };
      }

      const clues = (category as Record<string, unknown>).clues as unknown[];

      for (const clue of clues) {
        // Check 9: each clue must have numeric value >= 1, non-empty clue and solution strings
        if (
          typeof clue !== 'object' ||
          clue === null
        ) {
          return {
            valid: false,
            error: `Round "${key}" contains an invalid clue entry.`,
          };
        }

        const c = clue as Record<string, unknown>;

        if (typeof c.value !== 'number' || c.value < 1) {
          return {
            valid: false,
            error: `Round "${key}" contains a clue with an invalid value (must be a number >= 1).`,
          };
        }

        if (!isNonEmptyString(c.clue)) {
          return {
            valid: false,
            error: `Round "${key}" contains a clue with a missing or empty clue text.`,
          };
        }

        if (!isNonEmptyString(c.solution)) {
          return {
            valid: false,
            error: `Round "${key}" contains a clue with a missing or empty solution.`,
          };
        }
      }
    }
  }

  return { valid: true, raw: data as GameFile };
}
