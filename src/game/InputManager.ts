export type GameAction =
  | 'accelerate'
  | 'brake'
  | 'left'
  | 'right'
  | 'jump'
  | 'pause'
  | 'restart'
  | 'camera'
  | 'mute';

const KEY_MAP: Record<string, GameAction> = {
  KeyW: 'accelerate',
  ArrowUp: 'accelerate',
  KeyS: 'brake',
  ArrowDown: 'brake',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'jump',
  KeyP: 'pause',
  Escape: 'pause',
  KeyR: 'restart',
  KeyC: 'camera',
  KeyM: 'mute',
};

const PREVENT_DEFAULT = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
]);

/**
 * Keyboard state with edge-triggered actions for jump, pause, restart and
 * camera switching. Buttons and other UI keys retain their normal behavior.
 */
export class InputManager {
  private readonly held = new Set<GameAction>();
  private readonly pressed = new Set<GameAction>();

  constructor() {
    window.addEventListener('keydown', this.handleKeyDown, { passive: false });
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.clear);
    document.addEventListener('visibilitychange', this.handleVisibility);
  }

  get throttle(): boolean {
    return this.held.has('accelerate');
  }

  get brake(): boolean {
    return this.held.has('brake');
  }

  get steer(): number {
    return (this.held.has('right') ? 1 : 0) - (this.held.has('left') ? 1 : 0);
  }

  wasPressed(action: GameAction): boolean {
    return this.pressed.has(action);
  }

  consume(action: GameAction): boolean {
    if (!this.pressed.has(action)) return false;
    this.pressed.delete(action);
    return true;
  }

  endFrame(): void {
    this.pressed.clear();
  }

  dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.clear);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.clear();
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const action = KEY_MAP[event.code];
    if (event.code === 'Space' && event.target instanceof HTMLButtonElement) {
      return;
    }
    if (!action) return;
    if (PREVENT_DEFAULT.has(event.code)) event.preventDefault();
    if (event.repeat) return;
    if (!this.held.has(action)) this.pressed.add(action);
    this.held.add(action);
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    const action = KEY_MAP[event.code];
    if (!action) return;
    if (PREVENT_DEFAULT.has(event.code)) event.preventDefault();
    this.held.delete(action);
  };

  private readonly clear = (): void => {
    this.held.clear();
    this.pressed.clear();
  };

  private readonly handleVisibility = (): void => {
    if (document.hidden) this.clear();
  };
}
