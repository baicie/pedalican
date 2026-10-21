import { beforeEach, describe, expect, it } from 'vitest';
import { ScoreManager } from './ScoreManager';

describe('ScoreManager', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('chains fish inside the combo window and resets after it', () => {
    const score = new ScoreManager();
    expect(score.registerFish(1)).toBe(100);
    expect(score.registerFish(2)).toBe(125);
    expect(score.combo).toBe(2);
    expect(score.score).toBe(225);

    expect(score.registerFish(10)).toBe(100);
    expect(score.combo).toBe(1);
    expect(score.fish).toBe(3);
  });

  it('awards a positive completion bonus and never subtracts below zero', () => {
    const score = new ScoreManager();
    const bonus = score.finish(90, 5, 0, 20);
    expect(bonus).toBeGreaterThan(0);
    expect(score.score).toBe(bonus);
    expect(score.finish(600, 0, 99, 20)).toBe(0);
  });

  it('persists best score and best victory time', () => {
    const first = new ScoreManager();
    expect(first.recordRun(900, 100, true)).toBe(true);
    expect(first.recordRun(800, 80, true)).toBe(true);
    expect(first.recordRun(700, 120, true)).toBe(false);

    const reloaded = new ScoreManager();
    expect(reloaded.bestScore).toBe(900);
    expect(reloaded.bestTime).toBe(80);
  });
});
