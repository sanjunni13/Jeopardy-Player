import { describe, it, expect } from 'vitest';
import { generateSessionId } from './sessionIdGenerator';

describe('generateSessionId', () => {
  it('produces a string of at least 22 characters', () => {
    const id = generateSessionId();
    expect(id.length).toBeGreaterThanOrEqual(22);
  });

  it('contains only URL-safe characters [A-Za-z0-9_-]', () => {
    const id = generateSessionId();
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('generates unique IDs across multiple calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateSessionId()));
    expect(ids.size).toBe(100);
  });
});
