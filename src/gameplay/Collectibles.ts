import * as THREE from 'three';
import type { FishSpec, LevelManager } from './LevelManager';
import { createSoftCircleTexture } from '../utils/canvas';

export interface CollectedFish {
  spec: FishSpec;
  position: THREE.Vector3;
}

/**
 * All fish are drawn with four instanced meshes and one points cloud. This
 * keeps dozens of floating collectibles cheap while still allowing each one to
 * bob, turn, glow, and vanish independently.
 */
export class Collectibles {
  readonly root = new THREE.Group();
  readonly total: number;
  private readonly specs: FishSpec[];
  private readonly active: boolean[];
  private readonly positions: THREE.Vector3[];
  private readonly bodyMesh: THREE.InstancedMesh;
  private readonly finMesh: THREE.InstancedMesh;
  private readonly eyeMesh: THREE.InstancedMesh;
  private readonly glow: THREE.Points;
  private readonly glowGeometry: THREE.BufferGeometry;
  private readonly fishQuaternion = new THREE.Quaternion();
  private readonly eyeMatrix = new THREE.Matrix4();
  private readonly dummy = new THREE.Object3D();
  private readonly eyeDummy = new THREE.Object3D();
  private readonly tempColor = new THREE.Color();

  constructor(private readonly level: LevelManager) {
    this.root.name = 'collectible-fish';
    this.specs = level.data.fish;
    this.total = this.specs.length;
    this.active = this.specs.map(() => true);
    this.positions = this.specs.map(() => new THREE.Vector3());

    const bodyGeometry = new THREE.SphereGeometry(1, 12, 8);
    bodyGeometry.scale(0.11, 0.078, 0.22);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0xf4b84f,
      roughness: 0.34,
      metalness: 0.34,
      emissive: 0x4f2a00,
      emissiveIntensity: 0.18,
    });
    this.bodyMesh = new THREE.InstancedMesh(bodyGeometry, bodyMaterial, this.total);
    this.bodyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bodyMesh.frustumCulled = false;
    this.root.add(this.bodyMesh);

    const finMaterial = new THREE.MeshStandardMaterial({
      color: 0xe98950,
      roughness: 0.44,
      metalness: 0.18,
      side: THREE.DoubleSide,
    });
    this.finMesh = new THREE.InstancedMesh(createFishFinGeometry(), finMaterial, this.total);
    this.finMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.finMesh.frustumCulled = false;
    this.root.add(this.finMesh);

    const eyeGeometry = new THREE.SphereGeometry(0.018, 8, 6);
    const eyeMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a2724,
      roughness: 0.3,
    });
    this.eyeMesh = new THREE.InstancedMesh(eyeGeometry, eyeMaterial, this.total * 2);
    this.eyeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.eyeMesh.frustumCulled = false;
    this.root.add(this.eyeMesh);

    const glowGeometry = new THREE.BufferGeometry();
    glowGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(new Float32Array(this.total * 3), 3),
    );
    this.glowGeometry = glowGeometry;
    const glowMaterial = new THREE.PointsMaterial({
      color: 0xffdda0,
      size: 0.72,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      map: createSoftCircleTexture(64),
    });
    this.glow = new THREE.Points(glowGeometry, glowMaterial);
    this.glow.frustumCulled = false;
    this.root.add(this.glow);

    this.update(0, 0, true);
    this.setColors();
  }

  private setColors(): void {
    for (let i = 0; i < this.total; i += 1) {
      const shade = 0.88 + ((i * 37) % 23) / 100;
      this.tempColor.setRGB(1.0 * shade, 0.7 * shade, 0.28 * shade);
      this.bodyMesh.setColorAt(i, this.tempColor);
    }
    if (this.bodyMesh.instanceColor) this.bodyMesh.instanceColor.needsUpdate = true;
  }

  reset(): void {
    for (let i = 0; i < this.active.length; i += 1) this.active[i] = true;
    this.update(0, 0, true);
  }

  get remaining(): number {
    return this.active.reduce((total, active) => total + (active ? 1 : 0), 0);
  }

  update(dt: number, time: number, force = false): void {
    const glowPositions = this.glowGeometry.getAttribute('position') as THREE.BufferAttribute;
    const baseScale = 1.02;

    for (let i = 0; i < this.total; i += 1) {
      const spec = this.specs[i] as FishSpec;
      const isActive = force ? true : this.active[i] !== false;
      const bob = Math.sin(time * 2.0 + spec.phase) * 0.075;
      const drift = Math.sin(time * 0.7 + spec.phase * 0.8) * 0.07;
      const point = this.level.pointAt(spec.z, spec.lateral + drift);
      const centerY = spec.height + bob;
      this.positions[i]?.set(point.x, centerY, point.z);

      if (!isActive) {
        this.dummy.position.set(0, -999, 0);
        this.dummy.scale.setScalar(0.0001);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.bodyMesh.setMatrixAt(i, this.dummy.matrix);
        this.finMesh.setMatrixAt(i, this.dummy.matrix);
        this.eyeDummy.position.set(0, -999, 0);
        this.eyeDummy.scale.setScalar(0.0001);
        this.eyeDummy.updateMatrix();
        this.eyeMesh.setMatrixAt(i * 2, this.eyeDummy.matrix);
        this.eyeMesh.setMatrixAt(i * 2 + 1, this.eyeDummy.matrix);
        glowPositions.setXYZ(i, 0, -999, 0);
        continue;
      }

      const yaw = this.level.yawAt(spec.z) + Math.sin(time * 0.6 + spec.phase) * 0.9;
      const pitch = Math.sin(time * 1.4 + spec.phase) * 0.11;
      this.dummy.position.set(point.x, centerY, point.z);
      this.dummy.rotation.set(pitch, yaw, Math.sin(time * 1.1 + spec.phase) * 0.08);
      this.dummy.scale.setScalar(spec.scale * baseScale);
      this.dummy.updateMatrix();
      this.bodyMesh.setMatrixAt(i, this.dummy.matrix);
      this.finMesh.setMatrixAt(i, this.dummy.matrix);

      this.fishQuaternion.copy(this.dummy.quaternion);
      for (let eye = 0; eye < 2; eye += 1) {
        this.eyeDummy.position.set((eye === 0 ? -1 : 1) * 0.083, 0.018, 0.09);
        this.eyeDummy.quaternion.identity();
        this.eyeDummy.scale.setScalar(1);
        this.eyeDummy.updateMatrix();
        this.eyeMatrix.copy(this.dummy.matrix).multiply(this.eyeDummy.matrix);
        this.eyeMesh.setMatrixAt(i * 2 + eye, this.eyeMatrix);
      }

      glowPositions.setXYZ(i, point.x, centerY + 0.015, point.z);
    }

    this.bodyMesh.instanceMatrix.needsUpdate = true;
    this.finMesh.instanceMatrix.needsUpdate = true;
    this.eyeMesh.instanceMatrix.needsUpdate = true;
    glowPositions.needsUpdate = true;

    const glowMaterial = this.glow.material as THREE.PointsMaterial;
    glowMaterial.opacity = 0.43 + Math.sin(time * 2.6) * 0.08;
  }

  collectNear(
    playerCenter: THREE.Vector3,
    horizontalRadius = 1.1,
    verticalRadius = 0.9,
  ): CollectedFish[] {
    const collected: CollectedFish[] = [];
    for (let i = 0; i < this.total; i += 1) {
      if (!this.active[i]) continue;
      const position = this.positions[i];
      if (!position) continue;
      const dx = position.x - playerCenter.x;
      const dz = position.z - playerCenter.z;
      const dy = position.y - playerCenter.y;
      if (
        dx * dx + dz * dz < horizontalRadius * horizontalRadius &&
        Math.abs(dy) < verticalRadius
      ) {
        this.active[i] = false;
        const spec = this.specs[i] as FishSpec;
        collected.push({ spec, position: position.clone() });
      }
    }
    return collected;
  }

  nearestHighFishAhead(z: number, maxAhead = 16): FishSpec | null {
    let best: FishSpec | null = null;
    let bestDistance = Infinity;
    for (let i = 0; i < this.total; i += 1) {
      if (!this.active[i]) continue;
      const spec = this.specs[i] as FishSpec;
      if (spec.height < 1.55) continue;
      const delta = spec.z - z;
      if (delta > 2 && delta < maxAhead && delta < bestDistance) {
        best = spec;
        bestDistance = delta;
      }
    }
    return best;
  }

  dispose(): void {
    this.root.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
        object.geometry.dispose();
        if (Array.isArray(object.material)) {
          object.material.forEach((material) => material.dispose());
        } else {
          object.material.dispose();
        }
      }
    });
  }
}

function createFishFinGeometry(): THREE.BufferGeometry {
  const positions = [
    // Tail upper lobe.
    0, 0.0, -0.19,
    0, 0.15, -0.39,
    0, 0.015, -0.28,
    // Tail lower lobe.
    0, 0.0, -0.19,
    0, -0.15, -0.39,
    0, -0.015, -0.28,
    // Dorsal fin.
    0, 0.075, -0.06,
    0, 0.19, -0.16,
    0, 0.065, -0.22,
    // Little pectoral fin.
    0.07, 0.0, 0.06,
    0.14, -0.08, 0.01,
    0.065, -0.07, -0.03,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}
