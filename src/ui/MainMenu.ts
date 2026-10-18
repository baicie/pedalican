import { formatScoreShort, formatTime } from '../utils/math';

export class MainMenu {
  private readonly screen = requiredElement<HTMLElement>('menu-screen');
  private readonly startButton = requiredElement<HTMLButtonElement>('btn-start');
  private readonly bestChip = requiredElement<HTMLElement>('menu-best');
  private readonly bestValue = this.bestChip.querySelector('strong');
  private onStart: () => void = () => {};

  constructor() {
    this.startButton.addEventListener('click', () => {
      this.onStart();
    });
    window.addEventListener('keydown', this.handleKeydown);
  }

  bindStart(callback: () => void): void {
    this.onStart = callback;
  }

  show(bestScore: number, bestTime: number | null): void {
    this.screen.classList.add('is-visible');
    this.startButton.focus({ preventScroll: true });
    if (this.bestValue) {
      this.bestValue.textContent =
        bestScore > 0
          ? `${formatScoreShort(bestScore)} pts${bestTime !== null ? ` · ${formatTime(bestTime)}` : ''}`
          : 'No ride logged yet';
    }
  }

  hide(): void {
    this.screen.classList.remove('is-visible');
    this.startButton.blur();
  }

  isVisible(): boolean {
    return this.screen.classList.contains('is-visible');
  }

  setBest(bestScore: number, bestTime: number | null): void {
    if (this.bestValue) {
      this.bestValue.textContent =
        bestScore > 0
          ? `${formatScoreShort(bestScore)} pts${bestTime !== null ? ` · ${formatTime(bestTime)}` : ''}`
          : 'No ride logged yet';
    }
  }

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    if (!this.isVisible()) return;
    if (event.code === 'Enter') {
      event.preventDefault();
      this.onStart();
    }
  };
}

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing UI element #${id}`);
  return element as T;
}
