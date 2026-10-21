export interface LoopStats {
  fps: number;
  averageFrameMs: number;
  p95FrameMs: number;
  frames: number;
  elapsed: number;
}

const FIXED_STEP = 1 / 60;
const MAX_STEPS_PER_FRAME = 5;

/**
 * requestAnimationFrame driver with fixed 60 Hz simulation steps and one render
 * per display frame. The accumulator removes frame-rate-dependent physics at
 * ordinary refresh rates and caps catch-up work after a stall.
 */
export class GameLoop {
  private animationFrame = 0;
  private lastTime = 0;
  private running = false;
  private frameCount = 0;
  private elapsed = 0;
  private accumulator = 0;
  private readonly frameTimes: number[] = [];
  private readonly maxSamples = 180;

  constructor(
    private readonly onUpdate: (dt: number, elapsed: number) => void,
    private readonly onRender: () => void = () => {},
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
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
    const rawDt = Math.max(0, (now - this.lastTime) / 1000);
    this.lastTime = now;
    const frameMs = rawDt * 1000;
    this.frameTimes.push(Math.min(100, frameMs));
    if (this.frameTimes.length > this.maxSamples) this.frameTimes.shift();

    this.frameCount += 1;
    this.accumulator += Math.min(0.25, rawDt);
    let steps = 0;
    while (this.accumulator >= FIXED_STEP && steps < MAX_STEPS_PER_FRAME) {
      this.elapsed += FIXED_STEP;
      this.onUpdate(FIXED_STEP, this.elapsed);
      this.accumulator -= FIXED_STEP;
      steps += 1;
    }
    // Do not carry an unbounded backlog after a long stall.
    if (steps === MAX_STEPS_PER_FRAME) {
      this.accumulator = Math.min(this.accumulator, FIXED_STEP);
    }
    this.onRender();
    this.animationFrame = requestAnimationFrame(this.tick);
  };
}
