import * as THREE from 'three';
import type { Bicycle } from './Bicycle';
import type { Pelican, RidingTargets } from './Pelican';
import type { PhysicsSnapshot } from '../physics/BicyclePhysics';

export interface RidingAnimationInput {
  dt: number;
  time: number;
  snapshot: PhysicsSnapshot;
  steering: number;
  crashFactor: number;
}

/**
 * Bridges machine and bird: reads real anchors from the bicycle hierarchy,
 * converts them into the pelican's local space, and runs the IK rig.
 */
export class RidingAnimation {
  private readonly targets: RidingTargets = {
    leftPedal: new THREE.Vector3(),
    rightPedal: new THREE.Vector3(),
    leftGrip: new THREE.Vector3(),
    rightGrip: new THREE.Vector3(),
  };
  private readonly world = new THREE.Vector3();

  constructor(
    private readonly bicycle: Bicycle,
    private readonly pelican: Pelican,
  ) {}

  update(input: RidingAnimationInput): void {
    const { dt, time, snapshot, steering, crashFactor } = input;
    this.bicycle.update(snapshot.distance, snapshot.steerAngle);
    this.readAnchors();

    this.pelican.updateRiding({
      dt,
      time,
      speed: snapshot.speed,
      distance: snapshot.distance,
      steering,
      lean: snapshot.lean,
      grounded: snapshot.grounded,
      verticalVelocity: snapshot.verticalVelocity,
      crashFactor,
      targets: this.targets,
    });
  }

  updateIdle(time: number, dt: number): void {
    this.bicycle.update(0, 0);
    this.readAnchors();
    this.pelican.updateRiding({
      dt,
      time,
      speed: 0,
      distance: 0,
      steering: 0,
      lean: 0,
      grounded: true,
      verticalVelocity: 0,
      crashFactor: 0,
      targets: this.targets,
    });
  }

  /** The hand feathers should curl toward the centre of the bicycle. */
  getGripWorldPositions(): { left: THREE.Vector3; right: THREE.Vector3 } {
    const left = new THREE.Vector3();
    const right = new THREE.Vector3();
    this.bicycle.getWorldAnchor('left', 'grip', left);
    this.bicycle.getWorldAnchor('right', 'grip', right);
    return { left, right };
  }

  private readAnchors(): void {
    this.bicycle.root.updateWorldMatrix(true, true);
    this.pelican.root.updateWorldMatrix(true, false);

    this.bicycle.getWorldAnchor('left', 'pedal', this.world);
    this.targets.leftPedal.copy(this.pelican.root.worldToLocal(this.world));

    this.bicycle.getWorldAnchor('right', 'pedal', this.world);
    this.targets.rightPedal.copy(this.pelican.root.worldToLocal(this.world));

    this.bicycle.getWorldAnchor('left', 'grip', this.world);
    this.targets.leftGrip.copy(this.pelican.root.worldToLocal(this.world));

    this.bicycle.getWorldAnchor('right', 'grip', this.world);
    this.targets.rightGrip.copy(this.pelican.root.worldToLocal(this.world));
  }
}
