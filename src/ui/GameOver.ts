import type { RunResult } from '../game/GameState';
import { formatScoreShort, formatTime } from '../utils/math';

export interface ResultCallbacks {
  onAgain: () => void;
  onMenu: () => void;
}

export interface PauseCallbacks {
  onResume: () => void;
  onRestart: () => void;
  onMenu: () => void;
}

/**
 * Pause modal and end-of-run results share the same visual language but remain
 * separate screens for clean state transitions and focus behavior.
 */
export class GameOverPanels {
  private readonly pauseScreen = requiredElement<HTMLElement>('pause-screen');
  private readonly resultScreen = requiredElement<HTMLElement>('result-screen');
  private readonly resumeButton = requiredElement<HTMLButtonElement>('btn-resume');
  private readonly pauseRestart = requiredElement<HTMLButtonElement>('btn-pause-restart');
  private readonly pauseMenu = requiredElement<HTMLButtonElement>('btn-pause-menu');
  private readonly againButton = requiredElement<HTMLButtonElement>('btn-again');
  private readonly resultMenu = requiredElement<HTMLButtonElement>('btn-result-menu');
  private readonly resultTitle = requiredElement<HTMLElement>('result-title');
  private readonly resultKicker = requiredElement<HTMLElement>('result-kicker');
  private readonly resultCopy = requiredElement<HTMLElement>('result-copy');
  private readonly resultScore = requiredElement<HTMLElement>('result-score');
  private readonly resultFish = requiredElement<HTMLElement>('result-fish');
  private readonly resultTime = requiredElement<HTMLElement>('result-time');
  private readonly resultCrashes = requiredElement<HTMLElement>('result-crashes');
  private readonly resultBest = requiredElement<HTMLElement>('result-best');
  private readonly resultFootnote = requiredElement<HTMLElement>('result-footnote');
  private readonly resultBurst = requiredElement<HTMLElement>('result-burst');
  private resultCallbacks: ResultCallbacks | null = null;
  private pauseCallbacks: PauseCallbacks | null = null;

  constructor() {
    this.resumeButton.addEventListener('click', () => this.pauseCallbacks?.onResume());
    this.pauseRestart.addEventListener('click', () => this.pauseCallbacks?.onRestart());
    this.pauseMenu.addEventListener('click', () => this.pauseCallbacks?.onMenu());
    this.againButton.addEventListener('click', () => this.resultCallbacks?.onAgain());
    this.resultMenu.addEventListener('click', () => this.resultCallbacks?.onMenu());
    this.resultBest.classList.add('is-hidden');
  }

  bindResults(callbacks: ResultCallbacks): void {
    this.resultCallbacks = callbacks;
  }

  bindPause(callbacks: PauseCallbacks): void {
    this.pauseCallbacks = callbacks;
  }

  showPause(): void {
    this.pauseScreen.classList.add('is-visible');
    this.resumeButton.focus({ preventScroll: true });
  }

  hidePause(): void {
    this.pauseScreen.classList.remove('is-visible');
    this.resumeButton.blur();
  }

  showResult(result: RunResult): void {
    this.pauseScreen.classList.remove('is-visible');
    this.resultScreen.classList.add('is-visible');
    this.resultTitle.textContent = result.victory ? 'Beautiful ride!' : 'Down in the sand';
    this.resultKicker.textContent = result.victory ? 'THE LIGHTHOUSE IS YOURS' : 'THE TIDE CALLED IT';
    this.resultCopy.textContent = result.victory
      ? `You rolled into Pelican Point with ${result.fish} fish and ${result.crashes} ${
          result.crashes === 1 ? 'spill' : 'spills'
        } along the way.`
      : `${result.reason} The coast won this round, but the pelican is already dusting off.`;
    this.resultScore.textContent = formatScoreShort(result.score);
    this.resultFish.textContent = `${result.fish} / ${result.totalFish}`;
    this.resultTime.textContent = formatTime(result.time);
    this.resultCrashes.textContent = String(result.crashes);
    this.resultBest.classList.toggle('is-hidden', !result.newBest);
    this.resultBest.textContent = result.victory ? 'NEW PERSONAL BEST' : 'BEST SCORE SO FAR';
    this.resultFootnote.textContent = result.victory
      ? 'Tip: fish chains are worth more. Try a full basket next time.'
      : 'Tip: brake early, then hop logs and gaps rather than steering at the last moment.';
    this.resultBurst.textContent = result.victory ? '✦' : '…';
    this.againButton.focus({ preventScroll: true });
  }

  hideResult(): void {
    this.resultScreen.classList.remove('is-visible');
    this.againButton.blur();
  }

  hideAll(): void {
    this.pauseScreen.classList.remove('is-visible');
    this.resultScreen.classList.remove('is-visible');
    this.resumeButton.blur();
    this.againButton.blur();
  }
}

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing UI element #${id}`);
  return element as T;
}
