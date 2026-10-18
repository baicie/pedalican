import * as THREE from 'three';
import type { LevelManager } from '../gameplay/LevelManager';
import { createSignTexture, createSunTexture } from '../utils/canvas';
import {
  createPalmFrondGeometry,
  createTaperedTube,
  mergeSimpleGeometries,
} from '../utils/geometry';
import { clamp, mulberry32, randomRange, TAU } from '../utils/math';

interface RangingOptions {
  offsets: number[];
  height: (lateral: number, z: number) => number;
  ranges: Array<[number, number]>;
  step: number;
  material: THREE.Material;
  colorAt?: (lateral: number, z: number, out: THREE.Color) => void;
  name: string;
}

interface Cloth {
  object: THREE.Object3D;
  baseRotation: number;
  phase: number;
  speed: number;
  amplitude: number;
}

interface PalmTemplate {
  trunk: THREE.BufferGeometry;
  fronds: THREE.BufferGeometry;
}

/**
 * The physical postcard: coastal path, beaches, grass, bridges, fish sign
 * language, checkpoint arches, and a deliberately chunky lighthouse.
 */
export class World {
  readonly root = new THREE.Group();
  private readonly cloths: Cloth[] = [];
  private readonly rng = mulberry32(0x0cea57);
  private readonly roadMaterial: THREE.MeshStandardMaterial;
  private readonly sandMaterial: THREE.MeshStandardMaterial;
  private readonly grassMaterial: THREE.MeshStandardMaterial;
  private readonly lineMaterial = new THREE.MeshStandardMaterial({
    color: 0xfff0cd,
    roughness: 0.7,
    metalness: 0.02,
  });
  private readonly woodMaterial = new THREE.MeshStandardMaterial({
    color: 0x8e603c,
    roughness: 0.82,
    metalness: 0.02,
    flatShading: true,
  });
  private readonly darkWoodMaterial = new THREE.MeshStandardMaterial({
    color: 0x61432d,
    roughness: 0.86,
    metalness: 0.01,
    flatShading: true,
  });
  private readonly paleWoodMaterial = new THREE.MeshStandardMaterial({
    color: 0xc4a275,
    roughness: 0.8,
    metalness: 0.01,
    flatShading: true,
  });
  private readonly railMaterial = new THREE.MeshStandardMaterial({
    color: 0x4b5647,
    roughness: 0.82,
    metalness: 0.05,
  });
  private readonly stoneMaterial = new THREE.MeshStandardMaterial({
    color: 0x778678,
    roughness: 0.92,
    flatShading: true,
  });
  private readonly darkStoneMaterial = new THREE.MeshStandardMaterial({
    color: 0x53645a,
    roughness: 0.94,
    flatShading: true,
  });
  private readonly warningMaterial = new THREE.MeshStandardMaterial({
    color: 0xed8c4d,
    roughness: 0.75,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
  private readonly warningCream = new THREE.MeshStandardMaterial({
    color: 0xffe8bf,
    roughness: 0.72,
    side: THREE.DoubleSide,
  });
  private readonly waterMaterial = new THREE.MeshStandardMaterial({
    color: 0x55b9b6,
    roughness: 0.22,
    metalness: 0.12,
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide,
  });
  private readonly foamMaterial = new THREE.MeshBasicMaterial({
    color: 0xfff4da,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  private lighthouseGlow: THREE.Sprite | null = null;
  private finishBanner: THREE.Object3D | null = null;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly level: LevelManager,
  ) {
    this.root.name = 'world';
    scene.add(this.root);

    this.roadMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.93,
      metalness: 0.02,
    });
    this.sandMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.98,
      metalness: 0,
      flatShading: true,
    });
    this.grassMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.98,
      metalness: 0,
      flatShading: true,
    });

    this.buildTerrain();
    this.buildPath();
    this.buildBridges();
    this.buildGaps();
    this.buildCheckpoints();
    this.buildPalms();
    this.buildScenery();
    this.buildFinishArea();
    this.buildStartSign();
    this.buildWarningSigns();
    this.buildShoreDetails();
  }

  private beachHeight(lateral: number, z: number): number {
    const t = clamp((-lateral - 4.7) / 24, 0, 1);
    return -0.002 - Math.pow(t, 0.76) * 0.64 + Math.sin(z * 0.035 + lateral * 0.11) * 0.016;
  }

  private inlandHeight(lateral: number, z: number): number {
    const distance = Math.max(0, lateral - 4.7);
    const t = clamp(distance / 78, 0, 1);
    const rolling =
      Math.sin(z * 0.026 + lateral * 0.07) * 0.48 +
      Math.sin(z * 0.061 - lateral * 0.04) * 0.16;
    const hillMask = clamp(distance / 14, 0, 1);
    return 0.004 + t * t * 2.5 + rolling * hillMask * 0.33;
  }

  private surfaceHeight(lateral: number, z: number): number {
    return lateral < 0 ? this.beachHeight(lateral, z) : this.inlandHeight(lateral, z);
  }

  private buildTerrain(): void {
    const beachOffsets = [-34, -28, -23.5, -19, -14, -9, -4.7];
    this.addRibbon({
      offsets: beachOffsets,
      height: (lateral, z) => this.beachHeight(lateral, z),
      ranges: [[-30, this.level.data.trackLength + 120]],
      step: 4.2,
      material: this.sandMaterial,
      colorAt: (lateral, z, out) => {
        const wet = clamp((-lateral - 15) / 14, 0, 1);
        const dry = clamp((lateral + 7) / 12, 0, 1);
        out.set('#e2c58e').lerp(new THREE.Color('#f4ddb0'), dry * 0.7);
        out.lerp(new THREE.Color('#b49b73'), wet * 0.34);
        const n = Math.sin(z * 0.11 + lateral * 0.33) * 0.018;
        out.offsetHSL(0.005, 0, n);
      },
      name: 'beach',
    });

    const inlandOffsets = [4.7, 7, 11, 17, 26, 38, 56, 82, 118, 170];
    this.addRibbon({
      offsets: inlandOffsets,
      height: (lateral, z) => this.inlandHeight(lateral, z),
      ranges: [[-24, this.level.data.trackLength + 150]],
      step: 4.4,
      material: this.grassMaterial,
      colorAt: (lateral, z, out) => {
        const t = clamp((lateral - 4.7) / 100, 0, 1);
        out.set('#8fba69').lerp(new THREE.Color('#5d8f58'), t);
        out.offsetHSL(0.005, 0.02, Math.sin(z * 0.08 + lateral * 0.22) * 0.022);
      },
      name: 'inland-grass',
    });

  }

  private addRibbon(options: RangingOptions): void {
    const { offsets, height, ranges, step, material, colorAt, name } = options;
    const color = new THREE.Color();
    for (const [rangeStart, rangeEnd] of ranges) {
      if (rangeEnd <= rangeStart) continue;
      const zs: number[] = [];
      for (let z = rangeStart; z < rangeEnd; z += step) zs.push(z);
      zs.push(rangeEnd);
      const columns = offsets.length;
      const positions: number[] = [];
      const colors: number[] = [];
      const indices: number[] = [];

      zs.forEach((z) => {
        offsets.forEach((lateral) => {
          const point = this.level.pointAt(z, lateral);
          positions.push(point.x, height(lateral, z), z);
          if (colorAt) {
            colorAt(lateral, z, color);
            colors.push(color.r, color.g, color.b);
          }
        });
      });

      for (let row = 0; row < zs.length - 1; row += 1) {
        for (let col = 0; col < columns - 1; col += 1) {
          const a = row * columns + col;
          const b = a + 1;
          const c = a + columns;
          const d = c + 1;
          indices.push(a, c, b, b, c, d);
        }
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      if (colorAt) {
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      }
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `${name}-${rangeStart}-${rangeEnd}`;
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      this.root.add(mesh);
    }
  }

  // -------------------------------------------------------------------------
  // Path surface, lines, roadside posts
  // -------------------------------------------------------------------------

  private subtractIntervals(
    start: number,
    end: number,
    intervals: Array<[number, number]>,
  ): Array<[number, number]> {
    let ranges: Array<[number, number]> = [[start, end]];
    for (const [cutStart, cutEnd] of intervals) {
      const next: Array<[number, number]> = [];
      for (const [rangeStart, rangeEnd] of ranges) {
        if (cutEnd <= rangeStart || cutStart >= rangeEnd) {
          next.push([rangeStart, rangeEnd]);
          continue;
        }
        if (cutStart > rangeStart) next.push([rangeStart, Math.min(cutStart, rangeEnd)]);
        if (cutEnd < rangeEnd) next.push([Math.max(cutEnd, rangeStart), rangeEnd]);
      }
      ranges = next;
    }
    return ranges.filter(([a, b]) => b - a > 0.25);
  }

  private buildPath(): void {
    const half = this.level.roadHalfWidth();
    const gapIntervals = this.level.data.gaps.map((gap) => [gap.start, gap.end] as [number, number]);
    const roadRanges = this.subtractIntervals(0, this.level.data.trackLength, gapIntervals);

    this.addRibbon({
      offsets: [-half, half],
      height: () => 0.03,
      ranges: roadRanges,
      step: 2.2,
      material: this.roadMaterial,
      colorAt: (lateral, z, out) => {
        const tone = 0.375 + Math.sin(z * 0.13) * 0.012 + Math.cos(lateral * 2.1) * 0.007;
        out.setHSL(0.37, 0.052, tone);
        const centreWear = Math.max(0, 1 - Math.abs(lateral) / half);
        out.offsetHSL(0, 0, centreWear * 0.006);
      },
      name: 'coast-road',
    });

    // Warm sand/gravel shoulders at each edge.
    this.addRibbon({
      offsets: [-half - 0.9, -half - 0.03],
      height: (lateral, z) => this.beachHeight(lateral, z) + 0.008,
      ranges: [[0, this.level.data.trackLength]],
      step: 4,
      material: this.sandMaterial,
      colorAt: (_lateral, _z, out) => out.set('#e3caa1'),
      name: 'beach-shoulder',
    });
    this.addRibbon({
      offsets: [half + 0.03, half + 0.9],
      height: (lateral, z) => this.inlandHeight(lateral, z) + 0.004,
      ranges: [[0, this.level.data.trackLength]],
      step: 4,
      material: this.grassMaterial,
      colorAt: (_lateral, _z, out) => out.set('#9bbd78'),
      name: 'grass-shoulder',
    });

    // Solid cream edge stripes.
    const bridgeIntervals = this.level.data.bridges.map((bridge) => [bridge.start, bridge.end] as [number, number]);
    const lineRanges = this.subtractIntervals(0, this.level.data.trackLength, [
      ...gapIntervals,
      ...bridgeIntervals,
    ]);
    for (const side of [-1, 1]) {
      this.addRibbon({
        offsets:
          side < 0
            ? [-(half - 0.15), -(half - 0.29)]
            : [half - 0.29, half - 0.15],
        height: () => 0.041,
        ranges: lineRanges,
        step: 3,
        material: this.lineMaterial,
        name: `edge-stripe-${side}`,
      });
    }

    // Dashed centre line, pooled into one instanced mesh.
    const dashGeometry = new THREE.BoxGeometry(0.105, 0.012, 2.6);
    const dashes: number[] = [];
    for (let z = 13; z < this.level.data.trackLength - 4; z += 6.2) {
      if (this.level.gapAt(z) || this.level.bridgeAt(z)) continue;
      dashes.push(z);
    }
    const dashMesh = new THREE.InstancedMesh(dashGeometry, this.lineMaterial, dashes.length);
    const dummy = new THREE.Object3D();
    dashes.forEach((z, index) => {
      const point = this.level.pointAt(z, 0);
      dummy.position.set(point.x, 0.045, point.z);
      dummy.rotation.y = this.level.yawAt(z);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      dashMesh.setMatrixAt(index, dummy.matrix);
    });
    dashMesh.receiveShadow = true;
    dashMesh.castShadow = false;
    this.root.add(dashMesh);

    this.buildRoadPosts();
    this.buildStartLine();
  }

  private buildRoadPosts(): void {
    const half = this.level.roadHalfWidth();
    const positions: Array<{ x: number; y: number; z: number; yaw: number }> = [];
    for (let z = 20; z < this.level.data.trackLength; z += 16.5) {
      for (const side of [-1, 1]) {
        const lateral = side * (half + 0.75);
        const point = this.level.pointAt(z, lateral);
        positions.push({
          x: point.x,
          y: this.surfaceHeight(lateral, z),
          z: point.z,
          yaw: this.level.yawAt(z),
        });
      }
    }
    const postGeometry = new THREE.BoxGeometry(0.065, 0.66, 0.065);
    const capGeometry = new THREE.BoxGeometry(0.085, 0.065, 0.085);
    const posts = new THREE.InstancedMesh(postGeometry, this.lineMaterial, positions.length);
    const caps = new THREE.InstancedMesh(capGeometry, this.warningMaterial, positions.length);
    const dummy = new THREE.Object3D();
    positions.forEach((position, index) => {
      dummy.position.set(position.x, position.y + 0.33, position.z);
      dummy.rotation.y = position.yaw;
      dummy.updateMatrix();
      posts.setMatrixAt(index, dummy.matrix);
      dummy.position.y = position.y + 0.7;
      dummy.updateMatrix();
      caps.setMatrixAt(index, dummy.matrix);
    });
    posts.receiveShadow = true;
    posts.castShadow = true;
    caps.castShadow = true;
    this.root.add(posts, caps);
  }

  private buildStartLine(): void {
    const yaw = this.level.yawAt(this.level.data.startZ + 3);
    const point = this.level.pointAt(this.level.data.startZ + 3, 0);
    const group = new THREE.Group();
    group.position.set(point.x, 0.046, point.z);
    group.rotation.y = yaw;
    const tileGeometry = new THREE.BoxGeometry(0.78, 0.01, 0.75);
    const tiles = new THREE.InstancedMesh(
      tileGeometry,
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72 }),
      24,
    );
    const dummy = new THREE.Object3D();
    const white = new THREE.Color('#f9ecd1');
    const dark = new THREE.Color('#354a45');
    let index = 0;
    for (let row = 0; row < 2; row += 1) {
      for (let col = 0; col < 12; col += 1) {
        dummy.position.set(-4.8 + col * 0.8, 0, (row - 0.5) * 0.8);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        tiles.setMatrixAt(index, dummy.matrix);
        tiles.setColorAt(index, (row + col) % 2 === 0 ? white : dark);
        index += 1;
      }
    }
    if (tiles.instanceColor) tiles.instanceColor.needsUpdate = true;
    tiles.receiveShadow = true;
    group.add(tiles);
    this.root.add(group);
  }

  // -------------------------------------------------------------------------
  // Bridges and streams
  // -------------------------------------------------------------------------

  private buildBridges(): void {
    const half = this.level.roadHalfWidth();
    const plankGeometry = new THREE.BoxGeometry(this.level.roadWidth + 0.5, 0.06, 0.52);
    const plankPositions: Array<{ x: number; y: number; z: number; yaw: number }> = [];
    for (const bridge of this.level.data.bridges) {
      for (let z = bridge.start + 0.25; z < bridge.end - 0.2; z += 0.55) {
        const point = this.level.pointAt(z, 0);
        plankPositions.push({
          x: point.x,
          y: 0.055,
          z: point.z,
          yaw: this.level.yawAt(z),
        });
      }
    }
    const planks = new THREE.InstancedMesh(plankGeometry, this.woodMaterial, plankPositions.length);
    const dummy = new THREE.Object3D();
    plankPositions.forEach((plank, index) => {
      dummy.position.set(plank.x, plank.y, plank.z);
      dummy.rotation.y = plank.yaw;
      dummy.updateMatrix();
      planks.setMatrixAt(index, dummy.matrix);
    });
    planks.receiveShadow = true;
    planks.castShadow = true;
    this.root.add(planks);

    for (const bridge of this.level.data.bridges) {
      this.buildBridgeDetails(bridge.start, bridge.end, bridge.streamZ, half);
    }
  }

  private buildBridgeDetails(start: number, end: number, streamZ: number, half: number): void {
    const railHeight = 0.92;
    const postPositions: Array<{ x: number; y: number; z: number; yaw: number }> = [];
    const railPointsLeft: THREE.Vector3[] = [];
    const railPointsRight: THREE.Vector3[] = [];
    for (let z = start + 0.6; z <= end - 0.4; z += 2.2) {
      for (const side of [-1, 1]) {
        const lateral = side * (half - 0.04);
        const point = this.level.pointAt(z, lateral);
        postPositions.push({
          x: point.x,
          y: 0.12,
          z: point.z,
          yaw: this.level.yawAt(z),
        });
        const railPoint = new THREE.Vector3(point.x, railHeight + 0.12, point.z);
        if (side < 0) railPointsLeft.push(railPoint);
        else railPointsRight.push(railPoint);
      }
    }
    const postGeometry = new THREE.CylinderGeometry(0.038, 0.05, railHeight, 6);
    const posts = new THREE.InstancedMesh(postGeometry, this.darkWoodMaterial, postPositions.length);
    const dummy = new THREE.Object3D();
    postPositions.forEach((position, index) => {
      dummy.position.set(position.x, position.y + railHeight * 0.5, position.z);
      dummy.rotation.set(0, position.yaw, 0);
      dummy.updateMatrix();
      posts.setMatrixAt(index, dummy.matrix);
    });
    posts.castShadow = true;
    posts.receiveShadow = true;
    this.root.add(posts);

    for (const points of [railPointsLeft, railPointsRight]) {
      if (points.length < 2) continue;
      const geometry = new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.25),
        Math.max(10, points.length * 3),
        0.055,
        6,
        false,
      );
      const rail = new THREE.Mesh(geometry, this.paleWoodMaterial);
      rail.castShadow = true;
      rail.receiveShadow = true;
      this.root.add(rail);
    }

    // Under-deck cross supports.
    for (let z = start + 2.5; z < end - 1; z += 4.5) {
      const point = this.level.pointAt(z, 0);
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(this.level.roadWidth + 1.3, 0.15, 0.16),
        this.darkWoodMaterial,
      );
      beam.position.set(point.x, -0.02, point.z);
      beam.rotation.y = this.level.yawAt(z);
      beam.castShadow = true;
      this.root.add(beam);
    }

    // Stone abutments.
    for (const z of [start - 0.25, end + 0.25]) {
      const point = this.level.pointAt(z, 0);
      const abutment = new THREE.Mesh(new THREE.BoxGeometry(this.level.roadWidth + 1.0, 0.35, 0.8), this.stoneMaterial);
      abutment.position.set(point.x, 0.015, point.z);
      abutment.rotation.y = this.level.yawAt(z);
      abutment.castShadow = true;
      abutment.receiveShadow = true;
      this.root.add(abutment);
    }

    // Stream under the bridge. It lies just above the ground at the roadside
    // and is hidden by the bridge deck through the centre.
    const streamGroup = new THREE.Group();
    const streamPoint = this.level.pointAt(streamZ, 0);
    streamGroup.position.set(streamPoint.x, 0.022, streamPoint.z);
    streamGroup.rotation.y = this.level.yawAt(streamZ);
    const stream = new THREE.Mesh(new THREE.BoxGeometry(46, 0.012, 5.4), this.waterMaterial);
    stream.receiveShadow = true;
    streamGroup.add(stream);
    for (const side of [-1, 1]) {
      const foam = new THREE.Mesh(new THREE.BoxGeometry(46, 0.01, 0.22), this.foamMaterial);
      foam.position.set(0, 0.012, side * 2.62);
      streamGroup.add(foam);
    }
    this.root.add(streamGroup);

    // Rocks along the stream's banks.
    const rockGeometry = new THREE.DodecahedronGeometry(1, 0);
    for (let i = 0; i < 10; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const lateral = side * randomRange(this.rng, 6.5, 20);
      const point = this.level.pointAt(streamZ + side * randomRange(this.rng, 2.8, 4.3), lateral);
      const rock = new THREE.Mesh(rockGeometry, i % 3 === 0 ? this.darkStoneMaterial : this.stoneMaterial);
      rock.scale.set(
        randomRange(this.rng, 0.4, 1.1),
        randomRange(this.rng, 0.25, 0.6),
        randomRange(this.rng, 0.4, 0.9),
      );
      rock.position.set(point.x, 0.18, point.z);
      rock.rotation.set(this.rng() * 0.4, this.rng() * TAU, this.rng() * 0.3);
      rock.castShadow = true;
      this.root.add(rock);
    }

    // Wooden sign at the bridge entrance.
    this.addWorldSign(
      'GULLY BRIDGE',
      'mind the planks',
      start - 8,
      -(half + 2.4),
      1.7,
      0.82,
      '#e7d1ac',
      '#394f49',
    );
  }

  // -------------------------------------------------------------------------
  // Gaps, warning markers, checks
  // -------------------------------------------------------------------------

  private buildGaps(): void {
    const half = this.level.roadHalfWidth();
    const gapWaterMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a8f96,
      roughness: 0.24,
      metalness: 0.08,
      transparent: true,
      opacity: 0.94,
    });
    const gapWallMaterial = new THREE.MeshStandardMaterial({
      color: 0x625844,
      roughness: 0.98,
      flatShading: true,
    });
    const gapStoneMaterial = new THREE.MeshStandardMaterial({
      color: 0x52605a,
      roughness: 0.94,
      flatShading: true,
    });
    for (const gap of this.level.data.gaps) {
      const center = (gap.start + gap.end) * 0.5;
      const point = this.level.pointAt(center, 0);
      const yaw = this.level.yawAt(center);
      const depth = gap.end - gap.start;
      const gapGroup = new THREE.Group();
      gapGroup.position.set(point.x, 0, point.z);
      gapGroup.rotation.y = yaw;

      // The broken road opens over a shallow tidal pool instead of a black void.
      const waterGeometry = new THREE.PlaneGeometry(this.level.roadWidth + 1.2, depth + 1.0);
      waterGeometry.rotateX(-Math.PI / 2);
      const water = new THREE.Mesh(waterGeometry, gapWaterMaterial);
      water.position.y = -0.38;
      water.receiveShadow = true;
      gapGroup.add(water);

      const wallThickness = 0.24;
      const wallHeight = 0.52;
      const wallY = -wallHeight * 0.5;
      const sideWallGeometry = new THREE.BoxGeometry(wallThickness, wallHeight, depth + 0.5);
      for (const side of [-1, 1]) {
        const wall = new THREE.Mesh(sideWallGeometry, gapWallMaterial);
        wall.position.set(side * (this.level.roadWidth * 0.5 + 0.02), wallY, 0);
        wall.receiveShadow = true;
        gapGroup.add(wall);
      }
      const endWallGeometry = new THREE.BoxGeometry(this.level.roadWidth + 0.25, wallHeight, wallThickness);
      for (const side of [-1, 1]) {
        const wall = new THREE.Mesh(endWallGeometry, gapWallMaterial);
        wall.position.set(0, wallY, side * (depth * 0.5 + 0.02));
        wall.receiveShadow = true;
        gapGroup.add(wall);
      }

      for (let i = 0; i < 3; i += 1) {
        const rock = new THREE.Mesh(
          new THREE.DodecahedronGeometry(randomRange(this.rng, 0.18, 0.42), 0),
          gapStoneMaterial,
        );
        rock.scale.set(1, randomRange(this.rng, 0.55, 0.9), 1);
        rock.position.set(
          randomRange(this.rng, -half + 1.0, half - 1.0),
          -0.36,
          randomRange(this.rng, -depth * 0.35, depth * 0.35),
        );
        rock.rotation.set(randomRange(this.rng, 0, 1), randomRange(this.rng, 0, TAU), 0);
        rock.castShadow = true;
        rock.receiveShadow = true;
        gapGroup.add(rock);
      }

      // Foam gathers along the submerged lips.
      const foamMaterial = new THREE.MeshBasicMaterial({
        color: 0xfff8e8,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      for (const side of [-1, 1]) {
        const foam = new THREE.Mesh(
          new THREE.PlaneGeometry(this.level.roadWidth + 0.8, 0.24),
          foamMaterial,
        );
        foam.rotation.x = -Math.PI / 2;
        foam.position.set(0, -0.375, side * (depth * 0.5 - 0.22));
        gapGroup.add(foam);
      }
      this.root.add(gapGroup);

      // Sagging, broken lip shards.
      for (let i = 0; i < 5; i += 1) {
        const edge = i % 2 === 0 ? gap.start : gap.end;
        const lateral = -half + 0.8 + (i / 4) * (this.level.roadWidth - 1.6);
        const lipPoint = this.level.pointAt(edge, lateral);
        const shard = new THREE.Mesh(
          new THREE.BoxGeometry(randomRange(this.rng, 0.7, 1.4), 0.06, randomRange(this.rng, 0.35, 0.8)),
          new THREE.MeshStandardMaterial({
            color: 0x5e6c67,
            roughness: 0.95,
            metalness: 0.02,
            flatShading: true,
          }),
        );
        shard.position.set(
          lipPoint.x,
          -0.03 + this.rng() * 0.025,
          lipPoint.z + (i % 2 === 0 ? -0.25 : 0.25),
        );
        shard.rotation.set(
          randomRange(this.rng, -0.25, 0.25),
          this.level.yawAt(edge) + randomRange(this.rng, -0.3, 0.3),
          randomRange(this.rng, -0.25, 0.25),
        );
        shard.castShadow = true;
        shard.receiveShadow = true;
        this.root.add(shard);
      }

      // Warning flags flanking the break.
      for (const side of [-1, 1]) {
        const lateral = side * (half + 0.5);
        const flagPoint = this.level.pointAt(gap.start - 1.2, lateral);
        this.addWarningFlag(flagPoint.x, 0.03, flagPoint.z, side);
      }

      this.addWorldSign(
        'JUMP!',
        'broken road ahead',
        gap.start - 13,
        half + 2.1,
        2.0,
        0.96,
        '#f4dfae',
        '#36504a',
      );
      this.addRoadCones(gap.start - 4.5, gap.start - 2.0);
    }
  }

  private addWarningFlag(x: number, y: number, z: number, side: number): void {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.014, 1.7, 5), this.railMaterial);
    pole.position.y = 0.85;
    group.add(pole);
    const clothGeometry = new THREE.BufferGeometry();
    clothGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([
        0, 1.55, 0,
        -side * 0.55, 1.37, 0.02,
        0, 1.17, 0,
      ], 3),
    );
    clothGeometry.computeVertexNormals();
    const cloth = new THREE.Mesh(clothGeometry, this.warningMaterial);
    group.add(cloth);
    this.root.add(group);
    this.cloths.push({
      object: cloth,
      baseRotation: 0,
      phase: this.rng() * TAU,
      speed: randomRange(this.rng, 2.2, 3.4),
      amplitude: 0.24,
    });
  }

  private addRoadCones(start: number, end: number): void {
    const half = this.level.roadHalfWidth();
    const coneMaterial = this.warningMaterial;
    const coneGeometry = new THREE.ConeGeometry(0.16, 0.5, 8);
    const baseGeometry = new THREE.BoxGeometry(0.34, 0.04, 0.34);
    for (let i = 0; i < 4; i += 1) {
      const z = start + (end - start) * (i / 3);
      const lateral = (i % 2 === 0 ? -1 : 1) * (half - 0.9);
      const point = this.level.pointAt(z, lateral);
      const cone = new THREE.Mesh(coneGeometry, coneMaterial);
      cone.position.set(point.x, 0.28, point.z);
      cone.castShadow = true;
      const base = new THREE.Mesh(baseGeometry, this.darkWoodMaterial);
      base.position.set(point.x, 0.055, point.z);
      this.root.add(cone, base);
      const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.13, 0.08, 8), this.warningCream);
      stripe.position.set(point.x, 0.27, point.z);
      this.root.add(stripe);
    }
  }

  // -------------------------------------------------------------------------
  // Checkpoint arches and start/finish furniture
  // -------------------------------------------------------------------------

  private buildCheckpoints(): void {
    const half = this.level.roadHalfWidth();
    for (const checkpoint of this.level.data.checkpoints) {
      const group = this.buildArch(
        checkpoint.z,
        `CHECKPOINT ${checkpoint.index + 1}`,
        checkpoint.label,
        '#d87947',
        false,
      );
      this.root.add(group);
    }
  }

  private buildFinishArea(): void {
    const group = this.buildArch(
      this.level.data.finishZ,
      'FINISH',
      'PELICAN POINT LIGHTHOUSE',
      '#1f6f68',
      true,
    );
    this.finishBanner = group.children.find((child) => child.name === 'arch-banner') ?? null;
    this.root.add(group);

    // Checkered finish stripe.
    const point = this.level.pointAt(this.level.data.finishZ, 0);
    const stripeGroup = new THREE.Group();
    stripeGroup.position.set(point.x, 0.045, point.z);
    stripeGroup.rotation.y = this.level.yawAt(this.level.data.finishZ);
    const tileGeometry = new THREE.BoxGeometry(this.level.roadWidth / 10, 0.01, 0.8);
    const stripe = new THREE.InstancedMesh(
      tileGeometry,
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }),
      20,
    );
    const dummy = new THREE.Object3D();
    const cream = new THREE.Color('#fff1d6');
    const dark = new THREE.Color('#344a44');
    for (let i = 0; i < 20; i += 1) {
      const row = Math.floor(i / 10);
      const column = i % 10;
      dummy.position.set(-(this.level.roadWidth / 2) + 0.47 + column * (this.level.roadWidth / 10), 0, row * 0.82);
      dummy.updateMatrix();
      stripe.setMatrixAt(i, dummy.matrix);
      stripe.setColorAt(i, (row + column) % 2 === 0 ? cream : dark);
    }
    if (stripe.instanceColor) stripe.instanceColor.needsUpdate = true;
    stripeGroup.add(stripe);
    this.root.add(stripeGroup);

    this.buildLighthouse();
  }

  private buildArch(
    z: number,
    title: string,
    subtitle: string,
    accent: string,
    finish: boolean,
  ): THREE.Group {
    const half = this.level.roadHalfWidth();
    const point = this.level.pointAt(z, 0);
    const group = new THREE.Group();
    group.position.set(point.x, 0.025, point.z);
    group.rotation.y = this.level.yawAt(z) + Math.PI;
    const postMaterial = finish ? this.darkWoodMaterial : this.paleWoodMaterial;
    const height = finish ? 4.35 : 3.7;
    const width = (half + 1.15) * 2;

    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.13, height, 8),
        postMaterial,
      );
      post.position.set(side * (half + 1.15), height / 2, 0);
      post.castShadow = true;
      group.add(post);

      const foot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.28, 0.24, 8),
        this.stoneMaterial,
      );
      foot.position.set(side * (half + 1.15), 0.12, 0);
      group.add(foot);

      const pennant = new THREE.Mesh(
        new THREE.BufferGeometry().setAttribute(
          'position',
          new THREE.Float32BufferAttribute([
            0, 0, 0,
            side * 0.55, -0.18, 0,
            0, -0.38, 0,
          ], 3),
        ),
        finish ? this.warningMaterial : this.warningCream,
      );
      pennant.position.set(side * (half + 1.15), height - 0.25, 0);
      const shape = pennant.geometry as THREE.BufferGeometry;
      shape.computeVertexNormals();
      group.add(pennant);
      this.cloths.push({
        object: pennant,
        baseRotation: 0,
        phase: this.rng() * TAU,
        speed: randomRange(this.rng, 2, 3.4),
        amplitude: 0.3,
      });
    }

    const archCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-(half + 1.15), height, 0),
      new THREE.Vector3(-(half + 0.45), height + 0.3, 0),
      new THREE.Vector3(0, height + 0.36, 0),
      new THREE.Vector3(half + 0.45, height + 0.3, 0),
      new THREE.Vector3(half + 1.15, height, 0),
    ]);
    const arch = new THREE.Mesh(
      new THREE.TubeGeometry(archCurve, 26, 0.07, 7, false),
      postMaterial,
    );
    arch.castShadow = true;
    group.add(arch);

    const texture = createSignTexture(title, {
      width: 768,
      height: finish ? 230 : 220,
      subtitle,
      background: finish ? '#f9efd9' : '#f5ead2',
      foreground: '#173633',
      accent,
      border: '#173633',
    });
    const bannerMaterial = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.82,
      metalness: 0.01,
      side: THREE.DoubleSide,
    });
    const bannerWidth = finish ? this.level.roadWidth - 0.3 : this.level.roadWidth - 0.9;
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(bannerWidth, finish ? 1.12 : 1.02),
      bannerMaterial,
    );
    banner.name = 'arch-banner';
    banner.position.set(0, height - 0.24, 0.025);
    group.add(banner);

    // A little pennant string under the arch.
    const stringCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-(half + 0.9), height - 0.1, 0.01),
      new THREE.Vector3(-(half * 0.5), height - 0.36, 0.02),
      new THREE.Vector3(0, height - 0.25, 0.02),
      new THREE.Vector3(half * 0.5, height - 0.36, 0.02),
      new THREE.Vector3(half + 0.9, height - 0.1, 0.01),
    ]);
    const string = new THREE.Mesh(
      new THREE.TubeGeometry(stringCurve, 24, 0.012, 4, false),
      this.railMaterial,
    );
    group.add(string);

    return group;
  }

  private buildStartSign(): void {
    this.addWorldSign(
      'PELICAN COAST',
      'LIGHTHOUSE · 716 M',
      22,
      -this.level.roadHalfWidth() - 3.2,
      2.8,
      1.12,
      '#f3e3c0',
      '#234a43',
    );
    this.addWorldSign(
      'RIDE WITH THE TIDE',
      'collect fish · jump gaps',
      38,
      this.level.roadHalfWidth() + 3.6,
      2.4,
      0.9,
      '#dce7c9',
      '#2e5547',
    );
  }

  private buildWarningSigns(): void {
    // Small red-and-cream chevrons at fast bends.
    const bendZ = [280, 432, 685];
    for (const z of bendZ) {
      for (const side of [-1, 1]) {
        const group = this.addWorldSign(
          side < 0 ? 'SLOW' : 'TIDE',
          side < 0 ? 'soft curve' : 'watch the edge',
          z,
          side * (this.level.roadHalfWidth() + 2.3),
          1.25,
          0.7,
          '#e8d2a6',
          '#36504a',
        );
        group.rotation.y += side * 0.12;
      }
    }
  }

  private buildShoreDetails(): void {
    // A few charred driftwood pieces and salt-bleached boulders frame the surf.
    const beachPalms = [-14, -11, -17];
    for (const lateral of beachPalms) {
      const z = randomRange(this.rng, 60, this.level.data.trackLength - 70);
      const point = this.level.pointAt(z, lateral);
      const log = new THREE.Mesh(
        new THREE.CylinderGeometry(0.13, 0.19, randomRange(this.rng, 2.3, 4.4), 7),
        this.paleWoodMaterial,
      );
      log.rotation.set(Math.PI / 2, 0, randomRange(this.rng, 0.1, 1.1));
      log.position.set(point.x, this.beachHeight(lateral, z) + 0.15, point.z);
      log.castShadow = true;
      this.root.add(log);
    }
  }

  // -------------------------------------------------------------------------
  // Roadside signs and conical markers
  // -------------------------------------------------------------------------

  private addWorldSign(
    title: string,
    subtitle: string,
    z: number,
    lateral: number,
    width: number,
    height: number,
    background: string,
    foreground: string,
  ): THREE.Group {
    const point = this.level.pointAt(z, lateral);
    const group = new THREE.Group();
    group.position.set(point.x, this.surfaceHeight(lateral, z) + 0.01, point.z);
    group.rotation.y = this.level.yawAt(z) + Math.PI;

    const texture = createSignTexture(title, {
      width: 640,
      height: Math.round((640 * height) / width),
      background,
      foreground,
      accent: '#d97945',
      border: foreground,
      subtitle,
    });
    const boardMaterial = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.86,
      metalness: 0.01,
      side: THREE.DoubleSide,
    });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(width, height), boardMaterial);
    board.position.set(0, 1.4 + height * 0.5, 0.06);
    group.add(board);

    const backing = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.14, height + 0.14, 0.07),
      this.darkWoodMaterial,
    );
    backing.position.set(0, 1.4 + height * 0.5, 0);
    backing.castShadow = true;
    group.add(backing);

    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.075, 1.6 + height * 0.5, 6),
        this.woodMaterial,
      );
      post.position.set(side * width * 0.38, (1.6 + height * 0.5) * 0.5, 0);
      post.castShadow = true;
      group.add(post);
    }

    const flag = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.24, 0.3), this.warningMaterial);
    flag.position.set(-width * 0.58, 1.6 + height * 0.5, 0.05);
    flag.rotation.y = -0.05;
    group.add(flag);
    this.cloths.push({
      object: flag,
      baseRotation: flag.rotation.y,
      phase: this.rng() * TAU,
      speed: randomRange(this.rng, 1.8, 3.5),
      amplitude: 0.18,
    });

    this.root.add(group);
    return group;
  }

  // -------------------------------------------------------------------------
  // Palm trees, rocks, grass, distant hills
  // -------------------------------------------------------------------------

  private buildPalmTemplate(): PalmTemplate {
    const trunkPoints = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 1.3, 0.08),
      new THREE.Vector3(0, 2.7, 0.22),
      new THREE.Vector3(0, 3.9, 0.28),
      new THREE.Vector3(0, 4.65, 0.18),
    ];
    const trunk = createTaperedTube(trunkPoints, (t) => 0.24 - t * 0.13, 16, 7);

    const fronds: THREE.BufferGeometry[] = [];
    const rng = mulberry32(0x9a1f);
    const crown = new THREE.Vector3(0, 4.62, 0.17);
    const frondCount = 13;
    for (let i = 0; i < frondCount; i += 1) {
      const angle = (i / frondCount) * TAU + randomRange(rng, -0.16, 0.16);
      const tilt = 1.04 + randomRange(rng, -0.14, 0.3);
      const frond = createPalmFrondGeometry(
        randomRange(rng, 2.5, 3.45),
        randomRange(rng, 0.4, 0.66),
      );
      const tiltMatrix = new THREE.Matrix4().makeRotationX(tilt);
      const yawMatrix = new THREE.Matrix4().makeRotationY(angle);
      const matrix = yawMatrix.multiply(tiltMatrix);
      matrix.setPosition(crown);
      frond.applyMatrix4(matrix);
      fronds.push(frond);
    }
    const merged = mergeSimpleGeometries(fronds, ['position', 'normal']);
    return { trunk, fronds: merged };
  }

  private buildPalms(): void {
    const template = this.buildPalmTemplate();
    const placements: Array<{ x: number; y: number; z: number; yaw: number; scale: number }> = [];
    for (let i = 0; i < 17; i += 1) {
      const z = 35 + i * 42 + randomRange(this.rng, -14, 14);
      if (z > this.level.data.trackLength + 30) continue;
      const lateral = randomRange(this.rng, 10, 33);
      const point = this.level.pointAt(z, lateral);
      placements.push({
        x: point.x,
        y: this.inlandHeight(lateral, z),
        z: point.z,
        yaw: this.rng() * TAU,
        scale: randomRange(this.rng, 0.8, 1.4),
      });
    }
    for (let i = 0; i < 5; i += 1) {
      const z = 60 + i * 138 + randomRange(this.rng, -22, 22);
      const lateral = randomRange(this.rng, -16, -8.5);
      const point = this.level.pointAt(z, lateral);
      placements.push({
        x: point.x,
        y: this.beachHeight(lateral, z),
        z: point.z,
        yaw: this.rng() * TAU,
        scale: randomRange(this.rng, 0.7, 1.1),
      });
    }
    // Hero palms frame the opening shot.
    const heroPalms = [
      { z: 26, lateral: 11.5, scale: 1.38 },
      { z: 45, lateral: -11.8, scale: 1.24 },
      { z: 58, lateral: 16, scale: 1.16 },
      { z: 82, lateral: -13.5, scale: 1.08 },
    ];
    for (const hero of heroPalms) {
      const point = this.level.pointAt(hero.z, hero.lateral);
      placements.push({
        x: point.x,
        y:
          hero.lateral < 0
            ? this.beachHeight(hero.lateral, hero.z)
            : this.inlandHeight(hero.lateral, hero.z),
        z: point.z,
        yaw: this.rng() * TAU,
        scale: hero.scale,
      });
    }

    const trunkMaterial = new THREE.MeshStandardMaterial({
      color: 0xa27c57,
      roughness: 0.9,
      flatShading: true,
    });
    const frondMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.8,
      metalness: 0,
      emissive: 0x365f2d,
      emissiveIntensity: 0.65,
      flatShading: true,
      side: THREE.DoubleSide,
    });
    const trunks = new THREE.InstancedMesh(template.trunk, trunkMaterial, placements.length);
    const fronds = new THREE.InstancedMesh(template.fronds, frondMaterial, placements.length);
    const dummy = new THREE.Object3D();
    const leafColors = [
      new THREE.Color('#78b56b'),
      new THREE.Color('#8ac57a'),
      new THREE.Color('#9bcf88'),
      new THREE.Color('#68a765'),
    ];
    placements.forEach((placement, index) => {
      dummy.position.set(placement.x, placement.y, placement.z);
      dummy.rotation.set(0, placement.yaw, 0);
      dummy.scale.setScalar(placement.scale);
      dummy.updateMatrix();
      trunks.setMatrixAt(index, dummy.matrix);
      fronds.setMatrixAt(index, dummy.matrix);
      const color = leafColors[index % leafColors.length] as THREE.Color;
      fronds.setColorAt(index, color);
    });
    if (fronds.instanceColor) fronds.instanceColor.needsUpdate = true;
    trunks.castShadow = true;
    trunks.receiveShadow = true;
    fronds.castShadow = true;
    fronds.receiveShadow = true;
    this.root.add(trunks, fronds);
  }

  private buildScenery(): void {
    const rockGeometry = new THREE.DodecahedronGeometry(1, 0);
    const rockMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.94,
      flatShading: true,
    });
    const rockCount = 74;
    const rocks = new THREE.InstancedMesh(rockGeometry, rockMaterial, rockCount);
    const dummy = new THREE.Object3D();
    const rockColor = new THREE.Color();
    for (let i = 0; i < rockCount; i += 1) {
      const beach = i % 3 !== 0;
      const lateral = beach
        ? randomRange(this.rng, -22, -7.5)
        : randomRange(this.rng, 8, 55);
      const z = randomRange(this.rng, 20, this.level.data.trackLength + 50);
      const point = this.level.pointAt(z, lateral);
      const baseY = this.surfaceHeight(lateral, z);
      const scale = randomRange(this.rng, 0.35, 1.9);
      dummy.position.set(point.x, baseY + scale * 0.25, point.z);
      dummy.rotation.set(this.rng() * 0.5, this.rng() * TAU, this.rng() * 0.4);
      dummy.scale.set(scale * randomRange(this.rng, 0.8, 1.4), scale * randomRange(this.rng, 0.5, 0.9), scale);
      dummy.updateMatrix();
      rocks.setMatrixAt(i, dummy.matrix);
      rockColor.set(beach ? '#8a9489' : '#7b8d80');
      rockColor.offsetHSL(0, 0, randomRange(this.rng, -0.05, 0.06));
      rocks.setColorAt(i, rockColor);
    }
    if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    this.root.add(rocks);

    this.buildGrassAndFlowers();
    this.buildBushes();
    this.buildDistantHills();
    this.buildBeachDetails();
    this.buildFence();
  }

  private buildGrassAndFlowers(): void {
    const bladePositions: number[] = [];
    const bladeIndices: number[] = [];
    const bladeCount = 6;
    for (let i = 0; i < bladeCount; i += 1) {
      const angle = (i / bladeCount) * TAU + 0.35;
      const radius = 0.04 + (i % 2) * 0.045;
      const height = 0.24 + (i % 3) * 0.1;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const base = bladePositions.length / 3;
      bladePositions.push(
        x - 0.035, 0, z,
        x + 0.035, 0, z,
        x + Math.cos(angle) * 0.14, height, z + Math.sin(angle) * 0.14,
      );
      bladeIndices.push(base, base + 1, base + 2);
    }
    const tuftGeometry = new THREE.BufferGeometry();
    tuftGeometry.setAttribute('position', new THREE.Float32BufferAttribute(bladePositions, 3));
    tuftGeometry.setIndex(bladeIndices);
    tuftGeometry.computeVertexNormals();
    const tuftMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.95,
      side: THREE.DoubleSide,
      flatShading: true,
    });
    const tuftCount = 470;
    const tufts = new THREE.InstancedMesh(tuftGeometry, tuftMaterial, tuftCount);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const greens = [new THREE.Color('#6a9b5e'), new THREE.Color('#83b16f'), new THREE.Color('#588c54')];
    for (let i = 0; i < tuftCount; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const lateral = side * randomRange(this.rng, 5.6, side < 0 ? 20 : 18);
      const z = randomRange(this.rng, 5, this.level.data.trackLength + 30);
      const point = this.level.pointAt(z, lateral);
      const baseY = this.surfaceHeight(lateral, z);
      dummy.position.set(point.x, baseY, point.z);
      dummy.rotation.y = this.rng() * TAU;
      dummy.scale.setScalar(randomRange(this.rng, 0.6, 1.2));
      dummy.updateMatrix();
      tufts.setMatrixAt(i, dummy.matrix);
      color.copy(greens[i % greens.length] as THREE.Color);
      color.offsetHSL(0, 0, randomRange(this.rng, -0.03, 0.03));
      tufts.setColorAt(i, color);
    }
    if (tufts.instanceColor) tufts.instanceColor.needsUpdate = true;
    tufts.receiveShadow = true;
    this.root.add(tufts);

    // Little wildflowers made from a stem and a five-petal head. Two instanced
    // draws keep the meadow colourful without a hundred separate meshes.
    const stemGeometry = new THREE.CylinderGeometry(0.009, 0.012, 0.24, 4);
    stemGeometry.translate(0, 0.12, 0);
    const stemMaterial = new THREE.MeshStandardMaterial({
      color: 0x557443,
      roughness: 0.95,
      flatShading: true,
    });
    const petalParts: THREE.BufferGeometry[] = [];
    for (let p = 0; p < 5; p += 1) {
      const petal = new THREE.SphereGeometry(0.045, 6, 4);
      petal.scale(1, 0.36, 0.68);
      const angle = (p / 5) * TAU;
      petal.translate(Math.cos(angle) * 0.052, 0.255, Math.sin(angle) * 0.052);
      petalParts.push(petal);
    }
    const bloomCentre = new THREE.SphereGeometry(0.035, 6, 4);
    bloomCentre.translate(0, 0.255, 0);
    petalParts.push(bloomCentre);
    const bloomGeometry = mergeSimpleGeometries(petalParts);
    const bloomMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.74,
      flatShading: true,
    });
    const flowerCount = 180;
    const stems = new THREE.InstancedMesh(stemGeometry, stemMaterial, flowerCount);
    const blooms = new THREE.InstancedMesh(bloomGeometry, bloomMaterial, flowerCount);
    const flowerColors = [
      new THREE.Color('#f8da84'),
      new THREE.Color('#ed957e'),
      new THREE.Color('#f5c0b3'),
      new THREE.Color('#fff0d8'),
    ];
    for (let i = 0; i < flowerCount; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const lateral = side * randomRange(this.rng, 6.2, 18);
      const z = randomRange(this.rng, 14, this.level.data.trackLength);
      const point = this.level.pointAt(z, lateral);
      const baseY = this.surfaceHeight(lateral, z);
      dummy.position.set(point.x, baseY, point.z);
      dummy.rotation.set(0, this.rng() * TAU, 0);
      dummy.scale.setScalar(randomRange(this.rng, 0.75, 1.3));
      dummy.updateMatrix();
      stems.setMatrixAt(i, dummy.matrix);
      blooms.setMatrixAt(i, dummy.matrix);
      blooms.setColorAt(i, flowerColors[i % flowerColors.length] as THREE.Color);
    }
    if (blooms.instanceColor) blooms.instanceColor.needsUpdate = true;
    stems.receiveShadow = true;
    blooms.receiveShadow = true;
    this.root.add(stems);
    this.root.add(blooms);
  }

  private buildBushes(): void {
    const geometry = new THREE.IcosahedronGeometry(1, 1);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.92,
      flatShading: true,
    });
    const count = 46;
    const bushes = new THREE.InstancedMesh(geometry, material, count);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const greens = [new THREE.Color('#5f925f'), new THREE.Color('#7da873'), new THREE.Color('#527f56')];
    for (let i = 0; i < count; i += 1) {
      const lateral = randomRange(this.rng, 8, 34);
      const z = randomRange(this.rng, 10, this.level.data.trackLength + 40);
      const point = this.level.pointAt(z, lateral);
      const baseY = this.inlandHeight(lateral, z);
      const width = randomRange(this.rng, 0.5, 1.6);
      dummy.position.set(point.x, baseY + width * 0.36, point.z);
      dummy.rotation.set(0, this.rng() * TAU, 0);
      dummy.scale.set(width, width * randomRange(this.rng, 0.4, 0.7), width * randomRange(this.rng, 0.8, 1.1));
      dummy.updateMatrix();
      bushes.setMatrixAt(i, dummy.matrix);
      color.copy(greens[i % greens.length] as THREE.Color);
      bushes.setColorAt(i, color);
    }
    if (bushes.instanceColor) bushes.instanceColor.needsUpdate = true;
    bushes.castShadow = true;
    bushes.receiveShadow = true;
    this.root.add(bushes);
  }

  private buildDistantHills(): void {
    const geometry = new THREE.IcosahedronGeometry(1, 1);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.98,
      flatShading: true,
    });
    const count = 9;
    const hills = new THREE.InstancedMesh(geometry, material, count);
    const dummy = new THREE.Object3D();
    const colors = [new THREE.Color('#728f64'), new THREE.Color('#8ba681'), new THREE.Color('#627f5d')];
    for (let i = 0; i < count; i += 1) {
      const z = 100 + i * 78 + randomRange(this.rng, -20, 20);
      const lateral = randomRange(this.rng, 75, 145);
      const point = this.level.pointAt(z, lateral);
      const baseY = this.inlandHeight(Math.min(lateral, 75), z);
      dummy.position.set(point.x, baseY + randomRange(this.rng, 1, 5), point.z);
      dummy.rotation.set(0, this.rng() * TAU, 0);
      dummy.scale.set(randomRange(this.rng, 20, 42), randomRange(this.rng, 7, 20), randomRange(this.rng, 16, 34));
      dummy.updateMatrix();
      hills.setMatrixAt(i, dummy.matrix);
      hills.setColorAt(i, colors[i % colors.length]);
    }
    if (hills.instanceColor) hills.instanceColor.needsUpdate = true;
    hills.receiveShadow = true;
    this.root.add(hills);
  }

  private buildBeachDetails(): void {
    // Beach furniture at the start and finish frames the ride with a little
    // holiday colour. All of it lives well clear of the cycle path.
    const umbrellaGroup = new THREE.Group();
    const spots = [
      { z: 38, lateral: -10.4 },
      { z: 63, lateral: -13.2 },
      { z: 93, lateral: -9.8 },
      { z: this.level.data.finishZ - 22, lateral: -11 },
      { z: this.level.data.finishZ - 11, lateral: -14 },
    ];
    const canopyMaterials = [this.warningMaterial, this.warningCream];
    const towelColors = ['#de8b6a', '#75b4a6', '#e1c27d'];
    const ballGeometry = new THREE.SphereGeometry(0.35, 12, 8);
    for (let i = 0; i < spots.length; i += 1) {
      const spot = spots[i] as { z: number; lateral: number };
      const point = this.level.pointAt(spot.z, spot.lateral);
      const baseY = this.beachHeight(spot.lateral, spot.z);
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.045, 2.3, 6),
        this.paleWoodMaterial,
      );
      pole.position.set(point.x, baseY + 1.15, point.z);
      pole.castShadow = true;
      umbrellaGroup.add(pole);
      const canopy = new THREE.Mesh(
        new THREE.ConeGeometry(1.45, 0.5, 10, 1, true),
        canopyMaterials[i % canopyMaterials.length] as THREE.Material,
      );
      canopy.position.set(point.x, baseY + 2.24, point.z);
      canopy.rotation.y = this.rng() * TAU;
      canopy.castShadow = true;
      umbrellaGroup.add(canopy);
      const towel = new THREE.Mesh(
        new THREE.PlaneGeometry(1.2, 1.8),
        new THREE.MeshStandardMaterial({
          color: towelColors[i % towelColors.length],
          roughness: 0.96,
          side: THREE.DoubleSide,
        }),
      );
      towel.rotation.x = -Math.PI / 2;
      towel.rotation.z = this.rng() * 0.5;
      towel.position.set(point.x + 1.6, baseY + 0.02, point.z + 1.0);
      umbrellaGroup.add(towel);
      if (i % 2 === 0) {
        const ball = new THREE.Mesh(
          ballGeometry,
          new THREE.MeshStandardMaterial({
            color: i === 0 ? '#f0a44c' : '#ef7d67',
            roughness: 0.66,
          }),
        );
        ball.position.set(point.x - 1.2, baseY + 0.34, point.z + 0.8);
        ball.castShadow = true;
        umbrellaGroup.add(ball);
      }
    }
    this.root.add(umbrellaGroup);
  }

  private buildFence(): void {
    const postMaterial = this.paleWoodMaterial;
    const railMaterial = this.woodMaterial;
    const sections: Array<[number, number]> = [
      [52, 94],
      [286, 318],
      [560, 596],
    ];
    for (const [start, end] of sections) {
      for (const side of [1]) {
        const lateral = side * (this.level.roadHalfWidth() + 1.95);
        const points: THREE.Vector3[] = [];
        for (let z = start; z <= end; z += 3.3) {
          const point = this.level.pointAt(z, lateral);
          const baseY = this.surfaceHeight(lateral, z);
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.75, 0.1), postMaterial);
          post.position.set(point.x, baseY + 0.37, point.z);
          post.rotation.y = this.level.yawAt(z);
          post.castShadow = true;
          this.root.add(post);
          points.push(new THREE.Vector3(point.x, baseY + 0.62, point.z));
        }
        for (let i = 0; i < points.length - 1; i += 1) {
          const a = points[i] as THREE.Vector3;
          const b = points[i + 1] as THREE.Vector3;
          const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
          const direction = new THREE.Vector3().subVectors(b, a);
          const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, direction.length()), railMaterial);
          rail.position.copy(mid);
          const angle = Math.atan2(direction.x, direction.z);
          rail.rotation.y = angle;
          rail.castShadow = true;
          this.root.add(rail);
        }
      }
    }
  }

  private buildLighthouse(): void {
    const lateral = -23;
    const z = this.level.data.finishZ + 21;
    const point = this.level.pointAt(z, lateral);
    const baseY = this.beachHeight(lateral, z) + 0.2;
    const group = new THREE.Group();
    group.position.set(point.x, baseY, point.z);
    group.name = 'lighthouse';

    const headland = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 1), this.darkStoneMaterial);
    headland.scale.set(8, 2.6, 7);
    headland.position.y = -1.0;
    headland.rotation.y = 0.7;
    headland.receiveShadow = true;
    headland.castShadow = true;
    group.add(headland);

    const stoneBase = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.4, 1.0, 12), this.stoneMaterial);
    stoneBase.position.y = 0.5;
    stoneBase.castShadow = true;
    group.add(stoneBase);

    const white = new THREE.MeshStandardMaterial({ color: 0xfff1d9, roughness: 0.72 });
    const red = new THREE.MeshStandardMaterial({ color: 0xca6048, roughness: 0.68 });
    let radius = 1.52;
    for (let i = 0; i < 4; i += 1) {
      const nextRadius = radius - 0.13;
      const section = new THREE.Mesh(
        new THREE.CylinderGeometry(nextRadius, radius, 1.55, 14),
        i % 2 === 0 ? white : red,
      );
      section.position.y = 1.0 + i * 1.55 + 0.775;
      section.castShadow = true;
      group.add(section);
      radius = nextRadius;
    }

    const gallery = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.2, 0.16, 14), this.darkStoneMaterial);
    gallery.position.y = 7.15;
    gallery.castShadow = true;
    group.add(gallery);

    const lantern = new THREE.Mesh(
      new THREE.CylinderGeometry(0.78, 0.85, 1.0, 10),
      new THREE.MeshStandardMaterial({
        color: 0xffd877,
        emissive: 0xffb43b,
        emissiveIntensity: 1.1,
        roughness: 0.28,
      }),
    );
    lantern.position.y = 7.76;
    group.add(lantern);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.04, 0.9, 12), red);
    roof.position.y = 8.7;
    roof.castShadow = true;
    group.add(roof);
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), this.darkWoodMaterial);
    finial.position.y = 9.2;
    group.add(finial);

    const door = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.9, 0.1), this.darkWoodMaterial);
    door.position.set(0, 1.0, 1.48);
    group.add(door);

    const glowTexture = createSunTexture(192);
    const glowMaterial = new THREE.SpriteMaterial({
      map: glowTexture,
      color: 0xffd68b,
      transparent: true,
      opacity: 0.26,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const glow = new THREE.Sprite(glowMaterial);
    glow.position.y = 7.8;
    glow.scale.set(7, 7, 1);
    group.add(glow);
    this.lighthouseGlow = glow;
    this.root.add(group);
  }

  update(dt: number, time: number): void {
    for (const cloth of this.cloths) {
      cloth.object.rotation.y = cloth.baseRotation + Math.sin(time * cloth.speed + cloth.phase) * cloth.amplitude;
      cloth.object.rotation.z = Math.sin(time * cloth.speed * 0.63 + cloth.phase + 0.7) * cloth.amplitude * 0.35;
    }
    if (this.lighthouseGlow) {
      const material = this.lighthouseGlow.material as THREE.SpriteMaterial;
      material.opacity = 0.2 + Math.sin(time * 1.4) * 0.05 + Math.sin(time * 2.8) * 0.025;
    }
    if (this.finishBanner) {
      this.finishBanner.rotation.z = Math.sin(time * 0.8) * 0.008;
    }
  }

  /** World-space positions used by gameplay effects and menu framing. */
  getCheckpointPoint(index: number, out = new THREE.Vector3()): THREE.Vector3 {
    const checkpoint = this.level.data.checkpoints[index];
    if (!checkpoint) return out.set(0, 1, 0);
    const point = this.level.pointAt(checkpoint.z, 0);
    return out.set(point.x, 2.3, point.z);
  }

  getFinishPoint(out = new THREE.Vector3()): THREE.Vector3 {
    const point = this.level.pointAt(this.level.data.finishZ, 0);
    return out.set(point.x, 2.0, point.z);
  }

  /** Terrain height for off-road recovery and prop placement. */
  getGroundHeight(lateral: number, z: number): number {
    return this.surfaceHeight(lateral, z);
  }

  dispose(): void {
    this.root.traverse((object) => {
      if (object instanceof THREE.Mesh) {
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
