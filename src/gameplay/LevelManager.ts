import * as THREE from 'three';
import { clamp, formatDistance, mulberry32, randomRange } from '../utils/math';

export type ObstacleKind = 'log' | 'rock' | 'driftwood';

export interface ObstacleSpec {
  id: number;
  kind: ObstacleKind;
  z: number;
  lateral: number;
  width: number;
  depth: number;
  height: number;
  radius: number;
  rotation: number;
  seed: number;
}

export interface FishSpec {
  id: number;
  z: number;
  lateral: number;
  height: number;
  phase: number;
  scale: number;
}

export interface GapSpec {
  start: number;
  end: number;
}

export interface BridgeSpec {
  start: number;
  end: number;
  streamZ: number;
}

export interface CheckpointSpec {
  index: number;
  z: number;
  label: string;
}

export interface LevelData {
  seed: number;
  roadWidth: number;
  roadHalfWidth: number;
  trackLength: number;
  startZ: number;
  finishZ: number;
  checkpoints: CheckpointSpec[];
  gaps: GapSpec[];
  bridges: BridgeSpec[];
  obstacles: ObstacleSpec[];
  fish: FishSpec[];
}

const ROAD_WIDTH = 8.6;
const ROAD_HALF = ROAD_WIDTH * 0.5;
const TRACK_LENGTH = 780;
const START_Z = 8;
const FINISH_Z = 724;
const LEVEL_SEED = 0x5ea51de;

/**
 * The single complete coastal course. Geometry and prop placement are generated
 * from a deterministic seed so that records and best times are comparable.
 */
export class LevelManager {
  readonly data: LevelData;
  private readonly baseOffset: number;

  constructor(seed = LEVEL_SEED) {
    this.baseOffset = this.baseCenterX(0);
    const checkpoints: CheckpointSpec[] = [
      { index: 0, z: 232, label: 'GULL ROCK' },
      { index: 1, z: 472, label: 'LIGHTHOUSE BEND' },
    ];
    const gaps: GapSpec[] = [
      { start: 334, end: 340.2 },
      { start: 606, end: 613 },
    ];
    const bridges: BridgeSpec[] = [
      { start: 148, end: 168, streamZ: 158 },
      { start: 516, end: 536, streamZ: 526 },
    ];
    const rng = mulberry32(seed);
    const obstacles = this.generateObstacles(rng, checkpoints, gaps, bridges);
    const fish = this.generateFish(rng, gaps);
    this.data = {
      seed,
      roadWidth: ROAD_WIDTH,
      roadHalfWidth: ROAD_HALF,
      trackLength: TRACK_LENGTH,
      startZ: START_Z,
      finishZ: FINISH_Z,
      checkpoints,
      gaps,
      bridges,
      obstacles,
      fish,
    };
  }

  private baseCenterX(z: number): number {
    return 15 * Math.sin(z * 0.012 + 0.35) + 6.5 * Math.sin(z * 0.031 + 1.7);
  }

  /** World-space X of the centre of the coastal cycle path at a given Z. */
  centerX(z: number): number {
    return this.baseCenterX(z) - this.baseOffset;
  }

  /** Heading (radians about +Y) of the path's forward direction. */
  yawAt(z: number): number {
    const dx =
      15 * 0.012 * Math.cos(z * 0.012 + 0.35) +
      6.5 * 0.031 * Math.cos(z * 0.031 + 1.7);
    return Math.atan2(dx, 1);
  }

  /**
   * A point on the path. Positive lateral follows the path's local +X, which
   * is the rider's left in the +Z-forward, +Y-up right-handed frame (and
   * consequently projects to the left side of the default chase camera).
   */
  pointAt(z: number, lateral: number, out = new THREE.Vector3()): THREE.Vector3 {
    const yaw = this.yawAt(z);
    return out.set(
      this.centerX(z) + Math.cos(yaw) * lateral,
      0,
      z - Math.sin(yaw) * lateral,
    );
  }

  /** Signed left-positive lateral offset from the path centre at the rider's Z. */
  lateralAt(x: number, z: number): number {
    return x - this.centerX(z);
  }

  roadHalfWidth(): number {
    return ROAD_HALF;
  }

  get roadWidth(): number {
    return ROAD_WIDTH;
  }

  trackLength(): number {
    return TRACK_LENGTH;
  }

  startYaw(): number {
    return this.yawAt(START_Z);
  }

  isOnRoad(x: number, z: number, margin = 0): boolean {
    return Math.abs(this.lateralAt(x, z)) <= ROAD_HALF + margin;
  }

  progressForZ(z: number): number {
    return clamp((z - START_Z) / (FINISH_Z - START_Z), 0, 1);
  }

  distanceForZ(z: number): number {
    return Math.max(0, z - START_Z);
  }

  difficultyAt(z: number): number {
    return clamp((z - 80) / 590, 0, 1);
  }

  gapAt(z: number): GapSpec | undefined {
    return this.data.gaps.find((gap) => z >= gap.start && z <= gap.end);
  }

  gapAhead(z: number, maxDistance = 22): GapSpec | undefined {
    return this.data.gaps.find((gap) => gap.start > z && gap.start - z <= maxDistance);
  }

  bridgeAt(z: number): BridgeSpec | undefined {
    return this.data.bridges.find((bridge) => z >= bridge.start && z <= bridge.end);
  }

  isInBridgeApproach(z: number, padding = 8): boolean {
    return this.data.bridges.some(
      (bridge) => z >= bridge.start - padding && z <= bridge.end + padding,
    );
  }

  isCheckpointZone(z: number, padding = 12): boolean {
    return this.data.checkpoints.some(
      (checkpoint) => z >= checkpoint.z - padding && z <= checkpoint.z + padding,
    );
  }

