import type { RunResult } from '../game/GameState';
import { onLocaleChange, t } from '../i18n/I18n';
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
  private lastResult: RunResult | null = null;

  constructor() {
    this.resumeButton.addEventListener('click', () => this.pauseCallbacks?.onResume());
    this.pauseRestart.addEventListener('click', () => this.pauseCallbacks?.onRestart());
    this.pauseMenu.addEventListener('click', () => this.pauseCallbacks?.onMenu());
    this.againButton.addEventListener('click', () => this.resultCallbacks?.onAgain());
    this.resultMenu.addEventListener('click', () => this.resultCallbacks?.onMenu());
    this.resultBest.classList.add('is-hidden');
    onLocaleChange(() => {
      if (this.lastResult) this.renderResult();
    });
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
    this.lastResult = result;
    this.renderResult();
    this.againButton.focus({ preventScroll: true });
  }

  private renderResult(): void {
    const result = this.lastResult;
    if (!result) return;
    this.resultTitle.textContent = result.victory
      ? t('result.victoryTitle')
      : t('result.gameoverTitle');
    this.resultKicker.textContent = result.victory
      ? t('result.victoryKicker')
      : t('result.gameoverKicker');
    this.resultCopy.textContent = result.victory
      ? t('result.victoryCopy', {
          fish: result.fish,
          crashes: result.crashes,
          spills: result.crashes === 1 ? 'spill' : 'spills',
        })
      : t('result.gameoverCopy', { reason: result.reason });
    this.resultScore.textContent = formatScoreShort(result.score);
    this.resultFish.textContent = `${result.fish} / ${result.totalFish}`;
    this.resultTime.textContent = formatTime(result.time);
    this.resultCrashes.textContent = String(result.crashes);
    this.resultBest.classList.toggle('is-hidden', !result.newBest);
    this.resultBest.textContent = result.victory
      ? t('result.bestNew')
      : t('result.bestScore');
    this.resultFootnote.textContent = result.victory
      ? t('result.victoryTip')
      : t('result.gameoverTip');
    this.resultBurst.textContent = result.victory ? '✦' : '…';
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
