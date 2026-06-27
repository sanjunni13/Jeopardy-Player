import { describe, it, expect } from 'vitest';
import { applyScoreMark, reverseAndApplyMark } from './finalJeopardyScoring';

describe('applyScoreMark', () => {
  it('adds wager to score when marked correct', () => {
    expect(applyScoreMark(1000, 500, true)).toBe(1500);
  });

  it('subtracts wager from score when marked incorrect', () => {
    expect(applyScoreMark(1000, 500, false)).toBe(500);
  });

  it('handles zero wager', () => {
    expect(applyScoreMark(1000, 0, true)).toBe(1000);
    expect(applyScoreMark(1000, 0, false)).toBe(1000);
  });

  it('allows score to go negative', () => {
    expect(applyScoreMark(200, 500, false)).toBe(-300);
  });
});

describe('reverseAndApplyMark', () => {
  it('changes correct to incorrect: reverses +W then applies -W', () => {
    // Player had score S, was marked correct → score became S+W
    // Now we reverse correct (+W → -W) and apply incorrect (-W)
    // Net: currentScore - W - W = currentScore - 2W
    const scoreAfterCorrect = 1500; // was 1000 + 500
    expect(reverseAndApplyMark(scoreAfterCorrect, 500, true, false)).toBe(500);
    // 1500 - 500 (reverse correct) = 1000, then 1000 - 500 (apply incorrect) = 500
  });

  it('changes incorrect to correct: reverses -W then applies +W', () => {
    // Player had score S, was marked incorrect → score became S-W
    // Now we reverse incorrect (-W → +W) and apply correct (+W)
    const scoreAfterIncorrect = 500; // was 1000 - 500
    expect(reverseAndApplyMark(scoreAfterIncorrect, 500, false, true)).toBe(1500);
    // 500 + 500 (reverse incorrect) = 1000, then 1000 + 500 (apply correct) = 1500
  });

  it('same mark (correct to correct) produces no net change', () => {
    const score = 1500; // was 1000 + 500
    expect(reverseAndApplyMark(score, 500, true, true)).toBe(1500);
    // 1500 - 500 (reverse correct) = 1000, then 1000 + 500 (apply correct) = 1500
  });

  it('same mark (incorrect to incorrect) produces no net change', () => {
    const score = 500; // was 1000 - 500
    expect(reverseAndApplyMark(score, 500, false, false)).toBe(500);
    // 500 + 500 (reverse incorrect) = 1000, then 1000 - 500 (apply incorrect) = 500
  });
});
