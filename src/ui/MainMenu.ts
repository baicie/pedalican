import { onLocaleChange, t } from '../i18n/I18n';
import { formatScoreShort, formatTime } from '../utils/math';

export class MainMenu {
  private readonly screen = requiredElement<HTMLElement>('menu-screen');
  private readonly startButton = requiredElement<HTMLButtonElement>('btn-start');
  private readonly bestChip = requiredElement<HTMLElement>('menu-best');
  private readonly bestValue = this.bestChip.querySelector('strong');
  private onStart: () => void = () => {};
  private bestScore = 0;
  private bestTime: number | null = null;

  constructor() {
    this.startButton.addEventListener('click', () => {
      this.onStart();
    });
    window.addEventListener('keydown', this.handleKeydown);
    onLocaleChange(() => this.renderBest());
  }

  bindStart(callback: () => void): void {
    this.onStart = callback;
  }

  show(bestScore: number, bestTime: number | null): void {
    this.screen.classList.add('is-visible');
    this.startButton.focus({ preventScroll: true });
    this.bestScore = bestScore;
    this.bestTime = bestTime;
    this.renderBest();
  }

  hide(): void {
    this.screen.classList.remove('is-visible');
    this.startButton.blur();
  }

  isVisible(): boolean {
    return this.screen.classList.contains('is-visible');
  }

  setBest(bestScore: number, bestTime: number | null): void {
    this.bestScore = bestScore;
    this.bestTime = bestTime;
    this.renderBest();
  }

  private renderBest(): void {
    if (!this.bestValue) return;
    if (this.bestScore <= 0) {
      this.bestValue.textContent = t('menu.bestEmpty');
      return;
    }
    const time = this.bestTime !== null ? ` · ${formatTime(this.bestTime)}` : '';
    this.bestValue.textContent = t('menu.bestScore', {
      score: formatScoreShort(this.bestScore),
      time,
    });
  }

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    if (!this.isVisible() || event.code !== 'Enter') return;
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      target.closest('button, a, input, select, textarea')
    ) {
      // Let the focused control (language, sound, start, gate) handle Enter.
      return;
    }
    event.preventDefault();
    this.onStart();
  };
}

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing UI element #${id}`);
  return element as T;
}
