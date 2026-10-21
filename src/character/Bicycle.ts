import * as THREE from 'three';
import { clamp, TAU } from '../utils/math';
import { disposeObject3D, makeCylinderBetween } from '../utils/geometry';

export type BikeSide = 'left' | 'right';

interface WheelAssembly {
  mount: THREE.Group;
  spin: THREE.Group;
  spinAngle: number;
}

interface ChainPoint {
  t: number;
  upper: boolean;
}

/**
 * Procedurally modelled bicycle. All parts share a single local coordinate
 * system with +Z as forward and +Y up. This is a right-handed frame, so +X is
 * the rider's left; in the default chase view world +X projects to screen-left.
 */
export class Bicycle {
  readonly root = new THREE.Group();
  readonly wheelRadius = 0.45;
  readonly chainringRadius = 0.155;
  readonly cogRadius = 0.068;

  readonly leftGrip = new THREE.Object3D();
  readonly rightGrip = new THREE.Object3D();
  readonly leftPedal = new THREE.Object3D();
  readonly rightPedal = new THREE.Object3D();

  private readonly rearWheel: WheelAssembly;
  private frontWheel!: WheelAssembly;
  private readonly steerPivot = new THREE.Group();
  private readonly crankGroup = new THREE.Group();
  private readonly rightPedalPivot = new THREE.Group();
  private readonly leftPedalPivot = new THREE.Group();
  private readonly cogGroup = new THREE.Group();
  private readonly chainLinks: THREE.InstancedMesh;
  private readonly chainPoints: ChainPoint[] = [];
  private readonly chainTopStart = new THREE.Vector3();
  private readonly chainTopEnd = new THREE.Vector3();
  private readonly chainBottomStart = new THREE.Vector3();
  private readonly chainBottomEnd = new THREE.Vector3();
  private readonly tempObject = new THREE.Object3D();
  private readonly tempMatrix = new THREE.Matrix4();
  private chainOffset = 0;
  private crankAngle = 0;

  private readonly paint = new THREE.MeshStandardMaterial({
    color: 0x1d7771,
    roughness: 0.4,
    metalness: 0.22,
  });
  private readonly paintDeep = new THREE.MeshStandardMaterial({
    color: 0x0f4f4c,
    roughness: 0.45,
    metalness: 0.25,
  });
  private readonly dark = new THREE.MeshStandardMaterial({
    color: 0x142c2c,
    roughness: 0.48,
    metalness: 0.3,
  });
  private readonly cream = new THREE.MeshStandardMaterial({
    color: 0xfff2d8,
    roughness: 0.56,
    metalness: 0.04,
  });
  private readonly tire = new THREE.MeshStandardMaterial({
    color: 0x253535,
    roughness: 0.82,
    metalness: 0.04,
  });
  private readonly tireHighlight = new THREE.MeshStandardMaterial({
    color: 0x4e6260,
    roughness: 0.7,
    metalness: 0.06,
  });
  private readonly rim = new THREE.MeshStandardMaterial({
    color: 0xd8ddce,
    roughness: 0.35,
    metalness: 0.55,
  });
  private readonly chrome = new THREE.MeshStandardMaterial({
    color: 0xbac6b9,
    roughness: 0.24,
    metalness: 0.78,
  });
  private readonly darkMetal = new THREE.MeshStandardMaterial({
    color: 0x4d5d57,
    roughness: 0.38,
    metalness: 0.62,
  });
  private readonly leather = new THREE.MeshStandardMaterial({
    color: 0x825438,
    roughness: 0.74,
    metalness: 0.03,
  });
  private readonly leatherEdge = new THREE.MeshStandardMaterial({
    color: 0xa7734b,
    roughness: 0.7,
    metalness: 0.03,
  });
  private readonly gold = new THREE.MeshStandardMaterial({
    color: 0xd9b26a,
    roughness: 0.32,
    metalness: 0.66,
  });
  private readonly orange = new THREE.MeshStandardMaterial({
    color: 0xe8894e,
    roughness: 0.52,
    metalness: 0.04,
    emissive: 0x3a1205,
    emissiveIntensity: 0.2,
  });
  private readonly chainMat = new THREE.MeshStandardMaterial({
    color: 0x3c4a45,
    roughness: 0.42,
    metalness: 0.68,
  });

