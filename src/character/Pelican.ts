import * as THREE from 'three';
import { clamp, damp, TAU } from '../utils/math';
import { Y_AXIS, poseBone, solveTwoBoneIK } from '../utils/ik';
import {
  createEllipticalLoft,
  createFeatherGeometry,
  createSoftFeatherGeometry,
  createTaperedTube,
  disposeObject3D,
  setShadows,
} from '../utils/geometry';

export interface RidingTargets {
  leftPedal: THREE.Vector3;
  rightPedal: THREE.Vector3;
  leftGrip: THREE.Vector3;
  rightGrip: THREE.Vector3;
}

export interface RidingFrame {
  dt: number;
  time: number;
  speed: number;
  distance: number;
  steering: number;
  lean: number;
  grounded: boolean;
  verticalVelocity: number;
  crashFactor: number;
  targets: RidingTargets;
}

interface WingRig {
  side: number;
  shoulder: THREE.Vector3;
  upper: THREE.Group;
  lower: THREE.Group;
  hand: THREE.Group;
  trailing: THREE.Mesh[];
  upperLength: number;
  lowerLength: number;
}

interface LegRig {
  side: number;
  hip: THREE.Vector3;
  upper: THREE.Group;
  lower: THREE.Group;
  foot: THREE.Group;
  upperLength: number;
  lowerLength: number;
}

interface EyeRig {
  group: THREE.Group;
}

const BODY_CENTER = new THREE.Vector3(0, 1.52, -0.3);
const SHOULDER_X = 0.305;
const SHOULDER_Y = 1.755;
const SHOULDER_Z = -0.015;
const HIP_X = 0.155;
const HIP_Y = 1.245;
const HIP_Z = -0.11;
const UPPER_LEG_LENGTH = 0.415;
const LOWER_LEG_LENGTH = 0.545;
const UPPER_WING_LENGTH = 0.385;
const LOWER_WING_LENGTH = 0.495;

/**
 * Charming, slightly overbuilt procedural pelican. The wings and legs use
 * two-bone IK against the actual bicycle grips and pedals, so contact is
 * preserved through steering, jumping, leaning, and terrain motion.
 */
export class Pelican {
  readonly root = new THREE.Group();

  private readonly bodyRig = new THREE.Group();
  private readonly tailGroup = new THREE.Group();
  private readonly neckPivot = new THREE.Group();
  private readonly headGroup = new THREE.Group();
  private readonly eyes: EyeRig[] = [];
  private readonly wingRigs: { left: WingRig; right: WingRig };
  private readonly legRigs: { left: LegRig; right: LegRig };
  private readonly footGeometry: THREE.BufferGeometry;
  private readonly featherGeometrySmall = createFeatherGeometry(0.19, 0.085, 0.012);
  private readonly featherGeometryWing = createFeatherGeometry(0.27, 0.105, 0.014);
  private readonly sphereGeometry = new THREE.SphereGeometry(1, 18, 12);
  private readonly headSphereGeometry = new THREE.SphereGeometry(1, 28, 20);
  private readonly eyeSphereGeometry = new THREE.SphereGeometry(1, 14, 10);
  private readonly ringGeometry = new THREE.TorusGeometry(0.031, 0.0038, 5, 12);

  private readonly tempRoot = new THREE.Vector3();
  private readonly tempTarget = new THREE.Vector3();
  private readonly tempJoint = new THREE.Vector3();
  private readonly tempEnd = new THREE.Vector3();
  private readonly tempPole = new THREE.Vector3();
  private readonly tempDirection = new THREE.Vector3();
  private readonly trailingBase = new THREE.Vector3();
  private readonly trailingDirection = new THREE.Vector3();
  private readonly trailingNormal = new THREE.Vector3();

  private blinkTimer = 3.2;
  private blinkProgress = 0;
  private lastTime = 0;

