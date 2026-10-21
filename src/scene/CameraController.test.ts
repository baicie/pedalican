import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CameraController, type CameraView } from './CameraController';

function view(): CameraView {
  return {
    position: new THREE.Vector3(0, 0, 0),
    yaw: 0,
    speed: 0,
    verticalHeight: 0,
    grounded: true,
    lean: 0,
  };
}

describe('CameraController', () => {
  it('keeps world -X on screen-right in the default chase view', () => {
    const camera = new THREE.PerspectiveCamera(57, 16 / 9, 0.1, 1000);
    const controller = new CameraController(camera);
    controller.snapBehind(view());
    controller.update(1 / 60, view());
    camera.updateMatrixWorld(true);

    const screenLeft = new THREE.Vector3(1, 0, 0).project(camera).x;
    const screenRight = new THREE.Vector3(-1, 0, 0).project(camera).x;
    expect(screenLeft).toBeLessThan(screenRight);
  });
});
