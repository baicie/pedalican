export const TAU = Math.PI * 2;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function invLerp(a: number, b: number, value: number): number {
  if (a === b) return 0;
  return clamp((value - a) / (b - a), 0, 1);
}

/** Frame-rate independent exponential smoothing. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  return current + shortestAngle(target - current) * (1 - Math.exp(-lambda * dt));
}

export function shortestAngle(angle: number): number {
  let wrapped = angle % TAU;
  if (wrapped > Math.PI) wrapped -= TAU;
  if (wrapped < -Math.PI) wrapped += TAU;
  return wrapped;
}

export function smoothstep(min: number, max: number, value: number): number {
  const t = invLerp(min, max, value);
  return t * t * (3 - 2 * t);
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function formatTime(seconds: number, tenths = true): string {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remaining = safeSeconds - minutes * 60;
  const wholeSeconds = Math.floor(remaining);
  const fraction = Math.floor((remaining - wholeSeconds) * 10);
  const base = `${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}`;
  return tenths ? `${base}.${fraction}` : base;
}

export function formatScore(score: number): string {
  return Math.max(0, Math.round(score)).toString().padStart(6, '0');
}

export function formatScoreShort(score: number): string {
  return Math.max(0, Math.round(score)).toLocaleString('en-US');
}

export function formatDistance(meters: number): string {
  return `${Math.max(0, Math.floor(meters))} m`;
}

/** Small deterministic PRNG, useful for stable procedural scenery. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomRange(rng: () => number, min: number, max: number): number {
  return min + (max - min) * rng();
}

export function pick<T>(rng: () => number, values: readonly T[]): T {
  return values[Math.floor(rng() * values.length) % values.length] as T;
}

export function forwardFromYaw(yaw: number, out: { x: number; z: number }): { x: number; z: number } {
  out.x = Math.sin(yaw);
  out.z = Math.cos(yaw);
  return out;
}
