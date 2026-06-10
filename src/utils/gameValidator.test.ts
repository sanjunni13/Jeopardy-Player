import { describe, it, expect } from 'vitest';
import { validateGameFile } from './gameValidator';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFile(content: string, sizeOverride?: number): File {
  const blob = new Blob([content], { type: 'application/json' });
  const file = new File([blob], 'game.json', { type: 'application/json' });
  if (sizeOverride !== undefined) {
    // Override the size property (read-only) via defineProperty
    Object.defineProperty(file, 'size', { value: sizeOverride });
  }
  return file;
}

/** Minimal valid clue */
const validClue = { value: 200, clue: 'What is a test?', solution: 'A test' };

/** Minimal valid category */
const validCategory = { category: 'Science', clues: [validClue] };

/** Minimal valid final round */
const validFinal = { category: 'History', clue: 'Who was Napoleon?', solution: 'Napoleon Bonaparte' };

/** Build a minimal valid game file JSON with word keys */
function buildWordKeyGame(roundKeys: string[] = ['single']): string {
  const game: Record<string, unknown> = { final: validFinal };
  for (const key of roundKeys) {
    game[key] = [validCategory];
  }
  return JSON.stringify({ game });
}

/** Build a minimal valid game file JSON with numeric keys */
function buildNumericKeyGame(count = 1): string {
  const game: Record<string, unknown> = { final: validFinal };
  for (let i = 1; i <= count; i++) {
    game[String(i)] = [validCategory];
  }
  return JSON.stringify({ game });
}

// ─── Check 1: File size ───────────────────────────────────────────────────────

describe('Check 1: file size limit', () => {
  it('rejects a file larger than 5 MB', async () => {
    const file = makeFile('{}', 5_242_881);
    const result = await validateGameFile(file);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toBe('File exceeds the 5 MB size limit.');
  });

  it('accepts a file exactly at 5 MB', async () => {
    // Use a valid game JSON but override size to exactly 5 MB
    const json = buildWordKeyGame();
    const file = makeFile(json, 5_242_880);
    const result = await validateGameFile(file);
    // Should not fail on size (may fail on other checks if size override broke content, but size check passes)
    if (!result.valid) {
      expect(result.error).not.toBe('File exceeds the 5 MB size limit.');
    }
  });
});

// ─── Check 2: JSON parse ──────────────────────────────────────────────────────

describe('Check 2: JSON parsing', () => {
  it('rejects malformed JSON', async () => {
    const file = makeFile('{ not valid json }');
    const result = await validateGameFile(file);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe('Could not parse file as JSON. Please upload a valid JSON file.');
    }
  });

  it('rejects empty string', async () => {
    const file = makeFile('');
    const result = await validateGameFile(file);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe('Could not parse file as JSON. Please upload a valid JSON file.');
    }
  });
});

// ─── Check 3: top-level `game` key ───────────────────────────────────────────

describe('Check 3: missing game key', () => {
  it('rejects when game key is absent', async () => {
    const file = makeFile(JSON.stringify({ notGame: {} }));
    const result = await validateGameFile(file);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain("missing 'game' key");
  });

  it('rejects when game value is null', async () => {
    const file = makeFile(JSON.stringify({ game: null }));
    const result = await validateGameFile(file);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain("missing 'game' key");
  });
});

// ─── Check 4: mixed key types ────────────────────────────────────────────────

describe('Check 4: mixed numeric + word keys', () => {
  it('rejects a file with both "1" and "single" keys', async () => {
    const game = {
      '1': [validCategory],
      single: [validCategory],
      final: validFinal,
    };
    const file = makeFile(JSON.stringify({ game }));
    const result = await validateGameFile(file);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('both numeric and word-descriptor');
  });
});

// ─── Check 5: numeric key contiguity ─────────────────────────────────────────

describe('Check 5: numeric key contiguity', () => {
  it('rejects keys "1" and "3" (gap at 2)', async () => {
    const game = { '1': [validCategory], '3': [validCategory], final: validFinal };
    const file = makeFile(JSON.stringify({ game }));
    const result = await validateGameFile(file);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('contiguous sequence starting at "1"');
  });

  it('rejects keys starting at "2" (no "1")', async () => {
    const game = { '2': [validCategory], '3': [validCategory], final: validFinal };
    const file = makeFile(JSON.stringify({ game }));
    const result = await validateGameFile(file);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('contiguous sequence starting at "1"');
  });

  it('accepts keys "1", "2", "3" (contiguous from 1)', async () => {
    const file = makeFile(buildNumericKeyGame(3));
    const result = await validateGameFile(file);
    expect(result.valid).toBe(true);
  });
});

// ─── Check 6: word key contiguity ────────────────────────────────────────────

describe('Check 6: word key contiguity', () => {
  it('rejects "single" and "triple" (gap at double)', async () => {
    const game = { single: [validCategory], triple: [validCategory], final: validFinal };
    const file = makeFile(JSON.stringify({ game }));
    const result = await validateGameFile(file);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('contiguous sequence');
  });

  it('rejects "double" without "single"', async () => {
    const game = { double: [validCategory], final: validFinal };
    const file = makeFile(JSON.stringify({ game }));
    const result = await validateGameFile(file);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('start at "single"');
  });

  it('accepts ["single", "double"] (contiguous from single)', async () => {
    const file = makeFile(buildWordKeyGame(['single', 'double']));
    const result = await validateGameFile(file);
    expect(result.valid).toBe(true);
  });

  it('accepts just ["single"]', async () => {
    const file = makeFile(buildWordKeyGame(['single']));
    const result = await validateGameFile(file);
    expect(result.valid).toBe(true);
  });
});

