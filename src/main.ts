import './style.css';
import { Game } from './game/Game';
import { setupDeviceGate } from './ui/DeviceGate';

function showFatalError(error: unknown): void {
  console.error('Pelican Rider failed to start.', error);
  const loading = document.getElementById('loading');
  if (!loading) return;
  const message = loading.querySelector('span');
  if (message) {
    message.textContent =
      'The bicycle chain slipped. Please refresh the page to try again.';
  }
  const bar = loading.querySelector('.loading__bar');
  if (bar instanceof HTMLElement) bar.style.display = 'none';
  const bird = loading.querySelector('.loading__bird');
  if (bird instanceof HTMLElement) bird.style.animation = 'none';
}

try {
  const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
  if (!canvas) throw new Error('Game canvas not found.');
  const game = new Game(canvas);
  game.start();
  setupDeviceGate();
  window.addEventListener('beforeunload', () => game.dispose(), { once: true });
} catch (error) {
  showFatalError(error);
}

window.addEventListener('error', (event) => {
  if (event.error) console.error(event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection in Pelican Rider:', event.reason);
});
