import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameLoop } from './GameLoop';

describe('GameLoop', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses fixed simulation steps and renders once per frame', () => {
    let frameCallback: FrameRequestCallback | null = null;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frameCallback = callback;
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    vi.spyOn(performance, 'now').mockReturnValue(0);

    const updateTimes: number[] = [];
    let renderCount = 0;
    const loop = new GameLoop(
      (dt, elapsed) => {
        expect(dt).toBeCloseTo(1 / 60, 5);
        updateTimes.push(elapsed);
      },
      () => {
        renderCount += 1;
      },
    );

    loop.start();
    expect(frameCallback).not.toBeNull();
    frameCallback!(100);

    expect(updateTimes).toHaveLength(5);
    expect(updateTimes[0]).toBeCloseTo(1 / 60, 5);
    expect(renderCount).toBe(1);
    loop.stop();
  });
});