  constructor() {
    this.root.name = 'bicycle';
    const rear = this.buildWheel();
    rear.mount.position.set(0, this.wheelRadius, -0.86);
    this.root.add(rear.mount);
    this.rearWheel = rear;

    this.buildFrame();
    this.buildSteering();
    this.buildDrivetrain();
    this.buildSaddle();

    this.chainLinks = this.buildChainLinks();
    this.root.add(this.chainLinks);
    this.root.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    this.updateChainLinks(0);
  }

  private buildWheel(): WheelAssembly {
    const mount = new THREE.Group();
    mount.rotation.y = Math.PI / 2;
    const spin = new THREE.Group();
    mount.add(spin);

    const tire = new THREE.Mesh(
      new THREE.TorusGeometry(this.wheelRadius - 0.065, 0.065, 9, 36),
      this.tire,
    );
    spin.add(tire);

    const tread = new THREE.Mesh(
      new THREE.TorusGeometry(this.wheelRadius - 0.036, 0.012, 5, 36),
      this.tireHighlight,
    );
    fadeMesh(tread);
    spin.add(tread);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(this.wheelRadius - 0.132, 0.024, 6, 36),
      this.rim,
    );
    spin.add(rim);

    const innerRim = new THREE.Mesh(
      new THREE.TorusGeometry(this.wheelRadius - 0.24, 0.008, 4, 28),
      this.chrome,
    );
    fadeMesh(innerRim);
    spin.add(innerRim);