  isNearGap(z: number, padding = 16): boolean {
    return this.data.gaps.some(
      (gap) => z >= gap.start - padding && z <= gap.end + padding,
    );
  }

  checkpointAtOrBehind(z: number): CheckpointSpec[] {
    return this.data.checkpoints.filter((checkpoint) => checkpoint.z <= z);
  }

  humanDistance(z: number): string {
    return formatDistance(this.distanceForZ(z));
  }

  private generateObstacles(
    rng: () => number,
    checkpoints: CheckpointSpec[],
    gaps: GapSpec[],
    bridges: BridgeSpec[],
  ): ObstacleSpec[] {
    const obstacles: ObstacleSpec[] = [];
    let nextId = 0;
    let z = 64;
    let safety = 0;

    const unsafe = (candidate: number): boolean => {
      if (candidate < 42 || candidate > FINISH_Z - 24) return true;
      if (gaps.some((gap) => candidate > gap.start - 15 && candidate < gap.end + 10)) return true;
      if (bridges.some((bridge) => candidate > bridge.start - 8 && candidate < bridge.end + 8)) return true;
      if (checkpoints.some((cp) => Math.abs(candidate - cp.z) < 18)) return true;
      if (Math.abs(candidate - FINISH_Z) < 30) return true;
      return false;
    };

    while (z < FINISH_Z - 28 && safety < 80) {
      safety += 1;
      if (unsafe(z)) {
        z += 7;
        continue;
      }

      const difficulty = this.difficultyAt(z);
      const pairChance = difficulty > 0.25 ? 0.18 + difficulty * 0.35 : 0.05;
      const count = rng() < pairChance ? 2 : 1;
      const lanes = count === 2 ? [-2.2, 2.15] : [randomRange(rng, -2.15, 2.15)];

      for (let i = 0; i < count; i += 1) {
        const kindRoll = rng();
        const kind: ObstacleKind = kindRoll < 0.52 ? 'log' : kindRoll < 0.88 ? 'rock' : 'driftwood';
        const seed = Math.floor(rng() * 65535);
        const lateral = lanes[i] ?? 0;
        if (kind === 'rock') {
          const radius = randomRange(rng, 0.6, 0.86);
          obstacles.push({
            id: nextId,
            kind,
            z: z + randomRange(rng, -0.8, 0.8),
            lateral,
            width: radius * 1.8,
            depth: radius * 1.7,
            height: randomRange(rng, 0.78, 1.12),
            radius,
            rotation: randomRange(rng, 0, Math.PI),
            seed,
          });
        } else {
          const baseWidth = kind === 'driftwood' ? randomRange(rng, 1.8, 2.6) : randomRange(rng, 2.1, 3.2);
          const width = count === 2 ? baseWidth * 0.72 : baseWidth;
          obstacles.push({
            id: nextId,
            kind,
            z: z + randomRange(rng, -0.55, 0.55),
            lateral,
            width,
            depth: kind === 'driftwood' ? 0.38 : 0.52,
            height: kind === 'driftwood' ? 0.48 : 0.58,
            radius: width * 0.5,
            rotation: randomRange(rng, -0.16, 0.16),
            seed,
          });
        }
        nextId += 1;
      }

      const spacing = (1 - difficulty) * 26 + randomRange(rng, 24, 43);
      z += spacing;
    }

    return obstacles.sort((a, b) => a.z - b.z);
  }

  private generateFish(rng: () => number, gaps: GapSpec[]): FishSpec[] {
    const fish: FishSpec[] = [];
    let nextId = 0;

    const addFish = (z: number, lateral: number, height: number, scale = 1): void => {
      fish.push({
        id: nextId,
        z,
        lateral,
        height,
        phase: rng() * Math.PI * 2,
        scale,
      });
      nextId += 1;
    };

    // A pleasant ribbon of fish through the opening stretch.
    for (let z = 34; z < FINISH_Z - 10; z += randomRange(rng, 18, 27)) {
      if (gaps.some((gap) => z > gap.start - 7 && z < gap.end + 4)) continue;
      const pattern = rng();
      const baseLane = randomRange(rng, -2.6, 2.6);
      if (pattern < 0.3) {
        for (let i = 0; i < 3; i += 1) {
          addFish(z + i * 2.2, clamp(baseLane + Math.sin(i * 1.5) * 0.65, -3.0, 3.0), 1.1 + i * 0.1);
        }
      } else if (pattern < 0.53) {
        // High line: a little bunny hop makes these collectible.
        for (let i = 0; i < 3; i += 1) {
          addFish(z + i * 2.4, baseLane, 2.0 + Math.sin((i / 2) * Math.PI) * 0.48);
        }
      } else if (pattern < 0.76) {
        addFish(z, baseLane, 1.15);
        addFish(z + 4.4, -baseLane, 1.15);
      } else {
        addFish(z, baseLane, 1.0, 1.15);
      }
    }

    // Fish arcs spanning each gap reward a confident jump.
    for (const gap of gaps) {
      const center = (gap.start + gap.end) * 0.5;
      for (let i = 0; i < 5; i += 1) {
        const t = i / 4;
        addFish(
          center - 5 + t * 10,
          Math.sin(t * Math.PI * 2) * 0.55,
          1.5 + Math.sin(t * Math.PI) * 0.82,
          0.88,
        );
      }
    }

    // A farewell school before the lighthouse finish.
    for (let i = 0; i < 7; i += 1) {
      addFish(FINISH_Z - 32 + i * 2.8, Math.sin(i * 0.9) * 2.3, 1.2 + Math.sin(i * 0.8) * 0.5);
    }

    return fish.sort((a, b) => a.z - b.z);
  }
}
