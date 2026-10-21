import * as THREE from 'three';
import type { LevelManager } from '../gameplay/LevelManager';
import { SUN_DIRECTION } from './Lighting';
import { createSunTexture } from '../utils/canvas';
import { disposeObject3D } from '../utils/geometry';
import { mulberry32, randomRange, TAU } from '../utils/math';

interface Cloud {
  group: THREE.Group;
  baseX: number;
  speed: number;
  bobPhase: number;
}

interface Gull {
  group: THREE.Group;
  center: THREE.Vector3;
  radius: number;
  phase: number;
  speed: number;
  wingLeft: THREE.Object3D;
  wingRight: THREE.Object3D;
}

/**
 * Sky, sea, clouds, distant islands and ambient wildlife.
 */
export class Environment {
  readonly root = new THREE.Group();
  private readonly sky: THREE.Mesh;
  private readonly skyMaterial: THREE.ShaderMaterial;
  private readonly water: THREE.Mesh;
  private readonly waterGeometry: THREE.PlaneGeometry;
  private readonly waterBase: Float32Array;
  private readonly foam: THREE.Mesh;
  private readonly foamMaterial: THREE.MeshBasicMaterial;
  private readonly clouds: Cloud[] = [];
  private readonly gulls: Gull[] = [];
  private readonly sunSprite: THREE.Sprite;
  private time = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly level: LevelManager,
  ) {
    this.root.name = 'environment';
    scene.add(this.root);

    this.skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color('#2f80a8') },
        horizonColor: { value: new THREE.Color('#f5cc92') },
        seaHaze: { value: new THREE.Color('#9edbd6') },
        sunColor: { value: new THREE.Color('#ffd180') },
        sunDirection: { value: SUN_DIRECTION.clone() },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vWorldPosition;
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 seaHaze;
        uniform vec3 sunColor;
        uniform vec3 sunDirection;
        void main() {
          vec3 direction = normalize(vWorldPosition - cameraPosition);
          float h = clamp(direction.y * 1.12 + 0.045, 0.0, 1.0);
          vec3 color = mix(horizonColor, topColor, pow(h, 0.4));
          float belowHorizon = clamp(-direction.y * 3.0, 0.0, 1.0);
          color = mix(color, seaHaze, belowHorizon * 0.7);
          float sunDot = max(dot(direction, normalize(sunDirection)), 0.0);
          float glow = pow(sunDot, 12.0);
          float disc = smoothstep(0.99955, 0.99985, sunDot);
          color += sunColor * glow * 0.16;
          color += sunColor * disc * 1.5;
          float warmBand = pow(max(0.0, 1.0 - abs(direction.y + 0.015) * 7.0), 2.0);
          color += vec3(0.055, 0.025, 0.005) * warmBand;
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 18), this.skyMaterial);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -100;
    this.root.add(this.sky);

    this.sunSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: createSunTexture(256),
        color: 0xffb45f,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true,
      }),
    );
    this.sunSprite.scale.set(26, 26, 1);
    this.sunSprite.renderOrder = -99;
    this.root.add(this.sunSprite);

    this.waterGeometry = new THREE.PlaneGeometry(380, 1500, 32, 72);
    this.waterGeometry.rotateX(-Math.PI / 2);
    this.waterBase = new Float32Array(
      (this.waterGeometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array,
    );
    this.applyWaterColors(this.waterGeometry);
    const waterMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.32,
      metalness: 0.12,
      flatShading: true,
    });
    this.water = new THREE.Mesh(this.waterGeometry, waterMaterial);
    this.water.position.set(-146, -0.52, 370);
    this.water.receiveShadow = true;
    this.root.add(this.water);

    this.foamMaterial = new THREE.MeshBasicMaterial({
      color: 0xfff6df,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.foam = this.buildFoamRibbon(-23.6, 2.4, -0.41);
    this.foam.material = this.foamMaterial;
    this.root.add(this.foam);
    const secondFoam = this.buildFoamRibbon(-26.8, 1.1, -0.44);
    secondFoam.material = this.foamMaterial;
    this.root.add(secondFoam);
    const offshoreFoamMaterial = new THREE.MeshBasicMaterial({
      color: 0xfff8e8,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const offshoreLines: Array<[number, number]> = [
      [-35, 1.5],
      [-46, 1.0],
      [-62, 1.3],
    ];
    for (const [lateral, width] of offshoreLines) {
      const line = this.buildFoamRibbon(lateral, width, -0.455);
      line.material = offshoreFoamMaterial;
      this.root.add(line);
    }

    this.buildClouds();
    this.buildIslands();
    this.buildGulls();
    this.buildSailboats();
  }

  private applyWaterColors(geometry: THREE.PlaneGeometry): void {
    const position = geometry.getAttribute('position');
    const colors: number[] = [];
    const near = new THREE.Color('#52cdbd');
    const shallow = new THREE.Color('#2fa5b5');
    const deep = new THREE.Color('#126d8e');
    const color = new THREE.Color();
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const z = position.getZ(i);
      const shoreT = THREE.MathUtils.clamp((x + 160) / 250, 0, 1);
      color.copy(deep).lerp(shallow, Math.pow(shoreT, 0.65));
      if (shoreT > 0.82) color.lerp(near, (shoreT - 0.82) / 0.18);
      const streak = Math.sin(z * 0.04 + x * 0.19) * 0.5 + 0.5;
      color.offsetHSL(0, 0, streak * 0.018);
      colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  }

  private buildFoamRibbon(lateral: number, width: number, y: number): THREE.Mesh {
    const positions: number[] = [];
    const indices: number[] = [];
    const step = 4;
    const start = 0;
    const end = this.level.data.trackLength + 60;
    let row = 0;
    for (let z = start; z <= end; z += step) {
      const inner = this.level.pointAt(z, lateral - width * 0.5);
      const outer = this.level.pointAt(z, lateral + width * 0.5);
      const wobble = Math.sin(z * 0.09) * 0.12;
      positions.push(inner.x, y + wobble, inner.z, outer.x, y - wobble, outer.z);
      if (z < end) {
        const a = row * 2;
        indices.push(a, a + 2, a + 1, a + 2, a + 3, a + 1);
      }
      row += 1;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: 0xfff4dc,
        transparent: true,
        opacity: 0.44,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    mesh.renderOrder = 1;
    return mesh;
  }

  private buildClouds(): void {
    const rng = mulberry32(0x10adc10d);
    const cloudMaterial = new THREE.MeshStandardMaterial({
      color: 0xfffaed,
      emissive: 0xfff4df,
      emissiveIntensity: 0.78,
      roughness: 1,
      metalness: 0,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
      flatShading: false,
    });
    const sphere = new THREE.SphereGeometry(1, 10, 7);
    for (let i = 0; i < 10; i += 1) {
      const group = new THREE.Group();
      const puffCount = 5 + (i % 3);
      for (let j = 0; j < puffCount; j += 1) {
        const puff = new THREE.Mesh(sphere, cloudMaterial);
        const scale = randomRange(rng, 2.5, 5.1);
        puff.scale.set(scale * 1.5, scale * 0.6, scale);
        puff.position.set(
          (j - puffCount * 0.5) * randomRange(rng, 2.1, 3.6),
          randomRange(rng, -0.45, 1.7),
          randomRange(rng, -2.1, 2.1),
        );
        group.add(puff);
      }
      const z = randomRange(rng, 80, this.level.data.trackLength + 180);
      const lateral =
        (rng() < 0.5 ? -1 : 1) * randomRange(rng, 65, 230);
      const point = this.level.pointAt(Math.min(z, this.level.data.trackLength), lateral);
      group.position.set(point.x + randomRange(rng, -16, 16), randomRange(rng, 38, 62), z);
      group.rotation.y = rng() * TAU;
      group.scale.setScalar(randomRange(rng, 0.7, 1.4));
      this.root.add(group);
      this.clouds.push({
        group,
        baseX: group.position.x,
        speed: randomRange(rng, 0.12, 0.34),
        bobPhase: rng() * TAU,
      });
    }
  }

  private buildIslands(): void {
    const rng = mulberry32(0x51a1d);
    const islandMaterial = new THREE.MeshStandardMaterial({
      color: 0x557f61,
      roughness: 0.94,
      flatShading: true,
    });
    const cliffMaterial = new THREE.MeshStandardMaterial({
      color: 0x6f7e69,
      roughness: 0.96,
      flatShading: true,
    });
    for (let i = 0; i < 4; i += 1) {
      const group = new THREE.Group();
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), i % 2 ? cliffMaterial : islandMaterial);
      rock.scale.set(randomRange(rng, 14, 30), randomRange(rng, 3, 8), randomRange(rng, 8, 20));
      rock.position.y = -0.3;
      rock.rotation.y = rng() * TAU;
      group.add(rock);
      if (i > 0) {
        const cap = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), islandMaterial);
        cap.scale.set(randomRange(rng, 6, 12), randomRange(rng, 2, 5), randomRange(rng, 5, 10));
        cap.position.set(randomRange(rng, -3, 3), 1.6, randomRange(rng, -2, 2));
        group.add(cap);
      }
      group.position.set(
        randomRange(rng, -190, -80),
        -0.1,
        randomRange(rng, 100, 1000),
      );
      this.root.add(group);
    }
  }

  private buildGulls(): void {
    const rng = mulberry32(0x600d5);
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xfffbf1, roughness: 0.8 });
    const wingMaterial = new THREE.MeshStandardMaterial({
      color: 0xf6f0e3,
      roughness: 0.82,
      side: THREE.DoubleSide,
    });
    const wingShape = new THREE.BufferGeometry();
    wingShape.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([
        0, 0, 0,
        1.1, 0.04, -0.22,
        0.35, -0.12, 0.28,
      ], 3),
    );
    wingShape.computeVertexNormals();

    for (let i = 0; i < 5; i += 1) {
      const group = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), bodyMaterial);
      body.scale.set(1, 0.55, 1.2);
      group.add(body);
      const left = new THREE.Mesh(wingShape, wingMaterial);
      left.scale.set(-1, 1, 1);
      group.add(left);
      const right = new THREE.Mesh(wingShape, wingMaterial);
      group.add(right);
      const center = this.level.pointAt(randomRange(rng, 35, 690), randomRange(rng, -18, -45));
      group.position.copy(center);
      group.position.y = randomRange(rng, 13, 22);
      group.scale.setScalar(randomRange(rng, 0.9, 1.5));
      this.root.add(group);
      this.gulls.push({
        group,
        center: center.clone(),
        radius: randomRange(rng, 8, 18),
        phase: rng() * TAU,
        speed: randomRange(rng, 0.06, 0.13),
        wingLeft: left,
        wingRight: right,
      });
    }
  }

  private buildSailboats(): void {
    const rng = mulberry32(0x5a11b0a7);
    const hullMaterial = new THREE.MeshStandardMaterial({
      color: 0xf2e5cf,
      roughness: 0.7,
      flatShading: true,
    });
    const trimMaterial = new THREE.MeshStandardMaterial({
      color: 0xd1674c,
      roughness: 0.75,
      flatShading: true,
    });
    const sailMaterial = new THREE.MeshStandardMaterial({
      color: 0xfff8e8,
      roughness: 0.85,
      flatShading: true,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < 3; i += 1) {
      const group = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 2.2, 3, 8), hullMaterial);
      hull.rotation.z = Math.PI / 2;
      hull.scale.y = 0.58;
      group.add(hull);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.09, 0.12), trimMaterial);
      trim.position.y = 0.16;
      group.add(trim);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.055, 4.3, 6), this.darkWoodLike());
      mast.position.set(0, 2.2, 0);
      group.add(mast);
      const sailGeometry = new THREE.BufferGeometry();
      sailGeometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute([
          0, 0.35, 0,
          0, 4.0, 0,
          1.9, 0.5, 0,
        ], 3),
      );
      sailGeometry.computeVertexNormals();
      const sail = new THREE.Mesh(sailGeometry, sailMaterial);
      sail.position.set(0.06, 0.15, 0);
      group.add(sail);
      group.position.set(
        randomRange(rng, -75, -48),
        -0.35,
        randomRange(rng, 80, 640),
      );
      group.rotation.y = rng() * TAU;
      group.scale.setScalar(randomRange(rng, 0.7, 1.2));
      this.root.add(group);
    }
  }

  private darkWoodLike(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: 0x6e4e38,
      roughness: 0.85,
      flatShading: true,
    });
  }

  update(dt: number, time: number, cameraPosition: THREE.Vector3): void {
    this.time = time;
    this.sky.position.set(cameraPosition.x, 0, cameraPosition.z);
    this.sunSprite.position
      .copy(cameraPosition)
      .addScaledVector(SUN_DIRECTION, 340);

    this.animateWater(time);
    this.foamMaterial.opacity = 0.38 + Math.sin(time * 1.5) * 0.08 + Math.sin(time * 3.1) * 0.03;
    this.foam.position.x = Math.sin(time * 0.3) * 0.3;

    for (const cloud of this.clouds) {
      cloud.group.position.x = cloud.baseX + Math.sin(time * cloud.speed + cloud.bobPhase) * 2.2;
      cloud.group.position.y += 0;
      cloud.group.rotation.y += dt * cloud.speed * 0.015;
    }

    for (const gull of this.gulls) {
      const angle = time * gull.speed + gull.phase;
      const x = gull.center.x + Math.cos(angle) * gull.radius;
      const z = gull.center.z + Math.sin(angle) * gull.radius * 0.55;
      gull.group.position.x = x;
      gull.group.position.z = z;
      gull.group.position.y = gull.center.y + Math.sin(time * 0.9 + gull.phase) * 1.1;
      gull.group.rotation.y = -angle + Math.PI / 2;
      const flap = Math.sin(time * 5.2 + gull.phase) * 0.32;
      gull.wingLeft.rotation.z = 0.16 + flap;
      gull.wingRight.rotation.z = -0.16 - flap;
    }
  }

  private animateWater(time: number): void {
    const position = this.waterGeometry.getAttribute('position') as THREE.BufferAttribute;
    const array = position.array as Float32Array;
    for (let i = 0; i < position.count; i += 1) {
      const baseIndex = i * 3;
      const x = this.waterBase[baseIndex] as number;
      const z = this.waterBase[baseIndex + 2] as number;
      const wave =
        Math.sin(x * 0.11 + time * 1.05) * 0.055 +
        Math.sin(z * 0.038 - time * 0.56 + x * 0.018) * 0.046 +
        Math.sin((x + z) * 0.035 + time * 0.8) * 0.02;
      array[baseIndex + 1] = wave;
    }
    position.needsUpdate = true;
  }

  getSkyMaterial(): THREE.ShaderMaterial {
    return this.skyMaterial;
  }

  dispose(): void {
    disposeObject3D(this.root);
  }
}
