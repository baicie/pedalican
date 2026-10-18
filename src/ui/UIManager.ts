import type { HUDState, RunResult } from '../game/GameState';
import { gameAudio } from '../audio/AudioManager';
import { getLocale, onLocaleChange, t, toggleLocale } from '../i18n/I18n';
import { GameOverPanels } from './GameOver';
import { HUD } from './HUD';
import { MainMenu } from './MainMenu';

export interface UIHandlers {
  onStart: () => void;
  onResume: () => void;
  onRestart: () => void;
  onMenu: () => void;
}

/**
 * Single entry point for interface state. Keeps modal visibility in sync so a
 * render frame never leaves two overlapping screens active.
 */
export class UIManager {
  readonly hud = new HUD();
  readonly menu = new MainMenu();
  readonly panels = new GameOverPanels();
  private readonly loading = document.getElementById('loading');
  private readonly canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;

  constructor(handlers: UIHandlers) {
    this.menu.bindStart(handlers.onStart);
    this.panels.bindResults({
      onAgain: handlers.onStart,
      onMenu: handlers.onMenu,
    });
    this.panels.bindPause({
      onResume: handlers.onResume,
      onRestart: handlers.onRestart,
      onMenu: handlers.onMenu,
    });
    this.bindPreferences();
  }

  private bindPreferences(): void {
    document.querySelectorAll<HTMLButtonElement>('.js-locale-toggle').forEach((button) => {
      button.addEventListener('click', () => {
        gameAudio.uiClick();
        toggleLocale();
      });
    });
    document.querySelectorAll<HTMLButtonElement>('.js-sound-toggle').forEach((button) => {
      button.addEventListener('click', () => {
        gameAudio.uiClick();
        gameAudio.toggleMuted();
      });
    });
    onLocaleChange(() => this.refreshPreferences());
    gameAudio.onMuteChange(() => this.refreshPreferences());
    this.refreshPreferences();
  }

  refreshPreferences(): void {
    const zh = getLocale() === 'zh';
    document.querySelectorAll<HTMLElement>('.js-locale-label').forEach((label) => {
      label.textContent = zh ? t('settings.languageValueEn') : t('settings.languageValueZh');
    });
    document.querySelectorAll<HTMLButtonElement>('.js-locale-toggle').forEach((button) => {
      button.setAttribute(
        'aria-label',
        zh ? t('settings.switchToEn') : t('settings.switchToZh'),
      );
    });

    const muted = gameAudio.isMuted;
    document.querySelectorAll<HTMLElement>('.js-sound-label').forEach((label) => {
      label.textContent = muted ? t('settings.soundOff') : t('settings.soundOn');
    });
    document.querySelectorAll<HTMLElement>('.js-sound-icon').forEach((icon) => {
      const use = icon.querySelector('use');
      use?.setAttribute('href', muted ? '#icon-sound-off' : '#icon-sound-on');
    });
    document.querySelectorAll<HTMLButtonElement>('.js-sound-toggle').forEach((button) => {
      button.setAttribute('aria-pressed', String(muted));
      button.setAttribute('aria-label', muted ? t('settings.unmute') : t('settings.mute'));
    });
  }

  showMenu(bestScore: number, bestTime: number | null): void {
    this.panels.hideAll();
    this.hud.hide();
    this.menu.show(bestScore, bestTime);
  }

  beginRide(): void {
    this.menu.hide();
    this.panels.hideAll();
    this.hud.show();
    this.focusCanvas();
  }

  showPause(): void {
    this.panels.showPause();
  }

  hidePause(): void {
    this.panels.hidePause();
    this.focusCanvas();
  }

  showResult(result: RunResult): void {
    this.hud.hide();
    this.menu.hide();
    this.panels.showResult(result);
    this.panels.hidePause();
  }

  showCountdown(text: string): void {
    this.hud.showCountdown(text);
  }

  clearCountdown(): void {
    this.hud.clearCountdown();
  }

  updateHUD(state: HUDState): void {
    this.hud.update(state);
  }

  toast(text: string, icon = '✦', duration = 1800): void {
    this.hud.showToast(text, icon, duration);
  }

  crashFlash(): void {
    this.hud.crashFlash();
  }

  hideJumpPrompts(): void {
    this.hud.hideJumpPrompts();
  }

  updateBest(bestScore: number, bestTime: number | null): void {
    this.menu.setBest(bestScore, bestTime);
  }

  hideLoading(): void {
    this.loading?.classList.add('is-hidden');
  }

  showError(message: string): void {
    if (!this.loading) return;
    const label = this.loading.querySelector('span');
    if (label) label.textContent = message;
    const bird = this.loading.querySelector('.loading__bird');
    if (bird instanceof HTMLElement) bird.style.animation = 'none';
    const bar = this.loading.querySelector('.loading__bar');
    if (bar instanceof HTMLElement) bar.style.display = 'none';
  }

  focusCanvas(): void {
    this.canvas?.focus({ preventScroll: true });
  }

  refreshMenuBest(bestScore: number, bestTime: number | null): void {
    this.menu.setBest(bestScore, bestTime);
  }
}
