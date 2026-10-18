import * as THREE from 'three';
import { clamp, damp, dampAngle, lerp } from '../utils/math';

export type CameraMode = 'chase' | 'close' | 'coast';

export interface CameraView {
  position: THREE.Vector3;
  yaw: number;
  speed: number;
  verticalHeight: number;
  grounded: boolean;
  lean: number;
}

export interface MenuView {
  position: THREE.Vector3;
  time: number;
}

const MODES: CameraMode[] = ['chase', 'close', 'coast'];

/**
 * Silky third-person camera with three hand-tuned compositions and gentle
 * speed/air feedback. Shake is short-lived and low amplitude by design.
 */
export class CameraController {
  private modeIndex = 0;
  private readonly smoothPosition = new THREE.Vector3();
  private readonly smoothLook = new THREE.Vector3();
  private readonly desiredPosition = new THREE.Vector3();
  private readonly desiredLook = new THREE.Vector3();
  private readonly smoothYaw = { value: 0 };
  private readonly temp = new THREE.Vector3();
  private currentFov = 57;
  private shakeStrength = 0;
  private shakeRemaining = 0;
  private initialized = false;
  private menuAngle = 1.52;

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    this.smoothPosition.set(0, 4, -6);
    this.smoothLook.set(0, 1.2, 2);
  }

  get mode(): CameraMode {
    return MODES[this.modeIndex] as CameraMode;
  }

  get modeLabel(): string {
    if (this.mode === 'chase') return 'CHASE CAM';
    if (this.mode === 'close') return 'CLOSE CAM';
    return 'COAST CAM';
  }

  cycleMode(): CameraMode {
    this.modeIndex = (this.modeIndex + 1) % MODES.length;
    return this.mode;
  }

  setMode(mode: CameraMode): void {
    const index = MODES.indexOf(mode);
    if (index >= 0) this.modeIndex = index;
  }

  beginRide(): void {
    this.modeIndex = 0;
  }

  resetForMenu(): void {
    this.modeIndex = 0;
    this.initialized = false;
    this.menuAngle = 1.52;
  }

  updateMenu(dt: number, view: MenuView): void {
    this.modeIndex = 0;
    this.menuAngle += dt * 0.045;
    const radius = 5.8;
    const angle = this.menuAngle + Math.sin(view.time * 0.07) * 0.1;
    this.desiredPosition.set(
      view.position.x + Math.sin(angle) * radius,
      view.position.y + 2.25 + Math.sin(view.time * 0.42) * 0.07,
      view.position.z + Math.cos(angle) * radius,
    );
    this.desiredLook.set(
      view.position.x + Math.sin(angle + Math.PI) * 0.15,
      view.position.y + 1.45,
      view.position.z + 0.3,
    );
    if (!this.initialized) {
      this.smoothPosition.copy(this.desiredPosition);
      this.smoothLook.copy(this.desiredLook);
      this.initialized = true;
    } else {
      this.smoothPosition.lerp(this.desiredPosition, 1 - Math.exp(-3.2 * dt));
      this.smoothLook.lerp(this.desiredLook, 1 - Math.exp(-5 * dt));
    }
    this.camera.position.copy(this.smoothPosition);
    this.camera.lookAt(this.smoothLook);
    this.setFov(53, dt);
  }

  update(dt: number, view: CameraView): void {
    this.smoothYaw.value = dampAngle(this.smoothYaw.value, view.yaw, 4.2, dt);
    const yaw = this.smoothYaw.value;
    const speedT = clamp(view.speed / 16.2, 0, 1);
    const forwardX = Math.sin(yaw);
    const forwardZ = Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);

    if (this.mode === 'chase') {
      const distance = 3.95 + speedT * 0.95;
      const height = 2.08 + speedT * 0.28;
      this.desiredPosition.set(
        view.position.x - forwardX * distance + rightX * 0.5,
        view.position.y + height,
        view.position.z - forwardZ * distance + rightZ * 0.5,
      );
      this.desiredPosition.x += rightX * view.lean * 0.75;
      this.desiredPosition.z += rightZ * view.lean * 0.75;
      const lookAhead = 2.25 + speedT * 1.35;
      this.desiredLook.set(
        view.position.x + forwardX * lookAhead + rightX * 0.18,
        view.position.y + 1.3 + (view.grounded ? 0 : 0.06),
        view.position.z + forwardZ * lookAhead + rightZ * 0.18,
      );
    } else if (this.mode === 'close') {
      const distance = 3.35 + speedT * 0.45;
      const height = 1.98;
      this.desiredPosition.set(
        view.position.x - forwardX * distance + rightX * 0.55,
        view.position.y + height,
        view.position.z - forwardZ * distance + rightZ * 0.55,
      );
      this.desiredLook.set(
        view.position.x + forwardX * 1.75 + rightX * 0.15,
        view.position.y + 1.46,
        view.position.z + forwardZ * 1.75 + rightZ * 0.15,
      );
    } else {
      const distance = 4.8 + speedT * 0.7;
      const side = -1;
      this.desiredPosition.set(
        view.position.x + rightX * side * distance - forwardX * 1.55,
        view.position.y + 1.72,
        view.position.z + rightZ * side * distance - forwardZ * 1.55,
      );
      this.desiredLook.set(
        view.position.x + forwardX * 1.4,
        view.position.y + 1.32,
        view.position.z + forwardZ * 1.4,
      );
    }

    if (!this.initialized) {
      this.smoothPosition.copy(this.desiredPosition);
      this.smoothLook.copy(this.desiredLook);
      this.initialized = true;
    } else {
      const positionLambda = this.mode === 'close' ? 8.5 : 5.6;
      this.smoothPosition.lerp(this.desiredPosition, 1 - Math.exp(-positionLambda * dt));
      this.smoothLook.lerp(this.desiredLook, 1 - Math.exp(-8.2 * dt));
    }

    this.camera.position.copy(this.smoothPosition);
    const speedFov = this.mode === 'coast' ? 48 : this.mode === 'close' ? 63 : 56;
    this.setFov(speedFov + speedT * (this.mode === 'chase' ? 8 : 4), dt);

    if (this.shakeRemaining > 0) {
      this.shakeRemaining = Math.max(0, this.shakeRemaining - dt);
      const decay = this.shakeStrength * (this.shakeRemaining > 0 ? 1 : 0);
      const t = performance.now() * 0.001;
      this.camera.position.x += Math.sin(t * 92) * decay;
      this.camera.position.y += Math.cos(t * 131) * decay * 0.6;
      this.camera.position.z += Math.sin(t * 77 + 1.2) * decay * 0.8;
      this.shakeStrength *= Math.exp(-2.9 * dt);
      this.temp.copy(this.smoothLook).add(new THREE.Vector3(0, 0, 0));
    } else {
      this.shakeStrength = 0;
    }

    this.camera.lookAt(this.smoothLook);
    this.camera.position.y = Math.max(0.55, this.camera.position.y);
  }

  triggerShake(strength: number, duration = 0.35): void {
    this.shakeStrength = Math.max(this.shakeStrength, strength);
    this.shakeRemaining = Math.max(this.shakeRemaining, duration);
  }

  snapBehind(view: CameraView): void {
    this.smoothYaw.value = view.yaw;
    this.initialized = false;
  }

  setFov(target: number, dt: number): void {
    const next = damp(this.currentFov, target, 4.2, dt);
    if (Math.abs(next - this.currentFov) > 0.001) {
      this.currentFov = next;
      this.camera.fov = next;
      this.camera.updateProjectionMatrix();
    }
  }

  getLookTarget(): THREE.Vector3 {
    return this.smoothLook;
  }

  getPercentage(): number {
    return lerp(0, 1, this.mode === 'chase' ? 0.33 : this.mode === 'close' ? 0.66 : 1);
  }
}