  private readonly feather = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.86,
    metalness: 0.02,
  });
  private readonly featherSoft = new THREE.MeshStandardMaterial({
    color: 0xf8ecd8,
    roughness: 0.9,
    metalness: 0.01,
  });
  private readonly featherShade = new THREE.MeshStandardMaterial({
    color: 0xe4d2b6,
    roughness: 0.9,
    metalness: 0.01,
  });
  private readonly featherWarm = new THREE.MeshStandardMaterial({
    color: 0xf3d7a6,
    roughness: 0.86,
    metalness: 0.01,
  });
  private readonly flightFeather = new THREE.MeshStandardMaterial({
    color: 0x354946,
    roughness: 0.78,
    metalness: 0.02,
  });
  private readonly flightFeatherLight = new THREE.MeshStandardMaterial({
    color: 0x536560,
    roughness: 0.8,
    metalness: 0.02,
  });
  private readonly billMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.44,
    metalness: 0.04,
    emissive: 0x7a3600,
    emissiveIntensity: 0.3,
  });
  private readonly pouchMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.5,
    metalness: 0.01,
    emissive: 0xa54200,
    emissiveIntensity: 0.4,
  });
  private readonly pouchRim = new THREE.MeshStandardMaterial({
    color: 0xb56520,
    roughness: 0.56,
    emissive: 0x4d1c00,
    emissiveIntensity: 0.2,
  });
  private readonly billEdge = new THREE.MeshStandardMaterial({
    color: 0xa95e2c,
    roughness: 0.62,
    metalness: 0.02,
  });
  private readonly billTip = new THREE.MeshStandardMaterial({
    color: 0xcb6f36,
    roughness: 0.5,
    metalness: 0.04,
  });
  private readonly eyeWhite = new THREE.MeshStandardMaterial({
    color: 0xfffbef,
    roughness: 0.45,
    metalness: 0.02,
  });
  private readonly iris = new THREE.MeshStandardMaterial({
    color: 0xc78b36,
    roughness: 0.4,
    metalness: 0.03,
  });
  private readonly pupil = new THREE.MeshStandardMaterial({
    color: 0x1c2925,
    roughness: 0.25,
    metalness: 0.02,
  });
  private readonly catchlight = new THREE.MeshBasicMaterial({ color: 0xfffff4 });
  private readonly eyeRim = new THREE.MeshStandardMaterial({
    color: 0x48534a,
    roughness: 0.7,
  });
  private readonly brow = new THREE.MeshStandardMaterial({
    color: 0xb69b78,
    roughness: 0.85,
  });
  private readonly cheek = new THREE.MeshStandardMaterial({
    color: 0xf2cf95,
    roughness: 0.9,
    metalness: 0,
  });
  private readonly legOrange = new THREE.MeshStandardMaterial({
    color: 0xc98231,
    roughness: 0.62,
    metalness: 0.02,
  });
  private readonly legOrangeLight = new THREE.MeshStandardMaterial({
    color: 0xe7a444,
    roughness: 0.56,
    metalness: 0.02,
  });
  private readonly legOrangeDark = new THREE.MeshStandardMaterial({
    color: 0x8f5425,
    roughness: 0.62,
    metalness: 0.02,
  });
  private readonly claw = new THREE.MeshStandardMaterial({
    color: 0x7f4c2d,
    roughness: 0.55,
  });
  private readonly toeLine = new THREE.LineBasicMaterial({
    color: 0x8f5a30,
    transparent: true,
    opacity: 0.7,
  });
  private readonly tailMaterial = new THREE.MeshStandardMaterial({
    color: 0xf1e3cd,
    roughness: 0.9,
    metalness: 0.01,
  });
  private readonly outlineMaterial = new THREE.MeshBasicMaterial({
    color: 0x273934,
    side: THREE.BackSide,
  });


  constructor() {
    this.root.name = 'pelican';
    this.footGeometry = createWebbedFootGeometry();
    this.buildBody();
    this.wingRigs = {
      left: this.buildWing(-1),
      right: this.buildWing(1),
    };
    this.legRigs = {
      left: this.buildLeg(-1),
      right: this.buildLeg(1),
    };
    this.root.add(this.bodyRig);
    setShadows(this.root, true, true);
    this.root.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (child.material === this.eyeWhite || child.material === this.catchlight) {
          child.castShadow = false;
        }
      }
    });
  }

  // -------------------------------------------------------------------------
  // Body, neck, head and bill
  // -------------------------------------------------------------------------

  private buildBody(): void {
    this.bodyRig.name = 'pelican-upper-body';
    this.bodyRig.position.copy(BODY_CENTER);

    const mainBodyGeometry = new THREE.SphereGeometry(1, 32, 22);
    applyVerticalGradient(mainBodyGeometry, '#fffdf4', '#d8c2a2', 0.92);
    const mainBody = new THREE.Mesh(mainBodyGeometry, this.feather);
    mainBody.scale.set(0.355, 0.33, 0.5);
    mainBody.name = 'pelican-torso';
    this.bodyRig.add(mainBody);
    this.addOutline(mainBody, 1.028);

    const chestGeometry = new THREE.SphereGeometry(1, 24, 18);
    applyVerticalGradient(chestGeometry, '#fffdf8', '#e6d2b3', 0.92);
    const chest = new THREE.Mesh(chestGeometry, this.feather);
    chest.scale.set(0.285, 0.3, 0.27);
    chest.position.set(0, 0.045, 0.21);
    this.bodyRig.add(chest);

    const rumpGeometry = new THREE.SphereGeometry(1, 22, 16);
    applyVerticalGradient(rumpGeometry, '#fffaf0', '#d9c3a3', 0.84);
    const rump = new THREE.Mesh(rumpGeometry, this.feather);
    rump.scale.set(0.285, 0.255, 0.3);
    rump.position.set(0, -0.025, -0.24);
    this.bodyRig.add(rump);

    // Layered scapular feathers break up the big white torso silhouette.
    for (const side of [-1, 1]) {
      for (let row = 0; row < 3; row += 1) {
        for (let index = 0; index < 3; index += 1) {
          const length = 0.29 - row * 0.02;
          const mantle = new THREE.Mesh(
            createSoftFeatherGeometry(length, 0.13 - row * 0.007, 0.012),
            index % 2 === 0 ? this.featherSoft : this.featherShade,
          );
          const direction = new THREE.Vector3(
            side * (0.13 + index * 0.06),
            -0.14 - row * 0.08,
            -1,
          ).normalize();
          orientMeshAlong(mantle, direction);
          mantle.position.set(
            side * (0.295 - row * 0.02),
            0.14 - row * 0.075,
            -0.12 + index * 0.068,
          );
          mantle.rotation.z += side * (0.2 + index * 0.04);
          this.bodyRig.add(mantle);
        }
      }
    }

    // A cape of overlapping feathers across the back catches the light from
    // the chase camera and keeps the torso from reading as a smooth egg.
    for (let row = 0; row < 3; row += 1) {
      for (let i = -2; i <= 2; i += 1) {
        const cape = new THREE.Mesh(
          createSoftFeatherGeometry(0.23 - row * 0.02, 0.105 - row * 0.006, 0.013),
          (row + i) % 2 === 0 ? this.featherSoft : this.featherShade,
        );
        const direction = new THREE.Vector3(i * 0.09, -0.2 - row * 0.04, -1).normalize();
        orientMeshAlong(cape, direction);
        cape.position.set(
          i * 0.105,
          0.175 - row * 0.075,
          -0.16 - row * 0.075 - Math.abs(i) * 0.014,
        );
        cape.rotation.z += i * 0.04;
        this.bodyRig.add(cape);
      }
    }

    // Feathered tail fan.
    this.tailGroup.position.set(0, 0.02, -0.4);
    this.bodyRig.add(this.tailGroup);
    const tailDirections = [
      new THREE.Vector3(0, 0.16, -1),
      new THREE.Vector3(-0.38, 0.11, -1),
      new THREE.Vector3(0.38, 0.11, -1),
    ];
    tailDirections.forEach((direction, index) => {
      const feather = new THREE.Mesh(
        createFeatherGeometry(index === 0 ? 0.37 : 0.31, index === 0 ? 0.15 : 0.13, 0.018),
        this.tailMaterial,
      );
      orientMeshAlong(feather, direction);
      feather.position.set(0, index === 0 ? 0.005 : -0.015, 0);
      this.tailGroup.add(feather);
    });
    const tailCoverts = new THREE.Mesh(
      createSoftFeatherGeometry(0.22, 0.14, 0.02),
      this.featherSoft,
    );
    orientMeshAlong(tailCoverts, new THREE.Vector3(0, 0.2, -1));
    tailCoverts.position.set(0, 0.02, 0.03);
    this.tailGroup.add(tailCoverts);

    // Neck root and long, gently S-curved neck.
    this.neckPivot.position.set(0, 0.145, 0.18);
    this.bodyRig.add(this.neckPivot);
    const neckPoints = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0.12, -0.03),
      new THREE.Vector3(0, 0.27, -0.025),
      new THREE.Vector3(0, 0.42, 0.035),
      new THREE.Vector3(0, 0.57, 0.125),
      new THREE.Vector3(0, 0.7, 0.225),
      new THREE.Vector3(0, 0.78, 0.305),
    ];
    const neckGeometry = createTaperedTube(
      neckPoints,
      (t) => 0.17 - 0.075 * t + Math.sin(t * Math.PI) * 0.014,
      32,
      12,
    );
    applyVerticalGradient(neckGeometry, '#fffdf8', '#e2cfb0', 0.78);
    const neckMesh = new THREE.Mesh(neckGeometry, this.feather);
    neckMesh.name = 'pelican-neck';
    this.neckPivot.add(neckMesh);

    // Fluffy feather ruff where the neck meets the body.
    for (let i = 0; i < 6; i += 1) {
      const angle = (i / 6) * TAU;
      const tuft = new THREE.Mesh(
        createSoftFeatherGeometry(0.15 + (i % 2) * 0.04, 0.075, 0.014),
        this.featherShade,
      );
      const direction = new THREE.Vector3(Math.cos(angle) * 0.7, -0.5, Math.sin(angle) * 0.7 + 0.2);
      orientMeshAlong(tuft, direction);
      tuft.position.set(Math.cos(angle) * 0.15, 0.04, Math.sin(angle) * 0.14);
      this.neckPivot.add(tuft);
    }

    this.buildHead();
  }

  private buildHead(): void {
    this.headGroup.position.set(0, 0.8, 0.33);
    this.neckPivot.add(this.headGroup);

    const headGeometry = new THREE.SphereGeometry(1, 30, 22);
    applyVerticalGradient(headGeometry, '#fffdf7', '#efdfc5', 0.85);
    const head = new THREE.Mesh(headGeometry, this.feather);
    head.scale.set(0.253, 0.228, 0.266);
    head.name = 'pelican-head';
    this.headGroup.add(head);
    this.addOutline(head, 1.032);

    // Cheek blush patches make the face read warmly from the side.
    for (const side of [-1, 1]) {
      const cheek = new THREE.Mesh(this.sphereGeometry, this.cheek);
      cheek.scale.set(0.087, 0.07, 0.022);
      cheek.position.set(side * 0.155, -0.052, 0.125);
      cheek.rotation.y = side * 0.78;
      cheek.rotation.z = side * -0.08;
      this.headGroup.add(cheek);
    }

    this.buildEyes();
    this.buildCrest();
    this.buildBill();

    // A small soft nostril crease at the beak base.
    for (const side of [-1, 1]) {
      const nostril = new THREE.Mesh(this.sphereGeometry, this.billEdge);
      nostril.scale.set(0.014, 0.006, 0.005);
      nostril.position.set(side * 0.052, 0.074, 0.36);
      this.headGroup.add(nostril);
    }
  }

  private buildEyes(): void {
    for (const side of [-1, 1]) {
      const eyeGroup = new THREE.Group();
      eyeGroup.position.set(side * 0.185, 0.048, 0.098);
      eyeGroup.rotation.y = side * 0.9;
      eyeGroup.rotation.z = side * -0.06;
      this.headGroup.add(eyeGroup);

      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.054, 0.007, 6, 20), this.eyeRim);
      rim.position.z = 0.012;
      eyeGroup.add(rim);

      const white = new THREE.Mesh(this.eyeSphereGeometry, this.eyeWhite);
      white.scale.set(0.058, 0.069, 0.03);
      white.position.z = 0.008;
      eyeGroup.add(white);

      const iris = new THREE.Mesh(this.eyeSphereGeometry, this.iris);
      iris.scale.set(0.032, 0.041, 0.013);
      iris.position.set(0, -0.004, 0.035);
      eyeGroup.add(iris);

      const pupil = new THREE.Mesh(this.eyeSphereGeometry, this.pupil);
      pupil.scale.set(0.017, 0.026, 0.007);
      pupil.position.set(0, -0.002, 0.047);
      eyeGroup.add(pupil);

      const glint = new THREE.Mesh(this.eyeSphereGeometry, this.catchlight);
      glint.scale.set(0.006, 0.008, 0.004);
      glint.position.set(0.009, 0.012, 0.055);
      eyeGroup.add(glint);

      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.012, 0.014), this.brow);
      brow.position.set(0, 0.086, 0.013);
      brow.rotation.z = side * 0.11;
      eyeGroup.add(brow);

      this.eyes.push({ group: eyeGroup });
    }
  }

  private buildCrest(): void {
    const crestGroup = new THREE.Group();
    crestGroup.position.set(0, 0.145, -0.115);
    this.headGroup.add(crestGroup);
    const crestDirections = [
      new THREE.Vector3(-0.12, 0.25, -1),
      new THREE.Vector3(0.04, 0.45, -1),
      new THREE.Vector3(0.22, 0.17, -1),
    ];
    crestDirections.forEach((direction, index) => {
      const feather = new THREE.Mesh(
        createFeatherGeometry(index === 1 ? 0.23 : 0.18, 0.07, 0.012),
        this.featherSoft,
      );
      orientMeshAlong(feather, direction);
      feather.position.set((index - 1) * 0.045, 0, 0);
      feather.rotation.z += (index - 1) * 0.16;
      crestGroup.add(feather);
    });
  }

  private buildBill(): void {
    const billGroup = new THREE.Group();
    billGroup.name = 'pelican-bill';
    billGroup.rotation.x = -0.035;
    this.headGroup.add(billGroup);

    // The pouch sits under the upper mandible and is deliberately full.
    const pouchSections = [
      { z: 0.16, y: -0.08, rx: 0.092, ry: 0.066 },
      { z: 0.3, y: -0.22, rx: 0.16, ry: 0.17 },
      { z: 0.5, y: -0.35, rx: 0.205, ry: 0.23 },
      { z: 0.7, y: -0.33, rx: 0.175, ry: 0.2 },
      { z: 0.88, y: -0.22, rx: 0.12, ry: 0.13 },
      { z: 1.03, y: -0.1, rx: 0.06, ry: 0.05 },
      { z: 1.13, y: -0.06, rx: 0.015, ry: 0.015 },
    ];
    const pouchGeometry = createEllipticalLoft(pouchSections, 18, true, true);
    applyVerticalGradient(pouchGeometry, '#ffbd55', '#e57f24', 1.0);
    const pouch = new THREE.Mesh(pouchGeometry, this.pouchMaterial);
    pouch.name = 'pelican-pouch';
    billGroup.add(pouch);

    // A darker lower rim gives the pouch volume and a crisp silhouette.
    const pouchRimPoints = [
      new THREE.Vector3(0, -0.085, 0.17),
      new THREE.Vector3(0, -0.31, 0.32),
      new THREE.Vector3(0, -0.56, 0.52),
      new THREE.Vector3(0, -0.53, 0.74),
      new THREE.Vector3(0, -0.32, 0.94),
      new THREE.Vector3(0, -0.12, 1.1),
    ];
    const pouchRim = new THREE.Mesh(
      createTaperedTube(pouchRimPoints, (t) => 0.017 - t * 0.009, 18, 7),
      this.pouchRim,
    );
    billGroup.add(pouchRim);
    const pouchFold = new THREE.Mesh(
      createTaperedTube(
        [
          new THREE.Vector3(0, -0.12, 0.24),
          new THREE.Vector3(0, -0.3, 0.44),
          new THREE.Vector3(0, -0.4, 0.68),
          new THREE.Vector3(0, -0.28, 0.94),
        ],
        (t) => 0.012 - t * 0.005,
        16,
        6,
      ),
      this.pouchRim,
    );
    billGroup.add(pouchFold);

    // Upper mandible: broad at the face, tapering with a gentle downward arc.
    const upperSections = [
      { z: 0.13, y: 0.026, rx: 0.11, ry: 0.068 },
      { z: 0.31, y: 0.02, rx: 0.134, ry: 0.06 },
      { z: 0.58, y: -0.008, rx: 0.11, ry: 0.045 },
      { z: 0.83, y: -0.048, rx: 0.072, ry: 0.032 },
      { z: 1.03, y: -0.087, rx: 0.035, ry: 0.02 },
      { z: 1.14, y: -0.125, rx: 0.012, ry: 0.009 },
    ];
    const upperGeometry = createEllipticalLoft(upperSections, 16, true, true);
    applyVerticalGradient(upperGeometry, '#ffc25a', '#ea8c28', 0.98);
    const upper = new THREE.Mesh(upperGeometry, this.billMaterial);
    upper.name = 'pelican-upper-bill';
    billGroup.add(upper);

    // Lip / lower mandible line.
    const lipPoints = [
      new THREE.Vector3(0, 0.005, 0.19),
      new THREE.Vector3(0, -0.018, 0.42),
      new THREE.Vector3(0, -0.055, 0.7),
      new THREE.Vector3(0, -0.1, 0.96),
      new THREE.Vector3(0, -0.135, 1.13),
    ];
    const lipCurve = new THREE.CatmullRomCurve3(lipPoints);
    const lip = new THREE.Mesh(new THREE.TubeGeometry(lipCurve, 24, 0.009, 5, false), this.billEdge);
    billGroup.add(lip);

    // Mantle ridge along the top.
    const ridgePoints = [
      new THREE.Vector3(0, 0.089, 0.16),
      new THREE.Vector3(0, 0.098, 0.38),
      new THREE.Vector3(0, 0.055, 0.65),
      new THREE.Vector3(0, -0.005, 0.9),
      new THREE.Vector3(0, -0.088, 1.1),
    ];
    const ridge = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ridgePoints), 24, 0.007, 5, false),
      new THREE.MeshStandardMaterial({
        color: 0xfad79b,
        roughness: 0.55,
        metalness: 0.02,
      }),
    );
    billGroup.add(ridge);

    // A hooked nail at the tip.
    const nail = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 8), this.billTip);
    nail.rotation.x = Math.PI * 0.67;
    nail.position.set(0, -0.155, 1.13);
    billGroup.add(nail);

    // Two subtle pouch folds reading as stretched skin.
    addPouchFold(billGroup, -1, this.billEdge);
    addPouchFold(billGroup, 1, this.billEdge);

    // Warm gape crease where the bill meets the face.
    const gape = new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3([
          new THREE.Vector3(-0.1, -0.015, 0.17),
          new THREE.Vector3(-0.14, -0.055, 0.08),
          new THREE.Vector3(-0.12, -0.1, -0.02),
        ]),
        10,
        0.007,
        4,
        false,
      ),
      this.billEdge,
    );
    billGroup.add(gape);
  }

  // -------------------------------------------------------------------------
  // Wings
  // -------------------------------------------------------------------------

  private buildWing(side: number): WingRig {
    const shoulder = new THREE.Vector3(side * SHOULDER_X, SHOULDER_Y, SHOULDER_Z);
    const upper = new THREE.Group();
    const lower = new THREE.Group();
    const hand = new THREE.Group();
    upper.name = side < 0 ? 'left-wing-upper' : 'right-wing-upper';
    lower.name = side < 0 ? 'left-wing-lower' : 'right-wing-lower';
    hand.name = side < 0 ? 'left-wing-hand' : 'right-wing-hand';
    this.root.add(upper, lower, hand);

    const shoulderPuff = new THREE.Mesh(this.sphereGeometry, this.featherSoft);
    shoulderPuff.scale.set(0.13, 0.145, 0.1);
    shoulderPuff.position.set(0, 0.02, 0);
    upper.add(shoulderPuff);

    // The shoulder cape visually anchors the wing into the body.
    for (let i = 0; i < 3; i += 1) {
      const shoulderFeather = new THREE.Mesh(
        createSoftFeatherGeometry(0.2, 0.1, 0.012),
        i === 1 ? this.featherShade : this.featherWarm,
      );
      const direction = new THREE.Vector3(side * (0.3 + i * 0.1), 0.12, -0.7).normalize();
      orientMeshAlong(shoulderFeather, direction);
      shoulderFeather.position.set(side * (0.01 + i * 0.035), 0.035 + i * 0.022, -0.015);
      upper.add(shoulderFeather);
    }

    const upperLobe = new THREE.Mesh(this.sphereGeometry, this.featherSoft);
    upperLobe.scale.set(0.084, 0.235, 0.052);
    upperLobe.position.set(0, 0.205, 0);
    upper.add(upperLobe);
    this.addOutline(upperLobe, 1.05);

    const upperTrailing = new THREE.Mesh(this.sphereGeometry, this.featherShade);
    upperTrailing.scale.set(0.06, 0.2, 0.032);
    upperTrailing.position.set(side * -0.05, 0.2, -0.035);
    upper.add(upperTrailing);

    // Overlapping covert feathers make the upper wing feel layered.
    for (let i = 0; i < 4; i += 1) {
      const covert = new THREE.Mesh(
        createSoftFeatherGeometry(0.24 - i * 0.012, 0.09, 0.012),
        i % 2 === 0 ? this.featherSoft : this.featherShade,
      );
      const dir = new THREE.Vector3(side * (0.1 + i * 0.045), 1, 0.03).normalize();
      orientMeshAlong(covert, dir);
      covert.position.set(side * (0.03 + i * 0.012), 0.1 + i * 0.04, -0.025);
      covert.rotation.z += side * (0.18 + i * 0.05);
      upper.add(covert);
    }

    const lowerLobe = new THREE.Mesh(this.sphereGeometry, this.featherSoft);
    lowerLobe.scale.set(0.086, 0.255, 0.044);
    lowerLobe.position.set(0, 0.22, 0);
    lower.add(lowerLobe);
    this.addOutline(lowerLobe, 1.05);

    // Broad trailing feathers and dark primaries read as a wing, not an arm.
    for (let i = 0; i < 5; i += 1) {
      const length = 0.34 - i * 0.016;
      const feather = new THREE.Mesh(
        createSoftFeatherGeometry(length, 0.13 - i * 0.008, 0.014),
        i < 2 ? this.featherSoft : i < 4 ? this.featherShade : this.featherWarm,
      );
      const direction = new THREE.Vector3(side * (0.12 + i * 0.11), 1, 0.1 - i * 0.055).normalize();
      orientMeshAlong(feather, direction);
      feather.position.set(side * (0.04 + i * 0.016), 0.11 + i * 0.045, -0.006);
      feather.rotation.z += side * (0.1 + i * 0.06);
      lower.add(feather);
    }

    // A dark, wingtip-like fan at the wrist.
    for (let i = 0; i < 4; i += 1) {
      const primary = new THREE.Mesh(
        createFeatherGeometry(0.34 - i * 0.03, 0.085, 0.011),
        i < 2 ? this.flightFeather : this.flightFeatherLight,
      );
      const direction = new THREE.Vector3(side * (0.32 + i * 0.16), 1, -0.1 - i * 0.09).normalize();
      orientMeshAlong(primary, direction);
      primary.position.set(side * (0.025 + i * 0.014), 0.24 + i * 0.04, -0.02);
      primary.rotation.z += side * 0.08;
      lower.add(primary);
    }
    const wristCuff = new THREE.Mesh(this.sphereGeometry, this.featherWarm);
    wristCuff.scale.set(0.07, 0.085, 0.062);
    wristCuff.position.y = 0.39;
    lower.add(wristCuff);

    // Hand / primary feather cluster around the handlebar grip.
    const palm = new THREE.Mesh(this.sphereGeometry, this.featherWarm);
    palm.scale.set(0.075, 0.06, 0.07);
    hand.add(palm);
    const handDirections = [
      new THREE.Vector3(-side * 0.9, 0.16, 0.12),
      new THREE.Vector3(-side * 0.58, 0.46, -0.14),
      new THREE.Vector3(-side * 0.92, -0.18, 0.22),
      new THREE.Vector3(-side * 0.42, -0.3, -0.28),
    ];
    handDirections.forEach((direction, index) => {
      const feather = new THREE.Mesh(
        createFeatherGeometry(0.3 - index * 0.022, 0.075, 0.011),
        index % 2 === 0 ? this.flightFeather : this.flightFeatherLight,
      );
      orientMeshAlong(feather, direction);
      feather.position.set(side * 0.012, (index - 1.5) * 0.014, (index % 2 === 0 ? 1 : -1) * 0.012);
      hand.add(feather);
    });
    for (let i = 0; i < 4; i += 1) {
      const covert = new THREE.Mesh(
        createSoftFeatherGeometry(0.23 - i * 0.012, 0.075, 0.01),
        i % 2 === 0 ? this.featherSoft : this.featherShade,
      );
      const direction = new THREE.Vector3(
        side * (0.3 + i * 0.08),
        0.4 + i * 0.09,
        0.5,
      ).normalize();
      orientMeshAlong(covert, direction);
      covert.position.set(side * 0.035, 0.045 + i * 0.015, 0.01);
      hand.add(covert);
    }

    // A trailing fan of secondaries and primaries is updated in world space so
    // the wing reads as a feathered surface rather than a smooth arm.
    const trailing: THREE.Mesh[] = [];
    for (let i = 0; i < 5; i += 1) {
      const feather = new THREE.Mesh(
        createFeatherGeometry(0.46 - i * 0.045, 0.145 - i * 0.01, 0.014),
        i < 3 ? (i === 1 ? this.featherShade : this.featherSoft) : this.flightFeatherLight,
      );
      feather.name = `${side < 0 ? 'left' : 'right'}-trailing-feather-${i}`;
      this.root.add(feather);
      trailing.push(feather);
    }

    return {
      side,
      shoulder,
      upper,
      lower,
      hand,
      trailing,
      upperLength: UPPER_WING_LENGTH,
      lowerLength: LOWER_WING_LENGTH,
    };
  }

  // -------------------------------------------------------------------------
  // Legs and webbed feet
  // -------------------------------------------------------------------------

  private buildLeg(side: number): LegRig {
    const hip = new THREE.Vector3(side * HIP_X, HIP_Y, HIP_Z);
    const upper = new THREE.Group();
    const lower = new THREE.Group();
    const foot = new THREE.Group();
    upper.name = side < 0 ? 'left-leg-upper' : 'right-leg-upper';
    lower.name = side < 0 ? 'left-leg-lower' : 'right-leg-lower';
    foot.name = side < 0 ? 'left-webbed-foot' : 'right-webbed-foot';
    this.root.add(upper, lower, foot);

    const hipPuff = new THREE.Mesh(this.sphereGeometry, this.featherSoft);
    hipPuff.scale.set(0.105, 0.14, 0.1);
    hipPuff.position.y = 0.02;
    upper.add(hipPuff);

    const thigh = new THREE.Mesh(this.sphereGeometry, this.featherSoft);
    thigh.scale.set(0.09, 0.235, 0.082);
    thigh.position.y = 0.19;
    upper.add(thigh);

    for (let i = 0; i < 4; i += 1) {
      const feather = new THREE.Mesh(
        createSoftFeatherGeometry(0.2 - i * 0.01, 0.095, 0.011),
        i % 2 === 0 ? this.featherShade : this.featherSoft,
      );
      const direction = new THREE.Vector3(side * (0.09 + i * 0.06), 0.35, 0.14 + i * 0.03).normalize();
      orientMeshAlong(feather, direction);
      feather.position.set(side * (0.022 + i * 0.008), 0.24 + i * 0.028, 0.015);
      feather.rotation.z += side * (0.18 + i * 0.1);
      upper.add(feather);
    }

    const knee = new THREE.Mesh(this.sphereGeometry, this.featherWarm);
    knee.scale.set(0.068, 0.065, 0.065);
    knee.position.y = UPPER_LEG_LENGTH;
    upper.add(knee);

    const kneeTuft = new THREE.Mesh(
      createSoftFeatherGeometry(0.14, 0.075, 0.01),
      this.featherShade,
    );
    orientMeshAlong(kneeTuft, new THREE.Vector3(side * 0.2, -0.4, 0.8));
    kneeTuft.position.set(side * 0.02, UPPER_LEG_LENGTH - 0.01, 0.01);
    upper.add(kneeTuft);

    const shinGeometry = new THREE.CylinderGeometry(0.025, 0.04, LOWER_LEG_LENGTH, 9, 2);
    const shin = new THREE.Mesh(shinGeometry, this.legOrange);
    shin.position.y = LOWER_LEG_LENGTH * 0.5;
    lower.add(shin);

    for (let i = 0; i < 5; i += 1) {
      const t = 0.16 + i * 0.16;
      const ring = new THREE.Mesh(this.ringGeometry, this.legOrangeDark);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = t * LOWER_LEG_LENGTH;
      const scale = 0.77 + t * 0.5;
      ring.scale.setScalar(scale);
      lower.add(ring);
    }

    const ankle = new THREE.Mesh(this.sphereGeometry, this.legOrangeLight);
    ankle.scale.set(0.043, 0.045, 0.043);
    ankle.position.y = LOWER_LEG_LENGTH;
    lower.add(ankle);

    const footMesh = new THREE.Mesh(this.footGeometry, this.legOrangeLight);
    footMesh.scale.set(1.2, 1.08, 1.16);
    foot.add(footMesh);
    const ankleJoint = new THREE.Mesh(this.sphereGeometry, this.legOrange);
    ankleJoint.scale.setScalar(0.045);
    foot.add(ankleJoint);
    foot.scale.setScalar(1.08);

    const toePositions = [
      -0.19, 0.0, 0.19,
    ];
    toePositions.forEach((x, index) => {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.017, 0.06, 6), this.claw);
      claw.rotation.x = Math.PI / 2;
      claw.position.set(x, 0.004, index === 1 ? 0.3 : 0.13);
      foot.add(claw);
    });

    const toeLines = new THREE.BufferGeometry();
    toeLines.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([
        0, 0.004, 0.01,
        -0.105, 0.004, 0.2,
        0, 0.004, 0.01,
        0.0, 0.004, 0.255,
        0, 0.004, 0.01,
        0.105, 0.004, 0.2,
        -0.105, 0.004, 0.2,
        -0.045, 0.004, 0.125,
        0.105, 0.004, 0.2,
        0.045, 0.004, 0.125,
      ], 3),
    );
    foot.add(new THREE.LineSegments(toeLines, this.toeLine));

    return {
      side,
      hip,
      upper,
      lower,
      foot,
      upperLength: UPPER_LEG_LENGTH,
      lowerLength: LOWER_LEG_LENGTH,
    };
  }

  // -------------------------------------------------------------------------
  // Per-frame riding assembly
  // -------------------------------------------------------------------------

  updateRiding(frame: RidingFrame): void {
    const dt = Math.min(0.05, Math.max(0.001, frame.dt));
    const time = frame.time;
    const speedRatio = clamp(frame.speed / 16, 0, 1);
    const crash = clamp(frame.crashFactor, 0, 1);
    this.lastTime = time;

    const breathing = Math.sin(time * 2.1) * 0.004;
    const pedalBob = Math.sin(frame.distance * 3.4) * 0.007 * speedRatio;
    const airborne = !frame.grounded;
    const vertical = clamp(frame.verticalVelocity / 6, -1.4, 1.4);
    const bodyLift = airborne ? clamp(Math.abs(vertical) * 0.01, 0, 0.02) : 0;
    const bodyPitch =
      clamp(frame.speed * 0.006, 0, 0.072) +
      (airborne ? clamp(-vertical * 0.035, -0.085, 0.09) : 0) +
      Math.sin(time * 1.25) * 0.006 -
      crash * 0.18;
    // frame.steering is right-positive. Positive Z roll leans the body toward
    // local -X, which is screen-right, so the sign leans into the turn.
    const bodyRoll = frame.steering * 0.065 + Math.sin(time * 1.7) * 0.006 - crash * 0.12;

    this.bodyRig.position.set(
      0,
      BODY_CENTER.y + breathing + pedalBob + bodyLift - crash * 0.03,
      BODY_CENTER.z - crash * 0.06,
    );
    this.bodyRig.rotation.x = damp(this.bodyRig.rotation.x, bodyPitch, 7, dt);
    this.bodyRig.rotation.z = damp(this.bodyRig.rotation.z, bodyRoll, 7, dt);

    const neckBasePitch =
      -bodyPitch * 0.75 +
      Math.sin(time * 1.8 + 0.7) * 0.018 +
      (airborne ? clamp(vertical * 0.05, -0.09, 0.08) : 0) +
      crash * 0.2;
    const neckBaseRoll = frame.steering * 0.115 + Math.sin(time * 1.45) * 0.012;
    this.neckPivot.rotation.x = damp(this.neckPivot.rotation.x, neckBasePitch, 6, dt);
    this.neckPivot.rotation.z = damp(this.neckPivot.rotation.z, neckBaseRoll, 6, dt);

    const headPitch =
      Math.sin(time * 2.35) * 0.018 +
      clamp(frame.speed * 0.0025, 0, 0.025) -
      (airborne ? vertical * 0.028 : 0) +
      crash * 0.24;
    this.headGroup.rotation.x = damp(this.headGroup.rotation.x, headPitch, 8, dt);
    this.headGroup.rotation.y = damp(
      this.headGroup.rotation.y,
      0.52 + Math.sin(time * 0.4) * 0.08 - frame.steering * 0.23,
      6,
      dt,
    );
    this.headGroup.rotation.z = damp(
      this.headGroup.rotation.z,
      frame.steering * 0.06 + Math.sin(time * 1.6 + 0.4) * 0.01,
      6,
      dt,
    );

    this.tailGroup.rotation.y = damp(
      this.tailGroup.rotation.y,
      Math.sin(time * 1.55) * 0.045 + frame.steering * 0.15,
      5,
      dt,
    );
    this.tailGroup.rotation.x = damp(
      this.tailGroup.rotation.x,
      airborne ? clamp(-vertical * 0.06, -0.08, 0.08) : 0,
      5,
      dt,
    );

    this.updateBlink(dt);
    this.updateWing(this.wingRigs.left, frame.targets.leftGrip, frame, bodyPitch, bodyRoll);
    this.updateWing(this.wingRigs.right, frame.targets.rightGrip, frame, bodyPitch, bodyRoll);
    this.updateLeg(this.legRigs.left, frame.targets.leftPedal, frame);
    this.updateLeg(this.legRigs.right, frame.targets.rightPedal, frame);
  }

  private updateWing(
    rig: WingRig,
    target: THREE.Vector3,
    frame: RidingFrame,
    bodyPitch: number,
    bodyRoll: number,
  ): void {
    const side = rig.side;
    const bob = Math.sin(frame.time * 2.1) * 0.0025;
    const shoulder = this.tempRoot.set(
      side * SHOULDER_X + bodyRoll * 0.04,
      SHOULDER_Y + bob + bodyPitch * 0.02,
      SHOULDER_Z - bodyPitch * 0.12,
    );
    this.tempPole.set(
      side * (SHOULDER_X + 0.42),
      SHOULDER_Y + 0.16 - Math.abs(frame.steering) * 0.03,
      SHOULDER_Z - 0.24,
    );
    this.tempTarget.copy(target);
    solveTwoBoneIK(
      shoulder,
      this.tempTarget,
      rig.upperLength,
      rig.lowerLength,
      this.tempPole,
      this.tempJoint,
      this.tempEnd,
    );
    poseBone(rig.upper, shoulder, this.tempJoint);
    poseBone(rig.lower, this.tempJoint, this.tempEnd);
    rig.hand.position.copy(this.tempEnd);
    rig.hand.rotation.set(0, side * -0.12, 0);

    const trailingCount = rig.trailing.length;
    for (let i = 0; i < trailingCount; i += 1) {
      const feather = rig.trailing[i] as THREE.Mesh;
      const t = 0.18 + (i / (trailingCount - 1)) * 0.72;
      const base = this.trailingBase.lerpVectors(this.tempJoint, this.tempEnd, t);
      base.y -= 0.035;
      const featherDirection = this.trailingDirection.set(
        side * (0.22 + i * 0.08),
        -0.15 - i * 0.035,
        -1,
      ).normalize();
      const normal = this.trailingNormal.set(side * 0.82, 0.55, 0.08).normalize();
      orientFeatherFlat(feather, base, featherDirection, normal);
    }
  }

  private updateLeg(rig: LegRig, target: THREE.Vector3, frame: RidingFrame): void {
    const side = rig.side;
    const hipBob = Math.sin(frame.time * 2.1) * 0.003;
    const hip = this.tempRoot.set(
      side * HIP_X,
      HIP_Y + hipBob - frame.crashFactor * 0.035,
      HIP_Z,
    );
    const footTarget = this.tempTarget.copy(target);
    footTarget.y += 0.006;
    this.tempPole.set(
      side * (HIP_X + 0.2),
      HIP_Y + 0.3,
      HIP_Z + 0.66,
    );
    solveTwoBoneIK(
      hip,
      footTarget,
      rig.upperLength,
      rig.lowerLength,
      this.tempPole,
      this.tempJoint,
      this.tempEnd,
    );
    poseBone(rig.upper, hip, this.tempJoint);
    poseBone(rig.lower, this.tempJoint, this.tempEnd);
    rig.foot.position.copy(this.tempEnd);
    rig.foot.rotation.set(0, side * 0.2, 0);
  }

  private updateBlink(dt: number): void {
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0 && this.blinkProgress <= 0) {
      this.blinkProgress = 0.0001;
      this.blinkTimer = 3.2 + Math.random() * 3.7;
    }
    let scaleY = 1;
    if (this.blinkProgress > 0) {
      this.blinkProgress += dt / 0.16;
      if (this.blinkProgress >= 1) {
        this.blinkProgress = 0;
      } else {
        scaleY = 1 - Math.sin(Math.PI * this.blinkProgress) * 0.88;
      }
    }
    for (const eye of this.eyes) {
      eye.group.scale.y = scaleY;
    }
  }

  /**
   * Idle pose used on the menu. The caller still supplies current bicycle
   * anchors so the bird remains physically attached to the machine.
   */
  updateIdle(time: number, targets: RidingTargets): void {
    this.updateRiding({
      dt: 1 / 60,
      time,
      speed: 0,
      distance: 0,
      steering: 0,
      lean: 0,
      grounded: true,
      verticalVelocity: 0,
      crashFactor: 0,
      targets,
    });
  }

  dispose(): void {
    disposeObject3D(this.root);
  }

  getLastTime(): number {
    return this.lastTime;
  }

  private addOutline(
    source: THREE.Mesh,
    scaleMultiplier: number,
    material: THREE.Material = this.outlineMaterial,
  ): void {
    if (!source.parent) return;
    const outline = new THREE.Mesh(source.geometry, material);
    outline.position.copy(source.position);
    outline.rotation.copy(source.rotation);
    outline.scale.copy(source.scale).multiplyScalar(scaleMultiplier);
    outline.name = `${source.name || 'pelican'}-outline`;
    outline.castShadow = false;
    outline.receiveShadow = false;
    source.parent.add(outline);
  }
}

