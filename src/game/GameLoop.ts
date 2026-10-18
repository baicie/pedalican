export interface LoopStats {
  fps: number;
  averageFrameMs: number;
  p95FrameMs: number;
  frames: number;
  elapsed: number;
}

/**
 * requestAnimationFrame driver with dt clamping and a small rolling frame-time
 * history used by the real measurement harness.
 */
export class GameLoop {
  private animationFrame = 0;
  private lastTime = 0;
  private running = false;
  private frameCount = 0;
  private elapsed = 0;
  private readonly frameTimes: number[] = [];
  private readonly maxSamples = 180;

  constructor(
    private readonly onFrame: (dt: number, elapsed: number) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.animationFrame = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.animationFrame);
  }

  get isRunning(): boolean {
    return this.running;
  }

  getStats(): LoopStats {
    if (this.frameTimes.length === 0) {
      return { fps: 0, averageFrameMs: 0, p95FrameMs: 0, frames: this.frameCount, elapsed: this.elapsed };
    }
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const average = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] as number;
    return {
      fps: average > 0 ? 1000 / average : 0,
      averageFrameMs: average,
      p95FrameMs: p95,
      frames: this.frameCount,
      elapsed: this.elapsed,
    };
  }

  private readonly tick = (now: number): void => {
    if (!this.running) return;
    const rawDt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    const frameMs = rawDt * 1000;
    this.frameTimes.push(Math.min(100, frameMs));
    if (this.frameTimes.length > this.maxSamples) this.frameTimes.shift();

    const dt = Math.min(0.05, Math.max(0.001, rawDt));
    this.elapsed += dt;
    this.frameCount += 1;
    this.onFrame(dt, this.elapsed);
    this.animationFrame = requestAnimationFrame(this.tick);
  };
}
