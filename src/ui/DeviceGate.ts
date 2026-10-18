/**
 * Pelican Rider is keyboard-only. Touch-first devices get a friendly gate
 * instead of dropping players into a game they cannot steer. A physical
 * keyboard still works with tablets and phones, so the gate is dismissible.
 */
export function setupDeviceGate(): void {
  const gate = document.getElementById('device-gate');
  const continueButton = document.getElementById('btn-device-continue');
  if (!(gate instanceof HTMLElement) || !(continueButton instanceof HTMLButtonElement)) {
    return;
  }

  const touchFirst = window.matchMedia('(hover: none) and (pointer: coarse)');
  let dismissed = false;

  const close = (): void => {
    dismissed = true;
    gate.hidden = true;
    document.body.classList.remove('device-gate-open');
    document.getElementById('btn-start')?.focus({ preventScroll: true });
  };

  const open = (): void => {
    if (dismissed) return;
    gate.hidden = false;
    document.body.classList.add('device-gate-open');
    window.requestAnimationFrame(() => {
      continueButton.focus({ preventScroll: true });
    });
  };

  const sync = (): void => {
    const shouldOpen = touchFirst.matches && navigator.maxTouchPoints > 0;
    if (shouldOpen) {
      open();
    } else {
      gate.hidden = true;
      document.body.classList.remove('device-gate-open');
    }
  };

  continueButton.addEventListener('click', close);
  window.addEventListener('keydown', (event) => {
    if (!gate.hidden && event.code === 'Escape') close();
  });

  if (typeof touchFirst.addEventListener === 'function') {
    touchFirst.addEventListener('change', sync);
  } else {
    touchFirst.addListener(sync);
  }

  sync();
}
