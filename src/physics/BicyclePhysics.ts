import * as THREE from 'three';
import type { LevelManager } from '../gameplay/LevelManager';
import { clamp, damp, lerp } from '../utils/math';

export interface PhysicsInput {
  throttle: boolean;
  brake: boolean;
  steer: number;
  jumpPressed: boolean;
}

export interface PhysicsSnapshot {
  position: THREE.Vector3;
  yaw: number;
  speed: number;
  speedKmh: number;
  height: number;
  verticalVelocity: number;
  grounded: boolean;
  steerInput: number;
  steerAngle: number;
  lean: number;
  distance: number;
  lateral: number;
  offRoad: boolean;
  justLanded: boolean;
  airTime: number;
}

/**
 * Lightweight arcade bicycle model. Motion is always along the bicycle's
 * forward vector, so it cannot slide sideways; steering changes heading and
 * lean, while wheel and pedal animation consume actual travelled distance.
 */
export class BicyclePhysics {
  readonly position = new THREE.Vector3();
  readonly maxSpeed = 16.2;
  readonly wheelRadius = 0.45;

  yaw = 0;
  speed = 0;
  height = 0;
  verticalVelocity = 0;
  grounded = true;
  steerInput = 0;
  steerAngle = 0;
  lean = 0;
  distance = 0;
  lateral = 0;
  offRoad = false;
  airTime = 0;
  justLanded = false;
  lastLandingImpact = 0;

  private readonly forward = new THREE.Vector3();
  private readonly respawn = new THREE.Vector3();
  private respawnYaw = 0;

  constructor(private readonly level: LevelManager) {
    this.resetAt(level.centerX(level.data.startZ), level.data.startZ, level.startYaw());
  }

  resetAt(x: number, z: number, yaw: number): void {
    this.position.set(x, 0, z);
    this.yaw = yaw;
    this.speed = 0;
    this.height = 0;
    this.verticalVelocity = 0;
    this.grounded = true;
    this.steerInput = 0;
    this.steerAngle = 0;
    this.lean = 0;
    this.distance = this.level.distanceForZ(z);
    this.lateral = this.level.lateralAt(x, z);
    this.offRoad = false;
    this.airTime = 0;
    this.justLanded = false;
    this.lastLandingImpact = 0;
    this.respawn.copy(this.position);
    this.respawnYaw = yaw;
  }

  setRespawnPoint(x: number, z: number, yaw: number): void {
    this.respawn.set(x, 0, z);
    this.respawnYaw = yaw;
  }

  respawnAtCheckpoint(): void {
    this.position.copy(this.respawn);
    this.yaw = this.respawnYaw;
    this.speed = 0;
    this.height = 0;
    this.verticalVelocity = 0;
    this.grounded = true;
    this.lateral = this.level.lateralAt(this.position.x, this.position.z);
    this.offRoad = false;
    this.airTime = 0;
    this.justLanded = false;
    this.steerInput = 0;
    this.steerAngle = 0;
    this.lean = 0;
  }

  placeAt(x: number, z: number, yaw: number): void {
    this.position.set(x, 0, z);
    this.yaw = yaw;
    this.height = 0;
    this.verticalVelocity = 0;
    this.grounded = true;
    this.speed = 0;
    this.lean = 0;
    this.steerInput = 0;
    this.steerAngle = 0;
    this.lateral = this.level.lateralAt(x, z);
    this.offRoad = false;
    this.distance = Math.max(this.distance, this.level.distanceForZ(z));
  }

