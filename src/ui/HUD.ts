import type { HUDState } from '../game/GameState';
import { t } from '../i18n/I18n';
import { formatScore, formatTime } from '../utils/math';

/**
 * DOM HUD. Text writes are guarded so the frame loop never thrashes layout with
 * redundant updates.
 */
export class HUD {
  private readonly root = requiredElement<HTMLDivElement>('hud');
  private readonly score = requiredElement<HTMLElement>('hud-score');
  private readonly fish = requiredElement<HTMLElement>('hud-fish');
  private readonly distance = requiredElement<HTMLElement>('hud-distance');
  private readonly time = requiredElement<HTMLElement>('hud-time');
  private readonly best = requiredElement<HTMLElement>('hud-best');
  private readonly speed = requiredElement<HTMLElement>('hud-speed');
  private readonly speedFill = requiredElement<HTMLElement>('hud-speed-fill');
  private readonly speedCaption = requiredElement<HTMLElement>('hud-motion');
  private readonly hearts = requiredElement<HTMLElement>('hud-hearts');
  private readonly progressFill = requiredElement<HTMLElement>('hud-route-fill');
  private readonly progressLabel = requiredElement<HTMLElement>('hud-progress-label');
  private readonly progressMarker = requiredElement<HTMLElement>('hud-route-marker');
  private readonly cameraLabel = requiredElement<HTMLElement>('hud-camera-label');
  private readonly toast = requiredElement<HTMLElement>('status-toast');
  private readonly toastText = requiredElement<HTMLElement>('status-toast-text');
  private readonly toastIcon = requiredQuery<HTMLElement>('#status-toast .status-toast__icon');
  private readonly countdown = requiredElement<HTMLElement>('countdown');
  private readonly gapPrompt = requiredElement<HTMLElement>('jump-prompt');
  private readonly fishPrompt = requiredElement<HTMLElement>('fish-prompt');
  private readonly speedLines = requiredElement<HTMLElement>('speed-lines');
  private toastTimer = 0;
  private hitTimer = 0;
  private lastValues = new Map<string, string>();
  private readonly heartElements: SVGSVGElement[];

  constructor() {
    this.heartElements = Array.from(this.hearts.querySelectorAll<SVGSVGElement>('.heart'));
  }

  show(): void {
    this.root.classList.remove('is-hidden');
    this.root.classList.add('is-visible');
    this.gapPrompt.classList.remove('is-visible');
    this.fishPrompt.classList.remove('is-visible');
  }

  hide(): void {
    this.root.classList.add('is-hidden');
    this.root.classList.remove('is-visible', 'is-fast', 'is-crashed');
    this.clearTransient();
  }

  update(state: HUDState): void {
    this.setText(this.score, 'score', formatScore(state.score));
    this.setText(this.fish, 'fish', String(state.fish));
    this.setText(
      this.distance,
      'distance',
      `${Math.floor(state.distance)} ${t('hud.distanceUnit')}`,
    );
    this.setText(this.time, 'time', formatTime(state.time));
    this.setText(this.best, 'best', state.bestScore > 0 ? formatScore(state.bestScore).replace(/^0+/, '') : '—');
    this.setText(this.speed, 'speed', String(Math.round(state.speedKmh)));
    this.setText(this.speedCaption, 'motion', state.motion);
    this.setText(this.progressLabel, 'progress-label', `${Math.round(state.progress * 100)}%`);
    this.setText(this.cameraLabel, 'camera', state.cameraLabel);
    this.setWidth(this.progressFill, 'progress', state.progress * 100);
    this.setLeft(this.progressMarker, 'marker', 2 + state.progress * 96);
    this.setWidth(this.speedFill, 'speed-fill', Math.min(100, (state.speedKmh / 60) * 100));

    this.root.classList.toggle('is-fast', state.fast);
    this.setHearts(state.hearts, state.maxHearts);
    this.gapPrompt.classList.toggle('is-visible', state.gapWarning && !state.fishWarning);
    this.fishPrompt.classList.toggle('is-visible', state.fishWarning && !state.gapWarning);
    this.speedLines.setAttribute('aria-hidden', String(!state.fast));
  }