// ---------------------------------------------------------------------------
// Geometry helpers scoped to the character
// ---------------------------------------------------------------------------

function applyVerticalGradient(
  geometry: THREE.BufferGeometry,
  topColor: string,
  bottomColor: string,
  power = 1,
): void {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (!bounds) return;
  const minY = bounds.min.y;
  const maxY = bounds.max.y;
  const span = Math.max(0.0001, maxY - minY);
  const position = geometry.getAttribute('position');
  const colors: number[] = [];
  const top = new THREE.Color(topColor);
  const bottom = new THREE.Color(bottomColor);
  const color = new THREE.Color();
  for (let i = 0; i < position.count; i += 1) {
    const t = (position.getY(i) - minY) / span;
    color.copy(bottom).lerp(top, Math.pow(t, power));
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
}

function orientMeshAlong(mesh: THREE.Object3D, direction: THREE.Vector3): void {
  mesh.quaternion.setFromUnitVectors(Y_AXIS, direction.clone().normalize());
}

/** Orient a flat feather with explicit up/normal control to avoid edge-on cards. */
function orientFeatherFlat(
  mesh: THREE.Object3D,
  position: THREE.Vector3,
  direction: THREE.Vector3,
  normal: THREE.Vector3,
): void {
  const yAxis = direction.clone().normalize();
  const zAxis = normal.clone().addScaledVector(yAxis, -normal.dot(yAxis)).normalize();
  const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();
  const basis = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
  mesh.position.copy(position);
  mesh.quaternion.setFromRotationMatrix(basis);
}

function createWebbedFootGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.105);
  shape.bezierCurveTo(-0.055, -0.08, -0.14, 0.015, -0.175, 0.095);
  shape.quadraticCurveTo(-0.14, 0.135, -0.085, 0.115);
  shape.lineTo(-0.05, 0.205);
  shape.quadraticCurveTo(0, 0.245, 0.047, 0.2);
  shape.lineTo(0.086, 0.115);
  shape.quadraticCurveTo(0.145, 0.14, 0.175, 0.086);
  shape.bezierCurveTo(0.13, -0.005, 0.055, -0.078, 0, -0.105);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.03,
    bevelEnabled: true,
    bevelSize: 0.008,
    bevelThickness: 0.008,
    bevelSegments: 2,
    steps: 1,
  });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, 0.008, 0);
  geometry.computeVertexNormals();
  return geometry;
}

function addPouchFold(parent: THREE.Object3D, side: number, material: THREE.Material): void {
  const points = [
    new THREE.Vector3(side * 0.045, -0.03, 0.22),
    new THREE.Vector3(side * 0.115, -0.135, 0.37),
    new THREE.Vector3(side * 0.125, -0.215, 0.57),
    new THREE.Vector3(side * 0.075, -0.185, 0.8),
  ];
  const curve = new THREE.CatmullRomCurve3(points);
  const fold = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 18, 0.0045, 4, false),
    new THREE.MeshStandardMaterial({
      color: 0xc77d3b,
      roughness: 0.7,
      transparent: true,
      opacity: 0.48,
    }),
  );
  parent.add(fold);
}
