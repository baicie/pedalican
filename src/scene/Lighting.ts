import * as THREE from 'three';

export const SUN_DIRECTION = new THREE.Vector3(-0.38, 0.25, 0.6).normalize();

export class Lighting {
  readonly sun: THREE.DirectionalLight;
  readonly fill: THREE.DirectionalLight;
  readonly hemisphere: THREE.HemisphereLight;
  private readonly target = new THREE.Object3D();
  private readonly fillTarget = new THREE.Object3D();

  constructor(scene: THREE.Scene) {
    this.hemisphere = new THREE.HemisphereLight(0xdff8ff, 0x687d4c, 1.16);
    scene.add(this.hemisphere);

    this.sun = new THREE.DirectionalLight(0xffce8a, 2.35);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -24;
    this.sun.shadow.camera.right = 24;
    this.sun.shadow.camera.top = 24;
    this.sun.shadow.camera.bottom = -24;
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 100;
    this.sun.shadow.bias = -0.0002;
    this.sun.shadow.normalBias = 0.03;
    scene.add(this.sun);
    scene.add(this.target);
    this.sun.target = this.target;

    this.fill = new THREE.DirectionalLight(0xffd8b0, 0.78);
    this.fill.position.set(16, 20, -22);
    scene.add(this.fill);
    scene.add(this.fillTarget);
    this.fill.target = this.fillTarget;
  }

  update(focus: THREE.Vector3): void {
    this.target.position.set(focus.x, 0.8, focus.z);
    this.target.updateMatrixWorld();
    this.sun.position.copy(focus).addScaledVector(SUN_DIRECTION, 52);
    this.fill.position.set(focus.x + 15, focus.y + 18, focus.z - 9);
    this.fillTarget.position.set(focus.x, focus.y + 1.1, focus.z);
    this.fillTarget.updateMatrixWorld();
  }
}