    const spokeMaterial = new THREE.MeshStandardMaterial({
      color: 0x9daaa0,
      roughness: 0.46,
      metalness: 0.42,
    });
    const spokeGeometry = new THREE.CylinderGeometry(0.006, 0.006, 0.3, 4);
    const spokeCount = 16;
    for (let i = 0; i < spokeCount; i += 1) {
      const angle = (i / spokeCount) * TAU;
      const spoke = new THREE.Mesh(spokeGeometry, spokeMaterial);
      spoke.position.set(0, 0.19, 0);
      spoke.rotation.z = angle;
      spoke.rotation.x = 0.035 * Math.sin(angle);
      spin.add(spoke);
    }

    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 0.115, 12),
      this.chrome,
    );
    hub.rotation.x = Math.PI / 2;
    spin.add(hub);

    const hubDark = new THREE.Mesh(
      new THREE.CylinderGeometry(0.073, 0.073, 0.06, 12),
      this.darkMetal,
    );
    hubDark.rotation.x = Math.PI / 2;
    spin.add(hubDark);

    const axle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.017, 0.017, 0.2, 8),
      this.dark,
    );
    axle.rotation.x = Math.PI / 2;
    spin.add(axle);

    const valve = new THREE.Mesh(
      new THREE.CylinderGeometry(0.009, 0.009, 0.11, 6),
      this.dark,
    );
    valve.position.set(0, 0.32, 0);
    valve.rotation.z = 0.28;
    spin.add(valve);

    return { mount, spin, spinAngle: 0 };
  }

  private buildFrame(): void {
    const rear = new THREE.Vector3(0, 0.45, -0.86);
    const bb = new THREE.Vector3(0, 0.54, -0.02);
    const seat = new THREE.Vector3(0, 1.01, -0.36);
    const headBottom = new THREE.Vector3(0, 0.9, 0.55);
    const headTop = new THREE.Vector3(0, 1.13, 0.455);

    const addTube = (
      a: THREE.Vector3,
      b: THREE.Vector3,
      radius: number,
      material = this.paint,
      outline = true,
    ): THREE.Mesh => {
      if (outline) {
        const outer = makeCylinderBetween(a, b, radius + 0.013, this.dark);
        this.root.add(outer);
      }
      const inner = makeCylinderBetween(a, b, radius, material);
      this.root.add(inner);
      return inner;
    };

    addTube(bb, rear, 0.035, this.paintDeep);
    addTube(bb, seat, 0.043);
    addTube(seat, headTop, 0.039);
    addTube(bb, headBottom, 0.041);
    addTube(headBottom, headTop, 0.062, this.paintDeep);
    addTube(headTop, new THREE.Vector3(0, 1.2, 0.43), 0.03, this.chrome, false);

    // Stays are doubled up to read as a real bicycle rear triangle.
    for (const side of [-1, 1]) {
      addTube(
        new THREE.Vector3(side * 0.045, 0.45, -0.86),
        new THREE.Vector3(side * 0.045, 0.54, -0.02),
        0.025,
        this.paintDeep,
        false,
      );
      addTube(
        new THREE.Vector3(side * 0.04, 0.45, -0.86),
        new THREE.Vector3(side * 0.04, 1.01, -0.36),
        0.023,
        this.paintDeep,
        false,
      );
    }

    // Bottom-bracket shell, lug details, and headset cups.
    const bbShell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.085, 0.15, 14),
      this.darkMetal,
    );
    bbShell.rotation.z = Math.PI / 2;
    bbShell.position.copy(bb);
    this.root.add(bbShell);

    const headsetTop = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.035, 12),
      this.gold,
    );
    headsetTop.position.copy(headTop);
    this.root.add(headsetTop);

    const headsetBottom = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 0.03, 12),
      this.gold,
    );
    headsetBottom.position.copy(headBottom);
    this.root.add(headsetBottom);

    const seatLug = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), this.gold);
    seatLug.scale.set(1, 0.7, 0.8);
    seatLug.position.copy(seat);
    this.root.add(seatLug);

    const rearDropout = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.2, 8), this.chrome);
    rearDropout.rotation.z = Math.PI / 2;
    rearDropout.position.copy(rear);
    this.root.add(rearDropout);

    const chainstayBridge = makeCylinderBetween(
      new THREE.Vector3(-0.055, 0.49, -0.44),
      new THREE.Vector3(0.055, 0.49, -0.44),
      0.012,
      this.paintDeep,
    );
    this.root.add(chainstayBridge);

    const downTubeBottle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.055, 0.21, 10),
      this.cream,
    );
    downTubeBottle.position.set(0.1, 0.69, 0.22);
    downTubeBottle.rotation.z = 0.1;
    downTubeBottle.rotation.x = 0.38;
    this.root.add(downTubeBottle);

    const bottleCap = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.03, 8), this.orange);
    bottleCap.position.set(0.1, 0.8, 0.29);
    bottleCap.rotation.x = 0.38;
    this.root.add(bottleCap);
  }

  private buildSteering(): void {
    this.steerPivot.position.set(0, 0.9, 0.55);
    this.steerPivot.name = 'steering-assembly';
    this.root.add(this.steerPivot);

    const frontAxle = new THREE.Vector3(0, -this.wheelRadius, 0.31);
    const front = this.buildWheel();
    front.mount.position.copy(frontAxle);
    this.steerPivot.add(front.mount);
    this.frontWheel = front;

    // Curved fork blades.
    for (const side of [-1, 1]) {
      const start = new THREE.Vector3(side * 0.045, 0.005, 0.005);
      const middle = new THREE.Vector3(side * 0.065, -0.22, 0.14);
      const end = new THREE.Vector3(side * 0.018, -this.wheelRadius, 0.31);
      const outerStart = makeCylinderBetween(
        start,
        middle,
        0.03,
        this.dark,
      );
      const innerStart = makeCylinderBetween(start, middle, 0.018, this.paintDeep);
      const outerEnd = makeCylinderBetween(middle, end, 0.03, this.dark);
      const innerEnd = makeCylinderBetween(middle, end, 0.018, this.paintDeep);
      this.steerPivot.add(outerStart, innerStart, outerEnd, innerEnd);
    }

    const crown = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.09), this.paintDeep);
    crown.position.set(0, 0.0, 0.0);
    this.steerPivot.add(crown);

    const stem = makeCylinderBetween(
      new THREE.Vector3(0, 0.19, -0.08),
      new THREE.Vector3(0, 0.4, 0.05),
      0.028,
      this.chrome,
    );
    this.steerPivot.add(stem);

    const stemCap = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), this.chrome);
    stemCap.position.set(0, 0.4, 0.05);
    this.steerPivot.add(stemCap);

    const barPoints = [
      new THREE.Vector3(-0.43, 0.42, 0.05),
      new THREE.Vector3(-0.3, 0.44, 0.095),
      new THREE.Vector3(0, 0.425, 0.06),
      new THREE.Vector3(0.3, 0.44, 0.095),
      new THREE.Vector3(0.43, 0.42, 0.05),
    ];
    for (let i = 0; i < barPoints.length - 1; i += 1) {
      const a = barPoints[i] as THREE.Vector3;
      const b = barPoints[i + 1] as THREE.Vector3;
      this.steerPivot.add(makeCylinderBetween(a, b, 0.034, this.dark));
      this.steerPivot.add(makeCylinderBetween(a, b, 0.021, this.chrome));
    }

    const gripGeometry = new THREE.CylinderGeometry(0.035, 0.035, 0.13, 10);
    const leftGripMesh = new THREE.Mesh(gripGeometry, this.leather);
    leftGripMesh.rotation.z = Math.PI / 2;
    leftGripMesh.position.set(-0.44, 0.42, 0.05);
    this.steerPivot.add(leftGripMesh);
    const rightGripMesh = new THREE.Mesh(gripGeometry, this.leather);
    rightGripMesh.rotation.z = Math.PI / 2;
    rightGripMesh.position.set(0.44, 0.42, 0.05);
    this.steerPivot.add(rightGripMesh);

    const gripBandGeometry = new THREE.CylinderGeometry(0.041, 0.041, 0.018, 10);
    for (const x of [-0.5, -0.38, 0.38, 0.5]) {
      const band = new THREE.Mesh(gripBandGeometry, this.leatherEdge);
      band.rotation.z = Math.PI / 2;
      band.position.set(x, 0.42, 0.05);
      this.steerPivot.add(band);
    }

    const capGeometry = new THREE.SphereGeometry(0.038, 10, 8);
    for (const side of [-1, 1]) {
      const cap = new THREE.Mesh(capGeometry, this.gold);
      cap.position.set(side * 0.505, 0.42, 0.05);
      this.steerPivot.add(cap);
    }

    const lever = makeCylinderBetween(
      new THREE.Vector3(0.25, 0.41, 0.11),
      new THREE.Vector3(0.22, 0.33, 0.17),
      0.015,
      this.darkMetal,
    );
    this.steerPivot.add(lever);

    const brakeGrip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.025, 0.09), this.dark);
    brakeGrip.position.set(0.22, 0.33, 0.2);
    brakeGrip.rotation.z = 0.2;
    this.steerPivot.add(brakeGrip);

    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 8), this.gold);
    bell.scale.set(1, 0.55, 1);
    bell.position.set(-0.17, 0.465, 0.12);
    this.steerPivot.add(bell);

    const bellStem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.055, 6), this.dark);
    bellStem.position.set(-0.17, 0.43, 0.12);
    this.steerPivot.add(bellStem);

    // Grips and hands should target the same point in world space.
    this.leftGrip.position.set(-0.43, 0.42, 0.05);
    this.rightGrip.position.set(0.43, 0.42, 0.05);
    this.steerPivot.add(this.leftGrip, this.rightGrip);

    // A small warm headlamp adds a friendly focal detail to the front.
    const lampBody = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.08, 10), this.cream);
    lampBody.rotation.x = Math.PI / 2;
    lampBody.position.set(0, -0.06, 0.22);
    this.steerPivot.add(lampBody);
    const lampLens = new THREE.Mesh(
      new THREE.CircleGeometry(0.045, 12),
      new THREE.MeshStandardMaterial({
        color: 0xffdf9b,
        emissive: 0xffb95c,
        emissiveIntensity: 0.6,
        roughness: 0.35,
      }),
    );
    lampLens.position.set(0, -0.06, 0.265);
    this.steerPivot.add(lampLens);
  }

  private buildDrivetrain(): void {
    const bb = new THREE.Vector3(0, 0.54, -0.02);
    const rear = new THREE.Vector3(0, 0.45, -0.86);
    this.crankGroup.position.copy(bb);
    this.root.add(this.crankGroup);

    const crankAxle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 0.32, 10),
      this.chrome,
    );
    crankAxle.rotation.z = Math.PI / 2;
    this.crankGroup.add(crankAxle);

    const chainring = new THREE.Mesh(
      new THREE.TorusGeometry(this.chainringRadius, 0.022, 8, 32),
      this.darkMetal,
    );
    chainring.rotation.y = Math.PI / 2;
    chainring.position.x = 0.105;
    this.crankGroup.add(chainring);

    const chainringInner = new THREE.Mesh(
      new THREE.TorusGeometry(this.chainringRadius - 0.05, 0.009, 5, 28),
      this.gold,
    );
    chainringInner.rotation.y = Math.PI / 2;
    chainringInner.position.x = 0.105;
    this.crankGroup.add(chainringInner);

    const crankSpider = new THREE.Group();
    crankSpider.position.x = 0.105;
    for (let i = 0; i < 5; i += 1) {
      const angle = (i / 5) * TAU;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.12, 0.032), this.darkMetal);
      arm.position.set(
        0,
        Math.cos(angle) * 0.065,
        Math.sin(angle) * 0.065,
      );
      arm.rotation.x = angle;
      crankSpider.add(arm);
    }
    this.crankGroup.add(crankSpider);

    // Chainring teeth: carefully offset around the circumference.
    const toothGeometry = new THREE.BoxGeometry(0.035, 0.018, 0.025);
    const teeth = new THREE.InstancedMesh(toothGeometry, this.gold, 26);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 26; i += 1) {
      const angle = (i / 26) * TAU;
      dummy.position.set(
        0.105,
        Math.cos(angle) * (this.chainringRadius + 0.024),
        Math.sin(angle) * (this.chainringRadius + 0.024),
      );
      dummy.rotation.set(angle, 0, 0);
      dummy.updateMatrix();
      teeth.setMatrixAt(i, dummy.matrix);
    }
    this.crankGroup.add(teeth);

    // One crank arm on each side. The right starts down, the left starts up.
    const armGeometry = new THREE.BoxGeometry(0.045, 0.17, 0.055);
    const rightArm = new THREE.Mesh(armGeometry, this.chrome);
    rightArm.position.set(0.145, -0.09, 0);
    rightArm.rotation.z = -0.02;
    this.crankGroup.add(rightArm);
    const leftArm = new THREE.Mesh(armGeometry, this.chrome);
    leftArm.position.set(-0.145, 0.09, 0);
    leftArm.rotation.z = 0.02;
    this.crankGroup.add(leftArm);

    this.rightPedalPivot.position.set(0.15, -0.17, 0);
    this.leftPedalPivot.position.set(-0.15, 0.17, 0);
    this.crankGroup.add(this.rightPedalPivot, this.leftPedalPivot);

    const pedalBodyGeometry = new THREE.BoxGeometry(0.16, 0.025, 0.11);
    const pedalBarGeometry = new THREE.BoxGeometry(0.14, 0.012, 0.035);
    const reflectorGeometry = new THREE.BoxGeometry(0.055, 0.012, 0.023);

    for (const [pivot, side] of [
      [this.rightPedalPivot, 1],
      [this.leftPedalPivot, -1],
    ] as const) {
      const outline = new THREE.Mesh(pedalBodyGeometry, this.dark);
      outline.scale.set(1.05, 1.3, 1.05);
      pivot.add(outline);
      const body = new THREE.Mesh(pedalBodyGeometry, this.darkMetal);
      pivot.add(body);
      const rail = new THREE.Mesh(pedalBarGeometry, this.chrome);
      rail.position.y = 0.018;
      pivot.add(rail);
      const reflector = new THREE.Mesh(reflectorGeometry, this.orange);
      reflector.position.set(side * 0.05, 0.016, 0.045);
      pivot.add(reflector);
    }

    this.rightPedal.position.set(0, 0.025, 0);
    this.leftPedal.position.set(0, 0.025, 0);
    this.rightPedalPivot.add(this.rightPedal);
    this.leftPedalPivot.add(this.leftPedal);

    // Rear cog and cassette.
    this.cogGroup.position.copy(rear);
    this.root.add(this.cogGroup);
    const cog = new THREE.Mesh(new THREE.TorusGeometry(this.cogRadius, 0.018, 7, 20), this.darkMetal);
    cog.rotation.y = Math.PI / 2;
    cog.position.x = 0.108;
    this.cogGroup.add(cog);
    const cogInner = new THREE.Mesh(new THREE.TorusGeometry(this.cogRadius - 0.022, 0.01, 5, 16), this.gold);
    cogInner.rotation.y = Math.PI / 2;
    cogInner.position.x = 0.108;
    this.cogGroup.add(cogInner);
    const cogTeeth = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.025, 0.015, 0.018),
      this.gold,
      14,
    );
    for (let i = 0; i < 14; i += 1) {
      const angle = (i / 14) * TAU;
      dummy.position.set(
        0.108,
        Math.cos(angle) * (this.cogRadius + 0.02),
        Math.sin(angle) * (this.cogRadius + 0.02),
      );
      dummy.rotation.set(angle, 0, 0);
      dummy.updateMatrix();
      cogTeeth.setMatrixAt(i, dummy.matrix);
    }
    this.cogGroup.add(cogTeeth);

    // Chain runs.
    this.chainTopStart.set(0.108, bb.y + this.chainringRadius, bb.z);
    this.chainTopEnd.set(0.108, rear.y + this.cogRadius, rear.z);
    this.chainBottomStart.set(0.108, bb.y - this.chainringRadius, bb.z);
    this.chainBottomEnd.set(0.108, rear.y - this.cogRadius, rear.z);

    const upperChain = makeCylinderBetween(this.chainTopStart, this.chainTopEnd, 0.011, this.chainMat);
    const lowerChain = makeCylinderBetween(this.chainBottomStart, this.chainBottomEnd, 0.011, this.chainMat);
    this.root.add(upperChain, lowerChain);

    // Chainring and crank-side hardware are attached to the near (right) side.
    const chainGuide = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.055), this.dark);
    chainGuide.position.set(0.125, bb.y + 0.14, bb.z - 0.18);
    chainGuide.rotation.x = -0.32;
    this.root.add(chainGuide);
  }

  private buildChainLinks(): THREE.InstancedMesh {
    const geometry = new THREE.BoxGeometry(0.038, 0.015, 0.042);
    const material = new THREE.MeshStandardMaterial({
      color: 0xb39b6b,
      roughness: 0.4,
      metalness: 0.62,
    });
    const count = 28;
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.frustumCulled = false;
    for (let i = 0; i < count; i += 1) {
      this.chainPoints.push({ t: (i % 14) / 14, upper: i < 14 });
    }
    return mesh;
  }

  private updateChainLinks(distance: number): void {
    this.chainOffset = (distance * 0.16) % 1;
    for (let i = 0; i < this.chainPoints.length; i += 1) {
      const point = this.chainPoints[i] as ChainPoint;
      const t = (point.t + this.chainOffset) % 1;
      if (point.upper) {
        this.tempObject.position.lerpVectors(this.chainTopStart, this.chainTopEnd, t);
      } else {
        this.tempObject.position.lerpVectors(this.chainBottomEnd, this.chainBottomStart, t);
      }
      this.tempObject.rotation.set(0, 0, 0);
      this.tempObject.updateMatrix();
      this.tempMatrix.copy(this.tempObject.matrix);
      this.chainLinks.setMatrixAt(i, this.tempMatrix);
    }
    this.chainLinks.instanceMatrix.needsUpdate = true;
  }

  private buildSaddle(): void {
    const seatPostTop = new THREE.Vector3(0, 1.16, -0.46);
    const seatCluster = new THREE.Vector3(0, 1.01, -0.36);

    const postOuter = makeCylinderBetween(seatCluster, seatPostTop, 0.037, this.dark);
    const postInner = makeCylinderBetween(seatCluster, seatPostTop, 0.022, this.chrome);
    this.root.add(postOuter, postInner);

    const saddle = new THREE.Group();
    saddle.position.set(0, 1.19, -0.44);
    this.root.add(saddle);

    const bodyGeometry = new THREE.SphereGeometry(1, 20, 12);
    const body = new THREE.Mesh(bodyGeometry, this.leather);
    body.scale.set(0.17, 0.045, 0.27);
    body.position.z = -0.06;
    saddle.add(body);

    const nose = new THREE.Mesh(bodyGeometry, this.leatherEdge);
    nose.scale.set(0.075, 0.03, 0.17);
    nose.position.set(0, -0.012, 0.23);
    saddle.add(nose);

    const topEdge = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.016, 0.37), this.leatherEdge);
    topEdge.position.set(0, 0.025, -0.03);
    topEdge.scale.set(0.9, 1, 0.94);
    saddle.add(topEdge);

    const railLeft = makeCylinderBetween(
      new THREE.Vector3(-0.1, -0.04, 0.18),
      new THREE.Vector3(-0.06, -0.13, -0.26),
      0.012,
      this.chrome,
    );
    const railRight = makeCylinderBetween(
      new THREE.Vector3(0.1, -0.04, 0.18),
      new THREE.Vector3(0.06, -0.13, -0.26),
      0.012,
      this.chrome,
    );
    saddle.add(railLeft, railRight);

    for (const side of [-1, 1]) {
      const spring = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.008, 5, 10), this.chrome);
      spring.rotation.x = Math.PI / 2;
      spring.position.set(side * 0.09, -0.15, -0.24);
      saddle.add(spring);
    }

    const saddleStitch = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.008, 0.025),
      this.leatherEdge,
    );
    saddleStitch.position.set(0, 0.045, -0.08);
    saddle.add(saddleStitch);
  }

  update(distance: number, steeringAngle: number): void {
    const wheelAngle = distance / this.wheelRadius;
    this.rearWheel.spin.rotation.z = wheelAngle;
    this.frontWheel.spin.rotation.z = wheelAngle;
    this.frontWheel.spinAngle = wheelAngle;

    const gearRatio = this.cogRadius / this.chainringRadius;
    this.crankAngle = wheelAngle * gearRatio;
    this.crankGroup.rotation.x = this.crankAngle;
    this.rightPedalPivot.rotation.x = -this.crankAngle;
    this.leftPedalPivot.rotation.x = -this.crankAngle;
    this.cogGroup.rotation.x = wheelAngle;
    // steeringAngle is the physics/Three.js +Y angle: positive points the
    // front wheel toward +X (screen-left), negative toward -X (screen-right).
    this.steerPivot.rotation.y = clamp(steeringAngle, -0.52, 0.52);
    this.updateChainLinks(distance);
  }

  /** Grip and pedal anchors are queried after the matrix updates above. */
  getWorldAnchor(side: BikeSide, kind: 'grip' | 'pedal', target: THREE.Vector3): THREE.Vector3 {
    const anchor =
      kind === 'grip'
        ? side === 'left'
          ? this.leftGrip
          : this.rightGrip
        : side === 'left'
          ? this.leftPedal
          : this.rightPedal;
    anchor.getWorldPosition(target);
    return target;
  }

  getSteeringPivot(): THREE.Group {
    return this.steerPivot;
  }

  getFrontWheelPosition(target: THREE.Vector3): THREE.Vector3 {
    this.frontWheel.mount.getWorldPosition(target);
    return target;
  }

  getCrankAngle(): number {
    return this.crankAngle;
  }

  dispose(): void {
    disposeObject3D(this.root);
  }
}

function fadeMesh(mesh: THREE.Mesh): void {
  mesh.castShadow = false;
  mesh.receiveShadow = false;
}