// ─── Check: no round keys at all ─────────────────────────────────────────────

describe('No valid round keys', () => {
  it('rejects when game only has final and no round keys', async () => {
    const game = { final: validFinal };
    const file = makeFile(JSON.stringify({ game }));
    const result = await validateGameFile(file);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('Could not find any valid rounds');
  });
});

// ─── Check 7: final round validation ─────────────────────────────────────────

describe('Check 7: final round', () => {
  it('rejects when final key is missing', async () => {
    const game = { single: [validCategory] };
    const file = makeFile(JSON.stringify({ game }));
    const result = await validateGameFile(file);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('Invalid final round');
  });

  it('rejects when final.category is empty string', async () => {
    const game = { single: [validCategory], final: { ...validFinal, category: '' } };
    const file = makeFile(JSON.stringify({ game }));
    const result = await validateGameFile(file);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('Invalid final round');
  });

  it('rejects when final.clue is whitespace only', async () => {
    const game = { single: [validCategory], final: { ...validFinal, clue: '   ' } };
    const file = makeFile(JSON.stringify({ game }));
    const result = await validateGameFile(file);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('Invalid final round');
  });

  it('rejects when final.solution is missing', async () => {
    const game = { single: [validCategory], final: { category: 'History', clue: 'Some clue' } };
    const file = makeFile(JSON.stringify({ game }));
    const result = await validateGameFile(file);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('Invalid final round');
  });
});

// ─── Check 8: round/category structure ───────────────────────────────────────

describe('Check 8: round and category structure', () => {
  it('rejects an empty array for a round', async () => {
    const game = { single: [], final: validFinal };
    const file = makeFile(JSON.stringify({ game }));
    const result = await validateGameFile(file);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('non-empty array');
  });

  it('rejects a category with missing category string', async () => {
    const badCategory = { clues: [validClue] };
    const game = { single: [badCategory], final: validFinal };
    const file = makeFile(JSON.stringify({ game }));
    const result = await validateGameFile(file);
    expect(result.valid).toBe(false);
  });

  it('rejects a category with empty clues array', async () => {
    const badCategory = { category: 'Science', clues: [] };
    const game = { single: [badCategory], final: validFinal };
    const file = makeFile(JSON.stringify({ game }));
    const result = await validateGameFile(file);
    expect(result.valid).toBe(false);
  });

  it('rejects a category with whitespace-only category name', async () => {
    const badCategory = { category: '   ', clues: [validClue] };
    const game = { single: [badCategory], final: validFinal };
    const file = makeFile(JSON.stringify({ game }));
    const result = await validateGameFile(file);
    expect(result.valid).toBe(false);
  });
});

// ─── Check 9: clue validation ─────────────────────────────────────────────────

describe('Check 9: clue field validation', () => {
  it('rejects a clue with value 0', async () => {
    const badClue = { value: 0, clue: 'Q?', solution: 'A' };
    const game = { single: [{ category: 'Science', clues: [badClue] }], final: validFinal };
    const file = makeFile(JSON.stringify({ game }));
    const result = await validateGameFile(file);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('invalid value');
  });

  it('rejects a clue with negative value', async () => {
    const badClue = { value: -100, clue: 'Q?', solution: 'A' };
    const game = { single: [{ category: 'Science', clues: [badClue] }], final: validFinal };
    const file = makeFile(JSON.stringify({ game }));
    const result = await validateGameFile(file);
    expect(result.valid).toBe(false);
  });

  it('rejects a clue with empty clue text', async () => {
    const badClue = { value: 200, clue: '', solution: 'A' };
    const game = { single: [{ category: 'Science', clues: [badClue] }], final: validFinal };
    const file = makeFile(JSON.stringify({ game }));
    const result = await validateGameFile(file);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('clue text');
  });

  it('rejects a clue with whitespace-only solution', async () => {
    const badClue = { value: 200, clue: 'Q?', solution: '  ' };
    const game = { single: [{ category: 'Science', clues: [badClue] }], final: validFinal };
    const file = makeFile(JSON.stringify({ game }));
    const result = await validateGameFile(file);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('solution');
  });

  it('accepts a clue with value = 1', async () => {
    const goodClue = { value: 1, clue: 'Q?', solution: 'A' };
    const game = { single: [{ category: 'Science', clues: [goodClue] }], final: validFinal };
    const file = makeFile(JSON.stringify({ game }));
    const result = await validateGameFile(file);
    expect(result.valid).toBe(true);
  });
});

// ─── Happy path ───────────────────────────────────────────────────────────────

describe('Happy path: valid files', () => {
  it('returns valid: true with raw for a well-formed word-key file', async () => {
    const file = makeFile(buildWordKeyGame(['single', 'double']));
    const result = await validateGameFile(file);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.raw).toBeDefined();
      expect(result.raw.game).toBeDefined();
    }
  });

  it('returns valid: true with raw for a well-formed numeric-key file', async () => {
    const file = makeFile(buildNumericKeyGame(2));
    const result = await validateGameFile(file);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.raw).toBeDefined();
      expect(result.raw.game).toBeDefined();
    }
  });

  it('ignores isRandomlyGenerated key when classifying round keys', async () => {
    const game = {
      single: [validCategory],
      final: validFinal,
      isRandomlyGenerated: true,
    };
    const file = makeFile(JSON.stringify({ game }));
    const result = await validateGameFile(file);
    expect(result.valid).toBe(true);
  });
});
