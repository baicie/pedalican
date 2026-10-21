import { describe, expect, it } from 'vitest';
import { LevelManager } from '../gameplay/LevelManager';
import { BicyclePhysics } from './BicyclePhysics';
import { CollisionSystem } from './CollisionSystem';

describe('CollisionSystem', () => {
  it('detects an obstacle at its generated position', () => {
    const level = new LevelManager();
    const bike = new BicyclePhysics(level);
    const collisions = new CollisionSystem(level);
    const obstacle = level.data.obstacles[0] as NonNullable<typeof level.data.obstacles[0]>;
    const point = level.pointAt(obstacle.z, obstacle.lateral);
    bike.placeAt(point.x, obstacle.z, level.yawAt(obstacle.z));

    const hit = collisions.checkObstacles(bike);
    expect(hit?.obstacle.id).toBe(obstacle.id);
  });

  it('detects gaps and the finish trigger', () => {
    const level = new LevelManager();
    const bike = new BicyclePhysics(level);
    const collisions = new CollisionSystem(level);
    const gap = level.data.gaps[0] as NonNullable<typeof level.data.gaps[0]>;

    bike.placeAt(level.centerX(gap.start), gap.start, level.yawAt(gap.start));
    expect(collisions.checkGap(bike)).toBe(true);

    bike.placeAt(
      level.centerX(level.data.finishZ - 0.2),
      level.data.finishZ - 0.2,
      level.yawAt(level.data.finishZ - 0.2),
    );
    expect(collisions.isAtFinish(bike)).toBe(true);
  });
});
