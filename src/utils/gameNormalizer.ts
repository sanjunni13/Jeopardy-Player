import type {
  GameFile,
  NormalizedGame,
  NormalizeResult,
  RoundName,
  Category,
  Clue,
  FinalRound,
  RawCategory,
  RawFinalRound,
} from '../types/game';

const NUMERIC_TO_WORD: Record<string, RoundName> = {
  '1': 'single',
  '2': 'double',
  '3': 'triple',
  '4': 'quadruple',
  '5': 'quintuple',
  '6': 'sextuple',
};

const WORD_KEYS: RoundName[] = [
  'single',
  'double',
  'triple',
  'quadruple',
  'quintuple',
  'sextuple',
];

function isNumericKey(key: string): boolean {
  return key !== 'final' && key !== 'isRandomlyGenerated' && !isNaN(Number(key));
}

function isWordKey(key: string): boolean {
  return (WORD_KEYS as string[]).includes(key);
}

export function normalizeGame(raw: GameFile): NormalizeResult {
  const gameObj = raw.game;
  const allKeys = Object.keys(gameObj);

  const numericKeys = allKeys.filter(isNumericKey);
  const wordKeys = allKeys.filter(isWordKey);

  // Both types present — error
  if (numericKeys.length > 0 && wordKeys.length > 0) {
    return {
      ok: false,
      error: 'Game file contains both numeric and word-descriptor round keys.',
    };
  }

  let roundNames: RoundName[];

  if (numericKeys.length > 0) {
    // Validate all numeric keys are within 1–6
    for (const key of numericKeys) {
      if (!(key in NUMERIC_TO_WORD)) {
        return {
          ok: false,
          error: `Numeric round key "${key}" is outside the supported range of 1–6.`,
        };
      }
    }
    // Map numeric keys to word descriptors, sorted by WORD_KEYS order
    roundNames = numericKeys
      .map((k) => NUMERIC_TO_WORD[k])
      .sort((a, b) => WORD_KEYS.indexOf(a) - WORD_KEYS.indexOf(b));
  } else {
    // Use word-descriptor keys as-is, sorted by WORD_KEYS order
    roundNames = wordKeys
      .filter(isWordKey)
      .map((k) => k as RoundName)
      .sort((a, b) => WORD_KEYS.indexOf(a) - WORD_KEYS.indexOf(b));
  }

  // Build rounds record
  const rounds = {} as Record<RoundName, Category[]>;

  for (const roundName of roundNames) {
    // Determine the source key in the raw object
    const sourceKey =
      numericKeys.length > 0
        ? String(WORD_KEYS.indexOf(roundName) + 1)
        : roundName;

    const rawCategories = gameObj[sourceKey] as RawCategory[];

    const categories: Category[] = rawCategories.map((rawCat) => ({
      category: rawCat.category,
      clues: rawCat.clues.map(
        (rawClue): Clue => ({
          value: rawClue.value,
          clue: rawClue.clue,
          solution: rawClue.solution,
          dailyDouble: rawClue.dailyDouble ?? false,
          html: rawClue.html ?? false,
        })
      ),
    }));

    rounds[roundName] = categories;
  }

  // Build final round
  const finalEntry = gameObj['final'] as RawFinalRound;
  const final: FinalRound = {
    category: finalEntry.category,
    clue: finalEntry.clue,
    solution: finalEntry.solution,
    html: finalEntry.html ?? false,
  };

  const totalRounds = roundNames.length;

  const game: NormalizedGame = {
    rounds,
    final,
    totalRounds,
  };

  return { ok: true, game };
}
