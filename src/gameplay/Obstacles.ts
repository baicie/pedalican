import * as THREE from 'three';
import type { LevelManager, ObstacleSpec } from './LevelManager';
import { mulberry32, randomRange } from '../utils/math';
import { disposeObject3D, setShadows } from '../utils/geometry';

/**
 * Obstacle art direction: chunky, colour-coded, and readable at speed.
 * Logs are warm brown with cream hazard bands, rocks are cool grey-green, and
 * driftwood is bleached bone-coloured with orange cloth markers.
 */
export class Obstacles {
  readonly root = new THREE.Group();

  private readonly rockGeometry = new THREE.DodecahedronGeometry(1, 0);
  private readonly logGeometry = new THREE.CylinderGeometry(1, 1, 1, 10, 1);
  private readonly pebbleGeometry = new THREE.DodecahedronGeometry(0.28, 0);

  private readonly rockMaterial = new THREE.MeshStandardMaterial({
    color: 0x829187,
    roughness: 0.92,
    metalness: 0.02,
    flatShading: true,
  });
  private readonly rockLight = new THREE.MeshStandardMaterial({
    color: 0xa5afa3,
    roughness: 0.9,
    flatShading: true,
  });
  private readonly rockMoss = new THREE.MeshStandardMaterial({
    color: 0x6f8c4e,
    roughness: 0.96,
    flatShading: true,
  });
  private readonly logMaterial = new THREE.MeshStandardMaterial({
    color: 0x73492f,
    roughness: 0.88,
    metalness: 0.01,
    flatShading: true,
  });
  private readonly logDark = new THREE.MeshStandardMaterial({
    color: 0x523322,
    roughness: 0.9,
    flatShading: true,
  });
  private readonly cutWood = new THREE.MeshStandardMaterial({
    color: 0xc59b68,
    roughness: 0.8,
    flatShading: true,
  });
  private readonly cloth = new THREE.MeshStandardMaterial({
    color: 0xed8c4d,
    roughness: 0.82,
    side: THREE.DoubleSide,
  });
  private readonly cream = new THREE.MeshStandardMaterial({
    color: 0xffe9c2,
    roughness: 0.78,
    side: THREE.DoubleSide,
  });
  private readonly driftwood = new THREE.MeshStandardMaterial({
    color: 0xc6ae8d,
    roughness: 0.92,
    metalness: 0.01,
    flatShading: true,
  });

  constructor(private readonly level: LevelManager) {
    this.root.name = 'obstacles';
    for (const spec of level.data.obstacles) {
      const object = this.buildObstacle(spec);
      this.root.add(object);
    }
    setShadows(this.root, true, true);
  }

  private buildObstacle(spec: ObstacleSpec): THREE.Group {
    const group = new THREE.Group();
    const point = this.level.pointAt(spec.z, spec.lateral);
    group.position.copy(point);
    group.position.y = 0.025;
    group.rotation.y = this.level.yawAt(spec.z) + spec.rotation;
    group.name = `obstacle-${spec.kind}-${spec.id}`;

    if (spec.kind === 'rock') {
      this.buildRock(group, spec);
    } else if (spec.kind === 'driftwood') {
      this.buildDriftwood(group, spec);
    } else {
      this.buildLog(group, spec);
    }

    return group;
  }

  private buildRock(group: THREE.Group, spec: ObstacleSpec): void {
    const rng = mulberry32(spec.seed + 4181);
    const rock = new THREE.Mesh(this.rockGeometry, this.rockMaterial);
    rock.scale.set(spec.width * 0.5, spec.height * 0.6, spec.depth * 0.55);
    rock.position.y = spec.height * 0.42;
    rock.rotation.set(
      randomRange(rng, -0.2, 0.2),
      randomRange(rng, 0, Math.PI * 2),
      randomRange(rng, -0.16, 0.16),
    );
    group.add(rock);

    const cap = new THREE.Mesh(this.rockGeometry, this.rockLight);
    cap.scale.set(spec.width * 0.32, spec.height * 0.26, spec.depth * 0.34);
    cap.position.set(-spec.width * 0.13, spec.height * 0.72, spec.depth * 0.02);
    cap.rotation.set(0.3, randomRange(rng, 0, Math.PI), -0.2);
    group.add(cap);

    const moss = new THREE.Mesh(this.rockGeometry, this.rockMoss);
    moss.scale.set(spec.width * 0.21, spec.height * 0.08, spec.depth * 0.18);
    moss.position.set(spec.width * 0.1, spec.height * 0.82, -spec.depth * 0.05);
    moss.rotation.set(0, rng() * Math.PI, 0.3);
    group.add(moss);

    for (let i = 0; i < 3; i += 1) {
      const pebble = new THREE.Mesh(this.pebbleGeometry, i % 2 ? this.rockLight : this.rockMaterial);
      const angle = rng() * Math.PI * 2;
      const distance = spec.width * (0.55 + rng() * 0.4);
      pebble.position.set(
        Math.cos(angle) * distance,
        0.028,
        Math.sin(angle) * distance,
      );
      pebble.scale.setScalar(0.4 + rng() * 0.45);
      pebble.rotation.set(rng(), rng() * 3, rng());
      group.add(pebble);
    }

    this.addWarningMarker(group, spec, new THREE.Vector3(spec.width * 0.52, 0, -spec.depth * 0.65));
  }

