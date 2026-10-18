import * as THREE from 'three';

export const Y_AXIS = new THREE.Vector3(0, 1, 0);

export interface IKResult {
  joint: THREE.Vector3;
  clampedTarget: THREE.Vector3;
}

/**
 * Analytic two-bone IK. A pole point pulls the bend in a natural direction.
 * The returned end is the clamped target where the distal bone actually lands.
 */
export function solveTwoBoneIK(
  root: THREE.Vector3,
  target: THREE.Vector3,
  upperLength: number,
  lowerLength: number,
  pole: THREE.Vector3,
  outJoint = new THREE.Vector3(),
  outEnd = new THREE.Vector3(),
): IKResult {
  // Keep a distinct direction vector: reusing outEnd here aliases the vector
  // and corrupts every subsequent term (a nasty IK bug with a very funky pose).
  const direction = new THREE.Vector3().subVectors(target, root);
  let distance = direction.length();
  const maximum = upperLength + lowerLength - 0.0005;
  const minimum = Math.abs(upperLength - lowerLength) + 0.0005;
  distance = Math.min(maximum, Math.max(minimum, distance));

  if (direction.lengthSq() < 1e-8) {
    direction.set(0, -1, 0);
  } else {
    direction.normalize();
  }

  outEnd.copy(root).addScaledVector(direction, distance);

  const along = (upperLength * upperLength - lowerLength * lowerLength + distance * distance) /
    (2 * distance);
  const height = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));

  const base = new THREE.Vector3(root.x + direction.x * along, root.y + direction.y * along, root.z + direction.z * along);
  const poleDirection = new THREE.Vector3().subVectors(pole, root);
  const projection = poleDirection.dot(direction);
  poleDirection.addScaledVector(direction, -projection);

  if (poleDirection.lengthSq() < 1e-7) {
    poleDirection.set(0, 0, 1);
    if (Math.abs(direction.z) > 0.95) poleDirection.set(0, 1, 0);
    poleDirection.addScaledVector(direction, -poleDirection.dot(direction));
  }
  poleDirection.normalize();
  outJoint.copy(base).addScaledVector(poleDirection, height);
  return { joint: outJoint, clampedTarget: outEnd };
}

const tempDirection = new THREE.Vector3();

/** Points a bone modelled along local +Y from `start` towards `end`. */
export function poseBone(object: THREE.Object3D, start: THREE.Vector3, end: THREE.Vector3): void {
  object.position.copy(start);
  tempDirection.subVectors(end, start);
  if (tempDirection.lengthSq() < 1e-8) {
    tempDirection.set(0, 1, 0);
  } else {
    tempDirection.normalize();
  }
  object.quaternion.setFromUnitVectors(Y_AXIS, tempDirection);
}
