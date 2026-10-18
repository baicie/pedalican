export type GamePhase =
  | 'menu'
  | 'countdown'
  | 'playing'
  | 'paused'
  | 'crashed'
  | 'finished'
  | 'gameover';

export interface HUDState {
  phase: GamePhase;
  score: number;
  fish: number;
  scoreCombo: number;
  hearts: number;
  maxHearts: number;
  time: number;
  distance: number;
  progress: number;
  speedKmh: number;
  motion: string;
  cameraLabel: string;
  gapWarning: boolean;
  fishWarning: boolean;
  checkpointLabel: string;
  bestScore: number;
  bestTime: number | null;
  fast: boolean;
}

export interface RunResult {
  victory: boolean;
  score: number;
  fish: number;
  totalFish: number;
  time: number;
  crashes: number;
  distance: number;
  reason: string;
  newBest: boolean;
}

export interface GameStateSnapshot {
  phase: GamePhase;
  health: number;
  crashes: number;
  checkpointIndex: number;
}

export const START_HEARTS = 5;

/**
 * Small explicit state holder. The main Game class still owns transition
 * behavior, but all status values used by HUD and results come from here.
 */
export class GameState {
  phase: GamePhase = 'menu';
  runTime = 0;
  health = START_HEARTS;
  maxHealth = START_HEARTS;
  crashes = 0;
  checkpointIndex = 0;
  countdown = 0;
  crashTimer = 0;
  crashReason = '';
  invulnerable = 0;
  distance = 0;
  finishTime = 0;

  resetRun(): void {
    this.runTime = 0;
    this.health = START_HEARTS;
    this.maxHealth = START_HEARTS;
    this.crashes = 0;
    this.checkpointIndex = 0;
    this.countdown = 0;
    this.crashTimer = 0;
    this.crashReason = '';
    this.invulnerable = 0;
    this.distance = 0;
    this.finishTime = 0;
  }

  damage(): boolean {
    if (this.invulnerable > 0 || this.health <= 0) return false;
    this.health = Math.max(0, this.health - 1);
    this.crashes += 1;
    this.invulnerable = 2.2;
    return this.health <= 0;
  }

  heal(amount = 1): void {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  snapshot(): GameStateSnapshot {
    return {
      phase: this.phase,
      health: this.health,
      crashes: this.crashes,
      checkpointIndex: this.checkpointIndex,
    };
  }
}
