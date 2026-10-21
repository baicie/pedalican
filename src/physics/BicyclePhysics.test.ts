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

  it('does not yaw while stationary but still points the front wheel', () => {
    const bike = new BicyclePhysics(new LevelManager());
    bike.resetAt(0, 0, 0);
    bike.update(1 / 60, { ...idle, steer: -1 });
    expect(bike.yaw).toBe(0);
    expect(bike.position.x).toBe(0);
    expect(bike.steerAngle).toBeGreaterThan(0);
  });

  it('turns left for steer=-1 and right for steer=+1', () => {
    const level = new LevelManager();
    const left = new BicyclePhysics(level);
    const right = new BicyclePhysics(level);
    left.resetAt(0, 0, 0);
    right.resetAt(0, 0, 0);

    for (let i = 0; i < 60; i += 1) {
      left.update(1 / 60, { ...idle, throttle: true });
      right.update(1 / 60, { ...idle, throttle: true });
    }
    for (let i = 0; i < 60; i += 1) {
      left.update(1 / 60, { ...idle, throttle: true, steer: -1 });
      right.update(1 / 60, { ...idle, throttle: true, steer: 1 });
    }

    expect(left.yaw).toBeGreaterThan(0);
    expect(left.position.x).toBeGreaterThan(0);
    expect(left.steerAngle).toBeGreaterThan(0);
    expect(left.lean).toBeLessThan(0);

    expect(right.yaw).toBeLessThan(0);
    expect(right.position.x).toBeLessThan(0);
    expect(right.steerAngle).toBeLessThan(0);
    expect(right.lean).toBeGreaterThan(0);
  });

  it('produces mirror-symmetric left/right trajectories', () => {
    const level = new LevelManager();
    const left = new BicyclePhysics(level);
    const right = new BicyclePhysics(level);
    left.resetAt(0, 0, 0);
    right.resetAt(0, 0, 0);

    for (let i = 0; i < 60; i += 1) {
      left.update(1 / 60, { ...idle, throttle: true });
      right.update(1 / 60, { ...idle, throttle: true });
    }
    for (let i = 0; i < 60; i += 1) {
      left.update(1 / 60, { ...idle, throttle: true, steer: -1 });
      right.update(1 / 60, { ...idle, throttle: true, steer: 1 });
    }

    expect(left.yaw).toBeCloseTo(-right.yaw, 5);
    expect(left.steerAngle).toBeCloseTo(-right.steerAngle, 5);
    expect(left.lean).toBeCloseTo(-right.lean, 5);
    expect(left.position.x).toBeCloseTo(-right.position.x, 5);
    expect(left.position.z).toBeCloseTo(right.position.z, 5);
  });

  it('restores heading and steering after respawning', () => {
    const bike = new BicyclePhysics(new LevelManager());
    bike.setRespawnPoint(3, 50, 0.4);
    for (let i = 0; i < 60; i += 1) {
      bike.update(1 / 60, { ...idle, throttle: true, steer: 1 });
    }
    bike.respawnAtCheckpoint();
    expect(bike.yaw).toBe(0.4);
    expect(bike.speed).toBe(0);
    expect(bike.steerInput).toBe(0);
    expect(bike.steerAngle).toBe(0);
    expect(bike.lean).toBe(0);

    for (let i = 0; i < 60; i += 1) {
      bike.update(1 / 60, { ...idle, throttle: true, steer: -1 });
    }
    expect(bike.yaw).toBeGreaterThan(0.4);
  });
});
