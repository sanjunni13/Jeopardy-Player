import { describe, it, expect } from 'vitest';
import { sampleGame } from './sampleGame';
import { validateGameFile } from '../utils/gameValidator';

function makeFile(content: string): File {
  const blob = new Blob([content], { type: 'application/json' });
  return new File([blob], 'sample_game.json', { type: 'application/json' });
}

describe('sampleGame', () => {
  it('passes validateGameFile without modification', async () => {
    const json = JSON.stringify(sampleGame, null, 2);
    const file = makeFile(json);
    const result = await validateGameFile(file);
    expect(result.valid).toBe(true);
  });

  it('has a top-level game key', () => {
    expect(sampleGame).toHaveProperty('game');
  });

  it('has single round with 6 categories each containing 5 clues', () => {
    const single = sampleGame.game.single as Array<{ category: string; clues: unknown[] }>;
    expect(single).toHaveLength(6);
    for (const cat of single) {
      expect(cat.clues).toHaveLength(5);
    }
  });

  it('single round uses values 200, 400, 600, 800, 1000', () => {
    const single = sampleGame.game.single as Array<{ category: string; clues: Array<{ value: number }> }>;
    const expectedValues = [200, 400, 600, 800, 1000];
    for (const cat of single) {
      const values = cat.clues.map((c) => c.value);
      expect(values).toEqual(expectedValues);
    }
  });

  it('has double round with 6 categories each containing 5 clues', () => {
    const double = sampleGame.game.double as Array<{ category: string; clues: unknown[] }>;
    expect(double).toHaveLength(6);
    for (const cat of double) {
      expect(cat.clues).toHaveLength(5);
    }
  });

  it('double round uses values 400, 800, 1200, 1600, 2000', () => {
    const double = sampleGame.game.double as Array<{ category: string; clues: Array<{ value: number }> }>;
    const expectedValues = [400, 800, 1200, 1600, 2000];
    for (const cat of double) {
      const values = cat.clues.map((c) => c.value);
      expect(values).toEqual(expectedValues);
    }
  });

  it('has exactly 2 daily doubles in single round in different categories', () => {
    const single = sampleGame.game.single as Array<{ category: string; clues: Array<{ dailyDouble: boolean }> }>;
    const ddCategories: number[] = [];
    let ddCount = 0;
    single.forEach((cat, catIdx) => {
      for (const clue of cat.clues) {
        if (clue.dailyDouble) {
          ddCount++;
          ddCategories.push(catIdx);
        }
      }
    });
    expect(ddCount).toBe(2);
    expect(new Set(ddCategories).size).toBe(2);
  });

  it('has exactly 2 daily doubles in double round in different categories', () => {
    const double = sampleGame.game.double as Array<{ category: string; clues: Array<{ dailyDouble: boolean }> }>;
    const ddCategories: number[] = [];
    let ddCount = 0;
    double.forEach((cat, catIdx) => {
      for (const clue of cat.clues) {
        if (clue.dailyDouble) {
          ddCount++;
          ddCategories.push(catIdx);
        }
      }
    });
    expect(ddCount).toBe(2);
    expect(new Set(ddCategories).size).toBe(2);
  });

  it('daily doubles in single round are at value 600 or higher', () => {
    const single = sampleGame.game.single as Array<{ category: string; clues: Array<{ value: number; dailyDouble: boolean }> }>;
    for (const cat of single) {
      for (const clue of cat.clues) {
        if (clue.dailyDouble) {
          expect(clue.value).toBeGreaterThanOrEqual(600);
        }
      }
    }
  });

  it('daily doubles in double round are at value 1200 or higher', () => {
    const double = sampleGame.game.double as Array<{ category: string; clues: Array<{ value: number; dailyDouble: boolean }> }>;
    for (const cat of double) {
      for (const clue of cat.clues) {
        if (clue.dailyDouble) {
          expect(clue.value).toBeGreaterThanOrEqual(1200);
        }
      }
    }
  });

  it('has a final object with category, clue, and solution strings', () => {
    const final = sampleGame.game.final as { category: string; clue: string; solution: string };
    expect(typeof final.category).toBe('string');
    expect(final.category.length).toBeGreaterThan(0);
    expect(typeof final.clue).toBe('string');
    expect(final.clue.length).toBeGreaterThan(0);
    expect(typeof final.solution).toBe('string');
    expect(final.solution.length).toBeGreaterThan(0);
  });

  it('every clue has value, clue, solution, dailyDouble, and html fields', () => {
    const rounds = [sampleGame.game.single, sampleGame.game.double] as Array<Array<{ category: string; clues: Array<Record<string, unknown>> }>>;
    for (const round of rounds) {
      for (const cat of round) {
        for (const clue of cat.clues) {
          expect(clue).toHaveProperty('value');
          expect(clue).toHaveProperty('clue');
          expect(clue).toHaveProperty('solution');
          expect(clue).toHaveProperty('dailyDouble');
          expect(clue).toHaveProperty('html');
          expect(typeof clue.value).toBe('number');
          expect(typeof clue.clue).toBe('string');
          expect(typeof clue.solution).toBe('string');
          expect(typeof clue.dailyDouble).toBe('boolean');
          expect(clue.html).toBe(false);
        }
      }
    }
  });
});
