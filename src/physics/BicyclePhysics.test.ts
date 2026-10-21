import { describe, expect, it } from 'vitest';
import { LevelManager } from '../gameplay/LevelManager';
import { BicyclePhysics } from './BicyclePhysics';

const idle = { throttle: false, brake: false, steer: 0, jumpPressed: false };

describe('BicyclePhysics', () => {
  it('accelerates forward under throttle', () => {
    const bike = new BicyclePhysics(new LevelManager());
    const startZ = bike.position.z;
    for (let i = 0; i < 60; i += 1) {
      bike.update(1 / 60, { ...idle, throttle: true });
    }
    expect(bike.speed).toBeGreaterThan(0);
    expect(bike.position.z).toBeGreaterThan(startZ);
    expect(bike.grounded).toBe(true);
  });

  it('jumps from the ground and lands again', () => {
    const bike = new BicyclePhysics(new LevelManager());
    bike.update(1 / 60, { ...idle, jumpPressed: true });
    expect(bike.grounded).toBe(false);
    expect(bike.height).toBeGreaterThan(0);

    for (let i = 0; i < 180; i += 1) {
      bike.update(1 / 60, idle);
    }
    expect(bike.grounded).toBe(true);
    expect(bike.height).toBe(0);
  });

  it('respawns at the configured checkpoint', () => {
    const bike = new BicyclePhysics(new LevelManager());
    bike.setRespawnPoint(3, 50, 0.4);
    bike.placeAt(20, 100, 0);
    bike.respawnAtCheckpoint();
    expect(bike.position.x).toBe(3);
    expect(bike.position.z).toBe(50);
    expect(bike.yaw).toBe(0.4);
    expect(bike.speed).toBe(0);
  });
});
