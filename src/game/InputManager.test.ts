import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InputManager } from './InputManager';

function key(type: 'keydown' | 'keyup', code: string, init: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent(type, {
    code,
    bubbles: true,
    cancelable: true,
    ...init,
  });
}

describe('InputManager', () => {
  let input: InputManager;

  beforeEach(() => {
    input = new InputManager();
  });

  afterEach(() => {
    input.dispose();
  });

  it('keeps an action active when another key for the same action is held', () => {
    window.dispatchEvent(key('keydown', 'KeyW'));
    expect(input.throttle).toBe(true);

    window.dispatchEvent(key('keydown', 'ArrowUp'));
    window.dispatchEvent(key('keyup', 'KeyW'));
    expect(input.throttle).toBe(true);

    window.dispatchEvent(key('keyup', 'ArrowUp'));
    expect(input.throttle).toBe(false);
  });

  it('ignores Ctrl/Meta/Alt shortcuts', () => {
    window.dispatchEvent(key('keydown', 'KeyW', { ctrlKey: true }));
    expect(input.throttle).toBe(false);
    window.dispatchEvent(key('keyup', 'KeyW'));
  });

  it('does not steal Space from a focused button', () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.dispatchEvent(key('keydown', 'Space'));
    expect(input.consume('jump')).toBe(false);
    button.remove();
  });

  it('exposes edge-triggered actions and clears on blur', () => {
    window.dispatchEvent(key('keydown', 'Space'));
    expect(input.consume('jump')).toBe(true);
    expect(input.consume('jump')).toBe(false);

    window.dispatchEvent(key('keydown', 'KeyW'));
    window.dispatchEvent(new Event('blur'));
    expect(input.throttle).toBe(false);
  });
});