  private buildLog(group: THREE.Group, spec: ObstacleSpec): void {
    const rng = mulberry32(spec.seed + 7331);
    const radius = spec.height * 0.5;
    const log = new THREE.Mesh(this.logGeometry, this.logMaterial);
    log.scale.set(radius, spec.width, radius);
    log.rotation.z = Math.PI / 2;
    log.position.y = radius;
    group.add(log);

    const outer = new THREE.Mesh(this.logGeometry, this.logDark);
    outer.scale.set(radius * 1.02, spec.width * 0.97, radius * 1.02);
    outer.rotation.z = Math.PI / 2;
    outer.position.y = radius;
    group.add(outer);
    const inner = new THREE.Mesh(this.logGeometry, this.logMaterial);
    inner.scale.set(radius * 0.94, spec.width * 1.015, radius * 0.94);
    inner.rotation.z = Math.PI / 2;
    inner.position.y = radius;
    group.add(inner);

    const endGeometry = new THREE.CylinderGeometry(radius * 0.92, radius * 0.92, 0.035, 10);
    for (const side of [-1, 1]) {
      const end = new THREE.Mesh(endGeometry, this.cutWood);
      end.rotation.z = Math.PI / 2;
      end.position.set(side * spec.width * 0.5, radius, 0);
      group.add(end);

      const growthRing = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.5, 0.012, 5, 16), this.logDark);
      growthRing.rotation.y = Math.PI / 2;
      growthRing.position.set(side * (spec.width * 0.5 + 0.022), radius, 0);
      group.add(growthRing);
    }

    const bandGeometry = new THREE.TorusGeometry(radius * 1.025, 0.021, 5, 14, Math.PI);
    for (const x of [-spec.width * 0.24, spec.width * 0.1]) {
      const band = new THREE.Mesh(bandGeometry, this.cream);
      band.rotation.set(Math.PI / 2, 0, Math.PI / 2);
      band.position.set(x, radius, 0);
      band.scale.z = 0.9;
      group.add(band);
    }

    for (let i = 0; i < 2; i += 1) {
      const stub = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.18, radius * 0.3, randomRange(rng, 0.24, 0.48), 6),
        this.logDark,
      );
      stub.position.set(
        randomRange(rng, -spec.width * 0.35, spec.width * 0.35),
        radius * 1.25,
        randomRange(rng, -radius * 0.5, radius * 0.5),
      );
      stub.rotation.set(randomRange(rng, -0.7, 0.7), rng() * 2, randomRange(rng, -0.4, 0.4));
      group.add(stub);
    }

    this.addWarningMarker(group, spec, new THREE.Vector3(spec.width * 0.6, 0, -0.45));
  }

  private buildDriftwood(group: THREE.Group, spec: ObstacleSpec): void {
    const rng = mulberry32(spec.seed + 941);
    const branch = new THREE.Mesh(this.logGeometry, this.driftwood);
    branch.scale.set(spec.height * 0.37, spec.width, spec.height * 0.34);
    branch.rotation.z = Math.PI / 2;
    branch.rotation.x = randomRange(rng, -0.08, 0.08);
    branch.position.y = spec.height * 0.42;
    group.add(branch);

    const spur = new THREE.Mesh(this.logGeometry, this.cutWood);
    spur.scale.set(spec.height * 0.16, spec.width * 0.55, spec.height * 0.14);
    spur.rotation.z = Math.PI / 2;
    spur.rotation.x = 0.55;
    spur.position.set(spec.width * 0.2, spec.height * 0.65, -0.08);
    group.add(spur);

    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.27, 1, 1), this.cloth);
    cloth.position.set(-spec.width * 0.22, spec.height * 0.88, 0);
    cloth.rotation.y = 0.3;
    group.add(cloth);

    for (let i = 0; i < 4; i += 1) {
      const pebble = new THREE.Mesh(this.pebbleGeometry, i % 2 ? this.rockMaterial : this.driftwood);
      pebble.position.set(
        randomRange(rng, -spec.width * 0.6, spec.width * 0.6),
        0.02,
        randomRange(rng, -0.5, 0.5),
      );
      pebble.scale.setScalar(0.35 + rng() * 0.5);
      pebble.rotation.set(rng(), rng() * 3, rng());
      group.add(pebble);
    }

    this.addWarningMarker(group, spec, new THREE.Vector3(-spec.width * 0.55, 0, -0.4));
  }

  private addWarningMarker(group: THREE.Group, spec: ObstacleSpec, localPosition: THREE.Vector3): void {
    const marker = new THREE.Group();
    marker.position.copy(localPosition);
    marker.position.y = 0.02;
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.022, 0.85, 6),
      this.logDark,
    );
    pole.position.y = 0.43;
    marker.add(pole);

    const pennantGeometry = new THREE.BufferGeometry();
    const width = 0.27;
    const height = 0.2;
    pennantGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([
        0, 0.86, 0,
        width, 0.78, 0,
        0, 0.64, 0,
      ], 3),
    );
    pennantGeometry.computeVertexNormals();
    const pennant = new THREE.Mesh(pennantGeometry, this.cloth);
    marker.add(pennant);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.04, 7), this.cream);
    base.position.y = 0.03;
    marker.add(base);

    // Center the marker relative to the obstacle's collision footprint.
    marker.position.x += spec.kind === 'rock' ? 0.08 : 0;
    group.add(marker);
  }

  dispose(): void {
    disposeObject3D(this.root);
    this.pebbleGeometry.dispose();
    this.logGeometry.dispose();
    this.rockGeometry.dispose();
  }
}
