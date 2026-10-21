import { describe, expect, it } from 'vitest';
import { LevelManager } from './LevelManager';

describe('LevelManager', () => {
  it('generates the same deterministic course for the same seed', () => {
    const first = new LevelManager();
    const second = new LevelManager();
    expect(first.data).toEqual(second.data);
  });

  it('contains the documented checkpoint, gap, and bridge layout', () => {
    const level = new LevelManager();
    expect(level.data.checkpoints.map((checkpoint) => checkpoint.label)).toEqual([
      'GULL ROCK',
      'LIGHTHOUSE BEND',
    ]);
    expect(level.data.gaps).toHaveLength(2);
    expect(level.data.bridges).toHaveLength(2);
    expect(level.data.trackLength).toBe(780);
  });

  it('maps distance along the route to progress', () => {
    const level = new LevelManager();
    expect(level.progressForZ(level.data.startZ)).toBeCloseTo(0, 5);
    expect(level.progressForZ(level.data.finishZ)).toBeCloseTo(1, 5);
    expect(level.progressForZ(level.data.finishZ + 50)).toBe(1);
  });
});
