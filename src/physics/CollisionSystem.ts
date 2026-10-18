import * as THREE from 'three';
import type { LevelManager, ObstacleSpec } from '../gameplay/LevelManager';
import type { BicyclePhysics } from './BicyclePhysics';

export type CrashReason = 'rock' | 'log' | 'driftwood' | 'gap' | 'offroad';

export interface ObstacleHit {
  obstacle: ObstacleSpec;
  worldPosition: THREE.Vector3;
}

export class CollisionSystem {
  private readonly hitPosition = new THREE.Vector3();

  constructor(private readonly level: LevelManager) {}

  checkObstacles(physics: BicyclePhysics): ObstacleHit | null {
    if (physics.height > 1.12) return null;
    const radius = 0.34;
    const px = physics.position.x;
    const pz = physics.position.z;

    for (const obstacle of this.level.data.obstacles) {
      if (Math.abs(obstacle.z - pz) > 3.5) continue;
      if (physics.height > obstacle.height + 0.08) continue;

      this.level.pointAt(obstacle.z, obstacle.lateral, this.hitPosition);
      const angle = this.level.yawAt(obstacle.z) + obstacle.rotation;
      const dx = px - this.hitPosition.x;
      const dz = pz - this.hitPosition.z;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const localX = cos * dx + sin * dz;
      const localZ = -sin * dx + cos * dz;

      if (
        Math.abs(localX) <= obstacle.width * 0.5 + radius &&
        Math.abs(localZ) <= obstacle.depth * 0.5 + radius
      ) {
        return { obstacle, worldPosition: this.hitPosition.clone() };
      }
    }
    return null;
  }

  checkGap(physics: BicyclePhysics): boolean {
    if (!physics.grounded || physics.height > 0.06) return false;
    const probeZ = physics.position.z + 0.52;
    const lateral = this.level.lateralAt(physics.position.x, probeZ);
    if (Math.abs(lateral) > this.level.roadHalfWidth() + 0.2) return false;
    return this.level.data.gaps.some((gap) => probeZ >= gap.start && probeZ <= gap.end);
  }

  checkBoundary(physics: BicyclePhysics): boolean {
    return Math.abs(physics.lateral) > this.level.roadHalfWidth() + 2.5;
  }

  isAtFinish(physics: BicyclePhysics): boolean {
    const z = physics.position.z + 0.45;
    return z >= this.level.data.finishZ - 0.6 &&
      Math.abs(this.level.lateralAt(physics.position.x, z)) < this.level.roadHalfWidth() + 0.8;
  }

  checkCheckpoint(physics: BicyclePhysics, nextCheckpointIndex: number): number {
    const checkpoint = this.level.data.checkpoints[nextCheckpointIndex];
    if (!checkpoint) return -1;
    if (physics.position.z < checkpoint.z) return -1;
    if (Math.abs(this.level.lateralAt(physics.position.x, physics.position.z)) >
      this.level.roadHalfWidth() + 0.8) {
      return -1;
    }
    return checkpoint.index;
  }

  obstacleCrashReason(obstacle: ObstacleSpec): CrashReason {
    if (obstacle.kind === 'rock') return 'rock';
    if (obstacle.kind === 'driftwood') return 'driftwood';
    return 'log';
  }
}
