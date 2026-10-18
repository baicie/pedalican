import { clamp } from '../utils/math';

export interface ScoreSave {
  bestScore: number;
  bestTime: number | null;
  runs: number;
}

const STORAGE_KEY = 'pelican-rider.best.v1';

/**
 * Fish chain together for a gentle combo bonus. Completion bonuses reward a
 * clean run, and only successful runs can set a best time.
 */
export class ScoreManager {
  score = 0;
  fish = 0;
  combo = 0;
  bestScore = 0;
  bestTime: number | null = null;
  private lastFishAt = -100;
  private runs = 0;

  constructor() {
    this.load();
  }

  reset(): void {
    this.score = 0;
    this.fish = 0;
    this.combo = 0;
    this.lastFishAt = -100;
  }

  registerFish(time: number, fish = 1): number {
    let awarded = 0;
    for (let i = 0; i < fish; i += 1) {
      const chainWindow = 2.8;
      if (time - this.lastFishAt <= chainWindow) {
        this.combo = Math.min(6, this.combo + 1);
      } else {
        this.combo = 1;
      }
      this.lastFishAt = time;
      const multiplier = 1 + (this.combo - 1) * 0.25;
      awarded += Math.round(100 * multiplier);
    }
    this.score += awarded;
    this.fish += fish;
    return awarded;
  }

  registerCheckpoint(): number {
    const bonus = 150;
    this.score += bonus;
    return bonus;
  }

  finish(time: number, health: number, crashes: number, totalFish: number): number {
    const completion = 600;
    const healthBonus = health * 200;
    const fishRatio = totalFish > 0 ? this.fish / totalFish : 0;
    const collectionBonus = Math.round(fishRatio * 450);
    const timeBonus = Math.max(0, Math.round(1650 - time * 12));
    const crashPenalty = crashes * 30;
    const bonus = completion + healthBonus + collectionBonus + timeBonus - crashPenalty;
    this.score += Math.max(0, bonus);
    return Math.max(0, bonus);
  }

  recordRun(score: number, time: number, victory: boolean): boolean {
    this.runs += 1;
    let newBest = false;
    if (score > this.bestScore) {
      this.bestScore = score;
      newBest = true;
    }
    if (victory && (this.bestTime === null || time < this.bestTime)) {
      this.bestTime = time;
      newBest = true;
    }
    this.save();
    return newBest;
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<ScoreSave>;
      if (typeof parsed.bestScore === 'number' && Number.isFinite(parsed.bestScore)) {
        this.bestScore = Math.max(0, Math.round(parsed.bestScore));
      }
      if (typeof parsed.bestTime === 'number' && Number.isFinite(parsed.bestTime)) {
        this.bestTime = Math.max(0, parsed.bestTime);
      }
      if (typeof parsed.runs === 'number' && Number.isFinite(parsed.runs)) {
        this.runs = Math.max(0, Math.floor(parsed.runs));
      }
    } catch {
      // Persistence is best-effort; a blocked localStorage must not break play.
    }
  }

  private save(): void {
    try {
      const payload: ScoreSave = {
        bestScore: this.bestScore,
        bestTime: this.bestTime,
        runs: this.runs,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore quota / private mode errors.
    }
  }

  getProgressBonus(time: number): number {
    return Math.round(clamp(time, 0, 600) * 0.1);
  }
}
