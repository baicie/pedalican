import './style.css';
import { Game } from './game/Game';
import { gameAudio } from './audio/AudioManager';
import { initI18n, t } from './i18n/I18n';
import { setupDeviceGate } from './ui/DeviceGate';

function showFatalError(error: unknown): void {
  console.error('Pelican Rider failed to start.', error);
  const loading = document.getElementById('loading');
  if (!loading) return;
  const message = loading.querySelector('span');
  if (message) {
    message.textContent = t('error.start');
  }
  const bar = loading.querySelector('.loading__bar');
  if (bar instanceof HTMLElement) bar.style.display = 'none';
  const bird = loading.querySelector('.loading__bird');
  if (bird instanceof HTMLElement) bird.style.animation = 'none';
}

try {
  initI18n();
  gameAudio.bindGestureUnlock();
  const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
  if (!canvas) throw new Error('Game canvas not found.');
  const game = new Game(canvas);
  game.start();
  setupDeviceGate();
  window.addEventListener(
    'beforeunload',
    () => {
      gameAudio.dispose();
      game.dispose();
    },
    { once: true },
  );
} catch (error) {
  showFatalError(error);
}

window.addEventListener('error', (event) => {
  if (event.error) console.error(event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection in Pelican Rider:', event.reason);
});
