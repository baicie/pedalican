import { beforeEach, describe, expect, it } from 'vitest';
import { GameState, START_HEARTS } from './GameState';

describe('GameState', () => {
  let state: GameState;

  beforeEach(() => {
    state = new GameState();
  });

  it('starts with the configured number of hearts', () => {
    expect(START_HEARTS).toBe(5);
    expect(state.health).toBe(START_HEARTS);
    expect(state.maxHealth).toBe(START_HEARTS);
  });

  it('damages one heart and grants invulnerability', () => {
    expect(state.damage()).toBe(false);
    expect(state.health).toBe(4);
    expect(state.crashes).toBe(1);
    expect(state.invulnerable).toBeGreaterThan(0);

    expect(state.damage()).toBe(false);
    expect(state.health).toBe(4);
    expect(state.crashes).toBe(1);
  });

  it('reports a fatal hit only when the last heart is lost', () => {
    for (let i = 0; i < 4; i += 1) {
      state.invulnerable = 0;
      expect(state.damage()).toBe(false);
    }
    state.invulnerable = 0;
    expect(state.damage()).toBe(true);
    expect(state.health).toBe(0);
    expect(state.crashes).toBe(5);
  });

  it('heals up to max health and resets a run', () => {
    state.health = 2;
    state.heal(1);
    expect(state.health).toBe(3);
    state.heal(99);
    expect(state.health).toBe(START_HEARTS);

    state.runTime = 42;
    state.crashes = 2;
    state.checkpointIndex = 1;
    state.resetRun();
    expect(state.health).toBe(START_HEARTS);
    expect(state.maxHealth).toBe(START_HEARTS);
    expect(state.runTime).toBe(0);
    expect(state.crashes).toBe(0);
    expect(state.checkpointIndex).toBe(0);
  });
});
