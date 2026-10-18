import * as THREE from 'three';
import { randomRange } from './math';

export interface BurstOptions {
  count?: number;
  speed?: number;
  spread?: number;
  size?: number;
  life?: number;
  gravity?: number;
  upward?: number;
  color?: THREE.ColorRepresentation;
  colorVariance?: number;
  drag?: number;
}

interface Particle {
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  drag: number;
  gravity: number;
}

/**
 * Pooled, shader-drawn particles. A single draw call per emitter with per-
 * particle colour, size, alpha and soft circular falloff.
 */
export class ParticleEmitter {
  readonly points: THREE.Points;
  private readonly capacity: number;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly sizes: Float32Array;
  private readonly alphas: Float32Array;
  private readonly particles: Particle[] = [];
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;
  private readonly cursor = { value: 0 };
  private readonly tempColor = new THREE.Color();

  constructor(capacity: number, blending: THREE.Blending, pixelRatio: number) {
    this.capacity = capacity;
    this.positions = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3);
    this.sizes = new Float32Array(capacity);
    this.alphas = new Float32Array(capacity);
    this.positions.fill(0);
    this.alphas.fill(0);

    for (let i = 0; i < capacity; i += 1) {
      this.particles.push({
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        size: 1,
        drag: 1,
        gravity: 0,
      });
    }

    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    this.geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uPixelRatio: { value: pixelRatio },
      },
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute float aAlpha;
        varying vec3 vColor;
        varying float vAlpha;
        uniform float uPixelRatio;
        void main() {
          vColor = color;
          vAlpha = aAlpha;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uPixelRatio * (280.0 / max(0.1, -mvPosition.z));
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float dist = length(uv) * 2.0;
          float alpha = smoothstep(1.0, 0.1, dist) * vAlpha;
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      blending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
  }

  setPixelRatio(pixelRatio: number): void {
    this.material.uniforms.uPixelRatio.value = pixelRatio;
  }

  burst(position: THREE.Vector3, options: BurstOptions = {}): void {
    const count = options.count ?? 14;
    const speed = options.speed ?? 1.8;
    const spread = options.spread ?? 0.25;
    const size = options.size ?? 0.16;
    const life = options.life ?? 0.7;
    const gravity = options.gravity ?? -3.2;
    const upward = options.upward ?? 0.9;
    const color = options.color ?? 0xffcf77;
    const variance = options.colorVariance ?? 0.08;
    const drag = options.drag ?? 1.4;
    const baseColor = this.tempColor.set(color);

    for (let n = 0; n < count; n += 1) {
      const index = this.cursor.value;
      this.cursor.value = (this.cursor.value + 1) % this.capacity;
      const particle = this.particles[index];
      if (!particle) continue;

      const angle = Math.random() * Math.PI * 2;
      const radial = randomRange(Math.random, 0.2, 1) * speed;
      particle.velocity.set(
        Math.cos(angle) * radial,
        upward * speed * randomRange(Math.random, 0.25, 1) + Math.random() * 1.2,
        Math.sin(angle) * radial,
      );
      particle.velocity.x += randomRange(Math.random, -spread, spread);
      particle.velocity.z += randomRange(Math.random, -spread, spread);
      particle.life = 0;
      particle.maxLife = life * randomRange(Math.random, 0.7, 1.25);
      particle.size = size * randomRange(Math.random, 0.65, 1.25);
      particle.drag = drag;
      particle.gravity = gravity;

      const p = index * 3;
      this.positions[p] = position.x + randomRange(Math.random, -spread, spread);
      this.positions[p + 1] = position.y + randomRange(Math.random, -spread * 0.3, spread);
      this.positions[p + 2] = position.z + randomRange(Math.random, -spread, spread);

      const tint = randomRange(Math.random, -variance, variance);
      this.colors[p] = Math.min(1, Math.max(0, baseColor.r + tint));
      this.colors[p + 1] = Math.min(1, Math.max(0, baseColor.g + tint * 0.8));
      this.colors[p + 2] = Math.min(1, Math.max(0, baseColor.b + tint * 0.4));
      this.sizes[index] = particle.size;
      this.alphas[index] = 1;
    }

    (this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
  }

  update(dt: number): void {
    let active = false;
    for (let i = 0; i < this.capacity; i += 1) {
      const particle = this.particles[i];
      if (!particle || particle.life >= particle.maxLife) {
        this.alphas[i] = 0;
        continue;
      }
      active = true;
      particle.life += dt;
      const t = Math.min(1, particle.life / particle.maxLife);
      particle.velocity.y += particle.gravity * dt;
      const dragFactor = Math.max(0, 1 - particle.drag * dt);
      particle.velocity.multiplyScalar(dragFactor);
      const p = i * 3;
      this.positions[p] += particle.velocity.x * dt;
      this.positions[p + 1] += particle.velocity.y * dt;
      this.positions[p + 2] += particle.velocity.z * dt;
      this.alphas[i] = (1 - t) * (1 - t) * 0.95;
      this.sizes[i] = particle.size * (1 + t * 0.75);
    }

    if (active) {
      (this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      (this.geometry.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
      (this.geometry.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

export class ParticleSystem {
  readonly sparkles: ParticleEmitter;
  readonly dust: ParticleEmitter;
  readonly root = new THREE.Group();

  constructor(pixelRatio: number) {
    this.sparkles = new ParticleEmitter(260, THREE.AdditiveBlending, pixelRatio);
    this.dust = new ParticleEmitter(220, THREE.NormalBlending, pixelRatio);
    this.root.add(this.sparkles.points, this.dust.points);
  }

  setPixelRatio(pixelRatio: number): void {
    this.sparkles.setPixelRatio(pixelRatio);
    this.dust.setPixelRatio(pixelRatio);
  }

  fishBurst(position: THREE.Vector3): void {
    this.sparkles.burst(position, {
      count: 11,
      speed: 1.6,
      spread: 0.16,
      size: 0.105,
      life: 0.6,
      gravity: -1.1,
      upward: 1.2,
      color: 0xffd277,
      colorVariance: 0.12,
    });
  }

  crashDust(position: THREE.Vector3, amount = 18): void {
    this.dust.burst(position, {
      count: amount,
      speed: 1.1,
      spread: 0.3,
      size: 0.19,
      life: 0.75,
      gravity: -2.2,
      upward: 0.6,
      color: 0xd8c3a2,
      colorVariance: 0.06,
      drag: 2.3,
    });
  }

  checkpoint(position: THREE.Vector3): void {
    this.sparkles.burst(position, {
      count: 22,
      speed: 2.4,
      spread: 0.5,
      size: 0.15,
      life: 1.0,
      gravity: -1.8,
      upward: 1.6,
      color: 0xffe6a4,
      colorVariance: 0.1,
    });
  }

  landing(position: THREE.Vector3): void {
    this.dust.burst(position, {
      count: 10,
      speed: 0.8,
      spread: 0.25,
      size: 0.19,
      life: 0.5,
      gravity: -1.0,
      upward: 0.5,
      color: 0xe3d2b5,
      colorVariance: 0.04,
      drag: 2.4,
    });
  }

  update(dt: number): void {
    this.sparkles.update(dt);
    this.dust.update(dt);
  }

  dispose(): void {
    this.sparkles.dispose();
    this.dust.dispose();
  }
}