  update(dt: number, input: PhysicsInput): void {
    this.justLanded = false;
    const safeDt = Math.min(0.04, Math.max(0.001, dt));

    this.steerInput = damp(
      this.steerInput,
      clamp(input.steer, -1, 1),
      10,
      safeDt,
    );

    this.lateral = this.level.lateralAt(this.position.x, this.position.z);
    const edge = this.level.roadHalfWidth();
    this.offRoad = Math.abs(this.lateral) > edge + 0.2;

    const speedFactor = clamp(this.speed / this.maxSpeed, 0, 1);
    const steeringAuthority =
      1.08 * clamp(this.speed / 2.4, 0, 1) * lerp(1, 0.62, speedFactor);
    // In the +Z-forward, +Y-up right-handed frame, a positive Y yaw rotates
    // forward toward +X. The chase camera looks along +Z, so screen-right is
    // -X: steer=+1 (right) must therefore produce a negative yaw.
    const yawRate = -this.steerInput * steeringAuthority;

    // steerAngle is the actual Three.js rotation around +Y. It is positive
    // toward +X (vehicle-left) and negative toward -X (vehicle-right).
    const targetSteerAngle =
      -this.steerInput * lerp(0.43, 0.28, speedFactor);
    this.steerAngle = damp(this.steerAngle, targetSteerAngle, 13, safeDt);

    // A positive Z roll leans the top of the vehicle toward local -X (right),
    // so steer=+1 needs a positive lean to lean into a right turn.
    const targetLean =
      this.steerInput * 0.31 * clamp(this.speed / 5.6, 0, 1) * lerp(1, 0.76, speedFactor);
    this.lean = damp(this.lean, targetLean, 6.5, safeDt);

    // Longitudinal dynamics.
    const maxSpeedNow = this.offRoad ? 6.1 : this.maxSpeed;
    if (input.brake) {
      this.speed = Math.max(0, this.speed - 11.2 * safeDt);
    } else if (input.throttle && this.speed < maxSpeedNow) {
      const acceleration = this.offRoad ? 3.4 : 6.3;
      this.speed += acceleration * safeDt * (1 - 0.22 * speedFactor);
    }

    const drag = (this.offRoad ? 1.5 : 0.28) + this.speed * this.speed * (this.offRoad ? 0.06 : 0.016);
    this.speed = Math.max(0, this.speed - drag * safeDt);
    if (input.throttle && this.speed < 0.7) {
      // Make the first pedal strokes crisp without feeling twitchy.
      this.speed += 2.5 * safeDt;
    }
    this.speed = Math.min(this.speed, maxSpeedNow + 0.8);

    if (input.jumpPressed && this.grounded) {
      this.verticalVelocity = 5.6;
      this.grounded = false;
      this.airTime = 0;
    }

    if (!this.grounded) {
      this.airTime += safeDt;
      this.verticalVelocity -= 15.3 * safeDt;
      this.height += this.verticalVelocity * safeDt;
      if (this.height <= 0) {
        this.lastLandingImpact = Math.max(0, -this.verticalVelocity);
        this.height = 0;
        this.verticalVelocity = 0;
        this.grounded = true;
        this.justLanded = true;
        this.airTime = 0;
      }
    }

    this.yaw += yawRate * safeDt;
    const travelled = this.speed * safeDt;
    this.forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.position.addScaledVector(this.forward, travelled);
    this.distance += travelled;
    this.lateral = this.level.lateralAt(this.position.x, this.position.z);

    // Anticipate a soft speed drag at the edges before a crash is issued.
    if (Math.abs(this.lateral) > edge - 0.1) {
      this.speed = Math.max(0, this.speed - (1.1 + this.speed * 0.08) * safeDt);
    }

    if (this.height <= 0.001 && !this.grounded) {
      this.height = 0;
      this.grounded = true;
    }
  }

  applyCrashSlowdown(): void {
    this.speed *= 0.28;
    this.steerInput *= 0.2;
  }

  snapshot(): PhysicsSnapshot {
    return {
      position: this.position,
      yaw: this.yaw,
      speed: this.speed,
      speedKmh: this.speed * 3.6,
      height: this.height,
      verticalVelocity: this.verticalVelocity,
      grounded: this.grounded,
      steerInput: this.steerInput,
      steerAngle: this.steerAngle,
      lean: this.lean,
      distance: this.distance,
      lateral: this.lateral,
      offRoad: this.offRoad,
      justLanded: this.justLanded,
      airTime: this.airTime,
    };
  }
}