  showToast(text: string, icon = '✦', duration = 1800): void {
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.toastText.textContent = text;
    this.toastIcon.textContent = icon;
    this.toast.classList.add('is-visible');
    this.toastTimer = window.setTimeout(() => {
      this.toast.classList.remove('is-visible');
      this.toastTimer = 0;
    }, duration);
  }

  showCountdown(text: string): void {
    this.countdown.classList.remove('is-visible');
    this.countdown.textContent = text;
    // Force animation restart.
    void this.countdown.offsetWidth;
    this.countdown.classList.add('is-visible');
    if (text === 'GO!') {
      window.setTimeout(() => {
        this.countdown.classList.remove('is-visible');
      }, 580);
    }
  }

  clearCountdown(): void {
    this.countdown.classList.remove('is-visible');
  }

  dispose(): void {
    this.clearTransient();
  }

  hideJumpPrompts(): void {
    this.gapPrompt.classList.remove('is-visible');
    this.fishPrompt.classList.remove('is-visible');
  }

  setCameraLabel(label: string): void {
    this.cameraLabel.textContent = label;
  }

  crashFlash(): void {
    if (this.hitTimer) window.clearTimeout(this.hitTimer);
    this.root.classList.remove('is-crashed');
    void this.root.offsetWidth;
    this.root.classList.add('is-crashed');
    this.hitTimer = window.setTimeout(() => {
      this.root.classList.remove('is-crashed');
      this.hitTimer = 0;
    }, 500);
  }

  private setHearts(count: number, max: number): void {
    const key = `${count}/${max}`;
    if (this.lastValues.get('hearts') === key) return;
    const previous = Number(this.lastValues.get('hearts')?.split('/')[0] ?? max);
    this.lastValues.set('hearts', key);
    this.heartElements.forEach((heart, index) => {
      const isFull = index < count;
      heart.classList.toggle('is-empty', !isFull);
      heart.classList.toggle('is-full', isFull);
      if (previous > count && index === count) {
        heart.classList.remove('is-pulse');
        void heart.getBoundingClientRect();
        heart.classList.add('is-pulse');
      }
    });
  }

  private setText(element: HTMLElement, key: string, value: string): void {
    if (this.lastValues.get(key) === value) return;
    this.lastValues.set(key, value);
    element.textContent = value;
  }

  private setWidth(element: HTMLElement, key: string, value: number): void {
    const safe = Math.max(0, Math.min(100, value));
    const rounded = Math.round(safe * 10) / 10;
    const text = `${rounded}%`;
    if (this.lastValues.get(key) === text) return;
    this.lastValues.set(key, text);
    element.style.width = text;
  }

  private setLeft(element: HTMLElement, key: string, value: number): void {
    const safe = Math.max(0, Math.min(100, value));
    const rounded = Math.round(safe * 10) / 10;
    const text = `${rounded}%`;
    if (this.lastValues.get(key) === text) return;
    this.lastValues.set(key, text);
    element.style.left = text;
  }

  private clearTransient(): void {
    if (this.toastTimer) {
      window.clearTimeout(this.toastTimer);
      this.toastTimer = 0;
    }
    if (this.hitTimer) {
      window.clearTimeout(this.hitTimer);
      this.hitTimer = 0;
    }
    this.toast.classList.remove('is-visible');
    this.countdown.classList.remove('is-visible');
    this.gapPrompt.classList.remove('is-visible');
    this.fishPrompt.classList.remove('is-visible');
  }
}

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing UI element #${id}`);
  return element as T;
}

function requiredQuery<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Missing UI element ${selector}`);
  return element as T;
}
